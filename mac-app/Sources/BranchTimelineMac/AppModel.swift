import AppKit
import Combine
import TimelineCore

@MainActor final class AppModel: ObservableObject {
    static let shared = AppModel(preview: CommandLine.arguments.contains("--render-preview"))
    @Published private(set) var archive = AppArchive()
    @Published private(set) var projects: [Project] = []
    @Published var selectedPath: String?
    @Published var title = ""
    @Published var targetMinutes = 60
    @Published var query = ""
    @Published var now = Date()
    @Published var error: String?
    @Published var loading = false
    @Published var finishRequested = false
    @Published private(set) var syncStates: [String: String] = [:]
    private let disk: ArchiveStore
    private var healthy = true
    private var ticker: Timer?
    private var alertedID: String?
    private var scan: Task<Void, Never>?
    private var lastSync = Date.distantPast
    var active: DesktopSession? { archive.active }
    var selected: Project? { projects.first { $0.path == selectedPath } }
    var canStart: Bool { healthy && selected != nil && active == nil && !loading }
    var filtered: [Project] { projects.filter { matchesProject(query, project: $0) } }
    var elapsed: TimeInterval { active?.elapsed(at: now) ?? 0 }
    var remaining: TimeInterval { max(0, Double((active?.targetMinutes ?? 0) * 60) - elapsed) }
    var ratio: Double { guard let active, active.targetMinutes > 0 else { return 0 }; return elapsed / Double(active.targetMinutes * 60) }

    private init(preview: Bool = false) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        disk = ArchiveStore(url: preview ? FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) : support.appendingPathComponent("BranchTimelineMac/archive.json"))
        if preview {
            let project = Project(path: "preview.md", name: "编译器 · 词法分析")
            projects = [project]; selectedPath = project.path; archive.vaultPath = "/Preview"
            archive.active = DesktopSession(project: project, title: "完成标识符识别", targetMinutes: 60, now: now.addingTimeInterval(-1472))
            healthy = false
            return
        }
        do {
            archive = try disk.load()
            if archive.active != nil && archive.active?.isPaused == false {
                archive.active?.pause(at: archive.checkpoint)
                try disk.save(archive)
                error = "已恢复上次计时并暂停，请确认后继续。"
            }
        } catch { self.error = error.localizedDescription; healthy = false }
    }

    func launch() {
        refreshProjects()
        refreshSync()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }
    func shutdown() { pause(); ticker?.invalidate(); scan?.cancel() }
    func clearError() { error = nil }

    func chooseVault() {
        guard active == nil else { error = "请先结束或取消当前计时，再切换笔记库。"; return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false
        panel.message = "选择 Obsidian 笔记库。只读取项目，完成记录交给插件导入。"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let root = url.standardizedFileURL.resolvingSymlinksInPath()
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent(".obsidian").path) else {
            error = "请选择包含 .obsidian 文件夹的笔记库。"; return
        }
        var next = archive; next.vaultPath = root.path
        guard persist(next) else { return }
        selectedPath = nil; refreshProjects(); refreshSync()
    }

    func refreshProjects() {
        scan?.cancel()
        guard let path = archive.vaultPath else { projects = []; return }
        loading = true
        scan = Task { [weak self] in
            let result = await Task.detached(priority: .userInitiated) {
                Result { try VaultBridge(root: URL(fileURLWithPath: path)).projects() }
            }.value
            guard !Task.isCancelled, let self, self.archive.vaultPath == path else { return }
            self.loading = false
            switch result {
            case .success(let projects):
                self.projects = projects
                if !projects.contains(where: { $0.path == self.selectedPath }) { self.selectedPath = nil }
            case .failure(let error): self.error = error.localizedDescription
            }
        }
    }

    func start() {
        guard canStart, let project = selected, let path = archive.vaultPath else { return }
        var next = archive
        next.active = DesktopSession(project: project, title: title, targetMinutes: min(1440, max(0, targetMinutes)), vaultPath: path)
        if persist(next) { alertedID = nil; now = Date() }
    }
    func pause() {
        guard var session = active, !session.isPaused else { return }
        session.pause(at: Date()); var next = archive; next.active = session; _ = persist(next)
    }
    func resume() {
        guard var session = active, session.isPaused else { return }
        session.resume(at: Date()); var next = archive; next.active = session; _ = persist(next)
    }
    func mark(_ kind: String, level: String = "medium") {
        guard var session = active, !session.isPaused else { return }
        session.mark(kind, at: Date(), level: level); var next = archive; next.active = session; _ = persist(next)
    }
    func beginFinish() { pause(); if active?.isPaused == true { finishRequested = true } }
    func finish(title: String, note: String) {
        guard var session = active else { return }
        guard title.count <= 400, note.count <= 20_000 else { error = "标题限400字，备注限20000字；记录尚未提交。"; return }
        session.finish(at: Date(), title: title, note: note)
        var next = archive; next.active = nil; next.history.insert(session, at: 0)
        guard persist(next) else { return }
        finishRequested = false; self.title = ""; export(session)
    }
    func cancel() {
        var next = archive; next.active = nil
        if persist(next) { finishRequested = false }
    }
    func export(_ session: DesktopSession) {
        do {
            let bridge = VaultBridge(root: URL(fileURLWithPath: session.vaultPath))
            try bridge.export(session)
            syncStates[session.id] = "等待插件导入"
            refreshSync()
        } catch { self.error = "记录已保存在本机；导出失败：\(error.localizedDescription)"; syncStates[session.id] = "导出失败，可重试" }
    }
    func refreshSync() {
        for session in archive.history.prefix(30) {
            let bridge = VaultBridge(root: URL(fileURLWithPath: session.vaultPath))
            guard let receipt = bridge.receipt(for: session) else { continue }
            syncStates[session.id] = receipt.status == "imported" ? "已写入项目和时间线"
                : receipt.status == "too-short" ? "不足一分钟，原始记录已保留"
                : "未导入：\(receipt.message ?? "请检查插件")"
        }
    }
    private func tick() {
        now = Date()
        if let session = active, session.targetMinutes > 0, ratio >= 1, alertedID != session.id {
            NSSound.beep(); alertedID = session.id
        }
        if active != nil && active?.isPaused == false && now.timeIntervalSince(archive.checkpoint) >= 15 { _ = persist(archive) }
        if now.timeIntervalSince(lastSync) >= 10 { refreshSync(); lastSync = now }
    }
    @discardableResult private func persist(_ value: AppArchive) -> Bool {
        guard healthy else { return false }
        var next = value; next.checkpoint = Date()
        do { try disk.save(next); archive = next; return true }
        catch { self.error = error.localizedDescription; return false }
    }
}

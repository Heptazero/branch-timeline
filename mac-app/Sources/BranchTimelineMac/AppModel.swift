import AppKit
import Combine
import UniformTypeIdentifiers
import TimelineCore

@MainActor final class AppModel: ObservableObject {
    static var diagnostic: Bool { CommandLine.arguments.contains("--render-preview") || CommandLine.arguments.contains("--check-quit") }
    static let shared = AppModel(preview: diagnostic)
    // View state only. The authoritative timer and records live in the original state.json.
    @Published private(set) var archive = AppArchive()
    @Published private(set) var records: [TimelineRecord] = []
    @Published private(set) var projects: [Project] = []
    @Published var selectedPath: String?
    @Published var title = ""
    @Published var targetMinutes = 25
    @Published var page: AppPage = .timer
    @Published var focusDate = logicalDate()
    @Published private(set) var focusRequest = UUID()
    @Published var scope = "week"
    @Published private(set) var dashboard: Dashboard?
    @Published var query = ""
    @Published var now = Date()
    @Published var error: String?
    @Published var loading = false
    @Published var finishRequested = false
    private var storage: SharedStateStore?
    private var legacy: AppArchive?
    private var ticker: Timer?
    private var alertedID: String?
    private var scan: Task<Void, Never>?
    private var lastRefresh = Date.distantPast
    var active: DesktopSession? { archive.active }
    var selected: Project? { projects.first { $0.path == selectedPath } }
    var canStart: Bool { storage != nil && selected != nil && active == nil && !loading }
    var filtered: [Project] { projects.filter { matchesProject(query, project: $0) } }
    var elapsed: TimeInterval { active?.elapsed(at: now) ?? 0 }
    var remaining: TimeInterval { max(0, Double((active?.targetMinutes ?? 0) * 60) - elapsed) }
    var ratio: Double { guard let active, active.targetMinutes > 0 else { return 0 }; return elapsed / Double(active.targetMinutes * 60) }
    var timerSeconds: TimeInterval { TimerDial.displaySeconds(target: active?.targetMinutes ?? targetMinutes, elapsed: elapsed) }

    init(preview: Bool = false, runningPreview: Bool = true) {
        if preview {
            let project = Project(path: "preview.md", name: "编译器", color: "#3159e2")
            projects = [project, Project(path: "research.md", name: "科研", color: "#9072c6"), Project(path: "english.md", name: "英语", color: "#54a089")]
            selectedPath = project.path; archive.vaultPath = "/Preview"; title = "完成标识符识别"
            if runningPreview { archive.active = DesktopSession(project: project, title: title, targetMinutes: 25, now: now.addingTimeInterval(-428)) }
            dashboard = PreviewFixture.dashboard()
            return
        }
        if let id = Bundle.main.bundleIdentifier, NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 { return }
        if UserDefaults.standard.object(forKey: "timerTargetMinutes") != nil { targetMinutes = max(0, min(1440, UserDefaults.standard.integer(forKey: "timerTargetMinutes"))) }
        selectedPath = UserDefaults.standard.string(forKey: "timerProjectPath")
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/BranchTimelineMac/archive.json")
        if FileManager.default.fileExists(atPath: url.path) {
            do { legacy = try ArchiveStore(url: url).load() }
            catch { self.error = "旧版备份无法读取，已保留原文件。" }
        }
        if let bridge = VaultDiscovery.discover(remembered: UserDefaults.standard.string(forKey: "dataVaultPath"), legacy: legacy?.vaultPath) {
            do { try connect(bridge) } catch { self.error = error.localizedDescription }
        }
    }

    private func connect(_ bridge: VaultBridge) throws {
        let next = try SharedStateStore(bridge: bridge)
        try next.adoptLegacy(legacy ?? AppArchive())
        var snapshot = try next.load()
        if var active = snapshot.active, !active.isPaused {
            active.pause(at: min(snapshot.checkpoint, Date()))
            try next.saveTimer(active, expectedID: active.id)
            snapshot = try next.load()
        }
        storage = next; archive.vaultPath = bridge.root.path
        archive.active = snapshot.active; archive.checkpoint = snapshot.checkpoint; records = snapshot.records
        UserDefaults.standard.set(bridge.root.path, forKey: "dataVaultPath")
    }
    func launch() {
        guard ticker == nil else { return }
        refreshProjects()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in self?.tick() } }
    }
    func shutdown() { ticker?.invalidate(); scan?.cancel() }
    func prepareToQuit() -> Bool { active == nil || active?.isPaused == true || pause() }
    func clearError() { error = nil }

    func chooseDataFile() {
        guard active == nil else { error = "请先结束或取消当前计时。"; return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = true; panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.json]; panel.message = "选择原有的时间线 state.json，项目笔记位置会自动识别。"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try connect(VaultDiscovery.fromStateFile(url)); selectedPath = nil; error = nil; refreshProjects() }
        catch { self.error = error.localizedDescription }
    }
    func refreshProjects() {
        scan?.cancel()
        guard let path = archive.vaultPath else { projects = []; return }
        loading = true
        scan = Task { [weak self] in
            let result = await Task.detached(priority: .userInitiated) { Result { try VaultBridge(root: URL(fileURLWithPath: path)).projects() } }.value
            guard !Task.isCancelled, let self, self.archive.vaultPath == path else { return }
            self.loading = false
            switch result {
            case .success(let projects):
                self.projects = projects
                if !projects.contains(where: { $0.path == self.selectedPath }) { self.selectedPath = nil }
                self.refreshDashboard()
            case .failure(let error): self.error = error.localizedDescription
            }
        }
    }
    func refreshShared() {
        guard let storage else { return }
        do {
            let snapshot = try storage.load()
            archive.active = snapshot.active; archive.checkpoint = snapshot.checkpoint; records = snapshot.records
            if page != .timer { refreshDashboard() }
        } catch { self.error = error.localizedDescription }
    }
    func start() {
        guard canStart, let project = selected, let path = archive.vaultPath else { return }
        var next = archive
        next.active = DesktopSession(project: project, title: title, targetMinutes: min(1440, max(0, targetMinutes)), vaultPath: path)
        if persist(next) {
            alertedID = nil; now = Date()
            UserDefaults.standard.set(targetMinutes, forKey: "timerTargetMinutes")
            UserDefaults.standard.set(project.path, forKey: "timerProjectPath")
        }
    }
    @discardableResult func pause() -> Bool {
        guard var session = active, !session.isPaused else { return true }
        session.pause(at: Date()); var next = archive; next.active = session; return persist(next)
    }
    func resume() {
        guard var session = active, session.isPaused else { return }
        session.resume(at: Date()); var next = archive; next.active = session; _ = persist(next)
    }
    func mark(_ kind: String, level: String = "medium") {
        guard var session = active, !session.isPaused else { return }
        session.mark(kind, at: Date(), level: level); var next = archive; next.active = session; _ = persist(next)
    }
    func beginFinish() { if pause(), active != nil { finishRequested = true } }
    func finish(title: String, note: String) {
        guard var session = active, let storage else { return }
        guard title.count <= 400, note.count <= 20_000 else { error = "标题限400字，备注限20000字。"; return }
        session.finish(at: Date(), title: title, note: note)
        do {
            try storage.finish(session)
            refreshShared(); finishRequested = false; self.title = ""; error = nil
        } catch { self.error = error.localizedDescription }
    }
    func cancel() {
        var next = archive; next.active = nil
        if persist(next) { finishRequested = false }
    }
    private func tick() {
        now = Date()
        if let session = active, !session.isPaused, session.targetMinutes > 0, ratio >= 1, alertedID != session.id {
            alertedID = session.id; NSSound.beep(); AppWindows.shared.finish()
        }
        if active != nil && active?.isPaused == false && now.timeIntervalSince(archive.checkpoint) >= 15 { _ = persist(archive) }
        if now.timeIntervalSince(lastRefresh) >= 5 { refreshShared(); lastRefresh = now }
    }
    @discardableResult private func persist(_ value: AppArchive) -> Bool {
        guard let storage else { return false }
        do {
            let checkpoint = Date()
            try storage.saveTimer(value.active, expectedID: archive.active?.id, checkpoint: checkpoint)
            archive = value; archive.checkpoint = checkpoint; return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func selectPage(_ next: AppPage) {
        page = next
        if next == .timeline { goToday() }
        else if next != .timer { refreshDashboard() }
    }
    func goToday() { focusDate = logicalDate(); focusRequest = UUID(); refreshDashboard() }
    func shiftDate(_ amount: Int) {
        let step = page == .stats || (page == .projects && scope == "week") ? 7 : 1
        focusDate = Calendar.current.date(byAdding: .day, value: step * amount, to: focusDate) ?? focusDate
        refreshDashboard()
    }
    func refreshDashboard() {
        guard let storage else { return }
        do { dashboard = try storage.dashboard(date: focusDate, scope: page == .timeline ? "day" : page == .stats ? "week" : scope, projects: projects, now: Date()) }
        catch { self.error = error.localizedDescription }
    }
    func setGoal(_ path: String, hours: Double) {
        guard let storage, hours.isFinite, hours >= 0, hours <= 168, scope != "total" else { return }
        do { try storage.setGoal(path: path, date: focusDate, scope: scope, minutes: hours * 60); refreshDashboard(); error = nil }
        catch { self.error = error.localizedDescription }
    }
    func openProject(_ path: String) {
        guard let storage else { return }
        do { NSWorkspace.shared.open(try storage.bridge.safeURL(path)) } catch { self.error = error.localizedDescription }
    }
}

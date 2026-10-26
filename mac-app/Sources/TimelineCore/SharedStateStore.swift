import Foundation

public struct SharedSnapshot {
    public let active: DesktopSession?
    public let checkpoint: Date
    public let records: [TimelineRecord]
}

public final class SharedStateStore {
    public static func verifyRuntime() throws { try SharedScript().validate("{\"version\":1,\"days\":{}}") }
    public let bridge: VaultBridge
    public let url: URL
    let script: SharedScript
    public init(bridge: VaultBridge) throws {
        self.bridge = bridge; self.url = try bridge.stateURL()
        guard FileManager.default.fileExists(atPath: url.path) else { throw SharedStateError.missing }
        script = try SharedScript()
        _ = try read()
    }
    func read() throws -> (Data, [String: Any]) {
        guard try bridge.stateURL() == url else { throw SharedStateError.script("插件的数据路径已更改，请重新选择数据文件；旧文件未覆盖。") }
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { throw SharedStateError.invalid }
        try script.validate(text)
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw SharedStateError.invalid }
        return (data, value)
    }
    public func load() throws -> SharedSnapshot {
        let (_, state) = try read()
        let timer = state["macTimer"] as? [String: Any] ?? [:]
        var active: DesktopSession?
        if let raw = timer["active"], !(raw is NSNull) {
            active = try ArchiveStore.decoder().decode(DesktopSession.self, from: JSONSerialization.data(withJSONObject: raw))
            guard active?.version == 1, active?.segments.isEmpty == false, active?.endedAt == nil, active?.vaultPath == bridge.root.path else { throw SharedStateError.invalid }
        }
        let checkpoint = (timer["checkpoint"] as? String).flatMap { try? ArchiveStore.decoder().decode(Date.self, from: JSONEncoder().encode($0)) }
        if active != nil && checkpoint == nil { throw SharedStateError.invalid }
        return SharedSnapshot(active: active, checkpoint: checkpoint ?? Date(), records: timelineRecords(state))
    }
    public func saveTimer(_ active: DesktopSession?, expectedID: String?, checkpoint: Date = Date()) throws {
        try SharedFileLock.withLock(file: url) {
            let (before, original) = try read(); var state = original
            var timer = state["macTimer"] as? [String: Any] ?? [:]
            let currentID = (timer["active"] as? [String: Any])?["id"] as? String
            guard currentID == expectedID else { throw SharedStateError.conflict }
            timer["version"] = 1
            timer["checkpoint"] = try JSONSerialization.jsonObject(with: ArchiveStore.encoder().encode(checkpoint), options: .fragmentsAllowed)
            timer["active"] = try active.map { try JSONSerialization.jsonObject(with: ArchiveStore.encoder().encode($0)) } ?? NSNull()
            state["macTimer"] = timer
            try write(state, expected: before)
        }
    }
    public func finish(_ session: DesktopSession) throws {
        guard session.vaultPath == bridge.root.path else { throw StorageError.unsafePath }
        try SharedFileLock.withLock(file: url) {
            let (before, original) = try read()
            let receipts = original["desktopReceipts"] as? [String: Any] ?? [:]
            let oldReceipt = bridge.receipt(for: session)
            let imported = receipts[session.id] != nil || ["imported", "too-short"].contains(oldReceipt?.status ?? "")
            let projectURL = try bridge.safeURL(session.projectPath)
            let projectBefore = imported ? nil : try Data(contentsOf: projectURL)
            let project = projectBefore.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            if projectBefore != nil && project.isEmpty && !projectBefore!.isEmpty { throw SharedStateError.invalid }
            let result = try script.finish(state: String(decoding: before, as: UTF8.self), session: session, settings: bridge.settings(), project: project, alreadyImported: imported)
            guard let state = result["state"] as? [String: Any], let after = result["project"] as? String else { throw SharedStateError.invalid }
            let changed = projectBefore != nil && after != project
            if try Data(contentsOf: url) != before { throw SharedStateError.conflict }
            if let projectBefore, try Data(contentsOf: projectURL) != projectBefore { throw SharedStateError.conflict }
            if changed { try Data(after.utf8).write(to: projectURL, options: .atomic) }
            do { try write(state, expected: before) }
            catch {
                if changed, (try? Data(contentsOf: projectURL)) == Data(after.utf8), let projectBefore {
                    try projectBefore.write(to: projectURL, options: .atomic)
                }
                throw error
            }
        }
    }
    public func adoptLegacy(_ archive: AppArchive) throws {
        let (_, state) = try read()
        guard state["macTimer"] == nil else { return }
        // Old receipts protect intentionally deleted facts; the old archive itself stays untouched.
        for session in archive.history where session.vaultPath == bridge.root.path { try finish(session) }
        var active = archive.active
        if active?.vaultPath != bridge.root.path { active = nil }
        active?.pause(at: min(archive.checkpoint, Date()))
        try saveTimer(active, expectedID: nil)
    }
    func write(_ state: [String: Any], expected: Data) throws {
        guard try Data(contentsOf: url) == expected else { throw SharedStateError.conflict }
        let data = try JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        try data.write(to: url, options: .atomic)
    }
}

import Foundation

public struct ActiveMetadata: Equatable {
    public let id, title, note, projectPath: String
    public init(_ session: DesktopSession) { id = session.id; title = session.title; note = session.note; projectPath = session.projectPath }
}
extension SharedStateStore {
    /// Merge content into the latest session; never replace newer marks, pauses or checkpoints.
    public func editActiveMetadata(expected: ActiveMetadata, title: String, note: String, project: Project) throws {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 400, note.count <= 20_000 else { throw SharedStateError.script("请填写标题；标题限400字，备注限20000字") }
        try SharedFileLock.withLock(file: url) {
            let (before, original) = try read(); var state = original
            guard var timer = state["macTimer"] as? [String: Any], var raw = timer["active"] as? [String: Any] else { throw SharedStateError.conflict }
            let session = try ArchiveStore.decoder().decode(DesktopSession.self, from: JSONSerialization.data(withJSONObject: raw))
            guard session.vaultPath == bridge.root.path, session.endedAt == nil, ActiveMetadata(session) == expected else { throw SharedStateError.script("计时内容已变化，请重新打开后修改") }
            guard project.isActive || project.path == session.projectPath else { throw SharedStateError.script("请选择进行中的项目") }
            let file = try bridge.safeURL(project.path)
            guard file.pathExtension.lowercased() == "md", FileManager.default.fileExists(atPath: file.path) else { throw StorageError.unsafePath }
            raw["title"] = title; raw["note"] = note.trimmingCharacters(in: .whitespacesAndNewlines)
            raw["projectPath"] = project.path; raw["projectName"] = project.name
            if project.path != session.projectPath {
                if session.sourcePlan != nil { raw["targetMinutes"] = 0 }
                raw.removeValue(forKey: "sourcePlan")
            }
            timer["active"] = raw; state["macTimer"] = timer
            try write(state, expected: before)
        }
    }
}

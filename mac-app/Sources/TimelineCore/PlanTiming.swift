import Foundation

extension SharedStateStore {
    /// Start now without mutating the plan; cancellation leaves it exactly as it was.
    public func startPlan(date: String, id: String, revision: String, now: Date = Date(), minimumRecordSeconds: Int? = nil) throws -> DesktopSession {
        try SharedFileLock.withLock(file: url) {
            let (before, original) = try read()
            let value = try script.invoke("nativePreparePlan", arguments: [String(decoding: before, as: UTF8.self), date, id, revision, ISO8601DateFormatter().string(from: now)])
            guard let text = value.toString() else { throw SharedStateError.invalid }
            struct Draft: Decodable { let title, projectPath, note: String; let targetMinutes: Int; let source: PlanSource }
            let draft = try JSONDecoder().decode(Draft.self, from: Data(text.utf8))
            let file = try bridge.safeURL(draft.projectPath)
            guard file.pathExtension.lowercased() == "md" else { throw StorageError.unsafePath }
            let fields = frontmatterFields(try String(contentsOf: file, encoding: .utf8))
            let types = bridge.settings()["projectTypes"] as? [[String: String]] ?? [["type": "project", "color": "#467eae"]]
            guard let definition = types.first(where: { $0["type"]?.lowercased() == fields["type"]?.lowercased() }) else { throw SharedStateError.script("计划关联的项目类型已改变，请先检查项目") }
            let project = Project(path: draft.projectPath, name: file.deletingPathExtension().lastPathComponent, color: fields["color"] ?? definition["color"] ?? "#467eae", status: fields["status"] ?? "planned")
            guard project.isActive else { throw SharedStateError.script("请先将计划关联的项目设为进行中") }
            var session = DesktopSession(project: project, title: draft.title, targetMinutes: draft.targetMinutes, vaultPath: bridge.root.path, now: now, minimumRecordSeconds: minimumRecordSeconds)
            session.note = draft.note; session.sourcePlan = draft.source
            var state = original, timer = original["macTimer"] as? [String: Any] ?? [:]
            timer["version"] = 1
            timer["active"] = try JSONSerialization.jsonObject(with: ArchiveStore.encoder().encode(session))
            timer["checkpoint"] = try JSONSerialization.jsonObject(with: ArchiveStore.encoder().encode(now), options: .fragmentsAllowed)
            state["macTimer"] = timer
            try write(state, expected: before); return session
        }
    }
}

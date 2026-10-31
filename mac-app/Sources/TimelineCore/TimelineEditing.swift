import Foundation

public struct BlockEdit: Encodable, Identifiable {
    public let id: String
    public let date: String
    public var start, end: Double
    public var title = "", note = "", projectPath = "", tagId = "", kind = "fact"
    public var move = false
    public var updateContent = false
    public let expected: String?
    public init(date: String, start: Double, end: Double, id: String = "block-" + UUID().uuidString.lowercased(), expected: String? = nil) {
        self.date = date; self.start = start; self.end = end; self.id = id; self.expected = expected
    }
    public init?(item: DashboardItem, date: String) {
        guard item.editable == true, let revision = item.revision,
              let raw = try? JSONSerialization.jsonObject(with: Data(revision.utf8)) as? [String: Any] else { return nil }
        self.init(date: date, start: item.start, end: item.end, id: item.id, expected: revision)
        title = item.title; note = item.note; projectPath = item.projectPath; tagId = raw["tagId"] as? String ?? ""
        kind = item.plan == true ? "todo" : "fact"; updateContent = true
    }
}
public struct BlockTag: Identifiable {
    public let id, name, color: String
}
public struct BlockOptions {
    public let requirement: String
    public let tags: [BlockTag]
}
public enum BlockGeometry {
    public static func minute(y: Double, scale: Double) -> Int {
        max(120, min(1555, Int((((y - 18) / TimelineZoom.clamp(scale) + 120) / 5).rounded()) * 5))
    }
    public static func moved(start: Double, end: Double, delta: Double, scale: Double) -> (Double, Double) {
        let duration = max(0, end - start), shift = (delta / TimelineZoom.clamp(scale) / 5).rounded() * 5
        let next = max(120, min(1560 - duration, start + shift))
        return (next, next + duration)
    }
    public static func resized(start: Double, end: Double, delta: Double, scale: Double, top: Bool) -> (Double, Double) {
        let shift = (delta / TimelineZoom.clamp(scale) / 5).rounded() * 5
        let minimum = min(5, max(0, end - start))
        return top ? (max(120, min(end - minimum, start + shift)), end)
            : (start, max(start + minimum, min(1560, end + shift)))
    }
}

extension SharedStateStore {
    public func blockOptions() -> BlockOptions {
        let settings = bridge.settings()
        let tags = (settings["tags"] as? [[String: Any]] ?? []).compactMap { value -> BlockTag? in
            guard let id = value["id"] as? String, let name = value["name"] as? String else { return nil }
            return BlockTag(id: id, name: name, color: value["color"] as? String ?? "#a4aab5")
        }
        return BlockOptions(requirement: settings["itemMetadataRequirement"] as? String ?? "none", tags: tags)
    }
    public func editBlock(_ edit: BlockEdit) throws {
        try SharedFileLock.withLock(file: url) {
            let (before, original) = try read()
            if (edit.expected == nil || edit.updateContent) && !edit.projectPath.isEmpty {
                let project = try bridge.safeURL(edit.projectPath)
                guard project.pathExtension.lowercased() == "md", FileManager.default.fileExists(atPath: project.path) else { throw StorageError.unsafePath }
            }
            let days = original["days"] as? [String: [String: Any]] ?? [:]
            let items = days[edit.date]?["items"] as? [[String: Any]] ?? []
            let old = items.first { $0["id"] as? String == edit.id }
            let path = edit.expected == nil ? (edit.kind == "todo" ? "" : edit.projectPath) : (old?["projectLogId"] is String
                ? (old?["projectLogPath"] as? String ?? old?["projectPath"] as? String ?? "") : "")
            let plan = (old?["kind"] as? String ?? edit.kind) == "todo"
            let destination = plan ? "" : ((edit.updateContent || edit.expected == nil) ? edit.projectPath : path)
            var notes: [String: (url: URL, before: Data)] = [:]
            for name in Set([path, destination]).filter({ !$0.isEmpty }) {
                let url = try bridge.safeURL(name)
                guard url.pathExtension.lowercased() == "md", !notes.values.contains(where: { $0.url == url }) else { throw StorageError.unsafePath }
                let data = try Data(contentsOf: url)
                guard String(data: data, encoding: .utf8) != nil else { throw SharedStateError.invalid }
                notes[name] = (url, data)
            }
            let projectText = notes[path].map { String(decoding: $0.before, as: UTF8.self) } ?? ""
            let destinationText = notes[destination].map { String(decoding: $0.before, as: UTF8.self) } ?? ""
            let settings = String(decoding: try JSONSerialization.data(withJSONObject: bridge.settings()), as: UTF8.self)
            let request = String(decoding: try JSONEncoder().encode(edit), as: UTF8.self)
            let value = try script.invoke("nativeEditBlock", arguments: [String(decoding: before, as: UTF8.self), request, settings, projectText, destinationText])
            guard let text = value.toString(), let result = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                  let state = result["state"] as? [String: Any], let projects = result["projects"] as? [String: String], Set(projects.keys).isSubset(of: Set(notes.keys)) else { throw SharedStateError.invalid }
            guard try Data(contentsOf: url) == before else { throw SharedStateError.conflict }
            for note in notes.values { guard try Data(contentsOf: note.url) == note.before else { throw SharedStateError.conflict } }
            var written: [(url: URL, before: Data, after: Data)] = []
            do {
                for name in projects.keys.sorted() {
                    guard let note = notes[name] else { throw SharedStateError.invalid }
                    let after = Data(projects[name]!.utf8)
                    guard try Data(contentsOf: note.url) == note.before else { throw SharedStateError.conflict }
                    if after != note.before { try after.write(to: note.url, options: .atomic); written.append((note.url, note.before, after)) }
                }
                try write(state, expected: before)
            } catch {
                var failures = false
                for note in written.reversed() {
                    do {
                        guard try Data(contentsOf: note.url) == note.after else { throw SharedStateError.conflict }
                        try note.before.write(to: note.url, options: .atomic)
                    } catch { failures = true }
                }
                if failures { throw SharedStateError.script("保存失败，部分项目文件被其他操作修改，请检查日志") }
                throw error
            }
        }
    }
}

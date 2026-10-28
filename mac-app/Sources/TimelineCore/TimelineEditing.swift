import Foundation

public struct BlockEdit: Encodable, Identifiable {
    public let id: String
    public let date: String
    public var start, end: Int
    public var title = "", note = "", projectPath = "", tagId = ""
    public let expected: String?
    public init(date: String, start: Int, end: Int, id: String = "block-" + UUID().uuidString.lowercased(), expected: String? = nil) {
        self.date = date; self.start = start; self.end = end; self.id = id; self.expected = expected
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
    public static func resized(start: Double, end: Double, delta: Double, scale: Double, top: Bool) -> (Int, Int) {
        let shift = Int((delta / TimelineZoom.clamp(scale) / 5).rounded()) * 5
        return top ? (max(120, min(Int(end) - 5, Int(start) + shift)), Int(end))
            : (Int(start), max(Int(start) + 5, min(1560, Int(end) + shift)))
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
            let days = original["days"] as? [String: [String: Any]] ?? [:]
            let items = days[edit.date]?["items"] as? [[String: Any]] ?? []
            let old = items.first { $0["id"] as? String == edit.id }
            let path = edit.expected == nil ? edit.projectPath : (old?["projectLogId"] is String
                ? (old?["projectLogPath"] as? String ?? old?["projectPath"] as? String ?? "") : "")
            let projectURL = try path.isEmpty ? nil : bridge.safeURL(path)
            let projectBefore = try projectURL.map { try Data(contentsOf: $0) }
            if let projectURL, projectURL.pathExtension.lowercased() != "md" { throw StorageError.unsafePath }
            let projectText = projectBefore.map { String(decoding: $0, as: UTF8.self) } ?? ""
            if let projectBefore, Data(projectText.utf8) != projectBefore { throw SharedStateError.invalid }
            let settings = String(decoding: try JSONSerialization.data(withJSONObject: bridge.settings()), as: UTF8.self)
            let request = String(decoding: try JSONEncoder().encode(edit), as: UTF8.self)
            let value = try script.invoke("nativeEditBlock", arguments: [String(decoding: before, as: UTF8.self), request, settings, projectText])
            guard let text = value.toString(), let result = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                  let state = result["state"] as? [String: Any], let project = result["project"] as? String else { throw SharedStateError.invalid }
            let changed = projectBefore != nil && project != projectText
            guard try Data(contentsOf: url) == before else { throw SharedStateError.conflict }
            if let projectURL, let projectBefore, try Data(contentsOf: projectURL) != projectBefore { throw SharedStateError.conflict }
            if changed, let projectURL { try Data(project.utf8).write(to: projectURL, options: .atomic) }
            do { try write(state, expected: before) }
            catch {
                if changed, let projectURL, let projectBefore, (try? Data(contentsOf: projectURL)) == Data(project.utf8) {
                    try projectBefore.write(to: projectURL, options: .atomic)
                }
                throw error
            }
        }
    }
}

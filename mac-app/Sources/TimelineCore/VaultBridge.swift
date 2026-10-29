import Foundation

public struct BridgeReceipt: Codable {
    public let id: String
    public let status: String
    public let message: String?
}

public struct VaultBridge {
    public let root: URL
    public init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }

    public func safeURL(_ path: String) throws -> URL {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("\\"), !path.split(separator: "/").contains("..") else { throw StorageError.unsafePath }
        var target = root
        for component in path.split(separator: "/") {
            target.appendPathComponent(String(component))
            if let link = try? FileManager.default.destinationOfSymbolicLink(atPath: target.path) {
                target = link.hasPrefix("/") ? URL(fileURLWithPath: link) : target.deletingLastPathComponent().appendingPathComponent(link)
            }
            target = target.standardizedFileURL.resolvingSymlinksInPath()
            guard target.path.hasPrefix(root.path + "/") else { throw StorageError.unsafePath }
        }
        return target
    }

    public func settings() -> [String: Any] {
        guard let url = try? safeURL(".obsidian/plugins/branch-timeline-hz/data.json"),
              let data = try? Data(contentsOf: url), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return value
    }

    public func inbox() throws -> URL {
        let statePath = settings()["statePath"] as? String ?? "99_assets/branch-timeline/state.json"
        _ = try safeURL(statePath)
        let parent = (statePath as NSString).deletingLastPathComponent
        return try safeURL((parent.isEmpty ? "" : parent + "/") + "desktop-inbox")
    }

    public func stateURL() throws -> URL {
        let config = try safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        if FileManager.default.fileExists(atPath: config.path) {
            let data = try Data(contentsOf: config)
            guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  value["statePath"] == nil || value["statePath"] is String else { throw SharedStateError.invalid }
            return try safeURL(value["statePath"] as? String ?? "99_assets/branch-timeline/state.json")
        }
        return try safeURL("99_assets/branch-timeline/state.json")
    }

    public func export(_ session: DesktopSession) throws {
        guard session.endedAt != nil, UUID(uuidString: session.id) != nil else { throw StorageError.invalid }
        guard session.vaultPath == root.path else { throw StorageError.unsafePath }
        _ = try safeURL(session.projectPath)
        let directory = try inbox()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let target = directory.appendingPathComponent(session.id + ".json")
        let data = try ArchiveStore.encoder().encode(session)
        if FileManager.default.fileExists(atPath: target.path) {
            guard try Data(contentsOf: target) == data else { throw StorageError.conflict }
            if receipt(for: session)?.status != "imported" && receipt(for: session)?.status != "too-short" {
                try FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: target.path)
            }
            return
        }
        let temporary = directory.appendingPathComponent(".\(UUID().uuidString).tmp")
        do {
            try data.write(to: temporary, options: .withoutOverwriting)
            try FileManager.default.moveItem(at: temporary, to: target)
        } catch {
            try? FileManager.default.removeItem(at: temporary)
            throw error
        }
    }

    public func receipt(for session: DesktopSession) -> BridgeReceipt? {
        guard let directory = try? inbox(), let data = try? Data(contentsOf: directory.appendingPathComponent(session.id + ".receipt.json")),
              let receipt = try? JSONDecoder().decode(BridgeReceipt.self, from: data), receipt.id == session.id else { return nil }
        return receipt
    }

    public func projects() throws -> [Project] {
        let configured = settings()["projectTypes"] as? [[String: String]] ?? [["type": "project", "color": "#467eae"]]
        let colors = Dictionary(configured.compactMap { item -> (String, String)? in
            guard let type = item["type"], !type.isEmpty else { return nil }; return (type.lowercased(), item["color"] ?? "#467eae")
        }, uniquingKeysWith: { first, _ in first })
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey]
        guard let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else { return [] }
        var result: [Project] = []
        for case let url as URL in files where url.pathExtension.lowercased() == "md" {
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                  (values.fileSize ?? 0) < 2_000_000 else { continue }
            let canonical = url.standardizedFileURL.resolvingSymlinksInPath()
            guard canonical.path.hasPrefix(root.path + "/") else { continue }
            let path = String(canonical.path.dropFirst(root.path.count + 1))
            guard (try? safeURL(path)) != nil, let source = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let fields = frontmatterFields(source)
            guard let type = fields["type"]?.lowercased(), let color = colors[type] else { continue }
            result.append(Project(path: path, name: url.deletingPathExtension().lastPathComponent,
                                  color: fields["color"] ?? color, status: fields["status"] ?? "planned"))
        }
        return result.sorted {
            let left = ["active", "doing", "进行中"].contains($0.status) ? 0 : 1
            let right = ["active", "doing", "进行中"].contains($1.status) ? 0 : 1
            return left == right ? $0.name.localizedStandardCompare($1.name) == .orderedAscending : left < right
        }
    }
}

public func frontmatterFields(_ source: String) -> [String: String] {
    let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    guard lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) == "---" else { return [:] }
    var result: [String: String] = [:]
    for line in lines.dropFirst() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines) == "---" { break }
        guard !line.hasPrefix(" "), let colon = line.firstIndex(of: ":") else { continue }
        let key = String(line[..<colon]); var value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
        if (value.hasPrefix("\"") && value.hasSuffix("\"")) || (value.hasPrefix("'") && value.hasSuffix("'")) { value = String(value.dropFirst().dropLast()) }
        else if let comment = value.range(of: " #") { value = String(value[..<comment.lowerBound]).trimmingCharacters(in: .whitespaces) }
        if ["type", "status", "color"].contains(key) { result[key] = value }
    }
    return result
}

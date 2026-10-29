import Foundation

/// File adapter for bundled, offline feature components. No arbitrary file or network access.
public final class FeatureVault {
    public let store: SharedStateStore
    public init(store: SharedStateStore) { self.store = store }
    private var configPath: String { ".obsidian/plugins/branch-timeline-hz/data.json" }
    private var statePath: String { String(store.url.path.dropFirst(store.bridge.root.path.count + 1)) }
    private func allowed(_ path: String, directory: Bool = false) throws -> URL {
        let url = try store.bridge.safeURL(path)
        guard directory || url.pathExtension.lowercased() == "md" || path == configPath || url == store.url else { throw StorageError.unsafePath }
        if path.hasPrefix(".") && path != configPath { throw StorageError.unsafePath }
        return url
    }
    public func read(_ path: String) throws -> String {
        let url = try allowed(path), data = try Data(contentsOf: url)
        guard data.count < 32_000_000, let text = String(data: data, encoding: .utf8) else { throw SharedStateError.invalid }
        return text
    }
    public func exists(_ path: String) throws -> Bool { FileManager.default.fileExists(atPath: try allowed(path, directory: true).path) }
    public func write(_ path: String, text: String, expected: String?) throws {
        let file = try allowed(path)
        guard try store.bridge.stateURL() == store.url else { throw SharedStateError.conflict }
        guard text.utf8.count < 32_000_000 else { throw SharedStateError.invalid }
        try SharedFileLock.withLock(file: store.url) {
            let current = FileManager.default.fileExists(atPath: file.path) ? try read(path) : nil
            guard current == expected else { throw SharedStateError.conflict }
            let output = text
            if file == store.url {
                try store.script.validate(text)
                guard let current, let next = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                      let old = try JSONSerialization.jsonObject(with: Data(current.utf8)) as? [String: Any] else { throw SharedStateError.invalid }
                let editable = Set(["version", "days", "projects", "achievements", "policySides", "policyCards", "policyNodes", "policyEvents", "fixedReminders", "fixedReminderResults", "lifeEvents"])
                for (key, value) in old where !editable.contains(key) {
                    guard equal(value, next[key]) else { throw SharedStateError.script("共享计时或其他数据已变化，未覆盖") }
                }
            } else if path == configPath {
                guard let next = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                      let current, let old = try JSONSerialization.jsonObject(with: Data(current.utf8)) as? [String: Any],
                      equal(old["statePath"], next["statePath"]) else { throw SharedStateError.script("数据位置请通过 App 的更换数据文件入口选择") }
            }
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(output.utf8).write(to: file, options: .atomic)
        }
    }
    public func makeFolder(_ path: String) throws { try FileManager.default.createDirectory(at: allowed(path, directory: true), withIntermediateDirectories: true) }
    public func trash(_ path: String, expected: String) throws {
        let file = try allowed(path)
        guard file.pathExtension.lowercased() == "md" else { throw StorageError.unsafePath }
        try SharedFileLock.withLock(file: store.url) {
            guard try read(path) == expected else { throw SharedStateError.conflict }
            try FileManager.default.trashItem(at: file, resultingItemURL: nil)
        }
    }
    public func catalog() throws -> [String: Any] {
        guard try store.bridge.stateURL() == store.url else { throw SharedStateError.conflict }
        let settings = store.bridge.settings()
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        let files = FileManager.default.enumerator(at: store.bridge.root, includingPropertiesForKeys: Array(keys), options: [.skipsHiddenFiles])
        var result: [[String: Any]] = []
        while let file = files?.nextObject() as? URL {
            guard file.pathExtension.lowercased() == "md", let info = try? file.resourceValues(forKeys: keys), info.isRegularFile == true else { continue }
            let canonical = file.standardizedFileURL.resolvingSymlinksInPath()
            guard canonical.path.hasPrefix(store.bridge.root.path + "/") else { continue }
            let path = String(canonical.path.dropFirst(store.bridge.root.path.count + 1))
            guard (try? allowed(path)) != nil else { continue }
            let data = (try? Data(contentsOf: file, options: .mappedIfSafe)) ?? Data()
            let prefix = String(decoding: data.prefix(16_384), as: UTF8.self)
            result.append(["path": path, "name": file.lastPathComponent, "basename": file.deletingPathExtension().lastPathComponent,
                           "stat": ["mtime": (info.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000, "size": info.fileSize ?? 0], "frontmatter": frontmatterFields(prefix)])
        }
        return ["settings": settings, "statePath": statePath, "files": result]
    }
}
private func equal(_ a: Any?, _ b: Any?) -> Bool {
    func data(_ value: Any?) -> Data? { try? JSONSerialization.data(withJSONObject: value ?? NSNull(), options: [.fragmentsAllowed, .sortedKeys]) }
    return data(a) == data(b)
}

import Foundation

public enum VaultDiscovery {
    public static func discover(remembered: String?, legacy: String?, registry: URL? = nil) -> VaultBridge? {
        for path in [remembered, legacy].compactMap({ $0 }) {
            let bridge = VaultBridge(root: URL(fileURLWithPath: path))
            if let url = try? bridge.stateURL(), FileManager.default.fileExists(atPath: url.path) { return bridge }
        }
        let file = registry ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/obsidian/obsidian.json")
        guard let data = try? Data(contentsOf: file), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let vaults = root["vaults"] as? [String: [String: Any]] else { return nil }
        var valid: [String: VaultBridge] = [:]
        for info in vaults.values {
            guard let path = info["path"] as? String else { continue }
            let bridge = VaultBridge(root: URL(fileURLWithPath: path))
            guard let config = try? bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json"),
                  FileManager.default.fileExists(atPath: config.path), let state = try? bridge.stateURL(), FileManager.default.fileExists(atPath: state.path) else { continue }
            valid[bridge.root.path] = bridge
        }
        return valid.count == 1 ? valid.values.first : nil
    }
    public static func fromStateFile(_ file: URL) throws -> VaultBridge {
        let selected = file.standardizedFileURL.resolvingSymlinksInPath()
        var parent = selected.deletingLastPathComponent()
        while parent.path != "/" {
            if FileManager.default.fileExists(atPath: parent.appendingPathComponent(".obsidian").path) {
                let bridge = VaultBridge(root: parent)
                guard try bridge.stateURL() == selected else { throw SharedStateError.script("此文件不是该笔记库设置中的时间线数据文件。") }
                return bridge
            }
            parent.deleteLastPathComponent()
        }
        throw SharedStateError.missing
    }
}

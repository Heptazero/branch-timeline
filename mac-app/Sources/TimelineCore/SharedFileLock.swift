import Foundation
import CryptoKit
import Darwin

public enum SharedFileLock {
    public static func folder(for file: URL) -> URL {
        // Foundation intentionally abbreviates /private/var to /var; Node uses POSIX realpath.
        let resolved = realpath(file.path, nil)
        let canonical = (resolved.map { String(cString: $0) } ?? file.standardizedFileURL.path).precomposedStringWithCanonicalMapping
        if let resolved { free(resolved) }
        let key = SHA256.hash(data: Data(canonical.utf8)).map { String(format: "%02x", $0) }.joined()
        return URL(fileURLWithPath: "/tmp/branch-timeline-locks-\(getuid())").appendingPathComponent(key)
    }

    public static func withLock<T>(file: URL, _ action: () throws -> T) throws -> T {
        let folder = folder(for: file), ownerFile = folder.appendingPathComponent("owner")
        let owner = try JSONSerialization.data(withJSONObject: ["pid": Int(getpid()), "token": UUID().uuidString])
        try FileManager.default.createDirectory(at: folder.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let deadline = Date().addingTimeInterval(3)
        while true {
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
                break
            } catch {
                guard FileManager.default.fileExists(atPath: folder.path) else { throw error }
                if let bytes = try? Data(contentsOf: ownerFile),
                   let info = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                   let pid = info["pid"] as? Int, pid > 0, pid <= Int(Int32.max),
                   kill(Int32(pid), 0) != 0, errno == ESRCH,
                   (try? Data(contentsOf: ownerFile)) == bytes {
                    if clearDead(folder, expected: bytes) { continue }
                }
                guard Date() < deadline else { throw SharedStateError.busy }
                Thread.sleep(forTimeInterval: 0.02)
            }
        }
        try owner.write(to: ownerFile, options: .withoutOverwriting)
        defer {
            if (try? Data(contentsOf: ownerFile)) == owner {
                try? FileManager.default.removeItem(at: ownerFile)
                if (try? FileManager.default.contentsOfDirectory(atPath: folder.path).isEmpty) == true { try? FileManager.default.removeItem(at: folder) }
            }
        }
        return try action()
    }

    private static func clearDead(_ folder: URL, expected: Data) -> Bool {
        let reaper = URL(fileURLWithPath: folder.path + ".reap"), owner = folder.appendingPathComponent("owner")
        do { try FileManager.default.createDirectory(at: reaper, withIntermediateDirectories: false) } catch { return false }
        defer { try? FileManager.default.removeItem(at: reaper) }
        guard (try? Data(contentsOf: owner)) == expected else { return false }
        do {
            try FileManager.default.removeItem(at: owner)
            guard try FileManager.default.contentsOfDirectory(atPath: folder.path).isEmpty else { return false }
            try FileManager.default.removeItem(at: folder)
            return true
        } catch { return false }
    }
}

public enum SharedStateError: LocalizedError {
    case busy, missing, invalid, conflict, script(String)
    public var errorDescription: String? {
        switch self {
        case .busy: return "时间线正在被另一个程序保存，请稍后重试。"
        case .missing: return "找不到原时间线数据文件，请选择现有 state.json。"
        case .invalid: return "原时间线数据格式无法读取，已停止写入。"
        case .conflict: return "文件在保存期间已被修改，未覆盖，请重试。"
        case .script(let message): return message
        }
    }
}

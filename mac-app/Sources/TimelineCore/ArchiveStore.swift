import Foundation

public struct AppArchive: Codable {
    public var version = 1
    public var checkpoint = Date()
    public var active: DesktopSession?
    public var history: [DesktopSession] = []
    public var vaultPath: String?
    public init() {}
}

public enum StorageError: LocalizedError {
    case invalid, changed, unsafePath, conflict
    public var errorDescription: String? {
        switch self {
        case .invalid: return "本地记录格式无法读取，已停止写入以保护原文件。"
        case .changed: return "记录已被其他程序修改，请重新打开 App。"
        case .unsafePath: return "项目或数据路径超出所选笔记库。"
        case .conflict: return "同名记录内容不同，已停止覆盖。"
        }
    }
}

public final class ArchiveStore {
    public let url: URL
    private var previous: Data?
    private var loaded = false
    public init(url: URL) { self.url = url }
    public static func encoder() -> JSONEncoder {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var value = encoder.singleValueContainer(); try value.encode(formatter.string(from: date))
        }
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; return encoder
    }
    public static func decoder() -> JSONDecoder {
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter(); let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard let date = fractional.date(from: text) ?? plain.date(from: text) else { throw StorageError.invalid }
            return date
        }
        return decoder
    }
    public func load() throws -> AppArchive {
        if !FileManager.default.fileExists(atPath: url.path) { previous = nil; loaded = true; return AppArchive() }
        let data = try Data(contentsOf: url)
        let archive: AppArchive
        do { archive = try Self.decoder().decode(AppArchive.self, from: data) }
        catch { throw StorageError.invalid }
        guard archive.version == 1, archive.active?.endedAt == nil, archive.active.map({ $0.version == 1 && !$0.segments.isEmpty }) ?? true,
              archive.history.allSatisfy({ $0.version == 1 && $0.endedAt != nil }) else { throw StorageError.invalid }
        previous = data; loaded = true; return archive
    }
    public func save(_ archive: AppArchive) throws {
        guard loaded else { throw StorageError.invalid }
        let current = FileManager.default.fileExists(atPath: url.path) ? try Data(contentsOf: url) : nil
        guard current == previous else { throw StorageError.changed }
        let data = try Self.encoder().encode(archive)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic); previous = data
    }
}

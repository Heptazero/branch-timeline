import Foundation

public extension Project {
    var isActive: Bool { ["active", "doing", "进行中"].contains(status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) }
}
public enum GoalInput {
    public static func hours(_ text: String) -> Double? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
        guard !value.isEmpty, let number = Double(value), number.isFinite, number >= 0, number <= 168 else { return nil }
        return number
    }
}
public enum TimelineZoom {
    public static let minimum = 0.08, maximum = 2.5, initial = 0.65
    public static func clamp(_ scale: Double) -> Double { min(maximum, max(minimum, scale.isFinite ? scale : initial)) }
    public static func cardHeight(minutes: Double, scale: Double) -> Double { max(2, max(0, minutes) * clamp(scale)) }
    public static func anchoredOffset(oldOffset: Double, viewport: Double, oldScale: Double, newScale: Double, height: Double) -> Double {
        let minute = (max(0, oldOffset) + viewport / 2) / clamp(oldScale)
        return min(max(0, height - viewport), max(0, minute * clamp(newScale) - viewport / 2))
    }
}
public enum CalendarGrid {
    public static func dates(in month: Date, calendar: Calendar = .current) -> [Date] {
        let start = calendar.date(from: calendar.dateComponents([.year, .month], from: month))!
        let offset = (calendar.component(.weekday, from: start) + 5) % 7
        return (0..<42).compactMap { calendar.date(byAdding: .day, value: $0 - offset, to: start) }
    }
    public static func sameWeek(_ a: Date, _ b: Date, calendar: Calendar = .current) -> Bool {
        func monday(_ date: Date) -> Date {
            calendar.date(byAdding: .day, value: -((calendar.component(.weekday, from: date) + 5) % 7), to: calendar.startOfDay(for: date))!
        }
        return monday(a) == monday(b)
    }
}
public struct CalendarActivity: Decodable {
    public let date: String; public let minutes: Double
    public init(date: String, minutes: Double) { self.date = date; self.minutes = minutes }
}
public struct ConnectionInfo {
    public let vaultPath, appPath, configuredPath, pluginVersion, projectTypes, comments: String
    public let sameFile, compatiblePlugin, catalogMatches: Bool
    public var consistent: Bool { sameFile && compatiblePlugin && catalogMatches }
    public init(vaultPath: String, appPath: String, configuredPath: String, pluginVersion: String, projectTypes: String, comments: String, sameFile: Bool, compatiblePlugin: Bool, catalogMatches: Bool) {
        self.vaultPath = vaultPath; self.appPath = appPath; self.configuredPath = configuredPath; self.pluginVersion = pluginVersion
        self.projectTypes = projectTypes; self.comments = comments; self.sameFile = sameFile; self.compatiblePlugin = compatiblePlugin; self.catalogMatches = catalogMatches
    }
}
public extension VaultBridge {
    func catalogSignature() -> String {
        let value = settings()["projectTypes"] ?? [["type": "project", "color": "#467eae"]]
        return (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])).map { String(decoding: $0, as: UTF8.self) } ?? ""
    }
}
extension SharedStateStore {
    public func connectionInfo(catalogSignature: String) throws -> ConnectionInfo {
        let configured = try bridge.stateURL(), settings = bridge.settings()
        let manifest = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/manifest.json")
        let raw = (try? Data(contentsOf: manifest)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let version = raw?["version"] as? String ?? "未知"
        let parts = version.split(separator: ".").compactMap { Int($0) }
        let compatible = parts.count >= 3 && (parts[0] > 0 || parts[1] > 3 || (parts[1] == 3 && parts[2] >= 58))
        let types = settings["projectTypes"] as? [[String: String]] ?? [["type": "project"]]
        return ConnectionInfo(vaultPath: bridge.root.path, appPath: url.path, configuredPath: configured.path, pluginVersion: version,
            projectTypes: types.compactMap { $0["type"] }.joined(separator: "、"), comments: settings["pluginCommentStyle"] as? String == "obsidian" ? "%% Obsidian 注释 %%" : "HTML 注释",
            sameFile: SharedFileLock.folder(for: url) == SharedFileLock.folder(for: configured), compatiblePlugin: compatible, catalogMatches: catalogSignature == bridge.catalogSignature())
    }
    public func calendar(month: Date, now: Date = Date()) throws -> [CalendarActivity] {
        let (before, _) = try read(), clock = ISO8601DateFormatter(); clock.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let value = try script.invoke("nativeCalendar", arguments: [String(decoding: before, as: UTF8.self), dayKey(month), clock.string(from: now)])
        guard let text = value.toString() else { throw SharedStateError.invalid }
        return try JSONDecoder().decode([CalendarActivity].self, from: Data(text.utf8))
    }
}

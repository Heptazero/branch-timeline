import Foundation

public struct Dashboard: Decodable {
    public let date, weekStart, weekEnd: String
    public let totalMinutes, expected: Double
    public let projects: [ProjectSummary]
    public let items: [DashboardItem]
    public let branches: [DashboardBranch]
    public let days: [DashboardDay]
    public let sleep: [SleepMetric]
    public let rhythm: RhythmSummary?
}
public struct ProjectSummary: Decodable, Identifiable {
    public var id: String { path }
    public let path, name, color, status: String
    public let actual, planned: Double
    public let distractions: Int
    public let interval: Double?
}
public struct DashboardItem: Decodable, Identifiable {
    public let id, title, kind, note, projectPath, branchId: String
    public let start, end: Double
    public let editable: Bool?
    public let revision: String?
    public let plan: Bool?
    public let milestone: Bool?
}
public struct DashboardBranch: Decodable, Identifiable { public let id, name: String }
public struct DashboardDay: Decodable, Identifiable {
    public var id: String { date }
    public let date: String
    public let minutes: Double
    public let distractions: Int
    public let bed, wake: Double?
    public let projects: [DayProject]?
    public let items: [DashboardItem]?
    public let rhythmEvents: [DayRhythmEvent]?
    public let focus: DayFocusContext?
}
public struct DayProject: Decodable, Identifiable {
    public var id: String { path }
    public let path, name, color: String
    public let minutes: Double
}
public struct SleepMetric: Decodable {
    public let label, value: String
    public let change: SleepChange?
}
public struct SleepChange: Decodable { public let text, tone: String }

extension SharedStateStore {
    public func dashboard(date: Date, scope: String, projects: [Project], now: Date = Date()) throws -> Dashboard {
        let (before, _) = try read()
        let catalog = String(decoding: try JSONEncoder().encode(projects), as: UTF8.self)
        let clock = ISO8601DateFormatter(); clock.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let value = try script.invoke("nativeDashboard", arguments: [String(decoding: before, as: UTF8.self), catalog, dayKey(date), scope, clock.string(from: now), String(decoding: try JSONSerialization.data(withJSONObject: bridge.settings()), as: UTF8.self)])
        guard let text = value.toString() else { throw SharedStateError.invalid }
        return try JSONDecoder().decode(Dashboard.self, from: Data(text.utf8))
    }
    public func setGoal(path: String, date: Date, scope: String, minutes: Double) throws {
        guard FileManager.default.fileExists(atPath: try bridge.safeURL(path).path) else { throw StorageError.unsafePath }
        try SharedFileLock.withLock(file: url) {
            let (before, _) = try read()
            let value = try script.invoke("nativeSetGoal", arguments: [String(decoding: before, as: UTF8.self), path, dayKey(date), scope, minutes])
            guard let text = value.toString(), let state = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { throw SharedStateError.invalid }
            try write(state, expected: before)
        }
    }
}

public func dayKey(_ date: Date) -> String {
    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}
public func logicalDate(_ now: Date = Date()) -> Date {
    Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .hour, value: -2, to: now) ?? now)
}

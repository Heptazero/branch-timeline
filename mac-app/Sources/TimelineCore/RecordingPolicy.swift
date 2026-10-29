import Foundation

public enum RecordingPolicy {
    public static let enabledKey = "discardShortTimers"
    public static let key = "minimumRecordSeconds"
    public static let defaultSeconds = 60
    public static let maximumSeconds = 3600
    public static func seconds(_ value: Int) -> Int { max(0, min(maximumSeconds, value)) }
    public static func load(_ defaults: UserDefaults = .standard) -> Int {
        if defaults.object(forKey: enabledKey) != nil && !defaults.bool(forKey: enabledKey) { return 0 }
        guard defaults.object(forKey: key) != nil else { return defaultSeconds }
        return seconds(defaults.integer(forKey: key))
    }
}

import Foundation
public struct DayRhythmEvent: Decodable, Identifiable { public let id, name: String; public let minute: Double; public let real: Bool }
public struct RhythmSummary: Decodable {
    public let wake, sleep, switchAt: Double
    public let elapsedMark, remainingMark: String
    public func label(_ now: Date) -> String {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: now), hour = parts.hour ?? 0
        let at = Double(hour * 60 + (parts.minute ?? 0) + (hour < 2 ? 1440 : 0))
        let elapsed = at < switchAt, minutes = Int(elapsed ? max(0, at - wake) : max(0, sleep - at))
        return (elapsed ? elapsedMark : remainingMark) + String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }
}
extension SharedStateStore {
    public func setRhythm(date: String, id: String, minute: Int?) throws {
        try SharedFileLock.withLock(file: url) {
            let (before, _) = try read()
            let settings = String(decoding: try JSONSerialization.data(withJSONObject: bridge.settings()), as: UTF8.self)
            let clock = ISO8601DateFormatter()
            let value = try script.invoke("nativeSetRhythm", arguments: [String(decoding: before, as: UTF8.self), settings, date, id, minute as Any? ?? NSNull(), clock.string(from: Date())])
            guard let text = value.toString(), let state = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { throw SharedStateError.invalid }
            try write(state, expected: before)
        }
    }
}

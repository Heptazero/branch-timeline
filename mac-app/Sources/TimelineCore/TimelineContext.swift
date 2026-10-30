import Foundation

public struct FocusPoint: Decodable, Identifiable {
    public let id, recordId, kind, label, color, revision: String
    public let minute, score: Double
    public let editable: Bool
    public let level: String?
}
public struct FocusForecastPoint: Decodable {
    public let minute, score: Double
    public let color: String
    public let ready: Bool
    public let evidenceDays: Int
}
public struct FocusPalette: Decodable { public let low, neutral, high: String }
public struct FocusLabel: Decodable, Identifiable { public let id, name: String; public let score: Double }
public struct EnergyPhase: Decodable, Identifiable {
    public let id, name, color: String
    public let at: Double
    public let side: Int
}
public struct TimelineGap: Decodable {
    public let start, end: Double
    public let current: Bool
}
public struct DayFocusContext: Decodable {
    public let marks: [FocusPoint]
    public let forecast: [FocusForecastPoint]
    public let colors: FocusPalette
    public let phases: [EnergyPhase]
    public let energyRevision: String
    public let gaps: [TimelineGap]
    public let labels: [FocusLabel]
}
public struct TimelineContextEdit: Encodable {
    public var date: String
    public var action = "save", kind = "mental", id = "context-" + UUID().uuidString.lowercased()
    public var minute: Double?
    public var score: Double?
    public var label: String?
    public var level: String?
    public var color: String?
    public var expected: String?
    public init(date: String) { self.date = date }
}
extension SharedStateStore {
    public func editContext(_ request: TimelineContextEdit) throws {
        try SharedFileLock.withLock(file: url) {
            let (before, _) = try read()
            let settings = String(decoding: try JSONSerialization.data(withJSONObject: bridge.settings()), as: UTF8.self)
            let json = String(decoding: try JSONEncoder().encode(request), as: UTF8.self)
            let value = try script.invoke("nativeEditContext", arguments: [String(decoding: before, as: UTF8.self), settings, json])
            guard let text = value.toString(), let state = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { throw SharedStateError.invalid }
            try write(state, expected: before)
        }
    }
}

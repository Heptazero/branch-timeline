import Foundation

public struct ProjectTimeValue {
    public let id, name, color: String
    public let minutes: Double
    public init(id: String, name: String, color: String, minutes: Double) { self.id = id; self.name = name; self.color = color; self.minutes = minutes }
}
public struct ProjectTimeSlice: Identifiable {
    public let id, name, color: String
    public let minutes, start, end: Double
    public var fraction: Double { end - start }
}
/// Both charts use the same additive project-work denominator, including uncatalogued projects.
public struct ProjectComposition {
    public let slices: [ProjectTimeSlice]
    public let total: Double
    public init(values: [ProjectTimeValue], descending: Bool) {
        var sums: [String: Double] = [:], definitions: [String: ProjectTimeValue] = [:]
        for value in values where value.minutes.isFinite && value.minutes > 0 {
            sums[value.id, default: 0] += value.minutes; definitions[value.id] = value
        }
        let total = sums.values.reduce(0, +)
        guard total.isFinite && total > 0 else { self.total = 0; slices = []; return }
        self.total = total
        let sorted = sums.keys.sorted { a, b in
            if sums[a] == sums[b] { return a < b }
            return descending ? sums[a]! > sums[b]! : sums[a]! < sums[b]!
        }
        var cursor = 0.0
        slices = sorted.map { id in
            let value = definitions[id]!, minutes = sums[id]!, start = cursor
            cursor += minutes / total
            return ProjectTimeSlice(id: id, name: value.name, color: value.color, minutes: minutes, start: start, end: min(1, cursor))
        }
    }
}

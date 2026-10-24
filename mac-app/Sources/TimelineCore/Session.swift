import Foundation

public struct Project: Codable, Equatable, Identifiable {
    public var id: String { path }
    public let path: String
    public let name: String
    public let color: String
    public let status: String
    public init(path: String, name: String, color: String = "#467eae", status: String = "active") {
        self.path = path; self.name = name; self.color = color; self.status = status
    }
}

public struct Segment: Codable, Equatable {
    public var start: Date
    public var end: Date?
    public init(start: Date, end: Date? = nil) { self.start = start; self.end = end }
}

public struct FocusMark: Codable, Equatable, Identifiable {
    public let id: String
    public let at: Date
    public let kind: String
    public let level: String
    public init(at: Date, kind: String, level: String = "medium") {
        self.id = UUID().uuidString.lowercased(); self.at = at; self.kind = kind; self.level = level
    }
}

public struct DesktopSession: Codable, Equatable, Identifiable {
    public let version: Int
    public let id: String
    public let projectPath: String
    public let projectName: String
    public let vaultPath: String
    public var title: String
    public let startedAt: Date
    public var endedAt: Date?
    public let targetMinutes: Int
    public var note: String
    public var segments: [Segment]
    public var markers: [FocusMark]

    public init(project: Project, title: String, targetMinutes: Int, vaultPath: String = "", now: Date = Date()) {
        self.version = 1; self.id = UUID().uuidString.lowercased()
        self.projectPath = project.path; self.projectName = project.name
        self.vaultPath = vaultPath
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? project.name : title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.startedAt = now; self.endedAt = nil; self.targetMinutes = max(0, targetMinutes)
        self.note = ""; self.segments = [Segment(start: now)]; self.markers = []
    }

    public var isPaused: Bool { endedAt == nil && segments.last?.end != nil }
    public func elapsed(at now: Date) -> TimeInterval {
        segments.reduce(0) { $0 + max(0, ($1.end ?? endedAt ?? now).timeIntervalSince($1.start)) }
    }
    public mutating func pause(at now: Date) {
        guard endedAt == nil, let last = segments.indices.last, segments[last].end == nil else { return }
        segments[last].end = max(now, segments[last].start)
    }
    public mutating func resume(at now: Date) {
        guard isPaused else { return }
        segments.append(Segment(start: max(now, segments.last?.end ?? now)))
    }
    public mutating func finish(at now: Date, title: String, note: String) {
        pause(at: now)
        endedAt = max(now, segments.last?.end ?? now)
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.title = text.isEmpty ? projectName : text
        self.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    public mutating func mark(_ kind: String, at now: Date, level: String = "medium") {
        guard endedAt == nil, !isPaused, ["good", "distraction"].contains(kind) else { return }
        markers.append(FocusMark(at: now, kind: kind, level: level))
    }
}

public func clockLabel(_ seconds: TimeInterval) -> String {
    let value = max(0, Int(seconds.rounded(.down)))
    return value >= 3600 ? String(format: "%d:%02d:%02d", value / 3600, value / 60 % 60, value % 60)
        : String(format: "%02d:%02d", value / 60, value % 60)
}

public func matchesProject(_ query: String, project: Project) -> Bool {
    let needle = query.precomposedStringWithCanonicalMapping.lowercased().filter { !$0.isWhitespace }
    if needle.isEmpty { return true }
    var characters = Array(needle)[...]
    for character in (project.name + " " + project.path).precomposedStringWithCanonicalMapping.lowercased() {
        if character == characters.first { characters = characters.dropFirst() }
        if characters.isEmpty { return true }
    }
    return false
}

import Foundation

public struct LearningReviewPolicy: Codable, Equatable {
    public static let minimumKey = "learningReviewMinimum"
    public static let intervalKey = "learningReviewInterval"
    public static let defaultMinimum = 30
    public static let defaultInterval = 30
    public static let maxAnswer = 2000

    public let minimum: Int
    public let intervalMinutes: Int?
    public init(minimum: Int, intervalMinutes: Int? = nil) {
        self.minimum = min(500, max(10, minimum))
        self.intervalMinutes = intervalMinutes.map { min(180, max(5, $0)) }
    }
    public static func load(_ defaults: UserDefaults = .standard) -> Self {
        let interval = defaults.object(forKey: intervalKey) == nil ? 0 : defaults.integer(forKey: intervalKey)
        let minimum = defaults.object(forKey: minimumKey) == nil ? defaultMinimum : defaults.integer(forKey: minimumKey)
        return Self(minimum: minimum, intervalMinutes: interval > 0 ? interval : nil)
    }
    public static func count(_ text: String) -> Int {
        text.filter { character in character.isLetter || character.isNumber }.count
    }
    public func accepts(_ text: String) -> Bool {
        text.count <= Self.maxAnswer && Self.count(text) >= minimum
    }
    public func validated(_ text: String?) throws -> String {
        let answer = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard accepts(answer) else {
            throw SharedStateError.script("回顾至少填写\(minimum)个有效字，最多\(Self.maxAnswer)字")
        }
        return answer
    }
}

public struct LearningCheckpoint: Codable, Equatable {
    public let seconds: TimeInterval
    public let answer: String
}

public struct LearningProgress: Codable, Equatable {
    public let policy: LearningReviewPolicy
    public private(set) var checkpoints: [LearningCheckpoint] = []
    public init(policy: LearningReviewPolicy) { self.policy = policy }
    public func isDue(elapsed: TimeInterval) -> Bool {
        guard let interval = policy.intervalMinutes else { return false }
        return elapsed - (checkpoints.last?.seconds ?? 0) >= TimeInterval(interval * 60)
    }
    public mutating func submit(_ answer: String, elapsed: TimeInterval) throws {
        guard isDue(elapsed: elapsed) else { throw SharedStateError.conflict }
        checkpoints.append(LearningCheckpoint(seconds: elapsed, answer: try policy.validated(answer)))
    }
}

public struct LearningRecall: Codable, Equatable {
    public let answer: String
    public let at: Date
}

public struct LearningReviewRecord: Codable, Equatable, Identifiable {
    public let id, projectPath, title: String
    public let endedAt: Date
    public let answer: String
    public let checkpoints: [LearningCheckpoint]
    public var recall: LearningRecall?

    init(session: DesktopSession, endedAt: Date, answer: String, progress: LearningProgress) {
        id = session.id; projectPath = session.projectPath; title = session.title
        self.endedAt = endedAt; self.answer = answer; checkpoints = progress.checkpoints
    }

    public static func due(in records: [Self], projectPath: String, now: Date) -> Self? {
        let latest = records.filter { $0.projectPath == projectPath }.max {
            $0.endedAt == $1.endedAt ? $0.id < $1.id : $0.endedAt < $1.endedAt
        }
        guard let latest, latest.recall == nil, dayKey(logicalDate(latest.endedAt)) < dayKey(logicalDate(now)) else { return nil }
        return latest
    }
}

extension SharedStateStore {
    func readLearningReviews(_ state: [String: Any]) throws -> [String: LearningReviewRecord] {
        guard let raw = state["learningReviews"] else { return [:] }
        return try ArchiveStore.decoder().decode([String: LearningReviewRecord].self, from: JSONSerialization.data(withJSONObject: raw))
    }

    func writeLearningReviews(_ records: [String: LearningReviewRecord], into state: inout [String: Any]) throws {
        state["learningReviews"] = try JSONSerialization.jsonObject(with: ArchiveStore.encoder().encode(records))
    }

    public func saveLearningRecall(id: String, answer: String, policy: LearningReviewPolicy, at: Date = Date()) throws {
        let answer = try policy.validated(answer)
        try SharedFileLock.withLock(file: url) {
            let (before, original) = try read()
            var state = original, reviews = try readLearningReviews(state)
            guard var entry = reviews[id] else { throw SharedStateError.conflict }
            if entry.recall != nil { return }
            entry.recall = LearningRecall(answer: answer, at: at); reviews[id] = entry
            try writeLearningReviews(reviews, into: &state)
            try write(state, expected: before)
        }
    }
}

import Foundation
import TimelineCore

enum LearningPrompt: Identifiable {
    case checkpoint(String)
    case recall(LearningReviewRecord, LearningReviewPolicy)

    var id: String {
        switch self {
        case .checkpoint(let id): return "checkpoint:" + id
        case .recall(let record, _): return "recall:" + record.id
        }
    }
}

struct LearningRecallPending: Error {}

extension AppModel {
    var learningProjectDefaultsKey: String? { archive.vaultPath.map { "learningReviewProjects:" + $0 } }
    var selectedLearningEnabled: Bool {
        learningOverride ?? (selectedPath.map { learningProjects.contains($0) } ?? false)
    }
    var learningBlocksClosing: Bool {
        learningPrompt != nil || (finishRequested && active?.learningReview != nil)
    }
    var learningCheckpointDue: Bool { active?.learningReview?.isDue(elapsed: elapsed) ?? false }

    func setLearningProject(_ path: String, enabled: Bool) {
        guard let key = learningProjectDefaultsKey else { return }
        if enabled { learningProjects.insert(path) } else { learningProjects.remove(path) }
        UserDefaults.standard.set(learningProjects.sorted(), forKey: key)
        if selectedPath == path { learningOverride = nil }
    }

    func selectTimerProject(_ path: String) {
        selectedPath = path
        _ = presentLearningRecall(path: path, enabled: selectedLearningEnabled)
    }

    func openProjectDetail(_ path: String) {
        projectDetailPath = path
        _ = presentLearningRecall(path: path, enabled: learningProjects.contains(path))
    }

    @discardableResult func presentLearningRecall(path: String, enabled: Bool) -> Bool {
        guard enabled, active == nil else { return false }
        if learningPrompt != nil { return true }
        guard let due = LearningReviewRecord.due(in: learningReviews, projectPath: path, now: Date()) else { return false }
        learningPrompt = .recall(due, LearningReviewPolicy.load())
        return true
    }

    func pauseForReview() {
        if pause(), learningCheckpointDue { openLearningCheckpoint() }
    }

    func openLearningCheckpoint() {
        guard !finishRequested, learningPrompt == nil, let session = active, learningCheckpointDue, pause() else { return }
        learningPrompt = .checkpoint(session.id)
        AppWindows.shared.showMain()
    }

    @discardableResult func submitLearning(_ answer: String, prompt: LearningPrompt) -> Bool {
        guard prompt.id == learningPrompt?.id else { return false }
        do {
            switch prompt {
            case .checkpoint(let id):
                guard var session = active, session.id == id, var progress = session.learningReview else { throw SharedStateError.conflict }
                try progress.submit(answer, elapsed: session.elapsed(at: Date()))
                session.learningReview = progress
                var next = archive; next.active = session
                guard persist(next) else { return false }
                learningPrompt = nil
            case .recall(let record, let policy):
                guard let storage else { throw SharedStateError.missing }
                try storage.saveLearningRecall(id: record.id, answer: answer, policy: policy)
                refreshShared()
            }
            error = nil
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
}

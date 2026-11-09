import Foundation
import TimelineCore

extension CoreTests {
    func testLearningCheckpointCountsActiveTimeAndRejectsFiller() throws {
        let policy = LearningReviewPolicy(minimum: 10, intervalMinutes: 5)
        precondition(LearningReviewPolicy.count("学 A1…！ 📝") == 3)
        precondition(!policy.accepts("不够！ 。。。"))
        let answer = "缺页异常和实际读盘是两件事情"
        var run = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "复习", targetMinutes: 0, now: origin)
        run.learningReview = LearningProgress(policy: policy)
        run.pause(at: origin.addingTimeInterval(295))
        precondition(!run.learningReview!.isDue(elapsed: run.elapsed(at: origin.addingTimeInterval(600))))
        run.resume(at: origin.addingTimeInterval(600))
        let elapsed = run.elapsed(at: origin.addingTimeInterval(607))
        precondition(run.learningReview!.isDue(elapsed: elapsed))
        do { try run.learningReview!.submit("不够", elapsed: elapsed); preconditionFailure("Short answer accepted") } catch {}
        try run.learningReview!.submit(answer, elapsed: elapsed)
        precondition(!run.learningReview!.isDue(elapsed: elapsed + 299))
        precondition(run.learningReview!.isDue(elapsed: elapsed + 300))
        let decoded = try ArchiveStore.decoder().decode(DesktopSession.self, from: ArchiveStore.encoder().encode(run))
        precondition(decoded.learningReview == run.learningReview)
    }

    func testLearningJournalSavesAtomicallyAndRecallIsDueOnNextLogicalDay() throws {
        let (bridge, store) = try sharedFixture()
        let projectFile = try bridge.safeURL("p.md")
        let previous = try Data(contentsOf: projectFile)
        let policy = LearningReviewPolicy(minimum: 10)
        let answer = "缺页异常和实际读盘是两件事情"
        var run = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "复习", targetMinutes: 0, vaultPath: bridge.root.path, now: origin, minimumRecordSeconds: 60)
        run.learningReview = LearningProgress(policy: policy)
        try store.saveTimer(run, expectedID: nil, checkpoint: origin)
        run.finish(at: origin.addingTimeInterval(12), title: run.title, note: "")
        let before = try Data(contentsOf: store.url)
        do { try store.finish(run, learningAnswer: "太短"); preconditionFailure("Finish bypassed review") } catch {}
        let rejected = try Data(contentsOf: store.url)
        precondition(rejected == before)
        try store.finish(run, learningAnswer: answer)
        let saved = try store.load(), notes = try Data(contentsOf: projectFile)
        precondition(saved.active == nil && saved.records.isEmpty && notes == previous)
        precondition(saved.learningReviews.count == 1 && saved.learningReviews[0].answer == answer)
        let next = Calendar.current.date(byAdding: .day, value: 1, to: origin)!
        precondition(LearningReviewRecord.due(in: saved.learningReviews, projectPath: "p.md", now: origin) == nil)
        precondition(LearningReviewRecord.due(in: saved.learningReviews, projectPath: "other.md", now: next) == nil)
        precondition(LearningReviewRecord.due(in: saved.learningReviews, projectPath: "p.md", now: next)?.id == run.id)
        try store.saveLearningRecall(id: run.id, answer: answer, policy: policy, at: next)
        try store.saveLearningRecall(id: run.id, answer: "重复提交不能覆盖之前保存的回顾", policy: policy, at: next)
        try store.finish(run, learningAnswer: answer)
        let after = try store.load()
        precondition(after.learningReviews[0].recall?.answer == answer)
        precondition(LearningReviewRecord.due(in: after.learningReviews, projectPath: "p.md", now: next) == nil)
    }
}

import Foundation
import TimelineCore

extension CoreTests {
    func testMovedVaultResumesItsExistingTimerAtCheckpoint() throws {
        let (bridge, store) = try sharedFixture()
        let formerRoot = bridge.root.path + "-former"
        var run = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "保留中途进度",
                                 targetMinutes: 0, vaultPath: formerRoot, now: origin)
        run.mark("good", at: origin.addingTimeInterval(20))
        run.learningReview = LearningProgress(policy: LearningReviewPolicy(minimum: 30))
        let checkpoint = origin.addingTimeInterval(54)
        try store.saveTimer(run, expectedID: nil, checkpoint: checkpoint)

        let before = try Data(contentsOf: store.url)
        let unverified = try store.recoverRelocatedTimer(rememberedRoot: "/another")
        precondition(unverified == nil)
        try FileManager.default.createDirectory(atPath: formerRoot, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(atPath: formerRoot) }
        do {
            try store.recoverRelocatedTimer(rememberedRoot: formerRoot, explicitlySelected: true)
            preconditionFailure("A copied live timer cannot be recovered while its owner exists")
        } catch {}
        let afterRefusal = try Data(contentsOf: store.url)
        precondition(afterRefusal == before)
        try FileManager.default.removeItem(atPath: formerRoot)

        let migrated = try store.recoverRelocatedTimer(rememberedRoot: formerRoot, now: origin.addingTimeInterval(7200))
        precondition(migrated == formerRoot)
        let snapshot = try store.load()
        let active = snapshot.active!
        precondition(active.id == run.id && active.vaultPath == bridge.root.path && active.isPaused)
        precondition(active.segments.last?.end == checkpoint && active.elapsed(at: Date()) == 54)
        precondition(active.markers == run.markers && active.learningReview == run.learningReview)
        let migratedBytes = try Data(contentsOf: store.url)
        let state = try JSONSerialization.jsonObject(with: migratedBytes) as! [String: Any]
        precondition((state["custom"] as? [String: Bool])?["keep"] == true)
        let repeated = try store.recoverRelocatedTimer(rememberedRoot: formerRoot, explicitlySelected: true)
        let repeatedBytes = try Data(contentsOf: store.url)
        precondition(repeated == nil && repeatedBytes == migratedBytes)
    }
}

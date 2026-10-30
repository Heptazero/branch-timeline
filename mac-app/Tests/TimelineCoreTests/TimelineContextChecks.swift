import Foundation
import TimelineCore

private func contextCheck(_ value: Bool) { precondition(value) }

extension CoreTests {
    func testFocusCRUDUsesSharedStateWithoutTouchingNotes() throws {
        let (bridge, store) = try sharedFixture(), date = logicalDate(origin), key = dayKey(date)
        let project = try bridge.safeURL("p.md"), note = try Data(contentsOf: project)
        var request = TimelineContextEdit(date: key)
        request.minute = 180; request.score = 25; request.label = "困倦"
        try store.editContext(request)
        var report = try store.dashboard(date: date, scope: "day", projects: [])
        let point = report.days[0].focus!.marks[0]
        precondition(point.recordId == request.id && point.minute == 180 && point.score == 25 && point.editable)
        request.expected = point.revision; request.minute = 600; request.score = 75
        try store.editContext(request)
        let current = try Data(contentsOf: store.url)
        do { try store.editContext(request); preconditionFailure("Stale mark edit must fail") } catch {}
        contextCheck(try Data(contentsOf: store.url) == current)
        report = try store.dashboard(date: date, scope: "day", projects: [])
        request.expected = report.days[0].focus!.marks[0].revision; request.action = "delete"
        try store.editContext(request)
        let deleted = try store.dashboard(date: date, scope: "day", projects: [])
        precondition(deleted.days[0].focus!.marks.isEmpty)
        contextCheck(try Data(contentsOf: project) == note)
        let state = try JSONSerialization.jsonObject(with: Data(contentsOf: store.url)) as! [String: Any]
        precondition((state["custom"] as? [String: Bool])?["keep"] == true)
    }
    func testEnergyInheritanceAndConcurrentEditProtection() throws {
        let (_, store) = try sharedFixture(), date = logicalDate(origin), key = dayKey(date)
        var request = TimelineContextEdit(date: key); request.kind = "energy"
        request.minute = 420; request.label = "上午"; request.color = "#3978d3"; request.expected = "[]"
        try store.editContext(request)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: date)!
        let inherited = try store.dashboard(date: tomorrow, scope: "day", projects: [])
        precondition(inherited.days[0].focus!.phases[0].name == "上午")
        request.date = dayKey(tomorrow); request.minute = 480; request.expected = inherited.days[0].focus!.energyRevision
        try store.editContext(request)
        let original = try store.dashboard(date: date, scope: "day", projects: [])
        precondition(original.days[0].focus!.phases[0].at == 420)
        let bytes = try Data(contentsOf: store.url)
        do { try store.editContext(request); preconditionFailure("Stale energy drag must fail") } catch {}
        contextCheck(try Data(contentsOf: store.url) == bytes)
    }
    func testLiveFocusProjectionCannotWritePhantomMarksOrChangeTheTimer() throws {
        let (bridge, store) = try sharedFixture(), date = logicalDate(origin)
        var session = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "计时", targetMinutes: 0, vaultPath: bridge.root.path, now: origin)
        session.mark("good", at: origin.addingTimeInterval(1))
        try store.saveTimer(session, expectedID: nil, checkpoint: origin.addingTimeInterval(60))
        let before = try Data(contentsOf: store.url)
        let report = try store.dashboard(date: date, scope: "day", projects: [], now: origin.addingTimeInterval(60))
        let mark = report.days[0].focus!.marks.first!
        precondition(mark.kind == "good" && !mark.editable)
        contextCheck(try Data(contentsOf: store.url) == before)
        var request = TimelineContextEdit(date: dayKey(date)); request.kind = mark.kind; request.id = mark.recordId
        request.minute = mark.minute; request.expected = mark.revision; request.action = "delete"
        do { try store.editContext(request); preconditionFailure("Live projection is not a saved mark") } catch {}
        contextCheck(try Data(contentsOf: store.url) == before)
        request = TimelineContextEdit(date: dayKey(date)); request.minute = 600; request.score = 40
        try store.editContext(request)
        contextCheck(try store.load().active?.id == session.id)
    }
}

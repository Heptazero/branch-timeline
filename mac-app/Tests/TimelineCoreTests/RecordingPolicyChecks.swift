import Foundation
import TimelineCore

extension CoreTests {
    func testRecordingPreferenceDefaultsAndSessionSnapshot() throws {
        let suite = "recording-policy-" + UUID().uuidString, defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        precondition(RecordingPolicy.load(defaults) == 60)
        defaults.set(0, forKey: RecordingPolicy.key); precondition(RecordingPolicy.load(defaults) == 0)
        defaults.set(false, forKey: RecordingPolicy.enabledKey); precondition(RecordingPolicy.load(defaults) == 0)
        defaults.set(true, forKey: RecordingPolicy.enabledKey)
        defaults.set(15, forKey: RecordingPolicy.key)
        var run = DesktopSession(project: Project(path: "p.md", name: "p"), title: "阅读", targetMinutes: 0, now: origin, minimumRecordSeconds: RecordingPolicy.load(defaults))
        defaults.set(300, forKey: RecordingPolicy.key)
        run.pause(at: origin.addingTimeInterval(14))
        precondition(run.isTooShort(at: origin.addingTimeInterval(999)))
        run.resume(at: origin.addingTimeInterval(100)); run.finish(at: origin.addingTimeInterval(101), title: "阅读", note: "")
        precondition(!run.isTooShort(at: origin.addingTimeInterval(999)))
        precondition(run.minimumRecordSeconds == 15)
        let decoded = try ArchiveStore.decoder().decode(DesktopSession.self, from: ArchiveStore.encoder().encode(run))
        precondition(decoded.minimumRecordSeconds == 15)
        precondition(RecordingPolicy.seconds(-10) == 0 && RecordingPolicy.seconds(9999) == 3600)
        let range = BlockGeometry.moved(start: 600, end: 600.25, delta: 10, scale: 1)
        precondition(range.0 == 610 && range.1 == 610.25)
    }
    func testConfiguredNativeShortSessionsSaveOrDiscardAndPreservePlan() throws {
        let (bridge, store) = try sharedFixture()
        let file = try bridge.safeURL("p.md"), text = try String(contentsOf: file, encoding: .utf8)
        try Data(text.replacingOccurrences(of: "type: project\n", with: "type: project\nstatus: active\n").utf8).write(to: file)
        var run = DesktopSession(project: Project(path: "p.md", name: "p"), title: "短计时", targetMinutes: 0, vaultPath: bridge.root.path, now: origin, minimumRecordSeconds: 30)
        run.finish(at: origin.addingTimeInterval(29), title: "短计时", note: "")
        let original = try Data(contentsOf: bridge.safeURL("p.md"))
        try store.finish(run)
        let discarded = try store.load().records, unchanged = try Data(contentsOf: bridge.safeURL("p.md"))
        precondition(discarded.isEmpty && unchanged == original)
        var kept = DesktopSession(project: Project(path: "p.md", name: "p"), title: "短计时", targetMinutes: 0, vaultPath: bridge.root.path, now: origin, minimumRecordSeconds: 0)
        kept.finish(at: origin.addingTimeInterval(10), title: "短计时", note: "保留")
        try store.finish(kept)
        let records = try store.load().records
        precondition(records.count == 1 && abs(records[0].minutes * 60 - 10) < 1e-7)
        let date = dayKey(logicalDate(origin)), item = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items[0]
        var move = BlockEdit(date: date, start: item.start + 5, end: item.end + 5, id: item.id, expected: item.revision); move.move = true
        try store.editBlock(move)
        let after = try store.load().records
        precondition(after.count == 1 && abs(after[0].minutes * 60 - 10) < 1e-7)
        var plan = BlockEdit(date: date, start: 650, end: 680); plan.kind = "todo"; plan.projectPath = "p.md"; plan.title = "原计划"
        try store.editBlock(plan)
        let source = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items.first { $0.id == plan.id }!
        var started = try store.startPlan(date: date, id: plan.id, revision: source.revision!, now: origin, minimumRecordSeconds: 0)
        started.finish(at: origin.addingTimeInterval(15), title: started.title, note: "")
        try store.finish(started)
        let result = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items
        precondition(result.contains { $0.id == plan.id && $0.plan == true })
        precondition(result.filter { $0.kind == "fact" }.count == 2)
    }
}

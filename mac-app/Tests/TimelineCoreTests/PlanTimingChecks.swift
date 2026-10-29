import Foundation
import TimelineCore

extension CoreTests {
    private func planFixture() throws -> (VaultBridge, SharedStateStore, DashboardItem) {
        let (bridge, store) = try sharedFixture()
        let file = try bridge.safeURL("p.md")
        try Data("---\ntype: project\nstatus: active\n---\n## log\n手写保留\n".utf8).write(to: file)
        var state = try JSONSerialization.jsonObject(with: Data(contentsOf: store.url)) as! [String: Any]
        state["days"] = [dayKey(logicalDate(origin)): ["wake": 420, "sleep": 1500, "branches": [], "items": [["id": "plan", "kind": "todo", "projectPath": "p.md", "title": "原计划", "note": "原备注", "plannedMin": 600, "plannedEndMin": 660]]]]
        try JSONSerialization.data(withJSONObject: state).write(to: store.url)
        let item = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items[0]
        let projectPath = try bridge.projects().first?.path; precondition(projectPath == "p.md")
        return (bridge, store, item)
    }
    func testPlanTimerCountsUpAndKeepsPlanAfterCancellationOrFinish() throws {
        let (bridge, store, item) = try planFixture(), date = dayKey(logicalDate(origin))
        let started = try store.startPlan(date: date, id: item.id, revision: item.revision!, now: origin)
        precondition(started.title == "原计划" && started.note == "原备注" && started.targetMinutes == 0)
        precondition(started.projectPath == "p.md" && started.sourcePlan?.id == "plan")
        var legacy = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "旧计划", targetMinutes: 60)
        legacy.sourcePlan = started.sourcePlan; precondition(legacy.clockTargetMinutes == 0)
        precondition(TimerDial.displaySeconds(target: legacy.clockTargetMinutes, elapsed: 3700) == 3700)
        legacy.sourcePlan = nil; precondition(legacy.clockTargetMinutes == 60)
        let current = try store.load(); precondition(current.active?.sourcePlan == started.sourcePlan)
        do { _ = try store.startPlan(date: date, id: item.id, revision: item.revision!, now: origin); preconditionFailure("Cannot start two timers") } catch {}
        try store.saveTimer(nil, expectedID: started.id)
        let untouched = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items
        precondition(untouched.count == 1 && untouched[0].id == item.id && untouched[0].plan == true)
        var again = try store.startPlan(date: date, id: item.id, revision: untouched[0].revision!, now: origin)
        again.finish(at: origin.addingTimeInterval(3600), title: again.title, note: again.note)
        try store.finish(again)
        let after = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items
        precondition(after.count == 2 && after.contains { $0.id == item.id && $0.kind == "todo" } && after.contains { $0.kind == "fact" && $0.note == "原备注" })
        let project = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8); precondition(project.contains("手写保留") && project.contains("原备注"))
    }
    func testFailedPlanFinishRollsNotesBackAndKeepsPlan() throws {
        let (bridge, _, _) = try planFixture(), config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        let folder = bridge.root.appendingPathComponent("data"); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: bridge.root.appendingPathComponent("shared.json"), to: folder.appendingPathComponent("state.json"))
        try Data("{\"statePath\":\"data/state.json\"}".utf8).write(to: config)
        let store = try SharedStateStore(bridge: bridge), date = dayKey(logicalDate(origin))
        let item = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items[0]
        var session = try store.startPlan(date: date, id: item.id, revision: item.revision!, now: origin)
        session.finish(at: origin.addingTimeInterval(600), title: session.title, note: session.note)
        let note = try Data(contentsOf: bridge.safeURL("p.md")), before = try Data(contentsOf: store.url)
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path) }
        do { try store.finish(session); preconditionFailure("Expected write failure") } catch {}
        let after = try Data(contentsOf: store.url), afterNote = try Data(contentsOf: bridge.safeURL("p.md"))
        precondition(before == after && note == afterNote)
    }
    func testChangedPlanIsKeptWhileSavingActualTime() throws {
        let (_, store, item) = try planFixture(), date = dayKey(logicalDate(origin))
        var session = try store.startPlan(date: date, id: item.id, revision: item.revision!, now: origin)
        let vault = FeatureVault(store: store), before = try vault.read("shared.json")
        var raw = try JSONSerialization.jsonObject(with: Data(before.utf8)) as! [String: Any]
        var days = raw["days"] as! [String: [String: Any]], day = days[date]!, items = day["items"] as! [[String: Any]]
        items[0]["title"] = "已调整计划"; day["items"] = items; days[date] = day; raw["days"] = days
        let changed = String(decoding: try JSONSerialization.data(withJSONObject: raw), as: UTF8.self)
        try vault.write("shared.json", text: changed, expected: before)
        session.finish(at: origin.addingTimeInterval(600), title: session.title, note: session.note)
        try store.finish(session)
        let result = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items
        precondition(result.contains { $0.title == "已调整计划" && $0.kind == "todo" })
        precondition(result.contains { $0.title == "原计划" && $0.kind == "fact" })
    }

}

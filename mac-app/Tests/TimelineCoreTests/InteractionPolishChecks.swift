import Foundation
import TimelineCore

private func polishCheck(_ value: Bool) { precondition(value) }
extension CoreTests {
    func testPointDraggingUsesStableDocumentTranslation() {
        precondition(PointDragGeometry.minute(start: 600, translation: 65, scale: 0.65) == 700)
        precondition(PointDragGeometry.minute(start: 600, translation: 130, scale: 0.65) == 800)
        precondition(PointDragGeometry.minute(start: 600, translation: -65, scale: 0.65) == 500)
        precondition(PointDragGeometry.minute(start: 600, translation: -99999, scale: 0.08) == 120)
        precondition(PointDragGeometry.minute(start: 600, translation: 99999, scale: 2) == 1560)
        precondition(PointDragGeometry.minute(start: 600, translation: .nan, scale: 1) == 600)
    }
    func testActiveMetadataKeepsNewerMarksPausesAndNotesUntouchedUntilFinish() throws {
        let (bridge, store) = try sharedFixture(), project = Project(path: "p.md", name: "项目")
        var session = DesktopSession(project: project, title: "原标题", targetMinutes: 25, vaultPath: bridge.root.path, now: origin)
        try store.saveTimer(session, expectedID: nil, checkpoint: origin)
        let expected = ActiveMetadata(session), noteBefore = try Data(contentsOf: bridge.safeURL("p.md"))
        session.mark("good", at: origin.addingTimeInterval(5)); session.pause(at: origin.addingTimeInterval(60))
        try store.saveTimer(session, expectedID: session.id, checkpoint: origin.addingTimeInterval(60))
        try store.editActiveMetadata(expected: expected, title: " 新标题 ", note: " [[关联笔记]] ", project: project)
        let edited = try store.load().active!
        precondition(edited.title == "新标题" && edited.note == "[[关联笔记]]")
        precondition(edited.segments == session.segments && edited.markers == session.markers && edited.isPaused)
        polishCheck(try Data(contentsOf: bridge.safeURL("p.md")) == noteBefore)
        let bytes = try Data(contentsOf: store.url)
        do { try store.editActiveMetadata(expected: expected, title: "旧表单", note: "", project: project); preconditionFailure("Stale metadata must not replace a newer edit") } catch {}
        polishCheck(try Data(contentsOf: store.url) == bytes)
        do { try store.editActiveMetadata(expected: ActiveMetadata(edited), title: "", note: "", project: project); preconditionFailure("Blank title") } catch {}
        try store.saveTimer(nil, expectedID: session.id)
        let canceled = try Data(contentsOf: store.url)
        do { try store.editActiveMetadata(expected: ActiveMetadata(edited), title: "复活", note: "", project: project); preconditionFailure("Must not resurrect a canceled timer") } catch {}
        polishCheck(try Data(contentsOf: store.url) == canceled)
    }
    func testActiveProjectEditKeepsThePlanAndSavesOnlyToTheChosenProject() throws {
        let (bridge, store) = try sharedFixture(), key = dayKey(logicalDate(origin))
        let source = try bridge.safeURL("p.md"), original = try String(contentsOf: source, encoding: .utf8)
        try Data(original.replacingOccurrences(of: "type: project\n", with: "type: project\nstatus: active\n").utf8).write(to: source)
        let target = try bridge.safeURL("new.md")
        try Data("---\ntype: project\nstatus: active\n---\n## log\n手写目标\n".utf8).write(to: target)
        var plan = BlockEdit(date: key, start: 600, end: 660); plan.title = "原计划"; plan.kind = "todo"; plan.projectPath = "p.md"
        try store.editBlock(plan)
        let item = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items.first!
        let active = try store.startPlan(date: key, id: item.id, revision: item.revision!, now: origin, minimumRecordSeconds: 0)
        // An older session may still store its plan duration; editing must preserve count-up mode.
        var state = try JSONSerialization.jsonObject(with: Data(contentsOf: store.url)) as! [String: Any]
        var timer = state["macTimer"] as! [String: Any], raw = timer["active"] as! [String: Any]
        raw["targetMinutes"] = 25; timer["active"] = raw; state["macTimer"] = timer
        try JSONSerialization.data(withJSONObject: state).write(to: store.url)
        try store.editActiveMetadata(expected: ActiveMetadata(active), title: "改项目", note: "说明", project: Project(path: "new.md", name: "新项目"))
        var next = try store.load().active!
        precondition(next.projectPath == "new.md" && next.projectName == "新项目" && next.sourcePlan == nil && next.clockTargetMinutes == 0)
        next.finish(at: origin.addingTimeInterval(120), title: next.title, note: next.note); try store.finish(next)
        let after = try store.dashboard(date: logicalDate(origin), scope: "day", projects: []).items
        precondition(after.contains { $0.id == item.id && $0.plan == true && $0.projectPath == "p.md" })
        precondition(after.contains { $0.plan == false && $0.projectPath == "new.md" })
        let oldText = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8), newText = try String(contentsOf: target, encoding: .utf8)
        precondition(!oldText.contains("btl-work:") && newText.contains("改项目") && newText.contains("手写目标"))
    }
}

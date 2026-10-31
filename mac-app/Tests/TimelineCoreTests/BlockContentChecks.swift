import Foundation
import TimelineCore

private func contentCheck(_ value: Bool) { precondition(value) }
extension CoreTests {
    func testDirectEditorUsesClickedColumnAndMovesItsLogBetweenProjects() throws {
        let (bridge, store) = try sharedFixture(), date = logicalDate(origin), key = dayKey(date)
        let target = try bridge.safeURL("new.md")
        try Data("---\ntype: project\nstatus: active\n---\n## log\n新项目手写\n".utf8).write(to: target)
        var edit = BlockEdit(date: key, start: 600, end: 630)
        edit.title = "阅读"; edit.note = "[[原笔记]]"; edit.projectPath = "p.md"
        try store.editBlock(edit)
        let report = try store.dashboard(date: date, scope: "week", projects: [])
        let column = report.days.first { $0.date == key }!, item = column.items!.first!
        var full = BlockEdit(item: item, date: column.date)!
        precondition(full.updateContent && full.id == item.id && full.date == key && full.note == "[[原笔记]]")
        full.title = "实验"; full.note = "下次继续"; full.end = 660; full.projectPath = "new.md"
        try store.editBlock(full)
        let sourceText = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8)
        let targetText = try String(contentsOf: target, encoding: .utf8)
        precondition(!sourceText.contains("btl-work:" + item.id) && sourceText.contains("手写保留"))
        precondition(targetText.contains("[11:00] 1h 实验 — 下次继续") && targetText.contains("新项目手写"))
        let next = try store.dashboard(date: date, scope: "day", projects: []).items.first!
        precondition(next.id == item.id && next.title == "实验" && next.projectPath == "new.md" && next.note == "下次继续")
        let bytes = try Data(contentsOf: store.url)
        do { try store.editBlock(full); preconditionFailure("Stale direct edit must be rejected") } catch {}
        contentCheck(try Data(contentsOf: store.url) == bytes)
        contentCheck(try String(contentsOf: target, encoding: .utf8) == targetText)
    }
    func testFailedDirectEditRestoresBothProjectFiles() throws {
        let (bridge, original) = try sharedFixture(), key = dayKey(logicalDate(origin))
        let target = try bridge.safeURL("new.md")
        try Data("---\ntype: project\n---\n## log\n保留\n".utf8).write(to: target)
        var edit = BlockEdit(date: key, start: 600, end: 630)
        edit.title = "阅读"; edit.projectPath = "p.md"; try original.editBlock(edit)
        let item = try original.dashboard(date: logicalDate(origin), scope: "day", projects: []).items.first!
        var full = BlockEdit(item: item, date: key)!; full.projectPath = "new.md"
        let folder = bridge.root.appendingPathComponent("data")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let stateURL = folder.appendingPathComponent("state.json"), bytes = try Data(contentsOf: original.url)
        try bytes.write(to: stateURL)
        try Data("{\"statePath\":\"data/state.json\"}".utf8).write(to: bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json"))
        let store = try SharedStateStore(bridge: bridge), source = try bridge.safeURL("p.md")
        let beforeSource = try Data(contentsOf: source), beforeTarget = try Data(contentsOf: target)
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path) }
        do { try store.editBlock(full); preconditionFailure("Read-only state must fail after preparing both notes") } catch {}
        contentCheck(try Data(contentsOf: source) == beforeSource)
        contentCheck(try Data(contentsOf: target) == beforeTarget)
        contentCheck(try Data(contentsOf: stateURL) == bytes)
    }
}

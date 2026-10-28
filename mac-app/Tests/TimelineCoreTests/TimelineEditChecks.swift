import Foundation
import TimelineCore

extension CoreTests {
    func testBlockCoordinatesAndEdges() {
        precondition(BlockGeometry.minute(y: 18, scale: 1) == 120)
        precondition(BlockGeometry.minute(y: 498, scale: 1) == 600)
        precondition(BlockGeometry.minute(y: -999, scale: 0.65) == 120)
        precondition(BlockGeometry.minute(y: 99999, scale: 0.08) == 1555)
        let top = BlockGeometry.resized(start: 600, end: 660, delta: 50, scale: 1, top: true)
        precondition(top.0 == 650 && top.1 == 660)
        let crossed = BlockGeometry.resized(start: 600, end: 660, delta: 999, scale: 1, top: true)
        precondition(crossed.0 == 655 && crossed.1 == 660)
        let bottom = BlockGeometry.resized(start: 600, end: 660, delta: -999, scale: 1, top: false)
        precondition(bottom.0 == 600 && bottom.1 == 605)
        precondition(BlockGeometry.resized(start: 600, end: 660, delta: 9999, scale: 1, top: false).1 == 1560)
    }
    func testBlockCreateAndResizeUseSharedFiles() throws {
        let (bridge, store) = try sharedFixture()
        let date = logicalDate(origin)
        var edit = BlockEdit(date: dayKey(date), start: 600, end: 630)
        edit.title = "补记阅读"; edit.note = "[[原笔记]]"; edit.projectPath = "p.md"
        try store.editBlock(edit)
        let report = try store.dashboard(date: date, scope: "day", projects: [Project(path: "p.md", name: "项目")])
        let item = report.items.first!
        precondition(item.editable == true && item.start == 600 && item.end == 630)
        let resize = BlockEdit(date: edit.date, start: 590, end: 650, id: edit.id, expected: item.revision)
        try store.editBlock(resize)
        let md = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8)
        precondition(md.contains("[10:50] 1h") && md.contains("[[原笔记]]") && md.contains("手写保留"))
        let before = try Data(contentsOf: store.url)
        do { try store.editBlock(resize); preconditionFailure("Stale revision must fail") } catch {}
        let after = try Data(contentsOf: store.url)
        precondition(before == after)
    }
    func testBlockFailedStateWriteRollsBackProject() throws {
        let (bridge, _) = try sharedFixture()
        let folder = bridge.root.appendingPathComponent("data")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let stateURL = folder.appendingPathComponent("state.json")
        let original = Data("{\"version\":1,\"days\":{}}".utf8)
        try original.write(to: stateURL)
        let config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        try Data("{\"statePath\":\"data/state.json\"}".utf8).write(to: config)
        let store = try SharedStateStore(bridge: bridge), projectURL = try bridge.safeURL("p.md")
        let projectBefore = try Data(contentsOf: projectURL)
        var edit = BlockEdit(date: "2026-10-28", start: 600, end: 630)
        edit.title = "阅读"; edit.projectPath = "p.md"
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path) }
        do { try store.editBlock(edit); preconditionFailure("Read-only state directory must reject edit") } catch {}
        let stateAfter = try Data(contentsOf: stateURL), projectAfter = try Data(contentsOf: projectURL)
        precondition(stateAfter == original && projectAfter == projectBefore)
    }
}

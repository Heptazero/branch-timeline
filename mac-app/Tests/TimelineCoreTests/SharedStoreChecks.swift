import Foundation
import TimelineCore

private func checkShared(_ value: Bool) { precondition(value) }

extension CoreTests {
    func sharedFixture() throws -> (VaultBridge, SharedStateStore) {
        let root = try fixture(), bridge = VaultBridge(root: root)
        let config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        try FileManager.default.createDirectory(at: config.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{\"statePath\":\"shared.json\",\"projectTypes\":[{\"type\":\"project\",\"color\":\"#123456\"}]}".utf8).write(to: config)
        try Data("{\"version\":1,\"days\":{},\"custom\":{\"keep\":true},\"lifeEvents\":[]}".utf8).write(to: root.appendingPathComponent("shared.json"))
        try Data("---\ntype: project\n---\n## log\n手写保留\n".utf8).write(to: root.appendingPathComponent("p.md"))
        return (bridge, try SharedStateStore(bridge: bridge))
    }
    func testDirectFinishPreservesStateAndIsIdempotent() throws {
        let (bridge, store) = try sharedFixture()
        var session = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "直接保存", targetMinutes: 60, vaultPath: bridge.root.path, now: origin)
        try store.saveTimer(session, expectedID: nil, checkpoint: origin)
        session.finish(at: origin.addingTimeInterval(3600), title: "直接保存", note: "下次继续")
        try store.finish(session)
        let first = try Data(contentsOf: store.url)
        checkShared(try store.load().records.count == 1)
        checkShared(try store.load().active == nil)
        let text = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8)
        precondition(text.contains("手写保留") && text.contains("下次继续"))
        let state = try JSONSerialization.jsonObject(with: first) as! [String: Any]
        precondition((state["custom"] as? [String: Bool])?["keep"] == true)
        try store.finish(session)
        checkShared(try Data(contentsOf: store.url) == first)
        checkShared(try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8) == text)
    }
    func testExistingTimelineRecordsAndConcurrentFieldsStayVisible() throws {
        let (_, store) = try sharedFixture()
        var state = try JSONSerialization.jsonObject(with: Data(contentsOf: store.url)) as! [String: Any]
        state["days"] = ["2026-10-23": ["items": [["id": "old", "title": "原有项目记录", "kind": "fact", "projectPath": "p.md", "startMin": 540, "endMin": 600]]]]
        state["anotherWriter"] = "保留"
        try JSONSerialization.data(withJSONObject: state).write(to: store.url, options: .atomic)
        try store.saveTimer(nil, expectedID: nil)
        let result = try store.load()
        precondition(result.records.count == 1 && result.records[0].title == "原有项目记录" && result.records[0].minutes == 60)
        let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: store.url)) as! [String: Any]
        precondition(saved["anotherWriter"] as? String == "保留")
    }
    func testInvalidSharedDataAndWrongTimerOwnerNeverOverwrite() throws {
        let (bridge, store) = try sharedFixture()
        let session = DesktopSession(project: Project(path: "p.md", name: "p"), title: "", targetMinutes: 0, vaultPath: bridge.root.path, now: origin)
        try store.saveTimer(session, expectedID: nil)
        let before = try Data(contentsOf: store.url)
        do { try store.saveTimer(nil, expectedID: "different"); preconditionFailure("Expected conflict") } catch {}
        checkShared(try Data(contentsOf: store.url) == before)
        var missingCheckpoint = try JSONSerialization.jsonObject(with: before) as! [String: Any]
        var timer = missingCheckpoint["macTimer"] as! [String: Any]; timer.removeValue(forKey: "checkpoint")
        missingCheckpoint["macTimer"] = timer
        try JSONSerialization.data(withJSONObject: missingCheckpoint).write(to: store.url)
        do { _ = try store.load(); preconditionFailure("Never infer an active timer checkpoint") } catch {}
        let invalid = Data("{\"version\":2,\"days\":{}}".utf8); try invalid.write(to: store.url)
        do { try store.saveTimer(nil, expectedID: session.id); preconditionFailure("Expected rejection") } catch {}
        checkShared(try Data(contentsOf: store.url) == invalid)
    }
    func testLegacyReceiptCannotRestoreDeletedFacts() throws {
        let (bridge, store) = try sharedFixture()
        var session = DesktopSession(project: Project(path: "p.md", name: "p"), title: "", targetMinutes: 0, vaultPath: bridge.root.path, now: origin)
        session.finish(at: origin.addingTimeInterval(600), title: "已删", note: "")
        let inbox = try bridge.inbox(); try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: ["id": session.id, "status": "imported"]).write(to: inbox.appendingPathComponent(session.id + ".receipt.json"))
        var archive = AppArchive(); archive.history = [session]
        try store.adoptLegacy(archive)
        checkShared(try store.load().records.isEmpty)
        checkShared(try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8).contains("手写保留"))
    }
    func testDiscoveryUsesConfiguredStateFileWithoutAChooser() throws {
        let (bridge, store) = try sharedFixture()
        checkShared(try VaultDiscovery.fromStateFile(store.url).root == bridge.root)
        precondition(VaultDiscovery.discover(remembered: bridge.root.path, legacy: nil)?.root == bridge.root)
        let registry = try fixture().appendingPathComponent("obsidian.json")
        try JSONSerialization.data(withJSONObject: ["vaults": ["one": ["path": bridge.root.path]]]).write(to: registry)
        precondition(VaultDiscovery.discover(remembered: nil, legacy: nil, registry: registry)?.root == bridge.root)
        let config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        try Data("{broken".utf8).write(to: config)
        do { _ = try bridge.stateURL(); preconditionFailure("Must not fall back to another state file") } catch {}
    }

    func testFailedStateWriteRollsProjectBack() throws {
        let (bridge, original) = try sharedFixture()
        let folder = bridge.root.appendingPathComponent("data")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let data = try Data(contentsOf: original.url), stateURL = folder.appendingPathComponent("state.json")
        try data.write(to: stateURL)
        let config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        try Data("{\"statePath\":\"data/state.json\"}".utf8).write(to: config)
        let store = try SharedStateStore(bridge: bridge), project = try bridge.safeURL("p.md")
        let before = try Data(contentsOf: project)
        var session = DesktopSession(project: Project(path: "p.md", name: "p"), title: "", targetMinutes: 0, vaultPath: bridge.root.path, now: origin)
        session.finish(at: origin.addingTimeInterval(600), title: "测试", note: "")
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path) }
        do { try store.finish(session); preconditionFailure("Read-only state directory must reject save") } catch {}
        checkShared(try Data(contentsOf: project) == before)
        checkShared(try Data(contentsOf: stateURL) == data)
    }
}

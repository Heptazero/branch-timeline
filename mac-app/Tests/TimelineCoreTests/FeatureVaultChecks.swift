import Foundation
import TimelineCore

extension CoreTests {
    func testFeatureVaultPreservesNativeFieldsAndRejectsStaleWrites() throws {
        let (bridge, store) = try sharedFixture(), vault = FeatureVault(store: store)
        let before = try vault.read("shared.json")
        var state = try JSONSerialization.jsonObject(with: Data(before.utf8)) as! [String: Any]
        state["policyCards"] = [["id": "a", "name": "专注"]]
        let changed = String(decoding: try JSONSerialization.data(withJSONObject: state), as: UTF8.self)
        try vault.write("shared.json", text: changed, expected: before)
        // Exact written text is retained so the shared UndoManager can compare and restore it.
        let saved = try vault.read("shared.json"); precondition(saved == changed)
        do { try vault.write("shared.json", text: before, expected: before); preconditionFailure("Expected stale write conflict") } catch {}
        try vault.write("shared.json", text: before, expected: changed)
        state.removeValue(forKey: "custom")
        let unsafe = String(decoding: try JSONSerialization.data(withJSONObject: state), as: UTF8.self)
        do { try vault.write("shared.json", text: unsafe, expected: before); preconditionFailure("Must preserve unknown fields") } catch {}
        let final = try vault.read("shared.json"); precondition(final == before)
        do { _ = try vault.read("../outside.md"); preconditionFailure("Path escape") } catch {}
        do { _ = try vault.read(".obsidian/other.json"); preconditionFailure("Private JSON access") } catch {}
        let catalog = try vault.catalog(); precondition((catalog["files"] as? [[String: Any]])?.count == 1)
        let config = ".obsidian/plugins/branch-timeline-hz/data.json", settings = try vault.read(config)
        do { try vault.write(config, text: "{\"statePath\":\"other.json\"}", expected: settings); preconditionFailure("Must not disconnect running native timer") } catch {}
        let project = try vault.read("p.md"), edit = project + "\n新记录\n"
        try vault.write("p.md", text: edit, expected: project)
        let text = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8)
        precondition(text.contains("手写保留") && text.contains("新记录"))
    }
    func testRhythmEditsShareTheOriginalDayAndKeepUncompletedPosition() throws {
        let (_, store) = try sharedFixture()
        let day = "2026-09-01"
        try store.setRhythm(date: day, id: "wake", minute: 465)
        let report = try store.dashboard(date: Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 1))!, scope: "day", projects: [])
        precondition(report.days[0].rhythmEvents?.first { $0.id == "wake" }?.minute == 465)
        precondition(report.days[0].rhythmEvents?.first { $0.id == "wake" }?.real == true)
        try store.setRhythm(date: day, id: "wake", minute: nil)
        let undone = try store.dashboard(date: Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 1))!, scope: "day", projects: [])
        precondition(undone.days[0].rhythmEvents?.first { $0.id == "wake" }?.minute == 465)
        precondition(undone.days[0].rhythmEvents?.first { $0.id == "wake" }?.real == false)
        let before = try Data(contentsOf: store.url)
        do { try store.setRhythm(date: day, id: "wake", minute: -10); preconditionFailure("Invalid minute") } catch {}
        let after = try Data(contentsOf: store.url); precondition(before == after)
    }
}

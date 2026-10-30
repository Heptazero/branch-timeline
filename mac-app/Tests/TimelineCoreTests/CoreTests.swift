import Foundation
import Darwin
import TimelineCore

final class CoreTests {
    var cleanups: [() -> Void] = []
    func addTeardownBlock(_ block: @escaping () -> Void) { cleanups.append(block) }
    let origin = Date(timeIntervalSince1970: 1_700_000_000)
    func fixture() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("btl-test-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    func testPauseResumeExcludesBreaks() {
        var session = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "", targetMinutes: 30, now: origin)
        session.pause(at: origin.addingTimeInterval(60))
        session.pause(at: origin.addingTimeInterval(100))
        expectEqual(session.elapsed(at: origin.addingTimeInterval(200)), 60)
        session.resume(at: origin.addingTimeInterval(200))
        session.finish(at: origin.addingTimeInterval(320), title: "完成", note: " 下次继续 ")
        expectEqual(session.elapsed(at: origin.addingTimeInterval(999)), 180)
        expectEqual(session.note, "下次继续")
        expectEqual(session.segments.count, 2)
    }
    func testMarksOnlyDuringRunningIntervals() {
        var session = DesktopSession(project: Project(path: "p.md", name: "项目"), title: "", targetMinutes: 0, now: origin)
        session.mark("good", at: origin.addingTimeInterval(1))
        session.pause(at: origin.addingTimeInterval(20))
        session.mark("distraction", at: origin.addingTimeInterval(30))
        expectEqual(session.markers.count, 1)
        expectEqual(session.title, "项目")
    }
    func testArchiveRoundTripAndConcurrentEditProtection() throws {
        let root = try fixture(); let url = root.appendingPathComponent("archive.json")
        let store = ArchiveStore(url: url); var archive = try store.load()
        archive.active = DesktopSession(project: Project(path: "p.md", name: "p"), title: "", targetMinutes: 25, now: origin)
        try store.save(archive)
        expectEqual(try ArchiveStore(url: url).load().active, archive.active)
        let manual = Data("manual edit".utf8); try manual.write(to: url)
        expectThrows(try store.save(archive))
        expectEqual(try Data(contentsOf: url), manual)
    }
    func testInvalidArchiveDoesNotBecomeEmpty() throws {
        let url = try fixture().appendingPathComponent("archive.json")
        let invalid = Data("{broken".utf8); try invalid.write(to: url)
        let store = ArchiveStore(url: url)
        expectThrows(try store.load())
        expectThrows(try store.save(AppArchive()))
        expectEqual(try Data(contentsOf: url), invalid)
    }
    func testExportIsIdempotentAndCannotSwitchVaults() throws {
        let root = try fixture(); let bridge = VaultBridge(root: root)
        var session = DesktopSession(project: Project(path: "p.md", name: "p"), title: "", targetMinutes: 25, vaultPath: bridge.root.path, now: origin)
        session.finish(at: origin.addingTimeInterval(120), title: "工作", note: "备注")
        try bridge.export(session); try bridge.export(session)
        let inbox = try bridge.inbox()
        expectEqual(try FileManager.default.contentsOfDirectory(atPath: inbox.path).filter { $0.hasSuffix(".json") }.count, 1)
        session.note = "changed"
        expectThrows(try bridge.export(session))
        expectThrows(try VaultBridge(root: fixture()).export(session))
    }
    func testPathTraversalAndSymlinkEscapesAreRejected() throws {
        let root = try fixture(); let outside = try fixture(); let bridge = VaultBridge(root: root)
        expectThrows(try bridge.safeURL("../other.md"))
        expectThrows(try bridge.safeURL("/etc/passwd"))
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("escape"), withDestinationURL: outside)
        expectThrows(try bridge.safeURL("escape/x.md"))
    }
    func testFrontmatterAndFuzzySearch() {
        expectEqual(frontmatterFields("---\ntype: 'project'\nstatus: active # comment\ncolor: '#123456'\n---\n"), ["type": "project", "status": "active", "color": "#123456"])
        expectTrue(matchesProject("csos", project: Project(path: "study_CS_OS.md", name: "操作系统")))
        expectFalse(matchesProject("unknown", project: Project(path: "p.md", name: "项目")))
        expectEqual(clockLabel(3661), "1:01:01")
        expectEqual(clockLabel(60), "01:00")
    }
    func testFractionalSecondsKeepMarksBeforeFinish() throws {
        var session = DesktopSession(project: Project(path: "p.md", name: "p"), title: "", targetMinutes: 0, now: origin)
        session.mark("good", at: origin.addingTimeInterval(60.125))
        session.finish(at: origin.addingTimeInterval(60.875), title: "p", note: "")
        let roundTrip = try ArchiveStore.decoder().decode(DesktopSession.self, from: ArchiveStore.encoder().encode(session))
        expectEqual(roundTrip.markers[0].at, session.markers[0].at)
        expectTrue(roundTrip.markers[0].at < roundTrip.segments[0].end!)
        let legacy = Data("\"2023-11-14T22:13:20Z\"".utf8)
        expectEqual(try ArchiveStore.decoder().decode(Date.self, from: legacy), origin)
    }
    func testCatalogUsesConfiguredTypesAndDataDirectory() throws {
        let root = try fixture(); let bridge = VaultBridge(root: root)
        let settings = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        try FileManager.default.createDirectory(at: settings.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{\"statePath\":\"custom/state.json\",\"projectTypes\":[{\"type\":\"book\",\"color\":\"#aabbcc\"}]}".utf8).write(to: settings)
        try Data("---\ntype: book\nstatus: active\n---\n".utf8).write(to: root.appendingPathComponent("阅读.md"))
        try Data("---\ntype: project\n---\n".utf8).write(to: root.appendingPathComponent("不匹配.md"))
        let projects = try bridge.projects()
        expectEqual(projects.count, 1)
        expectEqual(projects[0].name, "阅读")
        expectEqual(projects[0].color, "#aabbcc")
        expectEqual(try bridge.inbox().path, bridge.root.appendingPathComponent("custom/desktop-inbox").path)
    }
}

private func expectEqual<T: Equatable>(_ actual: T, _ expected: T, line: UInt = #line) { precondition(actual == expected, "Mismatch at line \(line): \(actual) != \(expected)") }
private func expectTrue(_ actual: Bool, line: UInt = #line) { precondition(actual, "Expected true at \(line)") }
private func expectFalse(_ actual: Bool, line: UInt = #line) { precondition(!actual, "Expected false at \(line)") }
private func expectThrows<T>(_ action: @autoclosure () throws -> T, line: UInt = #line) { do { _ = try action(); preconditionFailure("Expected error at \(line)") } catch {} }
@main struct CoreChecks {
    static func main() throws {
        if let option = CommandLine.arguments.firstIndex(of: "--hold-lock"), CommandLine.arguments.count > option + 1 {
            let file = URL(fileURLWithPath: CommandLine.arguments[option + 1])
            try SharedFileLock.withLock(file: file) {
                try Data("native-held".utf8).write(to: file, options: .atomic)
                print("LOCKED \(SharedFileLock.folder(for: file).path) resolved=\(file.resolvingSymlinksInPath().path)"); fflush(stdout); Thread.sleep(forTimeInterval: 0.4)
                try Data("native-released".utf8).write(to: file, options: .atomic)
            }
            return
        }
        let tests = CoreTests()
        defer { tests.cleanups.reversed().forEach { $0() } }
        tests.testPauseResumeExcludesBreaks()
        tests.testMarksOnlyDuringRunningIntervals()
        try tests.testArchiveRoundTripAndConcurrentEditProtection()
        try tests.testInvalidArchiveDoesNotBecomeEmpty()
        try tests.testExportIsIdempotentAndCannotSwitchVaults()
        try tests.testPathTraversalAndSymlinkEscapesAreRejected()
        tests.testFrontmatterAndFuzzySearch()
        try tests.testFractionalSecondsKeepMarksBeforeFinish()
        try tests.testCatalogUsesConfiguredTypesAndDataDirectory()
        try tests.testDirectFinishPreservesStateAndIsIdempotent()
        try tests.testExistingTimelineRecordsAndConcurrentFieldsStayVisible()
        try tests.testInvalidSharedDataAndWrongTimerOwnerNeverOverwrite()
        try tests.testLegacyReceiptCannotRestoreDeletedFacts()
        try tests.testDiscoveryUsesConfiguredStateFileWithoutAChooser()
        try tests.testFailedStateWriteRollsProjectBack()
        tests.testDialSelectionAndCountdown()
        try tests.testNativeDashboardAndGoalWritesUseOriginalFile()
        tests.testOnlyActiveProjectsCanBeSelected()
        tests.testGoalInputReadsTheCurrentTextWithoutACommitEvent()
        tests.testZoomActuallyShrinksDurationsAndPreservesTheCenter()
        tests.testCalendarHandlesLeapDaysAndWeeksAcrossYears()
        try tests.testConnectionStatusDetectsChangedPathsAndCatalogSettings()
        tests.testBlockCoordinatesAndEdges()
        try tests.testBlockCreateAndResizeUseSharedFiles()
        try tests.testBlockFailedStateWriteRollsBackProject()
        tests.testSharedPeriodNavigationHandlesMonthsAndYears()
        try tests.testProjectColorEditsOnlyFrontmatterAndKeepsData()
        try tests.testNativePlansNeverWriteProjectLogsOrCountAsTime()
        try tests.testFeatureVaultPreservesNativeFieldsAndRejectsStaleWrites()
        try tests.testRhythmEditsShareTheOriginalDayAndKeepUncompletedPosition()
        tests.testResponsiveNavigationPreservesOrderingAndManualHiding()
        tests.testProjectChartsShareAggregationFractionsAndSort()
        try tests.testPlanTimerCountsUpAndKeepsPlanAfterCancellationOrFinish()
        try tests.testFailedPlanFinishRollsNotesBackAndKeepsPlan()
        try tests.testChangedPlanIsKeptWhileSavingActualTime()
        try tests.testRecordingPreferenceDefaultsAndSessionSnapshot()
        try tests.testConfiguredNativeShortSessionsSaveOrDiscardAndPreservePlan()
        try tests.testFocusCRUDUsesSharedStateWithoutTouchingNotes()
        try tests.testEnergyInheritanceAndConcurrentEditProtection()
        try tests.testLiveFocusProjectionCannotWritePhantomMarksOrChangeTheTimer()
        print("40 native core checks passed")
    }
}

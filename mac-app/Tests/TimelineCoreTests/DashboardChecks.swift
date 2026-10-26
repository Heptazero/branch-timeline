import Foundation
import TimelineCore

extension CoreTests {
    func testDialSelectionAndCountdown() {
        precondition(TimerDial.minutes(x: 0, y: -1) == 0)
        precondition(TimerDial.minutes(x: 1, y: 0) == 15)
        precondition(TimerDial.minutes(x: 0, y: 1) == 30)
        precondition(TimerDial.minutes(x: -1, y: 0) == 45)
        precondition(TimerDial.minutes(x: 0, y: 0) == nil)
        precondition(TimerDial.minutes(x: .nan, y: 1) == nil)
        precondition(TimerDial.displaySeconds(target: 0, elapsed: 72) == 72)
        precondition(TimerDial.displaySeconds(target: 25, elapsed: 72) == 1428)
        precondition(TimerDial.displaySeconds(target: 25, elapsed: 1600) == 0)
        precondition(TimerDial.fraction(target: 25, elapsed: 0) == 25.0 / 60)
        precondition(TimerDial.fraction(target: 0, elapsed: 600) == 1.0 / 6)
    }
    func testNativeDashboardAndGoalWritesUseOriginalFile() throws {
        let (bridge, store) = try sharedFixture()
        let date = logicalDate(), projects = [Project(path: "p.md", name: "项目")]
        let original = try Data(contentsOf: store.url)
        let report = try store.dashboard(date: date, scope: "week", projects: projects)
        precondition(report.days.count == 7 && report.projects.count == 1)
        let unchanged = try Data(contentsOf: store.url)
        precondition(unchanged == original)
        try store.setGoal(path: "p.md", date: date, scope: "week", minutes: 300)
        let after = try store.dashboard(date: date, scope: "week", projects: projects)
        precondition(after.projects[0].planned == 300)
        let note = try String(contentsOf: bridge.safeURL("p.md"), encoding: .utf8)
        precondition(note.contains("手写保留"))
        do { try store.setGoal(path: "../outside.md", date: date, scope: "week", minutes: 60); preconditionFailure("Unsafe path") } catch {}
        var active = DesktopSession(project: projects[0], title: "任务", targetMinutes: 25, vaultPath: bridge.root.path, now: origin)
        active.mark("good", at: origin.addingTimeInterval(600.125))
        try store.saveTimer(active, expectedID: nil)
        let running = try store.dashboard(date: logicalDate(origin), scope: "day", projects: projects, now: origin.addingTimeInterval(600.875))
        precondition(running.projects[0].actual == 10)
    }
}

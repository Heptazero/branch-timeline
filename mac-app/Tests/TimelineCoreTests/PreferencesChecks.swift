import Foundation
import TimelineCore

extension CoreTests {
    func testOnlyActiveProjectsCanBeSelected() {
        for status in ["active", "doing", "进行中", " ACTIVE "] { precondition(Project(path: "p.md", name: "p", status: status).isActive) }
        for status in ["planned", "paused", "archived", "", "inactive"] { precondition(!Project(path: "p.md", name: "p", status: status).isActive) }
    }
    func testGoalInputReadsTheCurrentTextWithoutACommitEvent() {
        precondition(GoalInput.hours("2.75") == 2.75 && GoalInput.hours(" 2,5 ") == 2.5)
        precondition(GoalInput.hours("0") == 0)
        for text in ["", " ", "-1", "nan", "inf", "169", "2h"] { precondition(GoalInput.hours(text) == nil) }
    }
    func testZoomActuallyShrinksDurationsAndPreservesTheCenter() {
        let normal = TimelineZoom.cardHeight(minutes: 120, scale: 0.65)
        let small = TimelineZoom.cardHeight(minutes: 120, scale: 0.1)
        precondition(normal == 78 && small == 12)
        precondition(TimelineZoom.clamp(0) == 0.08 && TimelineZoom.clamp(100) == 2.5)
        precondition(TimelineZoom.anchoredOffset(oldOffset: 200, viewport: 200, oldScale: 1, newScale: 2, height: 2000) == 500)
    }
    func testCalendarHandlesLeapDaysAndWeeksAcrossYears() {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        func date(_ year: Int, _ month: Int, _ day: Int) -> Date { calendar.date(from: DateComponents(year: year, month: month, day: day))! }
        let dates = CalendarGrid.dates(in: date(2024, 2, 21), calendar: calendar)
        precondition(dates.count == 42 && dates[0] == date(2024, 1, 29))
        precondition(dates.contains(date(2024, 2, 29)))
        precondition(CalendarGrid.sameWeek(date(2024, 12, 30), date(2025, 1, 5), calendar: calendar))
        precondition(!CalendarGrid.sameWeek(date(2024, 12, 30), date(2025, 1, 6), calendar: calendar))
    }
    func testConnectionStatusDetectsChangedPathsAndCatalogSettings() throws {
        let (bridge, store) = try sharedFixture()
        let manifest = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/manifest.json")
        try Data("{\"version\":\"0.3.60\"}".utf8).write(to: manifest)
        let signature = bridge.catalogSignature()
        let initial = try store.connectionInfo(catalogSignature: signature); precondition(initial.consistent)
        let config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        let original = try Data(contentsOf: store.url)
        try original.write(to: bridge.safeURL("other.json"))
        try Data("{\"statePath\":\"other.json\",\"projectTypes\":[{\"type\":\"book\"}]}".utf8).write(to: config)
        let changed = try store.connectionInfo(catalogSignature: signature)
        precondition(!changed.sameFile && !changed.catalogMatches && !changed.consistent)
        let unchanged = try Data(contentsOf: store.url); precondition(unchanged == original)
        try Data("{\"version\":\"0.3.57\"}".utf8).write(to: manifest)
        let old = try store.connectionInfo(catalogSignature: signature); precondition(!old.compatiblePlugin)
    }
}

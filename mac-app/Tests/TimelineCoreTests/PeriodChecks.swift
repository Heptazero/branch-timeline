import Foundation
import TimelineCore

extension CoreTests {
    func testSharedPeriodNavigationHandlesMonthsAndYears() {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        func date(_ year: Int, _ month: Int, _ day: Int) -> Date { calendar.date(from: DateComponents(year: year, month: month, day: day))! }
        precondition(PeriodNavigation.dates(date(2024, 2, 29), scope: "month", calendar: calendar).count == 29)
        precondition(PeriodNavigation.shift(date(2024, 1, 31), scope: "month", amount: 1, calendar: calendar) == date(2024, 2, 1))
        precondition(PeriodNavigation.shift(date(2024, 12, 31), scope: "month", amount: 1, calendar: calendar) == date(2025, 1, 1))
        precondition(PeriodNavigation.dates(date(2025, 1, 1), scope: "week", calendar: calendar).first == date(2024, 12, 30))
        let range = BlockGeometry.moved(start: 600, end: 660, delta: 50, scale: 1)
        precondition(range.0 == 650 && range.1 == 710)
        let edge = BlockGeometry.moved(start: 600, end: 660, delta: 9999, scale: 1)
        precondition(edge.0 == 1500 && edge.1 == 1560)
    }
    func testProjectColorEditsOnlyFrontmatterAndKeepsData() throws {
        let (bridge, store) = try sharedFixture(), file = try bridge.safeURL("p.md")
        let text = "---\r\ntype: project\r\nstatus: active\r\n---\r\n## log\r\n手写 [[双链]]\r\n"
        try Data(text.utf8).write(to: file)
        let before = try Data(contentsOf: store.url)
        try store.setProjectColor(path: "p.md", hex: "#123abc")
        let result = try String(contentsOf: file, encoding: .utf8)
        precondition(result == text.replacingOccurrences(of: "status: active", with: "status: active\r\ncolor: '#123abc'"))
        let after = try Data(contentsOf: store.url); precondition(before == after)
        let projects = try bridge.projects(); precondition(projects.first?.color == "#123abc")
        do { try store.setProjectColor(path: "p.md", hex: "bad\ncolor: red"); preconditionFailure("Invalid color") } catch {}
        do { try store.setProjectColor(path: "../outside.md", hex: "#123456"); preconditionFailure("Unsafe path") } catch {}
    }
    func testNativePlansNeverWriteProjectLogsOrCountAsTime() throws {
        let (bridge, store) = try sharedFixture(), file = try bridge.safeURL("p.md")
        let before = try Data(contentsOf: file), date = logicalDate(origin)
        var edit = BlockEdit(date: dayKey(date), start: 600, end: 660)
        edit.kind = "todo"; edit.projectPath = "p.md"; edit.title = "计划"
        try store.editBlock(edit)
        let report = try store.dashboard(date: date, scope: "month", projects: [Project(path: "p.md", name: "项目")])
        precondition(report.totalMinutes == 0 && report.projects[0].actual == 0)
        let item = report.items.first!; precondition(item.plan == true && item.end == 660)
        var move = BlockEdit(date: edit.date, start: 700, end: 760, id: edit.id, expected: item.revision); move.move = true
        try store.editBlock(move)
        let after = try Data(contentsOf: file); precondition(after == before)
        try store.setGoal(path: "p.md", date: date, scope: "month", minutes: 1200)
        let final = try store.dashboard(date: date, scope: "month", projects: [Project(path: "p.md", name: "项目")])
        precondition(final.projects[0].planned == 1200 && final.items[0].start == 700)
    }
}

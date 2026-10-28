import Foundation
import TimelineCore

enum PreviewFixture {
    static func dashboard(scope: String = "day") -> Dashboard? {
        let date = logicalDate(), dates = PeriodNavigation.dates(date, scope: scope)
        func items(_ index: Int) -> [[String: Any]] {
            [
                ["id": "a-\(index)", "title": "完成标识符识别", "kind": "fact", "editable": true, "plan": false, "note": "下次从关键字优先级继续。", "projectPath": "preview.md", "branchId": "", "start": 540, "end": 630],
                ["id": "b-\(index)", "title": "整理实验结果", "kind": "fact", "editable": true, "plan": false, "note": "补全对照组。", "projectPath": "research.md", "branchId": "", "start": 660, "end": 720],
                ["id": "c-\(index)", "title": "实现词法分析", "kind": "todo", "editable": true, "plan": true, "note": "", "projectPath": "preview.md", "branchId": "", "start": 600, "end": 690]
            ]
        }
        let days: [[String: Any]] = dates.enumerated().map { index, value in
            let factor = Double(index % 3 + 1) / 2
            return ["date": dayKey(value), "minutes": 150 * factor, "distractions": index % 4, "bed": 1440 + index % 3 * 20, "wake": 1890 + index % 3 * 15,
                    "items": items(index), "projects": [
                        ["path": "preview.md", "name": "编译器", "color": "#3159e2", "minutes": 90 * factor],
                        ["path": "research.md", "name": "科研", "color": "#9072c6", "minutes": 60 * factor]
                    ]]
        }
        let projects: [[String: Any]] = [
            ["path": "preview.md", "name": "编译器", "color": "#3159e2", "status": "active", "actual": days.reduce(0.0) { $0 + (($1["projects"] as? [[String: Any]])?.first?["minutes"] as? Double ?? 0) }, "planned": 300, "distractions": 3, "interval": 60],
            ["path": "research.md", "name": "科研", "color": "#9072c6", "status": "active", "actual": days.reduce(0.0) { $0 + (($1["projects"] as? [[String: Any]])?.last?["minutes"] as? Double ?? 0) }, "planned": 180, "distractions": 4, "interval": 30],
            ["path": "english.md", "name": "英语", "color": "#54a089", "status": "active", "actual": 0, "planned": 120, "distractions": 3, "interval": 20]
        ]
        let week = PeriodNavigation.dates(date, scope: "week")
        let value: [String: Any] = ["date": dayKey(date), "weekStart": dayKey(week[0]), "weekEnd": dayKey(week[6]), "totalMinutes": days.reduce(0.0) { $0 + ($1["minutes"] as? Double ?? 0) }, "expected": 0.5,
            "projects": projects, "items": items(0), "branches": [], "days": days, "sleep": [
                ["label": "平均入睡", "value": "00:20", "change": ["text": "−18m", "tone": "is-good"]],
                ["label": "平均起床", "value": "07:45", "change": ["text": "+5m", "tone": "is-neutral"]],
                ["label": "平均睡眠", "value": "7.4h", "change": ["text": "+23m", "tone": "is-good"]]
            ]]
        return try? JSONDecoder().decode(Dashboard.self, from: JSONSerialization.data(withJSONObject: value))
    }
}

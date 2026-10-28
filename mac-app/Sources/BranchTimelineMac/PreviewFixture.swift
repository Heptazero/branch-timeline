import Foundation
import TimelineCore

enum PreviewFixture {
    static func dashboard() -> Dashboard? {
        let date = logicalDate(), weekday = Calendar.current.component(.weekday, from: date)
        let start = Calendar.current.date(byAdding: .day, value: -((weekday + 5) % 7), to: date)!
        let days: [[String: Any]] = (0..<7).map { index in
            let key = dayKey(Calendar.current.date(byAdding: .day, value: index, to: start)!)
            return ["date": key, "minutes": [120, 60, 30, 90, 60, 0, 0][index], "distractions": [2, 1, 0, 4, 1, 0, 0][index], "bed": 1440 + index % 3 * 20, "wake": 1890 + index % 3 * 15]
        }
        let projects: [[String: Any]] = [
            ["path": "preview.md", "name": "编译器", "color": "#3159e2", "status": "active", "actual": 180, "planned": 300, "distractions": 3, "interval": 60],
            ["path": "research.md", "name": "科研", "color": "#9072c6", "status": "active", "actual": 120, "planned": 180, "distractions": 4, "interval": 30],
            ["path": "english.md", "name": "英语", "color": "#54a089", "status": "active", "actual": 60, "planned": 120, "distractions": 3, "interval": 20]
        ]
        let value: [String: Any] = ["date": dayKey(date), "weekStart": days[0]["date"]!, "weekEnd": days[6]["date"]!, "totalMinutes": 360, "expected": 0.5,
            "projects": projects, "items": [
                ["id": "1", "title": "完成标识符识别", "kind": "fact", "editable": true, "note": "下次从关键字优先级继续。", "projectPath": "preview.md", "branchId": "", "start": 540, "end": 630],
                ["id": "2", "title": "整理实验结果", "kind": "fact", "editable": true, "note": "补全对照组。", "projectPath": "research.md", "branchId": "", "start": 660, "end": 720]
            ], "branches": [], "days": days, "sleep": [
                ["label": "平均入睡", "value": "00:20", "change": ["text": "−18m", "tone": "is-good"]],
                ["label": "平均起床", "value": "07:45", "change": ["text": "+5m", "tone": "is-neutral"]],
                ["label": "平均睡眠", "value": "7.4h", "change": ["text": "+23m", "tone": "is-good"]]
            ]]
        return try? JSONDecoder().decode(Dashboard.self, from: JSONSerialization.data(withJSONObject: value))
    }
}

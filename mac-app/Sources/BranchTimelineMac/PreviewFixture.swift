import Foundation
import TimelineCore

enum PreviewFixture {
    static func context() -> [String: Any] {
        let phases: [[String: Any]] = [["id": "morning", "name": "清醒时段", "at": 480, "color": "#3978d3", "side": 1], ["id": "afternoon", "name": "放缓", "at": 780, "color": "#8a94a2", "side": 1]]
        return ["marks": [
            ["id": "good:g", "recordId": "g", "kind": "good", "label": "高度专注", "color": "#126cff", "revision": "{}", "minute": 580, "score": 100, "editable": true],
            ["id": "distraction:d", "recordId": "d", "kind": "distraction", "label": "中度走神", "level": "medium", "color": "#d84b4b", "revision": "{}", "minute": 610, "score": 0, "editable": true],
            ["id": "mental:m", "recordId": "m", "kind": "mental", "label": "有些困", "color": "#ba6464", "revision": "{}", "minute": 750, "score": 20, "editable": true]],
            "forecast": stride(from: 120, through: 1560, by: 15).map { minute in ["minute": minute, "score": minute < 720 ? 0.75 : 0.35, "color": minute < 720 ? "#126cff" : "#d84b4b", "ready": true, "evidenceDays": 9] as [String: Any] },
            "colors": ["low": "#d84b4b", "neutral": "#8b929d", "high": "#126cff"], "phases": phases,
            "energyRevision": String(decoding: try! JSONSerialization.data(withJSONObject: phases), as: UTF8.self), "labels": [],
            "gaps": [["start": 630, "end": 660, "current": false], ["start": 720, "end": 810, "current": true]]]
    }
    static func dashboard(scope: String = "day") -> Dashboard? {
        let date = logicalDate(), dates = PeriodNavigation.dates(date, scope: scope)
        func items(_ index: Int) -> [[String: Any]] {
            [
                ["milestone": true, "id": "a-\(index)", "title": "完成标识符识别", "kind": "fact", "editable": true, "plan": false, "note": "下次从关键字优先级继续。", "projectPath": "preview.md", "branchId": "", "start": 540, "end": 630],
                ["id": "b-\(index)", "title": "整理实验结果", "kind": "fact", "editable": true, "plan": false, "note": "补全对照组。", "projectPath": "research.md", "branchId": "", "start": 660, "end": 720],
                ["id": "c-\(index)", "title": "实现词法分析", "kind": "todo", "editable": true, "plan": true, "note": "", "projectPath": "preview.md", "branchId": "", "start": 600, "end": 690]
            ]
        }
        let days: [[String: Any]] = dates.enumerated().map { index, value in
            let factor = Double(index % 3 + 1) / 2
            return ["date": dayKey(value), "minutes": 150 * factor, "distractions": index % 4, "bed": 1440 + index % 3 * 20, "wake": 1890 + index % 3 * 15,
                    "focus": context(), "rhythmEvents": [["id": "wake", "name": "起床", "minute": 420, "real": true], ["id": "nap-start", "name": "午休", "minute": 780, "real": false], ["id": "sleep", "name": "入睡", "minute": 1500, "real": false]], "items": items(index), "projects": [
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
            "rhythm": ["wake": 420, "sleep": 1500, "switchAt": 810, "elapsedMark": "+", "remainingMark": "−"], "projects": projects, "items": items(0), "branches": [], "days": days, "sleep": [
                ["label": "平均入睡", "value": "00:20", "change": ["text": "−18m", "tone": "is-good"]],
                ["label": "平均起床", "value": "07:45", "change": ["text": "+5m", "tone": "is-neutral"]],
                ["label": "平均睡眠", "value": "7.4h", "change": ["text": "+23m", "tone": "is-good"]]
            ]]
        return try? JSONDecoder().decode(Dashboard.self, from: JSONSerialization.data(withJSONObject: value))
    }
}

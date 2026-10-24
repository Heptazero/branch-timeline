import Foundation

public struct TimelineRecord: Identifiable {
    public let id: String
    public let title: String
    public let projectName: String
    public let date: Date
    public let minutes: Double
    public let note: String
}

func timelineRecords(_ state: [String: Any]) -> [TimelineRecord] {
    let days = state["days"] as? [String: Any] ?? [:]
    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
    var records: [TimelineRecord] = []
    for (key, raw) in days {
        guard let day = raw as? [String: Any], let items = day["items"] as? [[String: Any]], let date = formatter.date(from: key) else { continue }
        for item in items where item["kind"] as? String == "fact" {
            guard let id = item["id"] as? String, let title = item["title"] as? String,
                  let start = item["startMin"] as? Double, let end = item["endMin"] as? Double, end >= start else { continue }
            let path = item["projectPath"] as? String ?? ""
            let instant = Calendar.current.date(byAdding: .minute, value: Int(end), to: date) ?? date
            records.append(TimelineRecord(id: id, title: title, projectName: (path as NSString).lastPathComponent.replacingOccurrences(of: ".md", with: ""),
                                          date: instant, minutes: end - start, note: item["note"] as? String ?? ""))
        }
    }
    return records.sorted { $0.date > $1.date }
}

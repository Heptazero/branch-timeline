import Foundation

public enum PeriodNavigation {
    public static func shift(_ date: Date, scope: String, amount: Int, calendar: Calendar = .current) -> Date {
        if scope == "total" { return date }
        if scope == "month" {
            let first = calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
            return calendar.date(byAdding: .month, value: amount, to: first) ?? first
        }
        return calendar.date(byAdding: .day, value: amount * (scope == "week" ? 7 : 1), to: date) ?? date
    }
    public static func dates(_ date: Date, scope: String, calendar: Calendar = .current) -> [Date] {
        if scope == "month" {
            let first = calendar.date(from: calendar.dateComponents([.year, .month], from: date))!
            return (0..<(calendar.range(of: .day, in: .month, for: first)?.count ?? 30)).compactMap { calendar.date(byAdding: .day, value: $0, to: first) }
        }
        if scope == "week" {
            let first = calendar.date(byAdding: .day, value: -((calendar.component(.weekday, from: date) + 5) % 7), to: calendar.startOfDay(for: date))!
            return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: first) }
        }
        return [calendar.startOfDay(for: date)]
    }
}

extension SharedStateStore {
    public func setProjectColor(path: String, hex: String) throws {
        guard hex.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else { throw SharedStateError.invalid }
        let file = try bridge.safeURL(path)
        guard file.pathExtension.lowercased() == "md" else { throw StorageError.unsafePath }
        try SharedFileLock.withLock(file: url) {
            let before = try Data(contentsOf: file)
            guard let text = String(data: before, encoding: .utf8) else { throw SharedStateError.invalid }
            let separator = text.contains("\r\n") ? "\r\n" : "\n"
            var lines = text.components(separatedBy: separator)
            guard lines.first == "---", let end = lines.indices.dropFirst().first(where: { lines[$0] == "---" }) else { throw SharedStateError.script("项目文件缺少属性区，未修改原文") }
            let matches = (1..<end).filter { lines[$0].hasPrefix("color:") }
            guard matches.count <= 1 else { throw SharedStateError.script("颜色属性重复，请先检查项目文件") }
            if let index = matches.first { lines[index] = "color: '\(hex)'" }
            else { lines.insert("color: '\(hex)'", at: end) }
            guard try Data(contentsOf: file) == before else { throw SharedStateError.conflict }
            try Data(lines.joined(separator: separator).utf8).write(to: file, options: .atomic)
        }
    }
}

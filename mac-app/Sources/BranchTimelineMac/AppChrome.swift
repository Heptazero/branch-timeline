import AppKit
import SwiftUI
import TimelineCore

enum AppPage: String, CaseIterable {
    case timer = "计时", timeline = "时间线", projects = "项目", stats = "统计", features = "更多"
    var icon: String {
        switch self { case .timer: return "clock"; case .timeline: return "calendar"; case .projects: return "square.stack"; case .stats: return "chart.bar"
        case .features: return "ellipsis" }
    }
}

enum AppPalette {
    static let blue = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(calibratedRed: 0.49, green: 0.61, blue: 1, alpha: 1)
            : NSColor(calibratedRed: 0.19, green: 0.35, blue: 0.89, alpha: 1)
    })
    static let surface = Color(nsColor: .controlBackgroundColor)
}

struct DateNavigation: View {
    @ObservedObject var model: AppModel
    @State private var showCalendar = false
    var body: some View {
        HStack(spacing: 8) {
            Button { model.shiftDate(-1) } label: { Image(systemName: "chevron.left") }.disabled(model.navigationScope == "total").help("上一个日期范围")
            Button { showCalendar.toggle() } label: {
                Text(title)
                    .monospacedDigit().font(.callout)
            }.disabled(model.navigationScope == "total").help("选择日期").popover(isPresented: $showCalendar, arrowEdge: .bottom) { CalendarPicker(model: model) }
            Button { model.shiftDate(1) } label: { Image(systemName: "chevron.right") }.disabled(model.navigationScope == "total").help("下一个日期范围")
        }.buttonStyle(.plain)
    }
    private var title: String {
        if model.navigationScope == "total" { return "全部时间" }
        if model.navigationScope == "month" { return model.focusDate.formatted(.dateTime.locale(Locale(identifier: "zh_CN")).year().month()) }
        if model.navigationScope == "week", let first = PeriodNavigation.dates(model.focusDate, scope: "week").first, let last = PeriodNavigation.dates(model.focusDate, scope: "week").last {
            return first.formatted(.dateTime.locale(Locale(identifier: "zh_CN")).month(.twoDigits).day(.twoDigits)) + "–" + last.formatted(.dateTime.locale(Locale(identifier: "zh_CN")).month(.twoDigits).day(.twoDigits))
        }
        return model.focusDate.formatted(.dateTime.locale(Locale(identifier: "zh_CN")).month().day())
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt32(cleaned, radix: 16) ?? 0x3159e2
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}
func hoursLabel(_ minutes: Double) -> String {
    minutes > 0 && minutes < 1.0 / 60 ? "<1s" : minutes > 0 && minutes < 1 ? String(format: "%.0fs", minutes * 60) : String(format: "%.1fh", minutes / 60)
}
func minuteLabel(_ minute: Double, seconds: Bool = false) -> String {
    let value = Int(max(0, minute) * 60 + 1e-6)
    let time = String(format: "%02d:%02d", value / 3600 % 24, value / 60 % 60)
    return seconds ? time + String(format: ":%02d", value % 60) : time
}

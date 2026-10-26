import AppKit
import SwiftUI
import TimelineCore

enum AppPage: String, CaseIterable {
    case timer = "计时", timeline = "时间线", projects = "项目", stats = "统计"
    var icon: String {
        switch self { case .timer: return "clock"; case .timeline: return "calendar"; case .projects: return "square.stack"; case .stats: return "chart.bar" }
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

struct BottomNavigation: View {
    @ObservedObject var model: AppModel
    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppPage.allCases, id: \.self) { page in
                Button { model.selectPage(page) } label: {
                    VStack(spacing: 5) {
                        Image(systemName: page.icon).font(.system(size: 21, weight: .regular))
                        Text(page.rawValue).font(.system(size: 11, weight: model.page == page ? .semibold : .regular))
                        Circle().fill(model.page == page ? AppPalette.blue : .clear).frame(width: 4, height: 4)
                    }.frame(maxWidth: .infinity).frame(height: 56).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(model.page == page ? AppPalette.blue : .secondary)
                    .accessibilityLabel(page.rawValue).accessibilityAddTraits(model.page == page ? .isSelected : [])
            }
        }.padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 4)
            .background(AppPalette.surface)
            .overlay(alignment: .top) { Divider() }
    }
}

struct DateNavigation: View {
    @ObservedObject var model: AppModel
    @State private var showCalendar = false
    var body: some View {
        HStack(spacing: 8) {
            Button { model.shiftDate(-1) } label: { Image(systemName: "chevron.left") }.help("上一个日期范围")
            Button { showCalendar.toggle() } label: {
                Text(model.page == .stats || (model.page == .projects && model.scope == "week") ? weekTitle : model.focusDate.formatted(.dateTime.locale(Locale(identifier: "zh_CN")).month().day()))
                    .monospacedDigit().font(.callout)
            }.help("选择日期").popover(isPresented: $showCalendar, arrowEdge: .bottom) { CalendarPicker(model: model) }
            Button { model.shiftDate(1) } label: { Image(systemName: "chevron.right") }.help("下一个日期范围")
        }.buttonStyle(.plain)
    }
    private var weekTitle: String {
        guard let value = model.dashboard else { return "本周" }
        return String(value.weekStart.suffix(5)).replacingOccurrences(of: "-", with: "/") + "–" + String(value.weekEnd.suffix(5)).replacingOccurrences(of: "-", with: "/")
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt32(cleaned, radix: 16) ?? 0x3159e2
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}
func hoursLabel(_ minutes: Double) -> String { String(format: "%.1fh", minutes / 60) }
func minuteLabel(_ minute: Double) -> String { String(format: "%02d:%02d", Int(minute) / 60 % 24, Int(minute) % 60) }

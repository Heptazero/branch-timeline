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

struct BottomNavigation: View {
    @ObservedObject var model: AppModel
    @State private var showMore = false
    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppPage.allCases.filter { $0 != .features && ($0 != .projects || model.visiblePages.contains("projects")) && ($0 != .stats || model.visiblePages.contains("habits")) }, id: \.self) { page in
                Button { model.selectPage(page) } label: {
                    VStack(spacing: 5) {
                        Image(systemName: page.icon).font(.system(size: 21, weight: .regular))
                        Text(page.rawValue).font(.system(size: 11, weight: model.page == page ? .semibold : .regular))
                        Circle().fill(model.page == page ? AppPalette.blue : .clear).frame(width: 4, height: 4)
                    }.frame(maxWidth: .infinity).frame(height: 56).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(model.page == page ? AppPalette.blue : .secondary)
                    .accessibilityLabel(page.rawValue).accessibilityAddTraits(model.page == page ? .isSelected : [])
            }
            Button { showMore.toggle() } label: {
                VStack(spacing: 5) {
                    Image(systemName: "ellipsis").font(.system(size: 21))
                    Text(model.page == .features ? model.featureTitle : "更多").font(.system(size: 11))
                    Circle().fill(model.page == .features ? AppPalette.blue : .clear).frame(width: 4, height: 4)
                }.frame(maxWidth: .infinity).frame(height: 56).contentShape(Rectangle())
            }.buttonStyle(.plain).foregroundStyle(model.page == .features ? AppPalette.blue : .secondary)
                .popover(isPresented: $showMore, arrowEdge: .bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        if model.visiblePages.contains("policy") { routeButton("锚点", "policy") }
                        if model.visiblePages.contains("achievements") { routeButton("成就", "achievements") }
                        if model.visiblePages.contains("life") { routeButton("人生", "life") }
                        Divider().padding(.vertical, 4)
                        Button("完整分支时间线") { showMore = false; model.page = .timeline; model.branchMode = true }
                        routeButton("详细统计", "habits")
                        routeButton("完整项目面板", "projects")
                        routeButton("全部功能设置", "settings")
                    }.buttonStyle(.plain).padding(14).frame(width: 190, alignment: .leading)
                }

        }.padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 4)
            .background(AppPalette.surface)
            .overlay(alignment: .top) { Divider() }
    }
    private func routeButton(_ title: String, _ route: String) -> some View {
        Button { showMore = false; model.openFeature(route) } label: { Text(title).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6) }
    }

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
func hoursLabel(_ minutes: Double) -> String { String(format: "%.1fh", minutes / 60) }
func minuteLabel(_ minute: Double) -> String { String(format: "%02d:%02d", Int(minute) / 60 % 24, Int(minute) % 60) }

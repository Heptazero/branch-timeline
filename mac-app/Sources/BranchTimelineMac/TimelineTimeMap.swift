import SwiftUI
import TimelineCore

private struct TimeMapDetail: Identifiable {
    let id = UUID(); let title: String; let start, end: Double; let day: DashboardDay
}
struct TimelineTimeMap: View {
    @ObservedObject var model: AppModel
    @State private var detail: TimeMapDetail?
    private var days: [DashboardDay] { model.dashboard?.days ?? [] }
    private let plotHeight = 490.0
    private func y(_ minute: Double) -> Double { (minute - 1080) / 1920 * plotHeight + 20 }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Label("睡眠", systemImage: "moon.fill").foregroundStyle(.purple)
                Label("计时", systemImage: "rectangle.fill").foregroundStyle(AppPalette.blue)
                Circle().fill(Color(hex: days.first?.focus?.colors.low ?? "#d84b4b")).frame(width: 5, height: 5)
                Circle().fill(Color(hex: days.first?.focus?.colors.high ?? "#126cff")).frame(width: 5, height: 5)
                Text("状态记录").foregroundStyle(.secondary)
                LinearGradient(colors: [.red, .gray, .blue], startPoint: .leading, endPoint: .trailing).frame(width: 14, height: 3)
                Text("历史预测").foregroundStyle(.secondary)
            }.font(.system(size: 10))
            GeometryReader { geometry in
                ScrollView(.horizontal) {
                    plot(width: max(geometry.size.width, 48 + Double(days.count) * 32))
                }
            }.frame(height: plotHeight + 55)
        }.popover(item: $detail) { item in
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title).font(.headline)
                Text(hoursLabel(item.end - item.start)).monospacedDigit()
                Text("\(minuteLabel(item.start))–\(minuteLabel(item.end))").font(.caption).foregroundStyle(.secondary)
                Button("查看当天") { model.selectDate(dayDate(item.day.date)); model.selectPage(.timeline); detail = nil }
            }.padding(16).frame(width: 230, alignment: .leading)
        }
    }
    private func dayDate(_ key: String) -> Date {
        let format = DateFormatter(); format.dateFormat = "yyyy-MM-dd"; format.locale = Locale(identifier: "en_US_POSIX")
        return format.date(from: key) ?? model.focusDate
    }
    private func plot(width: Double) -> some View {
        let left = 34.0, column = (width - left - 8) / Double(max(1, days.count))
        return ZStack(alignment: .topLeading) {
            ForEach([1080, 1440, 1800, 2160, 2520, 2880, 3000], id: \.self) { minute in
                HStack(spacing: 4) {
                    Text(minute == 1080 ? "昨18" : minute == 3000 ? "次2" : minute == 2880 ? "次0" : String(minute / 60 % 24)).font(.system(size: 10)).foregroundStyle(.secondary).frame(width: 28)
                    Rectangle().fill(.primary.opacity(0.06)).frame(height: 1)
                }.offset(y: y(Double(minute)) - 6).allowsHitTesting(false)
            }
            ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                dayColumn(day, width: column).offset(x: left + Double(index) * column)
            }
            ForEach([false, true], id: \.self) { wake in
                let values = days.compactMap { wake ? $0.wake : $0.bed }
                if !values.isEmpty {
                    let average = values.reduce(0, +) / Double(values.count)
                    Path { path in path.move(to: CGPoint(x: left, y: y(average))); path.addLine(to: CGPoint(x: width, y: y(average))) }
                        .stroke(.primary.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 4])).allowsHitTesting(false)
                }
            }
        }.frame(width: width, height: plotHeight + 55, alignment: .topLeading).accessibilityLabel("睡眠、计时和状态时间图；虚线为平均入睡与起床")
    }
    private func dayColumn(_ day: DashboardDay, width: Double) -> some View {
        ZStack(alignment: .topLeading) {
            if day.date == dayKey(logicalDate()) { Rectangle().fill(AppPalette.blue.opacity(0.04)).frame(width: width - 2, height: plotHeight + 36).allowsHitTesting(false) }
            if let bed = day.bed, let wake = day.wake { band("睡眠", start: bed, end: wake, color: .purple.opacity(0.45), day: day, x: width * 0.25, width: width * 0.45) }
            ForEach((day.items ?? []).filter { $0.plan != true && $0.end > $0.start }) { item in
                let color = Color(hex: model.projects.first { $0.path == item.projectPath }?.color ?? "#a4aab5")
                band(item.title, start: item.start + 1440, end: item.end + 1440, color: color.opacity(0.7), day: day, x: width * 0.28, width: width * 0.36)
            }
            if let focus = day.focus {
                if !focus.forecast.isEmpty {
                    LinearGradient(stops: focus.forecast.map { .init(color: Color(hex: $0.color), location: ($0.minute - 120) / 1440) }, startPoint: .top, endPoint: .bottom)
                        .frame(width: 3, height: y(3000) - y(1560)).offset(x: width - 5, y: y(1560)).allowsHitTesting(false)
                }
                ForEach(focus.marks) { point in
                    Circle().fill(Color(hex: point.color)).frame(width: point.kind == "mental" ? 6 : 5, height: point.kind == "mental" ? 6 : 5)
                        .offset(x: width * (point.kind == "mental" ? 0.72 : point.kind == "good" ? 0.5 : 0.12), y: y(point.minute + 1440) - 3)
                        .help("\(point.label) · \(minuteLabel(point.minute))")
                }
            }
            Button { model.selectDate(dayDate(day.date)); model.selectPage(.timeline) } label: { Text(String(day.date.suffix(2))).font(.system(size: 10)).frame(width: width, height: 22) }
                .buttonStyle(.plain).offset(y: plotHeight + 28).help(day.date)
        }.frame(width: width, height: plotHeight + 55, alignment: .topLeading)
    }
    private func band(_ title: String, start: Double, end: Double, color: Color, day: DashboardDay, x: Double, width: Double) -> some View {
        Button { detail = TimeMapDetail(title: title, start: start, end: end, day: day) } label: {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: max(4, width), height: max(3, y(end) - y(start)))
                .overlay(alignment: .top) { Color.clear.frame(height: 5).contentShape(Rectangle()).help("开始 \(minuteLabel(start))") }
                .overlay(alignment: .bottom) { Color.clear.frame(height: 5).contentShape(Rectangle()).help("结束 \(minuteLabel(end))") }
        }.buttonStyle(.plain).offset(x: x, y: y(start)).help("\(title) · \(hoursLabel(end - start))")
    }
}

import SwiftUI
import Charts
import TimelineCore

struct DailyProjectChart: View {
    let days: [DashboardDay]
    var onSelect: (DashboardDay) -> Void
    private var projects: [DayProject] {
        var seen = Set<String>()
        return days.flatMap { $0.projects ?? [] }.filter { seen.insert($0.path).inserted }
    }
    private var maximum: Double { max(1, ceil((days.map { ($0.projects ?? []).reduce(0) { $0 + $1.minutes } }.max() ?? 0) / 60)) }
    var body: some View {
        Chart {
            ForEach(days) { day in
                ForEach(day.projects ?? []) { project in
                    BarMark(x: .value("日期", day.date), y: .value("小时", project.minutes / 60), width: .ratio(0.65), stacking: .standard)
                        .foregroundStyle(by: .value("项目", project.path))
                }
            }
        }.chartXScale(domain: days.map(\.date)).chartYScale(domain: 0...maximum)
            .chartPlotStyle { plot in plot.background {
                HStack(spacing: 0) { ForEach(days) { day in (day.date == dayKey(logicalDate()) ? AppPalette.blue.opacity(0.055) : Color.clear).frame(maxWidth: .infinity) } }
            } }
            .chartForegroundStyleScale(domain: projects.map(\.path), range: projects.map { Color(hex: $0.color) }).chartLegend(.hidden)
            .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                AxisGridLine().foregroundStyle(.primary.opacity(0.07)); AxisValueLabel { if let hours = value.as(Double.self) { Text(String(format: "%gh", hours)).font(.system(size: 10)) } }
            } }
            .chartXAxis { AxisMarks(values: days.enumerated().filter { days.count <= 8 || $0.offset % 5 == 0 }.map { $0.element.date }) { value in
                AxisValueLabel { if let date = value.as(String.self) { Text(String(date.suffix(2))).font(.system(size: 10)) } }
            } }
            .chartOverlay { proxy in
                GeometryReader { geometry in
                    Rectangle().fill(.clear).contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onEnded { value in
                        let frame = geometry[proxy.plotAreaFrame], x = value.location.x - frame.minX
                        guard frame.contains(value.location), let date = proxy.value(atX: x, as: String.self) else { return }
                        if let day = days.first(where: { $0.date == date }) { onSelect(day) }
                    })
                }
            }.frame(height: 230).accessibilityLabel("按日期和项目颜色堆叠的工时，点击一天查看项目排行")
    }
}

struct DayBreakdown: View {
    let day: DashboardDay
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    private var rows: [DayProject] { (day.projects ?? []).sorted { $0.minutes > $1.minutes } }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text(day.date).font(.headline); Spacer(); Text(hoursLabel(rows.reduce(0) { $0 + $1.minutes })).font(.headline).monospacedDigit() }
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack { Circle().fill(Color(hex: row.color)).frame(width: 7, height: 7); Text(row.name).lineLimit(2); Spacer(minLength: 8); Text(hoursLabel(row.minutes)).font(.caption).monospacedDigit() }
                            GeometryReader { geometry in
                                Capsule().fill(Color(hex: row.color).opacity(0.65)).frame(width: geometry.size.width * row.minutes / max(1, rows.first?.minutes ?? 1))
                            }.frame(height: 6)
                        }
                    }
                    if rows.isEmpty { Text("暂无记录").foregroundStyle(.secondary) }
                }.padding(.vertical, 3)
            }.frame(maxHeight: 280)
            Button("打开当天时间线") { dismiss(); model.openTimelineDay(day.date) }.buttonStyle(.borderless)
        }.padding(18).frame(width: 300)
    }
}

struct MonthTimeline: View {
    @ObservedObject var model: AppModel
    @State private var selected: DashboardDay?
    private var maximum: Double { max(1, (model.dashboard?.days ?? []).map { ($0.projects ?? []).reduce(0) { $0 + $1.minutes } }.max() ?? 1) }
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                HStack { ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity) } }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                    ForEach(CalendarGrid.dates(in: model.focusDate, fixedWeeks: false), id: \.self) { date in cell(date) }
                }
            }.padding(.horizontal, 16).padding(.top, 8)
        }.popover(item: $selected, arrowEdge: .bottom) { day in DayBreakdown(day: day, model: model) }
    }
    private func cell(_ date: Date) -> some View {
        let key = dayKey(date), day = model.dashboard?.days.first { $0.date == key }, today = key == dayKey(logicalDate())
        let current = Calendar.current.isDate(date, equalTo: model.focusDate, toGranularity: .month)
        let total = (day?.projects ?? []).reduce(0) { $0 + $1.minutes }
        return Button { if let day { selected = day } } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(Calendar.current.component(.day, from: date))").font(.system(size: 11, weight: today ? .bold : .regular)).foregroundStyle(today ? AppPalette.blue : .primary)
                HStack(alignment: .bottom, spacing: 0) {
                    Spacer(minLength: 0)
                    VStack(spacing: 0) {
                        ForEach((day?.projects ?? []).reversed()) { project in Rectangle().fill(Color(hex: project.color).opacity(0.8)).frame(height: 40 * project.minutes / maximum) }
                    }.frame(width: 13).clipShape(RoundedRectangle(cornerRadius: 2))
                    Spacer(minLength: 0)
                }.frame(height: 40, alignment: .bottom)
                Text(total > 0 ? hoursLabel(total) : " ").font(.system(size: 9)).monospacedDigit().foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.75)
            }.padding(5).frame(maxWidth: .infinity).frame(height: 88)
                .background(today ? AppPalette.blue.opacity(0.075) : Color.primary.opacity(0.025), in: RoundedRectangle(cornerRadius: 6))
                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(selected?.date == key ? AppPalette.blue : .clear) }
                .opacity(current ? 1 : 0.25)
        }.buttonStyle(.plain).disabled(!current).help("\(key) · \(hoursLabel(total))")
    }
}

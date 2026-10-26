import SwiftUI
import TimelineCore

struct StatisticsPage: View {
    @ObservedObject var model: AppModel
    @State private var mode = "项目"
    @State private var descending = true
    private var rows: [ProjectSummary] {
        (model.dashboard?.projects ?? []).filter { $0.actual > 0 }.sorted {
            let a = mode == "走神" ? $0.interval ?? Double.greatestFiniteMagnitude : $0.actual
            let b = mode == "走神" ? $1.interval ?? Double.greatestFiniteMagnitude : $1.actual
            return descending ? a > b : a < b
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack { Text("本周").font(.title2.weight(.medium)); Spacer(); DateNavigation(model: model) }
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text(hoursLabel(model.dashboard?.totalMinutes ?? 0)).font(.system(size: 38, weight: .medium, design: .rounded)).monospacedDigit()
                Text("项目记录").foregroundStyle(.secondary).font(.caption)
            }
            HStack {
                ForEach(["项目", "走神", "睡眠"], id: \.self) { value in
                    Button { mode = value } label: {
                        Text(value).font(.callout).padding(.horizontal, 14).padding(.vertical, 7)
                            .foregroundStyle(mode == value ? AppPalette.blue : .secondary)
                            .background(mode == value ? AppPalette.blue.opacity(0.07) : .clear, in: Capsule())
                    }.buttonStyle(.plain).accessibilityAddTraits(mode == value ? .isSelected : [])
                }
                Spacer()
                if mode != "睡眠" { Button { descending.toggle() } label: { Image(systemName: descending ? "arrow.down" : "arrow.up") }.buttonStyle(.plain).help("切换排序方向") }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 25) {
                    if mode == "睡眠" {
                        SleepChart(dashboard: model.dashboard)
                    } else {
                        ForEach(rows) { row in
                            if mode == "项目" {
                                ProjectProgressRow(row: row, expected: model.dashboard?.expected ?? 0, showGoal: false, maximum: rows.map(\.actual).max() ?? 1,
                                    onOpen: { model.openProject(row.path) })
                            } else { interruptionRow(row) }
                        }
                        if rows.isEmpty { Text("本周暂无记录").foregroundStyle(.secondary).padding(.top, 30) }
                        if mode == "走神" { Text("计时分钟 ÷ 走神记录数；不是连续专注时长").font(.caption).foregroundStyle(.secondary) }
                    }
                }.padding(.vertical, 6)
            }
        }.padding(.horizontal, 30).padding(.top, 14).padding(.bottom, 20)
    }
    private func interruptionRow(_ row: ProjectSummary) -> some View {
        VStack(spacing: 9) {
            HStack { Text(row.name).lineLimit(1); Spacer(); Text(row.interval.map { "\(Int($0.rounded())) min/次" } ?? "未记走神").foregroundStyle(.secondary).font(.caption).monospacedDigit() }
            GeometryReader { geometry in
                let maximum = rows.compactMap(\.interval).max() ?? 1
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(.primary.opacity(0.05))
                    if let interval = row.interval { RoundedRectangle(cornerRadius: 4).fill(AppPalette.blue.opacity(0.65)).frame(width: geometry.size.width * min(1, interval / max(1, maximum))) }
                }
            }.frame(height: 18)
        }
    }
}

struct SleepChart: View {
    let dashboard: Dashboard?
    var body: some View {
        VStack(spacing: 24) {
            HStack(alignment: .top) {
                ForEach(Array((dashboard?.sleep ?? []).enumerated()), id: \.offset) { _, metric in
                    VStack(alignment: .leading, spacing: 7) {
                        Text(metric.label).font(.system(size: 11)).foregroundStyle(.secondary)
                        Text(metric.value).font(.system(size: 20, weight: .medium)).monospacedDigit()
                        if let change = metric.change {
                            Text(change.text).font(.system(size: 11)).foregroundStyle(change.tone == "is-good" ? .green : change.tone == "is-bad" ? .red : .secondary)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if let days = dashboard?.days, days.contains(where: { $0.bed != nil }) {
                Canvas { context, size in
                    let left = 46.0, plotWidth = size.width - left - 10
                    let start = 1080.0, span = 1320.0
                    func y(_ minute: Double) -> Double { 12 + (minute - start) / span * (size.height - 46) }
                    for minute in stride(from: 1080, through: 2400, by: 240) {
                        let yy = y(Double(minute))
                        context.draw(Text(minuteLabel(Double(minute))).font(.system(size: 10)).foregroundColor(.secondary), at: CGPoint(x: 16, y: yy))
                        var line = Path(); line.move(to: CGPoint(x: left, y: yy)); line.addLine(to: CGPoint(x: size.width, y: yy))
                        context.stroke(line, with: .color(.primary.opacity(0.08)), lineWidth: 1)
                    }
                    for (index, day) in days.enumerated() {
                        let x = left + plotWidth / 7 * (Double(index) + 0.5)
                        if let bed = day.bed, let wake = day.wake {
                            let rect = CGRect(x: x - 9, y: y(bed), width: 18, height: max(2, y(wake) - y(bed)))
                            context.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(AppPalette.blue.opacity(0.5)))
                        }
                        context.draw(Text(["一", "二", "三", "四", "五", "六", "日"][index]).font(.system(size: 11)).foregroundColor(.secondary), at: CGPoint(x: x, y: size.height - 8))
                    }
                    for values in [days.compactMap(\.bed), days.compactMap(\.wake)] where !values.isEmpty {
                        let yy = y(values.reduce(0, +) / Double(values.count))
                        var line = Path(); line.move(to: CGPoint(x: left, y: yy)); line.addLine(to: CGPoint(x: size.width, y: yy))
                        context.stroke(line, with: .color(.primary.opacity(0.5)), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    }
                }.frame(height: 270).accessibilityLabel("本周入睡到起床区间，虚线为平均时刻")
                Text("虚线：本周平均入睡 / 起床").font(.caption).foregroundStyle(.secondary)
            } else { Text("暂无完整睡眠记录").foregroundStyle(.secondary).padding(.vertical, 40) }
        }
    }
}

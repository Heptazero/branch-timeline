import SwiftUI
import TimelineCore

struct TimelinePage: View {
    @ObservedObject var model: AppModel
    @State private var scale = 0.65
    @State private var detail: DashboardItem?
    private let start = 120.0, end = 1560.0
    private var items: [DashboardItem] { (model.dashboard?.items ?? []).sorted { $0.start < $1.start } }
    private var nowMinute: Double {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: model.now)
        let hour = parts.hour ?? 0
        return Double(hour * 60 + (parts.minute ?? 0) + (hour < 2 ? 1440 : 0))
    }
    var body: some View {
        VStack(spacing: 14) {
            HStack { Spacer(); DateNavigation(model: model); Spacer() }.padding(.top, 8)
            ScrollViewReader { proxy in
                ScrollView {
                    ZStack(alignment: .topLeading) {
                        Color.clear.frame(height: 1).id("day-start")
                        Rectangle().fill(.primary.opacity(0.13)).frame(width: 1).offset(x: 56)
                        ForEach(Array(stride(from: 120, through: 1560, by: 120)), id: \.self) { minute in
                            Text(minuteLabel(Double(minute))).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit().offset(y: y(Double(minute)) - 7)
                        }
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            record(item, index: index).offset(y: y(item.start))
                        }
                        if dayKey(model.focusDate) == dayKey(logicalDate(model.now)) {
                            HStack(spacing: 0) {
                                Circle().fill(.red).frame(width: 6, height: 6)
                                Rectangle().fill(.red.opacity(0.7)).frame(height: 1)
                            }.padding(.leading, 53).offset(y: y(nowMinute)).id("now")
                        }
                    }.frame(height: (end - start) * scale + 100).padding(.horizontal, 24).padding(.top, 18)
                }.onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { proxy.scrollTo("now", anchor: .center) } }
                    .onChange(of: model.focusDate) { _ in proxy.scrollTo(dayKey(model.focusDate) == dayKey(logicalDate(model.now)) ? "now" : "day-start", anchor: .center) }
                    .onChange(of: model.focusRequest) { _ in proxy.scrollTo("now", anchor: .center) }
            }
            HStack {
                Button { scale = max(0.25, scale - 0.15) } label: { Image(systemName: "minus") }.help("缩小时间线")
                Button { scale = min(1.5, scale + 0.15) } label: { Image(systemName: "plus") }.help("放大时间线")
                Spacer()
                if items.isEmpty { Text("暂无记录").font(.caption).foregroundStyle(.secondary) }
            }.buttonStyle(.plain).padding(.horizontal, 28).padding(.bottom, 18)
        }.popover(item: $detail, arrowEdge: .trailing) { item in
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title).font(.headline)
                Text("\(minuteLabel(item.start))–\(minuteLabel(item.end)) · \(hoursLabel(max(0, item.end - item.start)))").font(.caption).foregroundStyle(.secondary)
                if !item.note.isEmpty { Text(item.note).textSelection(.enabled) }
                if !item.projectPath.isEmpty { Button("打开项目文件") { model.openProject(item.projectPath) } }
            }.padding(18).frame(width: 300, alignment: .leading)
        }
    }
    private func y(_ minute: Double) -> Double { (max(start, minute) - start) * scale }
    private func record(_ item: DashboardItem, index: Int) -> some View {
        let project = model.projects.first { $0.path == item.projectPath }
        let color = Color(hex: project?.color ?? "#a4aab5")
        let overlapping = items.prefix(index).filter { $0.end > item.start }.count
        let inset = Double(min(overlapping, 3)) * 12
        return Button { detail = item } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    if item.kind == "todo" { Image(systemName: "circle").font(.caption) }
                    Text(item.title).font(.system(size: 13, weight: .medium)).lineLimit(2)
                    Spacer(minLength: 0)
                    if item.end > item.start { Text(hoursLabel(item.end - item.start)).font(.caption).monospacedDigit() }
                }
                if let project { Text("@" + project.name).font(.system(size: 11)).lineLimit(1) }
                if let branch = model.dashboard?.branches.first(where: { $0.id == item.branchId }) { Text(branch.name).font(.system(size: 10)).foregroundStyle(.secondary) }
                if (item.end - item.start) * scale > 90 && !item.note.isEmpty { Text(item.note).font(.caption).lineLimit(3).foregroundStyle(.secondary) }
                Spacer(minLength: 0)
            }.foregroundStyle(color).padding(10).frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: max(46, min(320, (item.end - item.start) * scale)))
                .background(color.opacity(item.kind == "todo" ? 0.05 : 0.13), in: RoundedRectangle(cornerRadius: 8))
                .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(color.opacity(0.7)).frame(width: 3) }
        }.buttonStyle(.plain).padding(.leading, 72 + inset).padding(.trailing, 4)
    }
}

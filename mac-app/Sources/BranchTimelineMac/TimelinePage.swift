import SwiftUI
import TimelineCore

struct TimelinePage: View {
    @ObservedObject var model: AppModel
    @AppStorage("timelineMinuteScale") private var scale = TimelineZoom.initial
    @AppStorage("timelineShowPlans") private var showPlans = true
    @State private var gestureStart: Double?
    @State private var detail: DashboardItem?
    @State private var draft: BlockEdit?
    @State private var horizontalOffset = 0.0
    var body: some View {
        VStack(spacing: 0) {
            if model.scope == "month" {
                MonthTimeline(model: model)
            } else {
                let days = model.dashboard?.days ?? []
                TimelineColumnHeader(days: days, selected: dayKey(model.focusDate), showPlans: showPlans, offset: horizontalOffset)
                TimelineViewport(document: document(days), date: "\(model.scope)-\(days.first?.date ?? dayKey(model.focusDate))", focus: model.focusRequest,
                    onHorizontalOffset: { horizontalOffset = $0 })
                    .gesture(MagnificationGesture().onChanged { amount in
                        if gestureStart == nil { gestureStart = TimelineZoom.clamp(scale) }
                        scale = TimelineZoom.clamp((gestureStart ?? scale) * amount)
                    }.onEnded { _ in gestureStart = nil })
                HStack(spacing: 12) {
                    Image(systemName: "minus.magnifyingglass").foregroundStyle(.secondary)
                    Slider(value: Binding(get: { log2(TimelineZoom.clamp(scale)) }, set: { scale = TimelineZoom.clamp(pow(2, $0)) }), in: log2(TimelineZoom.minimum)...log2(TimelineZoom.maximum)).accessibilityLabel("时间线缩放")
                    Image(systemName: "plus.magnifyingglass").foregroundStyle(.secondary)
                    Text("\(Int(TimelineZoom.clamp(scale) / TimelineZoom.initial * 100))%").font(.caption).monospacedDigit().frame(width: 38, alignment: .trailing)
                }.padding(.horizontal, 22).padding(.vertical, 12)
            }
        }.sheet(item: $draft) { edit in BlockEditor(model: model, edit: edit) }
        .popover(item: $detail, arrowEdge: .trailing) { item in
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title).font(.headline)
                Text("\(minuteLabel(item.start))–\(minuteLabel(item.end)) · \(hoursLabel(max(0, item.end - item.start)))").font(.caption).foregroundStyle(.secondary)
                if item.plan == true { Text("计划").font(.caption).foregroundStyle(.secondary) }
                if !item.note.isEmpty { Text(item.note).textSelection(.enabled) }
                Button("更多操作") { detail = nil; model.openFeature("day"); model.featureItemID = item.id }
                if !item.projectPath.isEmpty { Button("在 Obsidian 打开项目文件") { model.openProject(item.projectPath) } }
            }.padding(18).frame(width: 300, alignment: .leading)
        }
    }
    private func document(_ days: [DashboardDay]) -> TimelineDocument {
        TimelineDocument(items: model.dashboard?.items ?? [], projects: model.projects, branches: model.dashboard?.branches ?? [], scale: TimelineZoom.clamp(scale), now: nowMinute,
            onOpen: { detail = $0 }, onStart: { item, date in model.executePlan(item, date: date) }, canStart: model.active == nil, onRhythm: { date, id, minute in model.changeRhythm(date: date, id: id, minute: minute) }, days: days, focusDate: dayKey(model.focusDate), showPlans: showPlans,
            onCreate: { date, minute, plan in
                model.clearError()
                var value = BlockEdit(date: date, start: minute, end: min(1560, minute + 30)); value.kind = plan ? "todo" : "fact"; draft = value
            }, onResize: { item, date, start, end, move in model.resizeBlock(item, date: date, start: start, end: end, move: move) })
    }
    private var nowMinute: Double {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: model.now), hour = parts.hour ?? 0
        return Double(hour * 60 + (parts.minute ?? 0) + (hour < 2 ? 1440 : 0))
    }
}

struct TimelineDocument: View {
    let items: [DashboardItem]
    let projects: [Project]
    let branches: [DashboardBranch]
    let scale: Double
    let now: Double?
    let onOpen: (DashboardItem) -> Void
    var onStart: (DashboardItem, String) -> Void = { _, _ in }
    var canStart = true
    var onRhythm: (String, String, Int?) -> Void = { _, _, _ in }
    var days: [DashboardDay] = []
    var focusDate = ""
    var showPlans = true
    var onCreate: (String, Int, Bool) -> Void = { _, _, _ in }
    var onResize: (DashboardItem, String, Int, Int, Bool) -> Void = { _, _, _, _, _ in }
    var height: Double { 1440 * scale + 40 }
    var minimumWidth: Double { days.count > 1 ? 48 + Double(days.count) * (showPlans ? 200 : 130) : 0 }
    func focusX(width: Double) -> Double {
        let index = days.firstIndex { $0.date == focusDate } ?? 0
        return 48 + (width - 48) / Double(max(1, days.count)) * (Double(index) + 0.5)
    }
    private func y(_ minute: Double) -> Double { (max(120, minute) - 120) * scale + 18 }
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                ForEach(Array(stride(from: 120, through: 1560, by: scale < 0.2 ? 360 : scale < 0.4 ? 180 : 120)), id: \.self) { minute in
                    HStack(spacing: 4) {
                        Text(minuteLabel(Double(minute))).font(.system(size: 10)).foregroundStyle(.secondary).monospacedDigit().frame(width: 40)
                        Rectangle().fill(.primary.opacity(0.045)).frame(height: 1)
                    }.offset(y: y(Double(minute)) - 6).allowsHitTesting(false)
                }
                HStack(spacing: 0) {
                    Color.clear.frame(width: 48)
                    if days.isEmpty { column(items: items, date: focusDate, width: geometry.size.width - 48) }
                    else {
                        ForEach(days) { day in column(items: day.items ?? [], date: day.date, width: (geometry.size.width - 48) / Double(days.count)) }
                    }
                }
            }
        }.coordinateSpace(name: "timelineDocument").frame(height: height).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    private func column(items: [DashboardItem], date: String, width: Double) -> some View {
        let actual = items.filter { $0.plan != true && !($0.kind == "todo" && $0.end == $0.start) }
        let plans = items.filter { $0.plan == true || ($0.kind == "todo" && $0.end == $0.start) }
        let today = date == dayKey(logicalDate())
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(today ? AppPalette.blue.opacity(0.025) : Color.clear).allowsHitTesting(false)
            HStack(spacing: 0) {
                lane(actual, date: date, plan: false, width: showPlans ? width / 2 : width)
                if showPlans { lane(plans, date: date, plan: true, width: width / 2) }
            }
            RhythmTimelineOverlay(events: days.first { $0.date == date }?.rhythmEvents ?? [], scale: scale, onChange: { id, minute in onRhythm(date, id, minute) })
            if today, let now {
                HStack(spacing: 0) { Circle().fill(.red).frame(width: 4, height: 4); Rectangle().fill(.red.opacity(0.6)).frame(height: 1) }.offset(y: y(now)).allowsHitTesting(false)
            }
        }.frame(width: max(1, width), height: height).overlay(alignment: .leading) { Rectangle().fill(.primary.opacity(0.06)).frame(width: 1).allowsHitTesting(false) }
    }
    private func lane(_ values: [DashboardItem], date: String, plan: Bool, width: Double) -> some View {
        let sorted = values.sorted { $0.start == $1.start ? $0.end > $1.end : $0.start < $1.start }
        let labels = visibleLabels(sorted)
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(plan ? Color.primary.opacity(0.015) : .clear).contentShape(Rectangle())
                .gesture(SpatialTapGesture(count: 2).onEnded { onCreate(date, BlockGeometry.minute(y: $0.location.y, scale: scale), plan) })
                .help(plan ? "双击添加计划" : "双击添加时间块")
            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, item in
                let inset = Double(min(sorted.prefix(index).filter { $0.end > item.start }.count, 3)) * 5
                TimelineBlockCard(item: item, project: projects.first { $0.path == item.projectPath }, branch: branches.first { $0.id == item.branchId }, scale: scale,
                    showLabel: labels.contains(item.id), onOpen: onOpen,
                    onResize: { item, start, end in onResize(item, date, start, end, false) },
                    onStart: { onStart($0, date) }, canStart: canStart,
                    onMove: { item, start, end in onResize(item, date, start, end, true) })
                    .padding(.leading, 6 + inset).padding(.trailing, 5).offset(y: y(item.start))
            }
        }.frame(width: max(1, width), height: height)
    }
    private func visibleLabels(_ items: [DashboardItem]) -> Set<String> {
        var previous = -Double.infinity, result = Set<String>()
        for item in items where y(item.start) >= previous + 14 { result.insert(item.id); previous = y(item.start) }
        return result
    }

}

struct TimelineColumnHeader: View {
    let days: [DashboardDay]
    let selected: String
    let showPlans: Bool
    let offset: Double
    var body: some View {
        GeometryReader { geometry in
            let count = max(1, days.count), total = max(geometry.size.width, count > 1 ? 48 + Double(count) * (showPlans ? 200 : 130) : 0)
            HStack(spacing: 0) {
                Color.clear.frame(width: 48)
                ForEach(Array((days.isEmpty ? [selected] : days.map(\.date)).enumerated()), id: \.offset) { index, date in
                    VStack(spacing: 4) {
                        if count > 1 { Text(["一", "二", "三", "四", "五", "六", "日"][index % 7] + " " + String(date.suffix(5)).replacingOccurrences(of: "-", with: "/")).font(.system(size: 11, weight: .medium)) }
                        HStack { Text("实际").frame(maxWidth: .infinity); if showPlans { Text("计划").frame(maxWidth: .infinity) } }.font(.system(size: 10)).foregroundStyle(.secondary)
                    }.frame(width: (total - 48) / Double(count)).frame(maxHeight: .infinity)
                        .background(date == dayKey(logicalDate()) ? AppPalette.blue.opacity(0.06) : .clear)
                }
            }.frame(width: total).offset(x: -offset)
        }.frame(height: days.count > 1 ? 38 : 24).clipped().overlay(alignment: .bottom) { Divider() }
    }
}

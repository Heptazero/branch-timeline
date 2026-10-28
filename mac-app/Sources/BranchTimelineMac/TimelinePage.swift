import SwiftUI
import TimelineCore

struct TimelinePage: View {
    @ObservedObject var model: AppModel
    @AppStorage("timelineMinuteScale") private var scale = TimelineZoom.initial
    @State private var gestureStart: Double?
    @State private var detail: DashboardItem?
    @State private var draft: BlockEdit?
    private var items: [DashboardItem] { (model.dashboard?.items ?? []).sorted { $0.start == $1.start ? $0.end > $1.end : $0.start < $1.start } }
    private var nowMinute: Double {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: model.now), hour = parts.hour ?? 0
        return Double(hour * 60 + (parts.minute ?? 0) + (hour < 2 ? 1440 : 0))
    }
    var body: some View {
        VStack(spacing: 12) {
            HStack { Spacer(); DateNavigation(model: model); Spacer() }.padding(.top, 8)
            TimelineViewport(document: TimelineDocument(items: items, projects: model.projects, branches: model.dashboard?.branches ?? [], scale: TimelineZoom.clamp(scale),
                now: dayKey(model.focusDate) == dayKey(logicalDate(model.now)) ? nowMinute : nil, onOpen: { detail = $0 }, onCreate: { minute in
                    model.clearError()
                    draft = BlockEdit(date: dayKey(model.focusDate), start: minute, end: min(1560, minute + 30))
                }, onResize: { item, start, end in model.resizeBlock(item, date: dayKey(model.focusDate), start: start, end: end) }), date: dayKey(model.focusDate), focus: model.focusRequest)
                .gesture(MagnificationGesture().onChanged { amount in
                    if gestureStart == nil { gestureStart = TimelineZoom.clamp(scale) }
                    scale = TimelineZoom.clamp((gestureStart ?? scale) * amount)
                }.onEnded { _ in gestureStart = nil })
            HStack(spacing: 12) {
                Image(systemName: "minus.magnifyingglass").foregroundStyle(.secondary)
                Slider(value: Binding(get: { log2(TimelineZoom.clamp(scale)) }, set: { scale = TimelineZoom.clamp(pow(2, $0)) }), in: log2(TimelineZoom.minimum)...log2(TimelineZoom.maximum))
                    .accessibilityLabel("时间线缩放")
                Image(systemName: "plus.magnifyingglass").foregroundStyle(.secondary)
                Text("\(Int(TimelineZoom.clamp(scale) / TimelineZoom.initial * 100))%").font(.caption).monospacedDigit().frame(width: 38, alignment: .trailing)
            }.padding(.horizontal, 26).padding(.bottom, 16)
        }.sheet(item: $draft) { edit in BlockEditor(model: model, edit: edit) }
        .popover(item: $detail, arrowEdge: .trailing) { item in
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title).font(.headline)
                Text("\(minuteLabel(item.start))–\(minuteLabel(item.end)) · \(hoursLabel(max(0, item.end - item.start)))").font(.caption).foregroundStyle(.secondary)
                if !item.note.isEmpty { Text(item.note).textSelection(.enabled) }
                if !item.projectPath.isEmpty { Button("在 Obsidian 打开项目文件") { model.openProject(item.projectPath) } }
            }.padding(18).frame(width: 300, alignment: .leading)
        }
    }
}

struct TimelineDocument: View {
    let items: [DashboardItem]
    let projects: [Project]
    let branches: [DashboardBranch]
    let scale: Double
    let now: Double?
    let onOpen: (DashboardItem) -> Void
    var onCreate: (Int) -> Void = { _ in }
    var onResize: (DashboardItem, Int, Int) -> Void = { _, _, _ in }
    var height: Double { 1440 * scale + 60 }
    private func y(_ minute: Double) -> Double { (max(120, minute) - 120) * scale + 18 }
    private var labelIds: Set<String> {
        var previous = -Double.infinity, visible: Set<String> = []
        for item in items {
            if y(item.start) >= previous + 16 { visible.insert(item.id); previous = y(item.start) }
        }
        return visible
    }
    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(maxWidth: .infinity).frame(height: height).contentShape(Rectangle())
                .gesture(SpatialTapGesture(count: 2).onEnded { value in
                    if value.location.x >= 60 { onCreate(BlockGeometry.minute(y: value.location.y, scale: scale)) }
                }).help("双击添加时间块")
            Rectangle().fill(.primary.opacity(0.13)).frame(width: 1, height: 1440 * scale).offset(x: 56, y: 18).allowsHitTesting(false)
            ForEach(Array(stride(from: 120, through: 1560, by: scale < 0.2 ? 360 : scale < 0.4 ? 180 : 120)), id: \.self) { minute in
                Text(minuteLabel(Double(minute))).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit().offset(y: y(Double(minute)) - 7).allowsHitTesting(false)
            }
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in record(item, index: index).offset(y: y(item.start)) }
            if let now {
                HStack(spacing: 0) { Circle().fill(.red).frame(width: 6, height: 6); Rectangle().fill(.red.opacity(0.7)).frame(height: 1) }
                    .padding(.leading, 53).offset(y: y(now)).allowsHitTesting(false)
            }
        }.coordinateSpace(name: "timelineDocument").frame(height: height, alignment: .topLeading).padding(.horizontal, 24).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    private func record(_ item: DashboardItem, index: Int) -> some View {
        let inset = Double(min(items.prefix(index).filter { $0.end > item.start }.count, 3)) * 12
        return TimelineBlockCard(item: item, project: projects.first { $0.path == item.projectPath },
            branch: branches.first { $0.id == item.branchId }, scale: scale, showLabel: labelIds.contains(item.id),
            onOpen: onOpen, onResize: onResize).padding(.leading, 72 + inset).padding(.trailing, 4)
    }
}

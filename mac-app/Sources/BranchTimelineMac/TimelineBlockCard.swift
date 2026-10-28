import SwiftUI
import TimelineCore

private struct EdgePreview {
    let item: DashboardItem
    let scale: Double
    var start, end: Int
}

struct TimelineBlockCard: View {
    let item: DashboardItem
    let project: Project?
    let branch: DashboardBranch?
    let scale: Double
    let showLabel: Bool
    let onOpen: (DashboardItem) -> Void
    let onResize: (DashboardItem, Int, Int) -> Void
    @GestureState private var preview: EdgePreview?
    @State private var hovered = false
    private var start: Double { Double(preview?.start ?? Int(item.start)) }
    private var end: Double { Double(preview?.end ?? Int(item.end)) }
    private var height: Double { TimelineZoom.cardHeight(minutes: max(0, end - start), scale: scale) }
    private var color: Color { Color(hex: project?.color ?? "#a4aab5") }
    var body: some View {
        ZStack(alignment: .topLeading) {
            Button { onOpen(item) } label: { contents }.buttonStyle(.plain)
            if item.editable == true, item.end > item.start {
                handle(top: true).offset(y: -6)
                handle(top: false).offset(y: height - 6)
            }
        }.frame(height: max(height, 14), alignment: .topLeading)
            .offset(y: (start - item.start) * scale)
            .onHover { hovered = $0 }
            .help("\(item.title) · \(minuteLabel(start))–\(minuteLabel(end))")
    }
    private var contents: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: min(8, height / 3)).fill(color.opacity(item.kind == "todo" ? 0.06 : 0.13)).frame(height: height)
            Rectangle().fill(color.opacity(0.7)).frame(width: 3, height: height)
            if height >= 42 {
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Text(item.title).font(.system(size: 13, weight: .medium)).lineLimit(1); Spacer(minLength: 0); Text(hoursLabel(end - start)).font(.caption) }
                    if height >= 54, let project { Text("@" + project.name).font(.system(size: 11)).lineLimit(1) }
                    if height >= 85, let branch { Text(branch.name).font(.system(size: 11)).foregroundStyle(.secondary) }
                    if height >= 110 && !item.note.isEmpty { Text(item.note).font(.caption).lineLimit(3).foregroundStyle(.secondary) }
                }.padding(10)
            } else if showLabel {
                HStack(spacing: 6) { Text(item.title).lineLimit(1); Spacer(minLength: 0); if end > start { Text(hoursLabel(end - start)).monospacedDigit() } }
                    .font(.system(size: 11)).padding(.horizontal, 8).offset(y: height >= 14 ? 0 : height + 2)
            }
        }.foregroundStyle(color).frame(maxWidth: .infinity, alignment: .topLeading)
            .frame(height: max(height, 14), alignment: .topLeading).contentShape(Rectangle())
    }
    private func handle(top: Bool) -> some View {
        HStack(spacing: 5) {
            if !top { Spacer(minLength: 0) }
            if !top && (hovered || preview != nil) { timeLabel(end) }
            Capsule().fill(color.opacity(hovered || preview != nil ? 0.9 : 0.4)).frame(width: 26, height: 3)
                .frame(width: 44, height: 12).contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 2, coordinateSpace: .named("timelineDocument"))
                    .updating($preview) { value, state, _ in
                        let base = state?.item ?? item, zoom = state?.scale ?? scale
                        let range = BlockGeometry.resized(start: base.start, end: base.end, delta: value.translation.height, scale: zoom, top: top)
                        state = EdgePreview(item: base, scale: zoom, start: range.0, end: range.1)
                    }.onEnded { value in
                        let base = preview?.item ?? item
                        let range = BlockGeometry.resized(start: base.start, end: base.end, delta: value.translation.height, scale: preview?.scale ?? scale, top: top)
                        if range.0 != Int(base.start) || range.1 != Int(base.end) { onResize(base, range.0, range.1) }
                    })
                .accessibilityLabel(top ? "拖动开始时间" : "拖动结束时间")
                .help(top ? "拖动开始时间" : "拖动结束时间")
            if top && (hovered || preview != nil) { timeLabel(start) }
            if top { Spacer(minLength: 0) }
        }.padding(.horizontal, 4)
    }
    private func timeLabel(_ minute: Double) -> some View {
        Text(minuteLabel(minute)).font(.system(size: 10)).monospacedDigit().foregroundStyle(color)
            .padding(.horizontal, 3).background(AppPalette.surface, in: RoundedRectangle(cornerRadius: 3)).allowsHitTesting(false)
    }
}

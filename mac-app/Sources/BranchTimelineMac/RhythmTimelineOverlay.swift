import SwiftUI
import TimelineCore

struct RhythmTimelineOverlay: View {
    let events: [DayRhythmEvent]
    let scale: Double
    let onChange: (String, Int?, String?) -> Void
    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(events) { event in
                RhythmTimelinePoint(event: event, scale: scale, onChange: { onChange(event.id, $0, $1) })
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
private struct RhythmMovement { let event: DayRhythmEvent; let scale: Double; var minute: Double }
private struct RhythmTimelinePoint: View {
    let event: DayRhythmEvent
    let scale: Double
    let onChange: (Int?, String?) -> Void
    @GestureState private var movement: RhythmMovement?
    @State private var grabbed: RhythmMovement?
    @State private var suppressTapUntil = Date.distantPast
    @State private var editing = false
    private var minute: Double { movement?.minute ?? event.minute }
    var body: some View {
        HStack(spacing: 4) {
            Button { if Date() > suppressTapUntil { onChange(nil, event.revision) } } label: {
                Circle().fill(event.real ? AppPalette.blue : Color(nsColor: .windowBackgroundColor))
                    .overlay(Circle().stroke(AppPalette.blue.opacity(0.6), lineWidth: 1))
                    .frame(width: 9, height: 9).frame(width: 24, height: 26).contentShape(Rectangle())
            }.buttonStyle(.plain).highPriorityGesture(dragGesture)
                .help("点击标记完成；拖动修改时间").accessibilityLabel(event.name)
            HStack(spacing: 4) {
                Text(event.name).font(.system(size: 10)).lineLimit(1)
                Rectangle().fill(AppPalette.blue.opacity(event.real ? 0.22 : 0.08)).frame(height: 1)
                Text(minuteLabel(minute)).font(.system(size: 10)).monospacedDigit()
            }.foregroundStyle(.secondary).frame(height: 26).contentShape(Rectangle()).gesture(dragGesture)
        }.padding(.trailing, 8).offset(y: (max(120, minute) - 120) * scale + 5)
            .contextMenu { Button("修改时间") { editing = true } }
            .popover(isPresented: $editing) { RhythmTimeEditor(event: event, onChange: onChange) }
            .onChange(of: movement == nil) { ended in if ended { DispatchQueue.main.async { grabbed = nil } } }
            .onDisappear { grabbed = nil }
    }
    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 3, coordinateSpace: .named("timelineDocument"))
            .updating($movement) { value, state, _ in
                var source = grabbed ?? state ?? RhythmMovement(event: event, scale: scale, minute: event.minute)
                source.minute = PointDragGeometry.minute(start: source.event.minute, translation: value.translation.height, scale: source.scale)
                state = source
            }.onChanged { _ in
                if grabbed == nil { grabbed = RhythmMovement(event: event, scale: scale, minute: event.minute) }
                suppressTapUntil = Date().addingTimeInterval(0.5)
            }.onEnded { value in
                let source = grabbed ?? RhythmMovement(event: event, scale: scale, minute: event.minute)
                let final = PointDragGeometry.minute(start: source.event.minute, translation: value.translation.height, scale: source.scale)
                suppressTapUntil = Date().addingTimeInterval(0.5); grabbed = nil
                if final != source.event.minute { onChange(Int(final), source.event.revision) }
            }
    }
}
private struct RhythmTimeEditor: View {
    let event: DayRhythmEvent
    let onChange: (Int?, String?) -> Void
    @State private var date = Date()
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(event.name).font(.headline)
            DatePicker("时间", selection: $date, displayedComponents: .hourAndMinute).labelsHidden()
            HStack { Button("取消") { dismiss() }; Spacer(); Button("保存") {
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date), hour = parts.hour ?? 0
                onChange(hour * 60 + (parts.minute ?? 0) + (hour < 2 ? 1440 : 0), event.revision); dismiss()
            }.buttonStyle(.borderedProminent) }
        }.padding(16).frame(width: 230).onAppear {
            date = Calendar.current.date(bySettingHour: Int(event.minute) / 60 % 24, minute: Int(event.minute) % 60, second: 0, of: Date()) ?? Date()
        }
    }
}
extension AppModel {
    func changeRhythm(date: String, id: String, minute: Int?, expected: String? = nil) {
        do { try storage?.setRhythm(date: date, id: id, minute: minute, expected: expected); refreshShared(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

import SwiftUI
import TimelineCore

struct RhythmTimelineOverlay: View {
    let events: [DayRhythmEvent]
    let scale: Double
    let onChange: (String, Int?) -> Void
    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(events) { event in
                RhythmTimelinePoint(event: event, scale: scale, onChange: { onChange(event.id, $0) })
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
private struct RhythmTimelinePoint: View {
    let event: DayRhythmEvent
    let scale: Double
    let onChange: (Int?) -> Void
    @State private var moved: Double?
    @State private var editing = false
    var body: some View {
        HStack(spacing: 3) {
            Circle().fill(event.real ? AppPalette.blue : Color(nsColor: .windowBackgroundColor))
                .overlay(Circle().stroke(AppPalette.blue.opacity(0.6), lineWidth: 1))
                .frame(width: 7, height: 7).frame(width: 20, height: 24).contentShape(Rectangle())
                .onTapGesture { onChange(nil) }
                .gesture(DragGesture(minimumDistance: 5).onChanged { value in
                    moved = min(1560, max(120, ((event.minute + Double(value.translation.height) / scale) / 5).rounded() * 5))
                }.onEnded { _ in if let moved { onChange(Int(moved)) }; moved = nil })
                .contextMenu { Button("修改时间") { editing = true } }
                .help("\(event.name) · \(minuteLabel(moved ?? event.minute))")
            Text(event.name).font(.system(size: 9)).lineLimit(1).foregroundStyle(.secondary)
                .allowsHitTesting(false)
            Rectangle().fill(AppPalette.blue.opacity(event.real ? 0.22 : 0.08)).frame(height: 1).allowsHitTesting(false)
            Text(minuteLabel(moved ?? event.minute)).font(.system(size: 9)).monospacedDigit().foregroundStyle(.secondary).allowsHitTesting(false)
        }.padding(.trailing, 6).offset(y: (max(120, moved ?? event.minute) - 120) * scale + 6)
            .popover(isPresented: $editing) { RhythmTimeEditor(event: event, onChange: onChange) }
    }
}
private struct RhythmTimeEditor: View {
    let event: DayRhythmEvent
    let onChange: (Int?) -> Void
    @State private var date = Date()
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(event.name).font(.headline)
            DatePicker("时间", selection: $date, displayedComponents: .hourAndMinute).labelsHidden()
            HStack { Button("取消") { dismiss() }; Spacer(); Button("保存") {
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date), hour = parts.hour ?? 0
                onChange(hour * 60 + (parts.minute ?? 0) + (hour < 2 ? 1440 : 0)); dismiss()
            }.buttonStyle(.borderedProminent) }
        }.padding(16).frame(width: 230).onAppear {
            date = Calendar.current.date(bySettingHour: Int(event.minute) / 60 % 24, minute: Int(event.minute) % 60, second: 0, of: Date()) ?? Date()
        }
    }
}
extension AppModel {
    func changeRhythm(date: String, id: String, minute: Int?) {
        do { try storage?.setRhythm(date: date, id: id, minute: minute); refreshShared(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

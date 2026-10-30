import SwiftUI
import TimelineCore

struct TimelineContextTools: View {
    @ObservedObject var model: AppModel
    @State private var editor: String?
    @State private var snapshot: DayFocusContext?
    @State private var date = ""
    private var minute: Double {
        guard date == dayKey(logicalDate(model.now)) else { return 720 }
        let part = Calendar.current.dateComponents([.hour, .minute], from: model.now), hour = part.hour ?? 0
        return Double(hour * 60 + (part.minute ?? 0) + (hour < 2 ? 1440 : 0))
    }
    var body: some View {
        Menu {
            Button("记录可用脑力") { open("mental") }
            Button("添加精力区间") { open("energy") }
        } label: { Image(systemName: "plus") }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("添加状态或精力区间")
            .popover(isPresented: Binding(get: { editor != nil }, set: { if !$0 { editor = nil } }), arrowEdge: .bottom) {
                if editor == "energy" { EnergyPhaseEditor(model: model, date: date, context: snapshot, initialMinute: minute) }
                else { FocusPointEditor(model: model, date: date, context: snapshot, initialMinute: minute) }
            }
    }
    private func open(_ kind: String) {
        date = dayKey(model.focusDate); snapshot = model.dashboard?.days.first { $0.date == date }?.focus; editor = kind
    }
}

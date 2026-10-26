import SwiftUI
import TimelineCore

struct CalendarPicker: View {
    @ObservedObject var model: AppModel
    @State private var month = Date()
    @State private var totals: [String: Double] = [:]
    @Environment(\.dismiss) private var dismiss
    private var weekSelection: Bool { model.page == .stats || (model.page == .projects && model.scope == "week") }
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }.help("上个月")
                Spacer()
                Text(month.formatted(.dateTime.locale(Locale(identifier: "zh_CN")).year().month())).font(.headline)
                Spacer()
                Button { shift(1) } label: { Image(systemName: "chevron.right") }.help("下个月")
            }.buttonStyle(.plain)
            HStack { ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity) } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                ForEach(CalendarGrid.dates(in: month), id: \.self) { date in cell(date) }
            }
            HStack {
                Text("记录时长").font(.caption).foregroundStyle(.secondary)
                ForEach([0.08, 0.25, 0.45, 0.65], id: \.self) { opacity in RoundedRectangle(cornerRadius: 2).fill(AppPalette.blue.opacity(opacity)).frame(width: 9, height: 9) }
                Spacer()
                Button("今天") { model.goToday(); dismiss() }
            }
        }.padding(16).frame(width: 310).onAppear { month = model.focusDate; reload() }
    }
    private func cell(_ date: Date) -> some View {
        let key = dayKey(date), amount = totals[key] ?? 0, maximum = max(1, totals.values.max() ?? 1)
        let selected = weekSelection ? CalendarGrid.sameWeek(date, model.focusDate) : key == dayKey(model.focusDate)
        let today = key == dayKey(logicalDate())
        return Button { model.selectDate(date); dismiss() } label: {
            Text("\(Calendar.current.component(.day, from: date))").font(.system(size: 12, weight: selected || today ? .semibold : .regular))
                .frame(maxWidth: .infinity).frame(height: 31)
                .foregroundStyle(Calendar.current.isDate(date, equalTo: month, toGranularity: .month) ? Color.primary : .secondary)
                .background(AppPalette.blue.opacity(amount > 0 ? 0.12 + 0.5 * amount / maximum : 0.035), in: RoundedRectangle(cornerRadius: 5))
                .overlay { RoundedRectangle(cornerRadius: 5).strokeBorder(selected ? AppPalette.blue : today ? Color.primary.opacity(0.65) : .clear, lineWidth: selected ? 1.5 : 1) }
        }.buttonStyle(.plain).help("\(key) · \(hoursLabel(amount))")
    }
    private func shift(_ amount: Int) { month = Calendar.current.date(byAdding: .month, value: amount, to: month) ?? month; reload() }
    private func reload() { totals = Dictionary(uniqueKeysWithValues: model.calendar(month).map { ($0.date, $0.minutes) }) }
}

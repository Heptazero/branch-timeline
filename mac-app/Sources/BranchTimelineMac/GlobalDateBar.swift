import SwiftUI
import TimelineCore

extension AppModel {
    func selectScope(_ value: String) {
        guard ["day", "week", "month", "total"].contains(value) else { return }
        scope = value; requestDateFocus()
    }
    func openTimelineDay(_ key: String) {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: key) else { return }
        page = .timeline; scope = "day"; focusDate = date; requestDateFocus()
    }
    @discardableResult func setProjectColor(_ path: String, hex: String) -> Bool {
        guard let storage else { return false }
        do { try storage.setProjectColor(path: path, hex: hex); refreshProjects(); error = nil; return true }
        catch { self.error = error.localizedDescription; return false }
    }
}

struct GlobalDateBar: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 7) {
            DateNavigation(model: model)
            if !model.hasFeaturePanel || (model.page == .features && model.featureRoute == "projects") { Picker("日期范围", selection: Binding(get: { model.scope }, set: { model.selectScope($0) })) {
                Text("日").tag("day"); Text("周").tag("week"); Text("月").tag("month")
                if model.page == .projects || (model.page == .features && model.featureRoute == "projects") { Text("累计").tag("total") }
            }.labelsHidden().pickerStyle(.segmented).controlSize(.small) }
        }.frame(width: 148)
    }
}

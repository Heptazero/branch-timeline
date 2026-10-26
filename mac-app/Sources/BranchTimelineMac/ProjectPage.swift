import SwiftUI
import TimelineCore

struct ProjectPage: View {
    @ObservedObject var model: AppModel
    @State private var filter = "进行中"
    @State private var descending = true
    @State private var goal: ProjectSummary?
    private var rows: [ProjectSummary] {
        (model.dashboard?.projects ?? []).filter { filter == "全部" || projectGroup($0.status) == filter }
            .sorted { descending ? $0.actual > $1.actual : $0.actual < $1.actual }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Menu(filter) { ForEach(["进行中", "计划", "搁置", "归档", "全部"], id: \.self) { value in Button(value) { filter = value } } }
                    .fixedSize()
                Spacer()
                Menu(model.scope == "day" ? "今日" : model.scope == "week" ? "本周" : "累计") {
                    Button("今日") { changeScope("day") }; Button("本周") { changeScope("week") }; Button("累计") { changeScope("total") }
                }.fixedSize()
                Button { descending.toggle() } label: { Image(systemName: descending ? "arrow.down" : "arrow.up") }.help(descending ? "按时长从多到少" : "按时长从少到多")
            }.menuStyle(.borderlessButton).buttonStyle(.plain)
            if model.scope != "total" { HStack { Spacer(); DateNavigation(model: model) } }
            ScrollView {
                LazyVStack(spacing: 26) {
                    ForEach(rows) { row in
                        ProjectProgressRow(row: row, expected: model.dashboard?.expected ?? 0, showGoal: model.scope != "total", maximum: rows.map(\.actual).max() ?? 1,
                            onOpen: { model.openProject(row.path) }, onGoal: { goal = row })
                    }
                    if rows.isEmpty { Text("暂无项目").foregroundStyle(.secondary).padding(.top, 80) }
                }.padding(.vertical, 6)
            }
        }.padding(.horizontal, 30).padding(.top, 12).padding(.bottom, 20)
            .popover(item: $goal, arrowEdge: .trailing) { row in GoalEditor(model: model, project: row) }
    }
    private func changeScope(_ value: String) { model.scope = value; model.refreshDashboard() }
}

struct ProjectProgressRow: View {
    let row: ProjectSummary
    let expected: Double
    var showGoal = true
    var maximum: Double = 1
    var onOpen: () -> Void
    var onGoal: () -> Void
    private var fraction: Double { showGoal ? (row.planned > 0 ? row.actual / row.planned : 0) : row.actual / max(1, maximum) }
    var body: some View {
        VStack(spacing: 9) {
            HStack(spacing: 9) {
                Circle().fill(Color(hex: row.color)).frame(width: 7, height: 7)
                Button(action: onOpen) { Text(row.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain)
                if showGoal && row.planned > 0 { Text("\(Int((row.actual / row.planned * 100).rounded()))%").foregroundStyle(.secondary).font(.caption).monospacedDigit() }
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 5).fill(.primary.opacity(0.05))
                    if fraction > 0 { RoundedRectangle(cornerRadius: 5).fill(Color(hex: row.color).opacity(0.72)).frame(width: geometry.size.width * min(1, max(0, fraction))) }
                    if showGoal && row.planned > 0 {
                        Rectangle().fill(.primary.opacity(0.65)).frame(width: 2).padding(.vertical, -3)
                            .offset(x: max(0, min(geometry.size.width - 2, geometry.size.width * expected)))
                    }
                }
            }.frame(height: 23)
            HStack {
                Text(hoursLabel(row.actual)).monospacedDigit()
                Spacer()
                if showGoal { Button(row.planned > 0 ? hoursLabel(row.planned) : "无") { onGoal() }.buttonStyle(.plain).help("修改目标；从所选日期向后生效") }
            }.font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }
}

struct GoalEditor: View {
    @ObservedObject var model: AppModel
    let project: ProjectSummary
    @State private var hours = 0.0
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(project.name).font(.headline).lineLimit(2)
            HStack {
                Text(model.scope == "week" ? "每周目标" : "每日目标")
                TextField("小时", value: $hours, format: .number).frame(width: 65).textFieldStyle(.roundedBorder)
                Text("h").foregroundStyle(.secondary)
            }
            Stepper("", value: $hours, in: 0...168, step: 0.5).labelsHidden()
            Text(model.scope == "week" ? "从所选周起生效，过往周不变" : "从\(model.focusDate.formatted(.dateTime.month().day()))起生效，过去不变").font(.caption).foregroundStyle(.secondary)
            HStack { Button("返回") { dismiss() }; Spacer(); Button("保存") { model.setGoal(project.path, hours: hours); if model.error == nil { dismiss() } }.buttonStyle(.borderedProminent).disabled(!hours.isFinite || hours < 0 || hours > 168) }
        }.padding(18).frame(width: 290).onAppear { hours = project.planned / 60 }
    }
}
func projectGroup(_ status: String) -> String {
    if ["active", "doing", "进行中"].contains(status) { return "进行中" }
    if ["hold", "paused", "搁置"].contains(status) { return "搁置" }
    if ["done", "archived", "archive", "归档"].contains(status) { return "归档" }
    return "计划"
}

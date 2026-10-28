import SwiftUI
import TimelineCore

struct ProjectPage: View {
    @ObservedObject var model: AppModel
    @State private var filter = "进行中"
    @State private var descending = true
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
                Button { descending.toggle() } label: { Image(systemName: descending ? "arrow.down" : "arrow.up") }.help(descending ? "按时长从多到少" : "按时长从少到多")
            }.menuStyle(.borderlessButton).buttonStyle(.plain).padding(.horizontal, 30)
            ScrollView {
                LazyVStack(spacing: 26) {
                    ForEach(rows) { row in
                        ProjectProgressRow(row: row, expected: model.dashboard?.expected ?? 0, showGoal: model.scope != "total", maximum: rows.map(\.actual).max() ?? 1,
                            onOpen: { model.openProject(row.path) }, model: model)
                    }
                    if rows.isEmpty { Text("暂无项目").foregroundStyle(.secondary).padding(.top, 80) }
                }.padding(.horizontal, 30).padding(.vertical, 6)
            }
        }.padding(.top, 12).padding(.bottom, 20)

    }
    private func changeScope(_ value: String) { model.scope = value; model.refreshDashboard() }
}

struct ProjectProgressRow: View {
    let row: ProjectSummary
    let expected: Double
    var showGoal = true
    var maximum: Double = 1
    var onOpen: () -> Void
    var model: AppModel? = nil
    @State private var editGoal = false
    private var fraction: Double { showGoal ? (row.planned > 0 ? row.actual / row.planned : 0) : row.actual / max(1, maximum) }
    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 9) {
                if let model { ProjectColorButton(project: row, model: model) }
                else { Circle().fill(Color(hex: row.color)).frame(width: 7, height: 7) }
                Button(action: onOpen) { Text(row.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain)
                if showGoal { Text(row.planned > 0 ? "\(Int((row.actual / row.planned * 100).rounded()))%" : "无").foregroundStyle(.secondary).font(.caption).monospacedDigit() }
            }
            HStack(spacing: 6) {
                ZStack {
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 6).fill(.primary.opacity(0.06))
                            if fraction > 0 { RoundedRectangle(cornerRadius: 6).fill(Color(hex: row.color).opacity(0.38)).frame(width: geometry.size.width * min(1, max(0, fraction))) }
                            if showGoal && row.planned > 0 {
                                Rectangle().fill(.primary.opacity(0.4)).frame(width: 1).padding(.vertical, -1)
                                    .offset(x: max(0, min(geometry.size.width - 1, geometry.size.width * expected)))
                            }
                        }
                    }
                    HStack {
                        Text(hoursLabel(row.actual)).font(.system(size: 14, weight: .bold)).monospacedDigit()
                        Spacer()
                        if showGoal {
                            Button { editGoal = true } label: {
                                Text(row.planned > 0 ? hoursLabel(row.planned) : "无").font(.system(size: 12)).monospacedDigit()
                                    .frame(minWidth: 42, minHeight: 30, alignment: .trailing).contentShape(Rectangle())
                            }.buttonStyle(.plain).help("修改目标").accessibilityLabel("修改\(row.name)目标")
                                .popover(isPresented: $editGoal, arrowEdge: .bottom) {
                                    if let model { GoalEditor(model: model, project: row, date: model.focusDate, scope: model.scope) }
                                }
                        } else if model != nil {
                            Text("无").font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                    }.padding(.horizontal, 8)
                }.frame(height: 32)
                if let model {
                    Menu {
                        Button("在 Obsidian 打开项目文件") { model.openProject(row.path) }
                        if showGoal { Button("修改目标") { editGoal = true } }
                    } label: { Text("⋮").font(.system(size: 21)).frame(width: 24, height: 32) }
                        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                }
            }
        }
    }
}

struct GoalEditor: View {
    @ObservedObject var model: AppModel
    let project: ProjectSummary
    let date: Date
    let scope: String
    @State private var text = ""
    @State private var failure: String?
    @Environment(\.dismiss) private var dismiss
    private var hours: Double? { GoalInput.hours(text, maximum: scope == "month" ? 744 : 168) }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(project.name).font(.headline).lineLimit(2)
            HStack(spacing: 10) {
                Button { adjust(-0.5) } label: { Image(systemName: "minus") }.help("减少半小时")
                TextField("小时", text: $text).multilineTextAlignment(.center).frame(width: 75).textFieldStyle(.roundedBorder)
                    .onSubmit(save)
                Text("h").foregroundStyle(.secondary)
                Button { adjust(0.5) } label: { Image(systemName: "plus") }.help("增加半小时")
            }.buttonStyle(.plain)
            Text(scope == "month" ? "每月目标 · 从所选月起生效" : scope == "week" ? "每周目标 · 从所选周起生效" : "每日目标 · 从所选日期起生效").font(.caption).foregroundStyle(.secondary)
            if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
            HStack { Button("取消") { dismiss() }; Spacer(); Button("保存", action: save).buttonStyle(.borderedProminent).disabled(hours == nil) }
        }.padding(18).frame(width: 290).onAppear { text = String(format: "%g", project.planned / 60) }
    }
    private func adjust(_ delta: Double) { text = String(format: "%g", min(scope == "month" ? 744 : 168, max(0, (hours ?? 0) + delta))) }
    private func save() {
        guard let hours else { return }
        if model.setGoal(project.path, hours: hours, date: date, scope: scope) { dismiss() }
        else { failure = model.error ?? "保存失败" }
    }
}
func projectGroup(_ status: String) -> String {
    if ["active", "doing", "进行中"].contains(status) { return "进行中" }
    if ["hold", "paused", "搁置"].contains(status) { return "搁置" }
    if ["done", "archived", "archive", "归档"].contains(status) { return "归档" }
    return "计划"
}

import SwiftUI
import TimelineCore

extension AppModel {
    @discardableResult func saveBlock(_ edit: BlockEdit) -> Bool {
        guard let storage else { error = "请先连接数据文件"; return false }
        do { try storage.editBlock(edit); refreshShared(); refreshDashboard(); error = nil; return true }
        catch { self.error = error.localizedDescription; return false }
    }
    func resizeBlock(_ item: DashboardItem, date: String, start: Int, end: Int, move: Bool = false) {
        guard item.editable == true, let revision = item.revision else { return }
        var edit = BlockEdit(date: date, start: start, end: end, id: item.id, expected: revision)
        edit.move = move
        _ = saveBlock(edit)
    }
}

struct BlockEditor: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var edit: BlockEdit
    @State private var projectSearch = ""
    @State private var selectingProject = false
    @FocusState private var titleFocused: Bool
    private var options: BlockOptions? { model.storage?.blockOptions() }
    private var project: Project? { model.projects.first { $0.path == edit.projectPath } }
    private var valid: Bool {
        let requirement = options?.requirement ?? "none"
        return !edit.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && edit.end > edit.start
            && (!(requirement == "project" || requirement == "both") || project != nil)
            && (!(requirement == "tag" || requirement == "both") || !edit.tagId.isEmpty)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text(edit.kind == "todo" ? "添加计划" : "添加时间块").font(.headline); Spacer(); Text(edit.date).font(.caption).foregroundStyle(.secondary) }
            TextField("标题", text: $edit.title).textFieldStyle(.roundedBorder).focused($titleFocused)
            HStack {
                timeControl("开始", minute: $edit.start)
                Spacer(minLength: 12)
                timeControl("结束", minute: $edit.end)
            }
            TextEditor(text: $edit.note).font(.body).scrollContentBackground(.hidden).frame(height: 90).padding(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.primary.opacity(0.12)))
                .overlay(alignment: .topLeading) { if edit.note.isEmpty { Text("备注（可选）").foregroundStyle(.tertiary).padding(10).allowsHitTesting(false) } }
                .accessibilityLabel("备注")
            HStack {
                Button { selectingProject.toggle() } label: {
                    HStack { Circle().fill(Color(hex: project?.color ?? "#a4aab5")).frame(width: 7, height: 7); Text(project.map { "@" + $0.name } ?? "选择项目").lineLimit(1); Image(systemName: "chevron.down").font(.caption2) }
                }.popover(isPresented: $selectingProject) { projectChoices }
                if let tags = options?.tags, !tags.isEmpty {
                    Menu {
                        Button("无标签") { edit.tagId = "" }
                        ForEach(tags) { tag in Button(tag.name) { edit.tagId = tag.id } }
                    } label: { Text(tags.first { $0.id == edit.tagId }.map { "#" + $0.name } ?? "选择标签").lineLimit(1) }
                }
                Spacer(minLength: 0)
            }.buttonStyle(.borderless)
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
            HStack { Button("取消") { dismiss() }; Spacer(); Button("添加") { if model.saveBlock(edit) { dismiss() } }.buttonStyle(.borderedProminent).disabled(!valid) }
        }.padding(20).frame(width: 350).tint(AppPalette.blue).onAppear { titleFocused = true }
    }
    private var projectChoices: some View {
        VStack(spacing: 8) {
            TextField("搜索项目", text: $projectSearch).textFieldStyle(.roundedBorder)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    if options?.requirement != "project" && options?.requirement != "both" {
                        Button("不关联项目") { edit.projectPath = ""; selectingProject = false }.padding(6)
                    }
                    ForEach(model.projects.filter { $0.isActive && matchesProject(projectSearch, project: $0) }) { project in
                        Button { edit.projectPath = project.path; selectingProject = false } label: {
                            HStack { Circle().fill(Color(hex: project.color)).frame(width: 7, height: 7); Text(project.name).lineLimit(2); Spacer() }.padding(6)
                        }
                    }
                }.buttonStyle(.plain)
            }.frame(maxHeight: 220)
        }.padding(12).frame(width: 280)
    }
    private func timeControl(_ label: String, minute: Binding<Int>) -> some View {
        let base = Calendar.current.startOfDay(for: model.focusDate)
        return VStack(alignment: .leading, spacing: 4) {
            Text(label + (minute.wrappedValue >= 1440 ? " · 次日" : "")).font(.caption).foregroundStyle(.secondary)
            DatePicker(label, selection: Binding(get: { Calendar.current.date(byAdding: .minute, value: minute.wrappedValue, to: base) ?? base }, set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                let value = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
                minute.wrappedValue = value < 120 || (label == "结束" && value == 120) ? value + 1440 : value
            }), displayedComponents: .hourAndMinute).labelsHidden().datePickerStyle(.field).environment(\.locale, Locale(identifier: "zh_CN"))
        }
    }
}

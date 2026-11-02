import SwiftUI
import TimelineCore

struct TimelineBlockEditor: View {
    @ObservedObject var model: AppModel
    let item: DashboardItem
    let date: String
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        if let edit = BlockEdit(item: item, date: date) { BlockEditor(model: model, edit: edit) }
        else if let session = model.active, item.id.hasPrefix("desktop-\(session.id)-") {
            ActiveSessionEditor(model: model, session: session)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title).font(.headline)
                Text("计时中 · \(hoursLabel(max(0, item.end - item.start)))").font(.caption).foregroundStyle(.secondary)
                Button("更多操作") { dismiss(); model.openBlockActions(date: date, id: item.id) }
            }.padding(16).frame(width: 250, alignment: .leading)
        }
    }
}
struct ActiveSessionEditor: View {
    @ObservedObject var model: AppModel
    let session: DesktopSession
    @State private var title = ""
    @State private var note = ""
    @State private var path = ""
    @State private var failure: String?
    @Environment(\.dismiss) private var dismiss
    @State private var expected: ActiveMetadata?
    private var project: Project? { model.projects.first { $0.path == path } }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text("编辑计时").font(.headline); Spacer(); Text(model.active?.isPaused == true ? "已暂停" : "计时中").font(.caption).foregroundStyle(.secondary) }
            TextField("标题", text: $title).textFieldStyle(.roundedBorder)
            TextEditor(text: $note).font(.body).frame(height: 90).padding(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.primary.opacity(0.12)))
                .overlay(alignment: .topLeading) { if note.isEmpty { Text("备注（可选）").foregroundStyle(.tertiary).padding(10).allowsHitTesting(false) } }.accessibilityLabel("备注")
            BlockProjectPicker(projects: model.projects, path: $path, required: true)
            if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
            HStack {
                Button("取消") { dismiss() }; Spacer()
                Button("保存") {
                    guard let expected, let project else { return }
                    if model.saveActiveMetadata(expected, title: title, note: note, project: project) { dismiss() } else { failure = model.error }
                }.buttonStyle(.borderedProminent).disabled(project == nil || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }.padding(18).frame(width: 310).onAppear {
            guard expected == nil else { return }
            expected = ActiveMetadata(session); title = session.title; note = session.note; path = session.projectPath
        }
    }
}
extension AppModel {
    @discardableResult func saveActiveMetadata(_ expected: ActiveMetadata, title: String, note: String, project: Project) -> Bool {
        guard let storage else { return false }
        do {
            try storage.editActiveMetadata(expected: expected, title: title, note: note, project: project)
            refreshShared(); refreshDashboard(); self.title = active?.title ?? ""; error = nil; return true
        } catch { self.error = error.localizedDescription; return false }
    }
}

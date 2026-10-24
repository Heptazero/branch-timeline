import AppKit
import SwiftUI
import TimelineCore

struct MainView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Branch Timeline").font(.title2.weight(.semibold))
                Spacer()
                Button { AppWindows.shared.togglePanel() } label: { Image(systemName: "pin") }.help("显示或隐藏悬浮条")
                Menu {
                    Button("选择笔记库") { model.chooseVault() }.disabled(model.active != nil)
                    Button("刷新项目") { model.refreshProjects() }
                    Button("退出") { NSApp.terminate(nil) }
                } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).fixedSize()
            }
            if let error = model.error {
                HStack(alignment: .top) {
                    Image(systemName: "exclamationmark.triangle")
                    Text(error).textSelection(.enabled)
                    Spacer()
                    Button { model.clearError() } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
                }.font(.caption).foregroundStyle(.red).padding(10).background(.red.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
            }
            if model.archive.vaultPath == nil {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "folder.badge.plus").font(.largeTitle).foregroundStyle(.secondary)
                    Button("选择 Obsidian 笔记库") { model.chooseVault() }.buttonStyle(.borderedProminent)
                }.frame(maxWidth: .infinity)
                Spacer()
            } else {
                if model.active == nil { setup }
                else {
                    TimerReadout(model: model)
                    TimerControls(model: model)
                }
                Divider()
                history
            }
        }
        .padding(20).frame(minWidth: 400, minHeight: 420)
        .sheet(isPresented: $model.finishRequested) { FinishView(model: model) }
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("搜索项目", text: $model.query).textFieldStyle(.roundedBorder)
            if model.loading { ProgressView().controlSize(.small) }
            ScrollView {
                LazyVStack(spacing: 2) {
                    ForEach(model.filtered) { project in
                        Button { model.selectedPath = project.path } label: {
                            HStack(spacing: 8) {
                                Circle().fill(Color(hex: project.color)).frame(width: 7, height: 7)
                                Text(project.name).lineLimit(2).multilineTextAlignment(.leading)
                                Spacer(minLength: 4)
                                if model.selectedPath == project.path { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                            }.padding(.horizontal, 9).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
                                .background(model.selectedPath == project.path ? Color.accentColor.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 7))
                        }.buttonStyle(.plain)
                    }
                    if !model.loading && model.filtered.isEmpty { Text("没有匹配的项目").font(.caption).foregroundStyle(.secondary).padding(12) }
                }
            }.frame(maxHeight: 190)
            TextField("这次做什么（可留空）", text: $model.title).textFieldStyle(.roundedBorder)
            HStack {
                Text("本次目标").foregroundStyle(.secondary)
                TextField("分钟", value: $model.targetMinutes, format: .number).frame(width: 54).textFieldStyle(.roundedBorder)
                Text("分钟").foregroundStyle(.secondary)
                Spacer()
                Button("开始计时") { model.start() }.buttonStyle(.borderedProminent).disabled(!model.canStart).keyboardShortcut(.return, modifiers: .command)
            }.font(.callout)
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("最近记录").font(.headline)
                Spacer()
                Button { model.refreshSync() } label: { Image(systemName: "arrow.clockwise") }.buttonStyle(.plain).help("检查项目写回状态")
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(model.archive.history.prefix(20)) { session in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(session.title).lineLimit(2)
                                Spacer()
                                Text(clockLabel(session.elapsed(at: session.endedAt ?? model.now))).monospacedDigit().fontWeight(.medium)
                            }
                            HStack {
                                Text(session.projectName).lineLimit(1)
                                Text(session.startedAt, style: .date)
                                Spacer()
                                Menu(model.syncStates[session.id] ?? "待检查写回状态") {
                                    Button("重试导出") { model.export(session) }
                                    Button("检查状态") { model.refreshSync() }
                                }.menuStyle(.borderlessButton).fixedSize()
                            }.font(.caption2).foregroundStyle(.secondary)
                            if !session.note.isEmpty { Text(session.note).font(.caption).foregroundStyle(.secondary).lineLimit(3) }
                        }.padding(.vertical, 9)
                        Divider()
                    }
                }
            }
        }.frame(maxHeight: .infinity, alignment: .top)
    }
}

struct FinishView: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var note = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("结束计时").font(.headline)
            if let session = model.active { Text(clockLabel(session.elapsed(at: model.now))).font(.title).monospacedDigit() }
            TextField("标题", text: $title).textFieldStyle(.roundedBorder)
            TextEditor(text: $note).font(.body).frame(height: 100).padding(6).background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
            Text("记录先保存在本机；Obsidian 插件运行时写回项目和时间线。").font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("返回") { dismiss() }
                Spacer()
                Button("保存记录") { model.finish(title: title, note: note) }.buttonStyle(.borderedProminent)
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
        }.padding(22).frame(width: 400)
            .onAppear { title = model.active?.title ?? ""; note = model.active?.note ?? "" }
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt32(cleaned, radix: 16) ?? 0x467eae
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

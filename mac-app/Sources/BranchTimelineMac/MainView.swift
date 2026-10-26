import AppKit
import SwiftUI
import TimelineCore

struct MainView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { AppWindows.shared.togglePanel() } label: { Image(systemName: "arrow.down.right.and.arrow.up.left") }.help("显示 / 隐藏悬浮条")
                Spacer()
                if model.page != .timer { Text(model.page.rawValue).font(.headline) }
                Spacer()
                Button { AppWindows.shared.showSettings() } label: { Image(systemName: "gearshape") }.help("设置")
                Menu {
                    Button("更换数据文件") { model.chooseDataFile() }.disabled(model.active != nil)
                    Button("刷新项目和记录") { model.refreshProjects(); model.refreshShared() }
                    Divider()
                    Button("退出") { ApplicationLifecycle.requestQuit() }
                } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("设置与更多操作")
            }.buttonStyle(.plain).font(.system(size: 16)).padding(.horizontal, 24).padding(.vertical, 10)
            if let error = model.error {
                HStack(alignment: .top) {
                    Image(systemName: "exclamationmark.triangle")
                    Text(error).textSelection(.enabled)
                    Spacer()
                    Button { model.clearError() } label: { Image(systemName: "xmark") }.buttonStyle(.plain).help("关闭提示")
                }.font(.caption).foregroundStyle(.red).padding(10).background(.red.opacity(0.06))
            }
            if model.archive.vaultPath == nil {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "clock").font(.system(size: 56, weight: .ultraLight)).foregroundStyle(AppPalette.blue)
                    Button("连接原时间线数据") { model.chooseDataFile() }.buttonStyle(.borderedProminent)
                    Spacer()
                }.frame(maxWidth: .infinity)
            } else {
                switch model.page {
                case .timer: FocusTimerPage(model: model)
                case .timeline: TimelinePage(model: model)
                case .projects: ProjectPage(model: model)
                case .stats: StatisticsPage(model: model)
                }
            }
            BottomNavigation(model: model)
        }.background(AppPalette.surface).frame(minWidth: 360, minHeight: 650)
            .sheet(isPresented: $model.finishRequested) { FinishView(model: model) }
            .tint(AppPalette.blue)
    }
}

struct FinishView: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var note = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text("结束计时").font(.headline); Spacer(); Text(clockLabel(model.elapsed)).font(.title2).monospacedDigit() }
            TextField("标题", text: $title).textFieldStyle(.roundedBorder)
            TextEditor(text: $note).font(.body).frame(height: 120).padding(6).background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                .accessibilityLabel("结束备注")
            HStack {
                Button("返回") { dismiss() }
                Spacer()
                Button("保存记录") { model.finish(title: title, note: note) }.buttonStyle(.borderedProminent)
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
        }.padding(22).frame(width: 370)
            .onAppear { title = model.active?.title ?? ""; note = model.active?.note ?? "" }
    }
}

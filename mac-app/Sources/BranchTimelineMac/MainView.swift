import AppKit
import SwiftUI
import TimelineCore

struct MainView: View {
    @ObservedObject var model: AppModel
    @AppStorage("timelineShowPlans") private var showPlans = true
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Button { AppWindows.shared.togglePanel() } label: { Image(systemName: "arrow.down.right.and.arrow.up.left") }.help("显示 / 隐藏悬浮条")
                RhythmControl(model: model)
                Spacer()
                if model.hasFeaturePanel {
                    Button { model.featureAction("undo") } label: { Image(systemName: "arrow.uturn.backward") }.disabled(!model.featureCanUndo).help("撤回")
                    if model.featureRoute != "settings" || model.page != .features {
                        Button { model.featureAction("add") } label: { Image(systemName: "plus") }.help("添加")
                    }
                }
                if model.page == .timeline && !model.branchMode { TimelineContextTools(model: model) }
                if model.page == .timeline && model.scope != "month" {
                    Button { showPlans.toggle() } label: { Image(systemName: "rectangle.split.2x1") }
                        .foregroundStyle(showPlans ? AppPalette.blue : .secondary)
                        .help(showPlans ? "隐藏计划" : "显示计划").accessibilityLabel(showPlans ? "隐藏计划" : "显示计划")
                }
                Button { AppWindows.shared.showSettings() } label: { Image(systemName: "gearshape") }.help("设置")
                Menu {
                    if model.page == .timeline {
                        Button(model.branchMode ? "日历视图" : "分支视图") { model.branchMode.toggle() }
                    }
                    if model.hasFeaturePanel { Button("同步项目日志") { model.featureAction("sync") } }
                    Button("全部功能设置") { model.openFeature("settings") }
                    Button("更换数据文件") { model.chooseDataFile() }.disabled(model.active != nil)
                    Button("刷新项目和记录") { model.refreshProjects(); model.refreshShared(); if model.hasFeaturePanel { model.featureAction("refresh") } }
                    Divider()
                    Button("退出") { ApplicationLifecycle.requestQuit() }
                } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("设置与更多操作")
            }.buttonStyle(.plain).font(.system(size: 15)).frame(height: model.page == .timer ? 28 : 64)
                .overlay { if model.page != .timer && !(model.page == .features && model.featureRoute == "life") { GlobalDateBar(model: model) } }
                .padding(.horizontal, 20).padding(.vertical, 10)
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
                case .timeline:
                    if model.branchMode { SharedFeatureView(model: model, route: "day") } else { TimelinePage(model: model) }
                case .projects:
                    if let path = model.projectDetailPath { ProjectDetailPage(model: model, path: path) } else { ProjectPage(model: model) }
                case .stats: StatisticsPage(model: model)
                case .features: FeaturePage(model: model)
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
            if let error = model.error {
                Text(error).font(.caption).foregroundStyle(.red)
                if model.active?.sourcePlan != nil && (error.contains("原计划") || error.contains("关联任务")) {
                    Button("保留原计划，单独保存本次") { model.finish(title: title, note: note, separateFromPlan: true) }
                }
            }
        }.padding(22).frame(width: 370)
            .onAppear { title = model.active?.title ?? ""; note = model.active?.note ?? "" }
    }
}

import AppKit
import SwiftUI
import TimelineCore

struct TimerControls: View {
    @ObservedObject var model: AppModel
    var compact = false
    @State private var confirmCancel = false
    @State private var showDistraction = false
    @State private var showMore = false
    var body: some View {
        HStack(spacing: compact ? 14 : 24) {
            if !compact { stateButtons }
            Button { if model.active?.isPaused == true { model.resume() } else { model.pause() } } label: {
                Image(systemName: model.active?.isPaused == true ? "play.fill" : "pause.fill")
                    .font(.system(size: compact ? 17 : 21, weight: .medium))
                    .frame(width: compact ? 28 : 58, height: compact ? 34 : 58)
                    .background(compact ? Color.clear : AppPalette.blue.opacity(0.10), in: Circle())
            }.help(model.active?.isPaused == true ? "继续" : "暂停").accessibilityLabel(model.active?.isPaused == true ? "继续计时" : "暂停计时")
            Button { AppWindows.shared.finish() } label: {
                Image(systemName: "stop").font(.system(size: compact ? 23 : 29, weight: .medium))
                    .frame(width: compact ? 48 : 72, height: compact ? 48 : 72)
                    .foregroundStyle(compact ? .white : AppPalette.blue)
                    .background(compact ? AppPalette.blue : AppPalette.blue.opacity(0.23), in: Circle())
            }.help("结束并记录").accessibilityLabel("结束并记录")
            Button { showMore.toggle() } label: {
                Image(systemName: "ellipsis").font(.system(size: compact ? 18 : 23, weight: .bold))
                    .frame(width: compact ? 28 : 58, height: compact ? 34 : 58)
                    .background(compact ? Color.clear : AppPalette.blue.opacity(0.10), in: Circle())
            }.help("更多计时操作").accessibilityLabel("更多计时操作")
                .popover(isPresented: $showMore, arrowEdge: .bottom) {
                    VStack(alignment: .leading, spacing: 16) {
                        Button("显示 / 隐藏悬浮条") { showMore = false; AppWindows.shared.togglePanel() }
                        Button("取消本次计时", role: .destructive) { showMore = false; confirmCancel = true }
                    }.buttonStyle(.plain).padding(16)
                }
            if compact { stateButtons }
        }.buttonStyle(.plain).foregroundStyle(AppPalette.blue)
            .confirmationDialog("取消本次计时？不生成工时，原有待办不变。", isPresented: $confirmCancel) {
                Button("取消计时", role: .destructive) { model.cancel() }
                Button("返回", role: .cancel) {}
            }
    }
    private var stateButtons: some View {
        HStack(spacing: compact ? 10 : 12) {
            Button { model.mark("good") } label: { Circle().fill(AppPalette.blue).frame(width: compact ? 9 : 12, height: compact ? 9 : 12).frame(width: compact ? 18 : 24, height: 30) }
                .help("记录高度专注").accessibilityLabel("记录高度专注").disabled(model.active?.isPaused == true)
            Button { showDistraction = true } label: { Circle().fill(.red).frame(width: compact ? 9 : 12, height: compact ? 9 : 12).frame(width: compact ? 18 : 24, height: 30) }
                .help("记录分神").accessibilityLabel("记录分神").disabled(model.active?.isPaused == true)
                .popover(isPresented: $showDistraction, arrowEdge: .bottom) {
                    VStack(alignment: .leading, spacing: 14) {
                        Button("轻微分神") { model.mark("distraction", level: "light"); showDistraction = false }
                        Button("明显分神") { model.mark("distraction", level: "medium"); showDistraction = false }
                        Button("长时间分神") { model.mark("distraction", level: "heavy"); showDistraction = false }
                    }.buttonStyle(.plain).padding(16)
                }
        }
    }
}

struct FloatingTimerView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    AppPalette.blue.opacity(0.11)
                    AppPalette.blue.frame(width: geometry.size.width * min(1, model.ratio))
                }
            }.frame(height: 3)
            HStack(spacing: 16) {
                Button { AppWindows.shared.showMain() } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(model.active?.title ?? "开始专注").lineLimit(1).font(.system(size: 14, weight: .medium))
                        Text(model.active?.projectName ?? "选择项目").lineLimit(1).foregroundStyle(.secondary).font(.system(size: 12))
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(.plain).help("打开主窗口")
                if model.active != nil {
                    Text(clockLabel(model.timerSeconds)).font(.system(size: 26, weight: .medium, design: .rounded)).monospacedDigit()
                    TimerControls(model: model, compact: true)
                } else {
                    Button { AppWindows.shared.showMain() } label: { Image(systemName: "play.fill").font(.system(size: 24)).foregroundStyle(AppPalette.blue) }.buttonStyle(.plain).help("开始计时")
                }
            }.padding(.horizontal, 20).padding(.vertical, 20)
            if model.error != nil { Button("查看保存提示") { AppWindows.shared.showMain() }.font(.caption).foregroundStyle(.red).padding(.bottom, 8) }
        }.frame(minWidth: 480, maxWidth: .infinity).background(AppPalette.surface)
    }
}

struct MenuContent: View {
    @ObservedObject var model: AppModel
    var body: some View {
        Group {
            if let active = model.active {
                Text(active.projectName)
                Text(clockLabel(model.timerSeconds))
                Button(active.isPaused ? "继续计时" : "暂停计时") { if active.isPaused { model.resume() } else { model.pause() } }
                Button("结束并记录") { AppWindows.shared.finish() }
                Divider()
            }
            Button("打开主窗口") { AppWindows.shared.showMain() }
            Button("显示 / 隐藏悬浮条") { AppWindows.shared.togglePanel() }
            Button("设置…") { AppWindows.shared.showSettings() }.keyboardShortcut(",")
            Divider()
            Button("退出 Branch Timeline") { ApplicationLifecycle.requestQuit() }.keyboardShortcut("q")
        }
    }
}

import AppKit
import SwiftUI
import TimelineCore

struct TimerReadout: View {
    @ObservedObject var model: AppModel
    var body: some View {
        if let active = model.active {
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(active.projectName).lineLimit(1).foregroundStyle(.secondary)
                    Spacer()
                    if active.isPaused { Text("已暂停").foregroundStyle(.secondary) }
                    else if active.targetMinutes > 0 { Text(model.ratio >= 1 ? "已到目标" : "剩余 \(clockLabel(model.remaining))").foregroundStyle(model.ratio >= 1 ? Color.accentColor : .secondary) }
                }.font(.caption)
                HStack(alignment: .firstTextBaseline) {
                    Text(clockLabel(model.elapsed)).font(.system(size: 32, weight: .medium, design: .rounded)).monospacedDigit()
                    Spacer()
                    Text(active.title).font(.caption).lineLimit(2).multilineTextAlignment(.trailing).foregroundStyle(.secondary)
                }
                if active.targetMinutes > 0 { ProgressView(value: min(1, model.ratio)).tint(.accentColor) }
            }
        }
    }
}

struct TimerControls: View {
    @ObservedObject var model: AppModel
    @State private var confirmCancel = false
    @State private var showDistraction = false
    var body: some View {
        HStack(spacing: 14) {
            Button { model.mark("good") } label: { Circle().fill(.blue).frame(width: 12, height: 12) }.help("记录状态顺畅").accessibilityLabel("记录状态顺畅").disabled(model.active?.isPaused == true)
            Button { showDistraction = true } label: { Circle().fill(.red).frame(width: 12, height: 12) }
                .help("记录分神").accessibilityLabel("记录分神").disabled(model.active?.isPaused == true)
                .popover(isPresented: $showDistraction, arrowEdge: .bottom) {
                    VStack(alignment: .leading, spacing: 10) {
                        Button("轻微分神") { model.mark("distraction", level: "light"); showDistraction = false }
                        Button("明显分神") { model.mark("distraction", level: "medium"); showDistraction = false }
                        Button("长时间分神") { model.mark("distraction", level: "heavy"); showDistraction = false }
                    }.buttonStyle(.plain).padding(12)
                }
            Spacer(minLength: 4)
            Button { if model.active?.isPaused == true { model.resume() } else { model.pause() } } label: {
                Image(systemName: model.active?.isPaused == true ? "play.fill" : "pause.fill")
            }.help(model.active?.isPaused == true ? "继续" : "暂停")
            Button { confirmCancel = true } label: { Image(systemName: "xmark") }.help("取消本次计时，不生成工时")
            Button { AppWindows.shared.finish() } label: { Image(systemName: "stop.fill") }.help("结束并记录")
        }.buttonStyle(.borderless)
            .confirmationDialog("取消本次计时？", isPresented: $confirmCancel) {
                Button("取消计时，不生成记录", role: .destructive) { model.cancel() }
                Button("返回", role: .cancel) {}
            }
    }
}

struct FloatingTimerView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.active != nil { TimerReadout(model: model); TimerControls(model: model) }
            else {
                HStack { Text("未在计时").foregroundStyle(.secondary); Spacer(); Button("选项目") { AppWindows.shared.showMain() } }
            }
            if model.error != nil { Button("查看保存提示") { AppWindows.shared.showMain() }.font(.caption).foregroundStyle(.red) }
        }.padding(.horizontal, 14).padding(.vertical, 12).frame(width: 350)
            .background(.regularMaterial)
    }
}

struct MenuContent: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.active != nil { TimerReadout(model: model); TimerControls(model: model); Divider() }
            Button("打开主窗口") { AppWindows.shared.showMain() }
            Button("显示 / 隐藏悬浮条") { AppWindows.shared.togglePanel() }
            Divider()
            Button("退出") { NSApp.terminate(nil) }
        }.buttonStyle(.plain).padding(15).frame(width: 320)
    }
}

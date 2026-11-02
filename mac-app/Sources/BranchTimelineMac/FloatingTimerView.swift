import SwiftUI
import TimelineCore

struct FloatingTimerView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    AppPalette.blue.opacity(0.11)
                    AppPalette.blue.frame(width: geometry.size.width * min(1, model.ratio))
                }
            }.frame(height: 2)
            HStack(spacing: 8) {
                Button { AppWindows.shared.showMain() } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.active?.title ?? "开始专注").lineLimit(1).font(.system(size: 12, weight: .medium))
                        if let active = model.active, active.projectName != active.title {
                            Text(active.projectName).lineLimit(1).foregroundStyle(.secondary).font(.system(size: 10))
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain).help(model.active?.title ?? "打开主窗口")
                if model.active != nil {
                    Text(clockLabel(model.timerSeconds)).font(.system(size: 22, weight: .medium, design: .rounded)).monospacedDigit().fixedSize()
                    TimerControls(model: model, compact: true).fixedSize()
                } else {
                    Button { AppWindows.shared.showMain() } label: { Image(systemName: "play.fill").font(.system(size: 18)).foregroundStyle(AppPalette.blue) }.buttonStyle(.plain).help("开始计时")
                }
            }.padding(.horizontal, 12).padding(.vertical, 8)
            if model.error != nil { Button("查看保存提示") { AppWindows.shared.showMain() }.font(.caption).foregroundStyle(.red).padding(.bottom, 4) }
        }.frame(minWidth: 320, maxWidth: .infinity).background(AppPalette.surface)
    }
}

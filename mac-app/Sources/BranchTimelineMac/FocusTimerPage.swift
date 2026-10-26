import SwiftUI
import TimelineCore

struct FocusTimerPage: View {
    @ObservedObject var model: AppModel
    @State private var editDuration = false
    private var color: Color { Color(hex: model.projects.first { $0.path == (model.active?.projectPath ?? model.selectedPath) }?.color ?? "#3159e2") }
    var body: some View {
        GeometryReader { geometry in
            let diameter = min(430, max(220, min(geometry.size.width - 48, geometry.size.height - (model.active == nil ? 335 : 285))))
            VStack(spacing: 0) {
                Spacer(minLength: 8)
                if model.active == nil {
                    Text("这次专注什么？").font(.system(size: 26, weight: .medium)).padding(.bottom, 14)
                }
                ProjectPicker(model: model)
                Group {
                    if let active = model.active {
                        Text(active.title).font(.system(size: 18, weight: .medium)).lineLimit(2).multilineTextAlignment(.center).frame(minHeight: 45)
                    } else {
                        TextField("这次做什么？", text: $model.title)
                            .textFieldStyle(.plain).padding(12).background(.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
                            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(.primary.opacity(0.10)) }
                            .font(.system(size: 16)).frame(maxWidth: 450).padding(.top, 14)
                    }
                }.padding(.horizontal, 30)
                Spacer(minLength: 8)
                TimerFace(minutes: model.active?.targetMinutes ?? model.targetMinutes, elapsed: model.elapsed, editable: model.active == nil, color: color) { model.targetMinutes = $0 }
                    .frame(width: diameter, height: diameter)
                Group {
                    if model.active != nil { clockText }
                    else {
                        Button { editDuration.toggle() } label: { clockText }
                            .buttonStyle(.plain).help("设置时长；零为正计时")
                            .popover(isPresented: $editDuration, arrowEdge: .bottom) { DurationPicker(minutes: $model.targetMinutes) }
                    }
                }
                Text(timeCaption).font(.system(size: 12, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
                    .padding(.horizontal, 15).padding(.vertical, 5)
                    .background(Capsule().strokeBorder(.primary.opacity(0.13), lineWidth: 1.5)).padding(.top, 6)
                Spacer(minLength: 16)
                if model.active == nil {
                    Button { model.start() } label: {
                        Text("开始专注").font(.system(size: 15, weight: .semibold)).frame(width: 240, height: 48)
                            .foregroundStyle(.white).background(color, in: Capsule())
                    }.buttonStyle(.plain).disabled(!model.canStart && !AppModel.diagnostic).opacity(model.canStart || AppModel.diagnostic ? 1 : 0.45).keyboardShortcut(.return, modifiers: .command)
                } else {
                    TimerControls(model: model)
                }
                Spacer(minLength: 16)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    private var clockText: some View {
        Text(clockLabel(model.timerSeconds)).font(.system(size: 38, weight: .medium, design: .rounded)).monospacedDigit().foregroundStyle(.secondary)
    }
    private var timeCaption: String {
        if let active = model.active {
            if active.isPaused { return "已暂停 · 已做 \(clockLabel(model.elapsed))" }
            if active.targetMinutes == 0 { return "正计时 · \(active.startedAt.formatted(date: .omitted, time: .shortened)) 开始" }
            if model.ratio >= 1 { return "已到目标 · 已做 \(clockLabel(model.elapsed))" }
            let end = model.now.addingTimeInterval(model.remaining)
            return active.startedAt.formatted(date: .omitted, time: .shortened) + " → " + end.formatted(date: .omitted, time: .shortened)
        }
        if model.targetMinutes == 0 { return "正计时" }
        return model.now.formatted(date: .omitted, time: .shortened) + " → " + model.now.addingTimeInterval(Double(model.targetMinutes * 60)).formatted(date: .omitted, time: .shortened)
    }
}

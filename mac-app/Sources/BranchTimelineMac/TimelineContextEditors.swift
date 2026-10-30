import SwiftUI
import AppKit
import TimelineCore

extension AppModel {
    @discardableResult func saveContext(_ request: TimelineContextEdit) -> Bool {
        guard let storage else { error = "请先连接数据文件"; return false }
        do { try storage.editContext(request); refreshShared(); refreshDashboard(); error = nil; return true }
        catch { self.error = error.localizedDescription; return false }
    }
}
struct ContextTimeField: View {
    @Binding var minute: Double
    var body: some View {
        HStack {
            Text("时间"); Spacer()
            if minute >= 1440 { Text("次日").foregroundStyle(.secondary).font(.caption) }
            DatePicker("时间", selection: Binding(get: {
                Calendar.current.date(bySettingHour: Int(minute) / 60 % 24, minute: Int(minute) % 60, second: 0, of: Date()) ?? Date()
            }, set: { date in
                let part = Calendar.current.dateComponents([.hour, .minute], from: date), value = (part.hour ?? 0) * 60 + (part.minute ?? 0)
                minute = Double(value < 120 ? value + 1440 : value)
            }), displayedComponents: .hourAndMinute).labelsHidden().environment(\.locale, Locale(identifier: "zh_CN"))
        }
    }
}
struct FocusPointEditor: View {
    @ObservedObject var model: AppModel
    let date: String
    let context: DayFocusContext?
    var point: FocusPoint? = nil
    var initialMinute: Double = 720
    @Environment(\.dismiss) private var dismiss
    @State private var minute = 720.0
    @State private var score = 50.0
    @State private var label = ""
    @State private var level = "medium"
    @State private var failure: String?
    @State private var deleting = false
    private var editable: Bool { point?.editable != false }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(point?.kind == "distraction" ? "走神" : point?.kind == "good" ? "高度专注" : "可用脑力").font(.headline)
            ContextTimeField(minute: $minute).disabled(!editable)
            if point == nil || point?.kind == "mental" {
                TextField("状态名称（可选）", text: $label).textFieldStyle(.roundedBorder)
                if let labels = context?.labels, !labels.isEmpty {
                    Menu("选择状态") { ForEach(labels) { preset in Button(preset.name) { label = preset.name; score = preset.score } } }
                }
                ZStack {
                    LinearGradient(colors: [Color(hex: context?.colors.low ?? "#d84b4b"), Color(hex: context?.colors.neutral ?? "#8b929d"), Color(hex: context?.colors.high ?? "#126cff")], startPoint: .leading, endPoint: .trailing).frame(height: 5).clipShape(Capsule())
                    Slider(value: $score, in: 0...100).tint(.clear).accessibilityLabel("可用脑力分数")
                }
                HStack { Text("难以投入"); Spacer(); Text("\(Int(score))/100").monospacedDigit(); Spacer(); Text("高度专注") }.font(.caption).foregroundStyle(.secondary)
            }
            if point?.kind == "distraction" {
                Picker("程度", selection: $level) { Text("轻").tag("light"); Text("中").tag("medium"); Text("重").tag("heavy") }.pickerStyle(.segmented).labelsHidden().disabled(!editable)
            }
            if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
            if !editable { Text("结束计时后可编辑").font(.caption).foregroundStyle(.secondary) }
            HStack {
                if point != nil && editable { Button(role: .destructive) { deleting = true } label: { Image(systemName: "trash") }.help("删除这次记录") }
                Spacer(); Button("取消") { dismiss() }
                if editable { Button(point == nil ? "记录" : "保存") { save(delete: false) }.buttonStyle(.borderedProminent) }
            }
        }.padding(16).frame(width: 290).onAppear {
            minute = point?.minute ?? initialMinute; score = point?.score ?? 50; label = point?.kind == "mental" ? point?.label ?? "" : ""; level = point?.level ?? "medium"
        }.alert("删除这次状态记录？", isPresented: $deleting) { Button("删除", role: .destructive) { save(delete: true) }; Button("取消", role: .cancel) {} }
    }
    private func save(delete: Bool) {
        var request = TimelineContextEdit(date: date)
        request.kind = point?.kind ?? "mental"; request.id = point?.recordId ?? request.id; request.expected = point?.revision
        request.action = delete ? "delete" : "save"; request.minute = minute; request.score = score; request.label = label; request.level = level
        if model.saveContext(request) { dismiss() } else { failure = model.error }
    }
}
struct EnergyPhaseEditor: View {
    @ObservedObject var model: AppModel
    let date: String
    let context: DayFocusContext?
    var phase: EnergyPhase? = nil
    var initialMinute: Double = 720
    @Environment(\.dismiss) private var dismiss
    @State private var minute = 720.0
    @State private var name = ""
    @State private var color = Color(hex: "#3978d3")
    @State private var failure: String?
    @State private var deleting = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text("精力区间").font(.headline); Spacer(); ColorPicker("颜色", selection: $color, supportsOpacity: false).labelsHidden() }
            TextField("名称", text: $name).textFieldStyle(.roundedBorder)
            ContextTimeField(minute: $minute)
            HStack {
                ForEach(["#3978d3", "#8a94a2"], id: \.self) { hex in Button { color = Color(hex: hex) } label: { Circle().fill(Color(hex: hex)).frame(width: 22, height: 22) }.buttonStyle(.plain).accessibilityLabel(hex) }
            }
            if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
            HStack {
                if phase != nil { Button(role: .destructive) { deleting = true } label: { Image(systemName: "trash") }.help("删除这个精力分界") }
                Spacer(); Button("取消") { dismiss() }; Button("保存") { save(delete: false) }.buttonStyle(.borderedProminent).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }.padding(16).frame(width: 270).onAppear { minute = phase?.at ?? initialMinute; name = phase?.name ?? ""; color = Color(hex: phase?.color ?? "#3978d3") }
            .alert("删除这个精力分界？", isPresented: $deleting) { Button("删除", role: .destructive) { save(delete: true) }; Button("取消", role: .cancel) {} } message: { Text("从这一天起生效，过去的安排保留。") }
    }
    private func save(delete: Bool) {
        guard let rgb = NSColor(color).usingColorSpace(.deviceRGB) else { return }
        var request = TimelineContextEdit(date: date); request.kind = "energy"; request.id = phase?.id ?? request.id
        request.minute = minute; request.label = name; request.action = delete ? "delete" : "save"; request.expected = context?.energyRevision ?? "[]"
        request.color = String(format: "#%02x%02x%02x", Int((rgb.redComponent * 255).rounded()), Int((rgb.greenComponent * 255).rounded()), Int((rgb.blueComponent * 255).rounded()))
        if model.saveContext(request) { dismiss() } else { failure = model.error }
    }
}

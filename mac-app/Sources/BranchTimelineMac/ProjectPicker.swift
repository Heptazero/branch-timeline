import SwiftUI
import TimelineCore

struct ProjectPicker: View {
    @ObservedObject var model: AppModel
    @State private var expanded = false
    private var chip: some View {
        HStack(spacing: 9) {
                Circle().fill(Color(hex: model.active.flatMap { active in model.projects.first { $0.path == active.projectPath }?.color } ?? model.selected?.color ?? "#3159e2")).frame(width: 8, height: 8)
                Text(model.active?.projectName ?? model.selected?.name ?? "选择项目").lineLimit(1).font(.system(size: 14, weight: .semibold))
                if model.active == nil { Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(.tertiary) }
            }.padding(.horizontal, 16).padding(.vertical, 9)
                .background(Capsule().strokeBorder(.primary.opacity(0.13), lineWidth: 2))
    }
    var body: some View {
        Group {
            if model.active != nil { chip }
            else { Button { expanded.toggle() } label: { chip }.buttonStyle(.plain) }
        }
            .popover(isPresented: $expanded, arrowEdge: .bottom) {
                VStack(spacing: 10) {
                    TextField("搜索项目", text: $model.query).textFieldStyle(.roundedBorder)
                    if model.loading { ProgressView().controlSize(.small) }
                    ScrollView {
                        LazyVStack(spacing: 2) {
                            ForEach(model.filtered) { project in
                                Button { model.selectedPath = project.path; expanded = false } label: {
                                    HStack(spacing: 9) {
                                        Circle().fill(Color(hex: project.color)).frame(width: 7, height: 7)
                                        Text(project.name).lineLimit(2).multilineTextAlignment(.leading)
                                        Spacer(minLength: 4)
                                        if model.selectedPath == project.path { Image(systemName: "checkmark").foregroundStyle(AppPalette.blue) }
                                    }.padding(9).frame(maxWidth: .infinity, alignment: .leading)
                                }.buttonStyle(.plain)
                            }
                            if !model.loading && model.filtered.isEmpty { Text("无匹配项目").foregroundStyle(.secondary).padding() }
                        }
                    }.frame(maxHeight: 250)
                }.padding(14).frame(width: 300)
            }
    }
}

struct DurationPicker: View {
    @Binding var minutes: Int
    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Button { minutes = max(0, minutes - 5) } label: { Image(systemName: "minus") }.help("减少五分钟")
                TextField("分钟", value: $minutes, format: .number).multilineTextAlignment(.center).frame(width: 65).textFieldStyle(.roundedBorder)
                    .onChange(of: minutes) { minutes = min(1440, max(0, $0)) }
                Text("min").foregroundStyle(.secondary)
                Button { minutes = min(1440, minutes + 5) } label: { Image(systemName: "plus") }.help("增加五分钟")
            }
            HStack(spacing: 8) {
                ForEach([0, 25, 50, 60, 90], id: \.self) { value in
                    Button(value == 0 ? "正计时" : "\(value)") { minutes = value }
                        .buttonStyle(.borderless).tint(minutes == value ? AppPalette.blue : .secondary)
                }
            }
        }.padding(16)
    }
}

import SwiftUI
import TimelineCore

struct BlockProjectPicker: View {
    let projects: [Project]
    @Binding var path: String
    var required = false
    @State private var expanded = false
    @State private var query = ""
    private var project: Project? { projects.first { $0.path == path } }
    private var matches: [Project] { projects.filter { ($0.isActive || $0.path == path) && matchesProject(query, project: $0) } }
    var body: some View {
        Button { expanded.toggle() } label: {
            HStack {
                Circle().fill(Color(hex: project?.color ?? "#a4aab5")).frame(width: 7, height: 7)
                Text(project.map { "@" + $0.name } ?? "选择项目").lineLimit(1)
                Image(systemName: "chevron.down").font(.caption2)
            }
        }.buttonStyle(.borderless).popover(isPresented: $expanded) {
            VStack(spacing: 8) {
                TextField("搜索项目", text: $query).textFieldStyle(.roundedBorder)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        if !required { Button("不关联项目") { path = ""; expanded = false }.padding(6) }
                        ForEach(matches) { project in
                            Button { path = project.path; expanded = false } label: {
                                HStack { Circle().fill(Color(hex: project.color)).frame(width: 7, height: 7); Text(project.name).lineLimit(2); Spacer() }.padding(6)
                            }
                        }
                        if matches.isEmpty { Text("无匹配项目").font(.caption).foregroundStyle(.secondary).padding(6) }
                    }.buttonStyle(.plain)
                }.frame(maxHeight: 220)
            }.padding(12).frame(width: 260)
        }
    }
}

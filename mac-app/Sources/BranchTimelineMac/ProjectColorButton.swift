import AppKit
import SwiftUI
import TimelineCore

struct ProjectColorButton: View {
    let project: ProjectSummary
    @ObservedObject var model: AppModel
    @State private var open = false
    @State private var color = Color.blue
    @State private var failure: String?
    var body: some View {
        Button { color = Color(hex: project.color); open = true } label: {
            Circle().fill(Color(hex: project.color)).frame(width: 8, height: 8).frame(width: 18, height: 22).contentShape(Rectangle())
        }.buttonStyle(.plain).help("修改项目颜色").accessibilityLabel("修改\(project.name)颜色")
            .popover(isPresented: $open, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 12) {
                    ColorPicker(project.name, selection: $color, supportsOpacity: false).lineLimit(1)
                    HStack(spacing: 10) {
                        ForEach(["#3159e2", "#9072c6", "#54a089", "#d29446", "#ca6975", "#707989"], id: \.self) { hex in
                            Button { color = Color(hex: hex) } label: { Circle().fill(Color(hex: hex)).frame(width: 22, height: 22) }.buttonStyle(.plain).accessibilityLabel(hex)
                        }
                    }
                    if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
                    HStack { Button("取消") { open = false }; Spacer(); Button("保存") {
                        guard let rgb = NSColor(color).usingColorSpace(.deviceRGB) else { return }
                        let hex = String(format: "#%02x%02x%02x", Int((rgb.redComponent * 255).rounded()), Int((rgb.greenComponent * 255).rounded()), Int((rgb.blueComponent * 255).rounded()))
                        if model.setProjectColor(project.path, hex: hex) { open = false } else { failure = model.error }
                    }.buttonStyle(.borderedProminent) }
                }.padding(16).frame(width: 265)
            }
    }
}

import SwiftUI
import TimelineCore

struct FeatureCommand { let id = UUID(); let action: String }
extension AppModel {
    var navigationScope: String { hasFeaturePanel && !(page == .features && featureRoute == "projects") ? "day" : scope }
    var featureTitle: String {
        ["policy": "锚点", "achievements": "成就", "life": "人生", "settings": "设置", "day": "分支", "projects": "项目详情", "rhythm": "节律", "habits": "详细统计"][featureRoute] ?? "更多"
    }
    var hasFeaturePanel: Bool { page == .features || (page == .timeline && branchMode) || (page == .projects && projectDetailPath != nil) }
    func openFeature(_ route: String) { featureItemID = nil; featureRoute = route; page = .features; featureCanUndo = false }
    func featureAction(_ action: String) { featureCommand = FeatureCommand(action: action) }
}
struct FeaturePage: View {
    @ObservedObject var model: AppModel
    var body: some View {
        SharedFeatureView(model: model, route: model.featureRoute, projectPath: model.featureItemID)
    }
}
struct ProjectDetailPage: View {
    @ObservedObject var model: AppModel
    let path: String
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.projectDetailPath = nil } label: { Image(systemName: "chevron.left") }.buttonStyle(.plain).help("返回")
                Spacer()
                Text(model.projects.first { $0.path == path }?.name ?? "").lineLimit(1).font(.callout)
                Spacer()
            }.padding(.horizontal, 22).padding(.vertical, 8)
            SharedFeatureView(model: model, route: "projects", projectPath: path)
        }
    }
}
struct RhythmControl: View {
    @ObservedObject var model: AppModel
    @State private var expanded = false
    var body: some View {
        Button { expanded.toggle() } label: {
            HStack(spacing: 4) { Image(systemName: "sun.horizon"); if let rhythm = model.dashboard?.rhythm { Text(rhythm.label(model.now)).monospacedDigit() } }
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }.buttonStyle(.plain).help("节律与固定时间")
            .popover(isPresented: $expanded, arrowEdge: .bottom) {
                SharedFeatureView(model: model, route: "rhythm").frame(width: 310, height: 390)
            }
    }
}

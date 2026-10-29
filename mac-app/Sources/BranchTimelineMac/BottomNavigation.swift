import SwiftUI
import TimelineCore

struct BottomNavigation: View {
    @ObservedObject var model: AppModel
    @AppStorage("macNavigationLayoutV1") private var saved = ""
    @State private var showMore = false
    @State private var draft: NavigationLayout?
    @State private var moving: NavigationDestination?
    @State private var suppressTapUntil = Date.distantPast
    @GestureState private var dragging = false
    private var layout: NavigationLayout { draft ?? NavigationLayout.decode(saved) }
    var body: some View {
        GeometryReader { geometry in
            let visible = layout.visible(width: geometry.size.width, pages: model.visiblePages)
            let overflow = layout.overflow(width: geometry.size.width, pages: model.visiblePages)
            let extraSelected = model.page == .features && !NavigationDestination.allCases.contains(where: model.isSelected)
            HStack(spacing: 0) {
                ForEach(visible) { destination in
                    tab(destination, visible: visible, width: geometry.size.width)
                }
                Button { showMore.toggle() } label: { tabLabel("更多", icon: "ellipsis", selected: extraSelected || overflow.contains(where: model.isSelected)) }
                    .buttonStyle(.plain).foregroundStyle(extraSelected || overflow.contains(where: model.isSelected) ? AppPalette.blue : .secondary)
                    .popover(isPresented: $showMore, arrowEdge: .bottom) {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(overflow) { destination in
                                HStack(spacing: 4) {
                                    Button { showMore = false; model.navigate(destination) } label: {
                                        HStack { Image(systemName: destination.icon).frame(width: 18); Text(destination.title); Spacer(); if model.isSelected(destination) { Image(systemName: "checkmark").font(.caption) } }.padding(.vertical, 7).contentShape(Rectangle())
                                    }
                                    Button { var next = layout; next.restore(destination); saved = next.encoded } label: { Image(systemName: "pin").frame(width: 28, height: 30) }.help("显示在底部").accessibilityLabel("将\(destination.title)显示在底部")
                                }
                            }
                            if !overflow.isEmpty { Divider().padding(.vertical, 4) }
                            Button("完整分支时间线") { showMore = false; model.page = .timeline; model.branchMode = true }
                            routeButton("详细统计", "habits")
                            routeButton("完整项目面板", "projects")
                            routeButton("全部功能设置", "settings")
                        }.buttonStyle(.plain).padding(14).frame(width: 210, alignment: .leading)
                    }
            }.animation(.easeInOut(duration: 0.15), value: layout.order).coordinateSpace(name: "bottomTabs").padding(.horizontal, 20)
        }.frame(height: 56).padding(.top, 8).padding(.bottom, 4).background(AppPalette.surface)
            .overlay(alignment: .top) { Divider() }
            .onChange(of: dragging) { active in if !active { draft = nil; moving = nil } }
            .onChange(of: model.visiblePages) { _ in draft = nil; moving = nil }
    }
    private func tab(_ destination: NavigationDestination, visible: [NavigationDestination], width: Double) -> some View {
        Button { if Date() >= suppressTapUntil { model.navigate(destination) } } label: {
            tabLabel(destination.title, icon: destination.icon, selected: model.isSelected(destination))
        }.buttonStyle(.plain).foregroundStyle(model.isSelected(destination) ? AppPalette.blue : .secondary)
            .scaleEffect(moving == destination ? 1.08 : 1).opacity(moving == destination ? 0.65 : 1)
            .help("\(destination.title) · 按住拖动排序；右键收进更多")
            .accessibilityLabel(destination.title).accessibilityAddTraits(model.isSelected(destination) ? .isSelected : [])
            .contextMenu {
                Button("收进更多") { var next = layout; next.hide(destination); saved = next.encoded }
                Divider()
                Button("向左移动") { shift(destination, in: visible, by: -1) }.disabled(visible.first == destination)
                Button("向右移动") { shift(destination, in: visible, by: 1) }.disabled(visible.last == destination)
            }
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.3).sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named("bottomTabs")))
                .updating($dragging) { value, active, _ in if case .second(true, _) = value { active = true } }
                .onChanged { value in
                    guard case .second(true, let drag?) = value else { return }
                    if draft == nil { draft = NavigationLayout.decode(saved); moving = destination }
                    suppressTapUntil = Date().addingTimeInterval(0.4)
                    let index = min(visible.count - 1, max(0, Int(drag.location.x / max(1, (width - 40) / Double(visible.count + 1)))))
                    if visible.indices.contains(index) { draft?.move(destination, to: visible[index]) }
                }.onEnded { value in
                    if case .second(true, _) = value, let draft { saved = draft.encoded; suppressTapUntil = Date().addingTimeInterval(0.4) }
                    draft = nil; moving = nil
                })
    }
    private func tabLabel(_ title: String, icon: String, selected: Bool) -> some View {
        VStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 21))
            Text(title).font(.system(size: 11, weight: selected ? .semibold : .regular)).lineLimit(1)
            Circle().fill(selected ? AppPalette.blue : .clear).frame(width: 4, height: 4)
        }.frame(maxWidth: .infinity).frame(height: 56).contentShape(Rectangle())
    }
    private func shift(_ destination: NavigationDestination, in visible: [NavigationDestination], by amount: Int) {
        guard let index = visible.firstIndex(of: destination), visible.indices.contains(index + amount) else { return }
        var next = layout; next.move(destination, to: visible[index + amount]); saved = next.encoded
    }
    private func routeButton(_ title: String, _ route: String) -> some View {
        Button { showMore = false; model.openFeature(route) } label: { Text(title).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6) }
    }
}
extension NavigationDestination {
    var icon: String {
        switch self { case .timer: return "clock"; case .timeline: return "calendar"; case .projects: return "square.stack"; case .stats: return "chart.bar"; case .anchors: return "point.3.connected.trianglepath.dotted"; case .achievements: return "rosette"; case .life: return "point.topleft.down.to.point.bottomright.curvepath" }
    }
}
extension AppModel {
    func isSelected(_ destination: NavigationDestination) -> Bool {
        switch destination { case .timer: return page == .timer; case .timeline: return page == .timeline; case .projects: return page == .projects; case .stats: return page == .stats
        default: return page == .features && featureRoute == destination.pageKey }
    }
    func navigate(_ destination: NavigationDestination) {
        switch destination { case .timer: selectPage(.timer); case .timeline: selectPage(.timeline); case .projects: selectPage(.projects); case .stats: selectPage(.stats)
        default:
            if isSelected(destination) { goToday(); featureAction("today") }
            openFeature(destination.pageKey)
        }
    }
}

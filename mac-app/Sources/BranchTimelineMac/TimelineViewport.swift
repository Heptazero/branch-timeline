import AppKit
import SwiftUI
import TimelineCore

/// Change minute geometry, never scale the hosted text or controls.
struct TimelineViewport: NSViewRepresentable {
    let document: TimelineDocument
    let date: String
    let focus: UUID
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeNSView(context: Context) -> TimelineScrollView {
        let scroll = TimelineScrollView()
        scroll.hasVerticalScroller = true; scroll.hasHorizontalScroller = false
        scroll.autohidesScrollers = true; scroll.scrollerStyle = .overlay; scroll.drawsBackground = false
        let host = NSHostingView(rootView: document); host.autoresizingMask = [.width]
        scroll.documentView = host
        scroll.didLayout = { [weak scroll, weak coordinator = context.coordinator] in
            guard let scroll, let coordinator else { return }; coordinator.layout(scroll)
        }
        return scroll
    }
    func updateNSView(_ scroll: TimelineScrollView, context: Context) {
        guard let host = scroll.documentView as? NSHostingView<TimelineDocument> else { return }
        let coordinator = context.coordinator, oldScale = coordinator.scale
        let reset = coordinator.date != date || coordinator.focus != focus
        let oldOffset = scroll.contentView.bounds.minY
        coordinator.date = date; coordinator.focus = focus; coordinator.scale = document.scale
        coordinator.height = document.height; coordinator.targetMinute = document.now ?? document.items.first?.start ?? 120
        if reset { coordinator.needsFocus = true }
        host.rootView = document
        coordinator.layout(scroll)
        if !reset && oldScale != document.scale {
            let offset = TimelineZoom.anchoredOffset(oldOffset: oldOffset, viewport: scroll.contentView.bounds.height, oldScale: oldScale,
                newScale: document.scale, height: document.height)
            scroll.contentView.scroll(to: NSPoint(x: 0, y: offset)); scroll.reflectScrolledClipView(scroll.contentView)
        }
    }
    final class Coordinator {
        var date: String?, focus: UUID?, scale = TimelineZoom.initial, height = 0.0, targetMinute = 120.0, needsFocus = true
        func layout(_ scroll: TimelineScrollView) {
            guard let host = scroll.documentView, scroll.contentSize.width > 0 else { return }
            let size = NSSize(width: scroll.contentSize.width, height: max(height, scroll.contentSize.height))
            if host.frame.size != size { host.setFrameSize(size) }
            if needsFocus && scroll.contentSize.height > 0 {
                needsFocus = false
                let y = max(0, min(max(0, size.height - scroll.contentSize.height), (targetMinute - 120) * scale + 18 - scroll.contentSize.height / 2))
                scroll.contentView.scroll(to: NSPoint(x: 0, y: y)); scroll.reflectScrolledClipView(scroll.contentView)
            }
        }
    }
}
final class TimelineScrollView: NSScrollView {
    var didLayout: (() -> Void)?
    override func layout() { super.layout(); didLayout?() }
}

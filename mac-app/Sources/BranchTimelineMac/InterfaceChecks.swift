import AppKit
import SwiftUI
import TimelineCore

/// Isolated, offscreen AppKit contracts; never drive the user's windows.
@MainActor enum InterfaceChecks {
    static func run() {
        precondition(minuteLabel(600.25, seconds: true) == "10:00:15" && hoursLabel(0.25) == "15s")
        let model = AppModel(preview: true)
        let panel = AppWindows.floatingWindow(model: model, remember: false)
        for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            precondition(panel.standardWindowButton(kind) != nil, "Missing standard window control")
        }
        precondition(panel.styleMask.contains(.closable) && panel.styleMask.contains(.miniaturizable) && panel.styleMask.contains(.resizable))
        precondition(!panel.styleMask.contains(.fullSizeContentView))
        let scroll = TimelineScrollView(frame: NSRect(x: 0, y: 0, width: 500, height: 500))
        let document = TimelineDocument(items: model.dashboard?.items ?? [], projects: model.projects, branches: [], scale: 0.65, now: nil, onOpen: { _, _ in })
        let host = NSHostingView(rootView: document); scroll.documentView = host
        let coordinator = TimelineViewport.Coordinator(); coordinator.height = document.height; coordinator.needsFocus = false
        coordinator.layout(scroll)
        let original = host.frame.height
        coordinator.height = 1440 * 0.08 + 60; coordinator.layout(scroll)
        precondition(host.frame.height < original, "Timeline document did not shrink")
        precondition(host.isFlipped, "Timeline document must use top-origin coordinates")
        let week = AppModel(preview: true, previewScope: "week")
        let wide = TimelineDocument(items: [], projects: week.projects, branches: [], scale: 0.65, now: nil, onOpen: { _, _ in }, days: week.dashboard?.days ?? [])
        coordinator.minimumWidth = wide.minimumWidth; coordinator.layout(scroll)
        precondition(host.frame.width >= 1448, "Week columns must retain usable widths")
        precondition(!PeriodNavigation.dates(logicalDate(), scope: "month").isEmpty)
        let historical = Calendar.current.date(byAdding: .day, value: -9, to: logicalDate())!
        model.page = .stats; model.scope = "week"; model.focusDate = historical
        model.selectPage(.timeline)
        precondition(model.focusDate == historical && model.scope == "week", "Switching pages must retain the shared date")
        model.selectPage(.timeline)
        precondition(model.focusDate == logicalDate(), "Repeating the active tab must focus today")
        model.navigate(.anchors)
        precondition(model.isSelected(.anchors) && !model.isSelected(.stats))
        model.focusDate = historical; model.navigate(.life)
        precondition(model.isSelected(.life) && model.focusDate == historical)
        model.navigate(.life)
        precondition(model.focusDate == logicalDate() && model.featureCommand?.action == "today")
        panel.close()
        print("Native window controls and timeline shrinking contracts OK")
    }
}

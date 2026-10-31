import AppKit
import SwiftUI
import TimelineCore

@MainActor enum PreviewRenderer {
    static func run() {
        guard let index = CommandLine.arguments.firstIndex(of: "--render-preview"), CommandLine.arguments.count > index + 1 else { NSApp.terminate(nil); return }
        let directory = URL(fileURLWithPath: CommandLine.arguments[index + 1])
        let model = AppModel.shared
        Task { @MainActor in
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try await capture(MainView(model: model).environment(\.colorScheme, .light), size: NSSize(width: 540, height: 810), to: directory.appendingPathComponent("Mac-main.png"))
                try await capture(MainView(model: AppModel(preview: true, runningPreview: false)).environment(\.colorScheme, .light), size: NSSize(width: 540, height: 810), to: directory.appendingPathComponent("Mac-setup.png"))
                try await capture(MainView(model: model).environment(\.colorScheme, .dark), size: NSSize(width: 380, height: 680), to: directory.appendingPathComponent("Mac-narrow-dark.png"))
                try await capture(FloatingTimerView(model: model).environment(\.colorScheme, .light), size: NSSize(width: 580, height: 100), to: directory.appendingPathComponent("Mac-floating.png"))
                for page in [AppPage.projects, .stats, .timeline] {
                    let fixture = AppModel(preview: true, previewScope: page == .timeline ? "day" : "week"); fixture.page = page
                    try await capture(MainView(model: fixture).environment(\.colorScheme, .light), size: NSSize(width: 540, height: 810), to: directory.appendingPathComponent("Mac-\(page.icon).png"))
                }
                for scope in ["week", "month"] {
                    let fixture = AppModel(preview: true, previewScope: scope); fixture.page = .timeline
                    try await capture(MainView(model: fixture).environment(\.colorScheme, .light), size: NSSize(width: scope == "week" ? 1100 : 380, height: 810), to: directory.appendingPathComponent("Mac-timeline-\(scope).png"))
                    let statistics = AppModel(preview: true, previewScope: scope); statistics.page = .stats
                    try await capture(MainView(model: statistics).environment(\.colorScheme, .light), size: NSSize(width: 380, height: 810), to: directory.appendingPathComponent("Mac-stats-\(scope).png"))
                }
                if let day = model.dashboard?.days.first {
                    try await capture(DayBreakdown(day: day, model: model).environment(\.colorScheme, .light), size: NSSize(width: 340, height: 280), to: directory.appendingPathComponent("Mac-day-details.png"))
                }
                try await capture(SleepChart(dashboard: model.dashboard).padding(24).environment(\.colorScheme, .light), size: NSSize(width: 420, height: 420), to: directory.appendingPathComponent("Mac-sleep.png"))
                try await capture(DataSettingsView(model: model).environment(\.colorScheme, .light), size: NSSize(width: 560, height: 610), to: directory.appendingPathComponent("Mac-settings.png"))
                try await capture(CalendarPicker(model: model).environment(\.colorScheme, .light), size: NSSize(width: 310, height: 340), to: directory.appendingPathComponent("Mac-calendar-picker.png"))
                for width in [380, 540, 850] {
                    try await capture(MainView(model: AppModel(preview: true)).environment(\.colorScheme, .light), size: NSSize(width: width, height: 810), to: directory.appendingPathComponent("Mac-navigation-\(width).png"))
                }
                let pie = AppModel(preview: true, previewScope: "week")
                try await capture(StatisticsPage(model: pie, previewChart: "pie").environment(\.colorScheme, .light), size: NSSize(width: 380, height: 700), to: directory.appendingPathComponent("Mac-statistics-pie.png"))
                try await capture(StatisticsPage(model: pie, previewChart: "bar").environment(\.colorScheme, .light), size: NSSize(width: 380, height: 700), to: directory.appendingPathComponent("Mac-statistics-bar.png"))
                var block = BlockEdit(date: dayKey(logicalDate()), start: 600, end: 630)
                block.title = "整理实验结果"; block.projectPath = "preview.md"
                try await capture(BlockEditor(model: model, edit: block).environment(\.colorScheme, .light), size: NSSize(width: 390, height: 360), to: directory.appendingPathComponent("Mac-add-block.png"))
                try await capture(BlockEditor(model: model, edit: PreviewFixture.editableBlock()).environment(\.colorScheme, .light), size: NSSize(width: 390, height: 360), to: directory.appendingPathComponent("Mac-edit-block.png"))
                let contextModel = AppModel(preview: true, previewScope: "week")
                try await capture(TimelineTimeMap(model: contextModel).padding(20).environment(\.colorScheme, .light), size: NSSize(width: 540, height: 620), to: directory.appendingPathComponent("Mac-time-map.png"))
                let focus = model.dashboard?.days.first?.focus
                try await capture(FocusPointEditor(model: model, date: dayKey(logicalDate()), context: focus).environment(\.colorScheme, .light), size: NSSize(width: 330, height: 260), to: directory.appendingPathComponent("Mac-state-editor.png"))
                try await capture(EnergyPhaseEditor(model: model, date: dayKey(logicalDate()), context: focus, phase: focus?.phases.first).environment(\.colorScheme, .light), size: NSSize(width: 310, height: 245), to: directory.appendingPathComponent("Mac-energy-editor.png"))
                let timeline = TimelineDocument(items: model.dashboard?.items ?? [], projects: model.projects, branches: [], scale: 2, now: nil, onOpen: { _, _ in })
                try await capture(timeline.environment(\.colorScheme, .light), size: NSSize(width: 380, height: timeline.height), to: directory.appendingPathComponent("Mac-block-handles.png"))
                let floating = AppWindows.floatingWindow(model: model, remember: false)
                floating.displayIfNeeded()
                if let frame = floating.contentView?.superview, let bitmap = frame.bitmapImageRepForCachingDisplay(in: frame.bounds) {
                    frame.cacheDisplay(in: frame.bounds, to: bitmap)
                    if let data = bitmap.representation(using: .png, properties: [:]) { try data.write(to: directory.appendingPathComponent("Mac-window-controls.png")) }
                }
                floating.close()
                print("Rendered isolated fixture previews")
            } catch { fputs("Preview failed: \(error.localizedDescription)\n", stderr) }
            NSApp.terminate(nil)
        }
    }
    private static func capture<V: View>(_ root: V, size: NSSize, to url: URL) async throws {
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless], backing: .buffered, defer: false)
        let view = NSHostingView(rootView: root.background(Color(nsColor: .windowBackgroundColor)))
        view.frame = NSRect(origin: .zero, size: size); window.contentView = view
        view.layoutSubtreeIfNeeded()
        window.displayIfNeeded()
        try await Task.sleep(nanoseconds: 250_000_000)
        window.contentView?.layoutSubtreeIfNeeded()
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { throw StorageError.invalid }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        guard let data = bitmap.representation(using: .png, properties: [:]) else { throw StorageError.invalid }
        try data.write(to: url, options: .atomic)
    }
}

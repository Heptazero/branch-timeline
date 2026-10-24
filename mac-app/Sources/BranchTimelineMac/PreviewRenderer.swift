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
                try await capture(MainView(model: model).environment(\.colorScheme, .light), size: NSSize(width: 580, height: 620), to: directory.appendingPathComponent("Mac-main.png"))
                try await capture(FloatingTimerView(model: model).environment(\.colorScheme, .light), size: NSSize(width: 350, height: 140), to: directory.appendingPathComponent("Mac-floating.png"))
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

import AppKit
import SwiftUI
import TimelineCore

@main struct BranchTimelineApp: App {
    @NSApplicationDelegateAdaptor(ApplicationDelegate.self) var delegate
    var body: some Scene {
        MenuBarExtra {
            MenuContent(model: .shared)
        } label: { MenuLabel(model: .shared) }
        .menuBarExtraStyle(.menu)
        .commands {
            CommandGroup(replacing: .appSettings) { Button("设置…") { AppWindows.shared.showSettings() }.keyboardShortcut(",") }
            CommandGroup(replacing: .appTermination) {
                Button("退出 Branch Timeline") { ApplicationLifecycle.requestQuit() }.keyboardShortcut("q")
            }
        }
    }
}
@MainActor final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    private var sleepObserver: NSObjectProtocol?
    func applicationDidFinishLaunching(_ notification: Notification) {
        if CommandLine.arguments.contains("--render-preview") { PreviewRenderer.run(); return }
        if CommandLine.arguments.contains("--check-features") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 50) { fputs("Feature check timeout\n", stderr); exit(1) }
            Task { do { try await FeatureChecks.run(); NSApp.terminate(nil) } catch { fputs("Feature checks: \(error)\n", stderr); exit(1) } }; return
        }
        if CommandLine.arguments.contains("--check-interface") { InterfaceChecks.run(); NSApp.terminate(nil); return }
        if CommandLine.arguments.contains("--check-quit") {
            do { try SharedStateStore.verifyRuntime(); print("Shared runtime resource OK") }
            catch { fputs("Shared runtime failed: \(error)\n", stderr); exit(1) }
            ApplicationLifecycle.requestQuit(); return
        }
        if let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 { NSApp.terminate(nil); return }
        AppModel.shared.launch()
        AppWindows.shared.showMain()
        sleepObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in AppModel.shared.pause() }
        }
    }
    func applicationWillTerminate(_ notification: Notification) {
        if CommandLine.arguments.contains("--check-quit") { print("Native termination delegate OK"); return }
        AppModel.shared.shutdown()
        if let sleepObserver { NSWorkspace.shared.notificationCenter.removeObserver(sleepObserver) }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { ApplicationLifecycle.shouldTerminate() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if ApplicationLifecycle.quitting { return false }
        AppWindows.shared.showMain(); return true
    }
}

@MainActor final class AppWindows {
    static let shared = AppWindows()
    private var main: NSWindow?
    private var panel: NSPanel?
    private var settings: NSWindow?
    func hideForQuit() { panel?.orderOut(nil); main?.orderOut(nil); settings?.orderOut(nil) }
    func showSettings() {
        if settings == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 610), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "设置"; window.minSize = NSSize(width: 480, height: 540); window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: DataSettingsView(model: .shared)); window.center(); settings = window
        }
        AppModel.shared.refreshConnection(); NSApp.activate(ignoringOtherApps: true); settings?.makeKeyAndOrderFront(nil)
    }
    func showMain() {
        if main == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 540, height: 810), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "Branch Timeline"; window.minSize = NSSize(width: 380, height: 680)
            window.isReleasedWhenClosed = false; window.setFrameAutosaveName("BranchTimelineMainDial")
            window.contentView = NSHostingView(rootView: MainView(model: .shared)); window.center(); main = window
        }
        NSApp.activate(ignoringOtherApps: true); main?.makeKeyAndOrderFront(nil)
    }
    func finish() { showMain(); AppModel.shared.beginFinish() }
    func togglePanel() {
        if let panel, panel.isMiniaturized { panel.deminiaturize(nil); return }
        if let panel, panel.isVisible { panel.orderOut(nil); return }
        if panel == nil {
            let window = Self.floatingWindow(model: .shared, remember: true); window.center(); panel = window
        }
        panel?.orderFrontRegardless()
    }
    static func floatingWindow(model: AppModel, remember: Bool) -> NSPanel {
        let window = FloatingPanel(contentRect: NSRect(x: 0, y: 0, width: 580, height: 100), styleMask: [.titled, .closable, .miniaturizable, .resizable, .nonactivatingPanel], backing: .buffered, defer: false)
        window.title = "计时"; window.minSize = NSSize(width: 500, height: 120)
        window.titleVisibility = .hidden; window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true; window.hidesOnDeactivate = false
        window.level = .floating; window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isReleasedWhenClosed = false
        if remember { window.setFrameAutosaveName("BranchTimelineFloatingStandard") }
        window.contentView = NSHostingView(rootView: FloatingTimerView(model: model))
        return window
    }
}

final class FloatingPanel: NSPanel { override var canBecomeKey: Bool { true } }

struct MenuLabel: View {
    @ObservedObject var model: AppModel
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "timer")
            if model.active != nil { Text(TimelineCore.clockLabel(model.timerSeconds)).monospacedDigit() }
        }
    }
}

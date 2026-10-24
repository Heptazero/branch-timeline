import AppKit

@MainActor enum ApplicationLifecycle {
    static var quitting = false
    static func requestQuit() {
        guard !quitting else { return }
        quitting = true
        // A menu action must finish tracking before NSApplication starts termination.
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }
    static func shouldTerminate() -> NSApplication.TerminateReply {
        if !AppModel.diagnostic && !AppModel.shared.prepareToQuit() {
            NSApp.activate(ignoringOtherApps: true)
            let alert = NSAlert()
            alert.messageText = "计时状态尚未保存"
            alert.informativeText = AppModel.shared.error ?? "数据文件暂时不可写。"
            alert.addButton(withTitle: "返回重试")
            alert.addButton(withTitle: "仍然退出")
            if alert.runModal() == .alertFirstButtonReturn { quitting = false; return .terminateCancel }
        }
        quitting = true
        AppWindows.shared.hideForQuit()
        return .terminateNow
    }
}

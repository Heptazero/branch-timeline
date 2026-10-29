import AppKit
import WebKit
import TimelineCore

/// Runs only on disposable files and an offscreen web view.
@MainActor enum FeatureChecks {
    static func run() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("btl-feature-check-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let bridge = VaultBridge(root: root), config = try bridge.safeURL(".obsidian/plugins/branch-timeline-hz/data.json")
        try FileManager.default.createDirectory(at: config.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(##"{"statePath":"shared.json","visiblePages":["day","projects","policy","achievements","life"],"projectTypes":[{"type":"project","color":"#3159e2"}],"projectTaskHeadings":["任务"]}"##.utf8).write(to: config)
        let initial = #"{"version":1,"days":{},"custom":{"keep":true},"macTimer":{"version":1,"active":null,"checkpoint":"2026-10-29T06:00:00Z"},"desktopReceipts":{"keep":{"status":"imported"}}}"#
        try Data(initial.utf8).write(to: root.appendingPathComponent("shared.json"))
        try Data("---\ntype: project\nstatus: active\ncolor: '#3159e2'\n---\n## 任务\n- [ ] 示例任务\n## log\n手写内容\n".utf8).write(to: root.appendingPathComponent("p.md"))
        let store = try SharedStateStore(bridge: bridge), vault = FeatureVault(store: store), model = AppModel(preview: true)
        let coordinator = SharedFeatureView.Coordinator(model: model, override: vault, onReady: nil)
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addScriptMessageHandler(coordinator, contentWorld: .page, name: "vault")
        let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 500, height: 650), configuration: configuration)
        web.navigationDelegate = coordinator; coordinator.web = web
        let window = NSWindow(contentRect: web.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = web; window.isReleasedWhenClosed = false
        defer { web.configuration.userContentController.removeScriptMessageHandler(forName: "vault", contentWorld: .page); window.close() }
        coordinator.enter(route: "policy", date: "2026-10-29", scope: "day", project: nil, command: nil)
        let page = try FeatureResources.page(); coordinator.root = page.deletingLastPathComponent()
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            coordinator.onReady = { _ in continuation.resume(); coordinator.onReady = nil }
            web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        }
        for route in ["policy", "achievements", "life", "day", "projects", "habits", "settings", "rhythm"] {
            _ = try await evaluate(web, "await window.FeatureUI.enter(route, '2026-10-29'); return document.getElementById('app').innerText.length;", ["route": route])
            try await healthy(web, route); print("Feature route OK: " + route); fflush(stdout)
        }
        // Opening read-only pages must not modify Markdown or create records.
        let untouched = try vault.read("shared.json"); precondition(untouched == initial)
        _ = try await evaluate(web, "await window.FeatureUI.enter('policy','2026-10-29'); await window.FeatureUI.action('add'); return true;")
        _ = try await evaluate(web, "[...document.querySelectorAll('.menu button')].find(b=>b.textContent==='添加根锚点').click(); await new Promise(r=>setTimeout(r,60)); const input=document.querySelector('.modal input'); input.value='专注锚点'; input.dispatchEvent(new Event('input')); document.querySelector('.modal .mod-cta').click(); return true;")
        try await wait(web, "JSON.parse(await window.webkit.messageHandlers.vault.postMessage({op:'read',path:'shared.json'})).policyCards?.some(c=>c.name==='专注锚点')")
        print("Feature anchor save OK"); fflush(stdout)
        let created = try vault.read("shared.json")
        precondition(created.contains("专注锚点") && created.contains("desktopReceipts") && created.contains("macTimer") && created.contains("custom"))
        _ = try await evaluate(web, "await window.FeatureUI.action('undo'); return true;")
        let undone = try vault.read("shared.json"); precondition(!undone.contains("专注锚点"))
        print("Feature anchor undo OK"); fflush(stdout)
        // Add parent/child and verify a violation returns the subtree to the hand.
        _ = try await evaluate(web, "await window.FeatureUI.action('add'); [...document.querySelectorAll('.menu button')].find(b=>b.textContent==='添加根锚点').click(); await new Promise(r=>setTimeout(r,30)); const i=document.querySelector('.modal input'); i.value='父锚点'; i.dispatchEvent(new Event('input')); document.querySelector('.modal .mod-cta').click(); return true;")
        try await wait(web, "document.querySelectorAll('.btl-policy-child-add').length===1")
        _ = try await evaluate(web, "document.querySelector('.btl-policy-child-add').click(); await new Promise(r=>setTimeout(r,30)); const i=document.querySelector('.modal input'); i.value='子锚点'; i.dispatchEvent(new Event('input')); document.querySelector('.modal .mod-cta').click(); return true;")
        try await wait(web, "document.querySelectorAll('.btl-policy-node').length===2")
        print("Feature parent/child tree OK"); fflush(stdout)
        _ = try await evaluate(web, "await new Promise(r=>setTimeout(r,450)); document.querySelector('.btl-policy-node').click(); await new Promise(r=>setTimeout(r,30)); [...document.querySelectorAll('.menu button')].find(b=>b.textContent==='破戒').click(); return true;")
        try await wait(web, "JSON.parse(await window.webkit.messageHandlers.vault.postMessage({op:'read',path:'shared.json'})).policyNodes?.length===0")
        print("Feature subtree returned to hand OK"); fflush(stdout)
        _ = try await evaluate(web, "await window.FeatureUI.action('undo'); return true;")
        try await wait(web, "document.querySelectorAll('.btl-policy-node').length===2")
        print("Feature parent/child tree OK"); fflush(stdout)
        _ = try await evaluate(web, "await window.FeatureUI.enter('achievements','2026-10-29'); await window.FeatureUI.action('add'); return true;")
        _ = try await evaluate(web, "const input=document.querySelector('.modal input'); input.value='第一次完整专注'; input.dispatchEvent(new Event('input')); document.querySelector('.modal .mod-cta').click(); return true;")
        try await wait(web, "JSON.parse(await window.webkit.messageHandlers.vault.postMessage({op:'read',path:'shared.json'})).achievements?.some(c=>c.name==='第一次完整专注')")
        _ = try await evaluate(web, "await window.FeatureUI.enter('projects','2026-10-29','p.md','week'); return document.getElementById('app').innerText;")
        try await healthy(web, "project detail")
        _ = try await evaluate(web, "await window.FeatureUI.enter('rhythm','2026-10-29'); return true;")
        print("Feature achievement and project detail OK"); fflush(stdout)
        let rhythm = try await evaluate(web, "return document.querySelectorAll('.btl-rhythm-row').length;") as? Int ?? 0
        precondition(rhythm >= 2, "Missing wake/sleep editor")
        _ = try await evaluate(web, "document.querySelector('.btl-rhythm-row-time').click(); return true;")
        try await healthy(web, "rhythm wheel")
        _ = try await evaluate(web, "await window.FeatureUI.enter('settings','2026-10-29'); return true;")
        try await healthy(web, "settings")
        _ = try await evaluate(web, "[...document.querySelectorAll('.setting-item button')].find(b=>b.textContent==='Obsidian %%').click(); return true;")
        try await wait(web, "JSON.parse(await window.webkit.messageHandlers.vault.postMessage({op:'read',path:'.obsidian/plugins/branch-timeline-hz/data.json'})).pluginCommentStyle==='obsidian'")
        _ = try await evaluate(web, "await window.FeatureUI.action('undo'); return true;")
        let originalConfig = try vault.read(".obsidian/plugins/branch-timeline-hz/data.json")
        let decodedConfig = try JSONSerialization.jsonObject(with: Data(originalConfig.utf8)) as! [String: Any]
        precondition(decodedConfig["pluginCommentStyle"] == nil)
        if let index = CommandLine.arguments.firstIndex(of: "--feature-previews"), CommandLine.arguments.count > index + 1 {
            let destination = URL(fileURLWithPath: CommandLine.arguments[index + 1]); try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            for route in ["policy", "rhythm", "settings", "life", "projects"] {
                web.setFrameSize(route == "rhythm" ? NSSize(width: 310, height: 390) : NSSize(width: 500, height: 650))
                _ = try await evaluate(web, "document.querySelectorAll('.btl-rhythm-popover').forEach(e=>e.remove()); await window.FeatureUI.enter(route,'2026-10-29'); await new Promise(r=>setTimeout(r,120)); return true;", ["route": route])
                let image = try await web.takeSnapshot(configuration: nil)
                if let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) { try png.write(to: destination.appendingPathComponent(route + ".png")) }
            }
        }
        _ = try await evaluate(web, "window.FeatureUI.shutdown(); return true;")
        print("Offline feature routes, anchor create/undo, achievement create, project detail, rhythm editor and shared-field preservation OK")
    }
    private static func evaluate(_ web: WKWebView, _ body: String, _ arguments: [String: Any] = [:]) async throws -> Any {
        try await withCheckedThrowingContinuation { continuation in
            web.callAsyncJavaScript(body, arguments: arguments, in: nil, in: .page) { result in continuation.resume(with: result) }
        }
    }
    private static func healthy(_ web: WKWebView, _ route: String) async throws {
        let error = try await evaluate(web, "return window.FeatureUI.diagnostics().error || document.querySelector('.btl-state-error')?.textContent || ''; ") as? String ?? ""
        guard error.isEmpty else { throw SharedStateError.script(route + ": " + error) }
    }
    private static func wait(_ web: WKWebView, _ expression: String) async throws {
        let success = try await evaluate(web, "for(let i=0;i<8;i++){if(\(expression))return true; await new Promise(r=>setTimeout(r,50));} return false;") as? Bool ?? false
        guard success else { try await healthy(web, "save"); throw SharedStateError.script("Fixture save timed out") }
    }
}

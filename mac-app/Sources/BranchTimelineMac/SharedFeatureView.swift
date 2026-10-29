import AppKit
import SwiftUI
import WebKit
import TimelineCore

struct SharedFeatureView: NSViewRepresentable {
    @ObservedObject var model: AppModel
    let route: String
    var projectPath: String? = nil
    var diagnosticVault: FeatureVault? = nil
    var onReady: ((WKWebView) -> Void)? = nil
    func makeCoordinator() -> Coordinator { Coordinator(model: model, override: diagnosticVault, onReady: onReady) }
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "vault")
        let web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = context.coordinator
        web.setValue(false, forKey: "drawsBackground"); context.coordinator.web = web
        do { let page = try FeatureResources.page(); context.coordinator.root = page.deletingLastPathComponent(); web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent()) }
        catch { model.error = error.localizedDescription }
        return web
    }
    func updateNSView(_ web: WKWebView, context: Context) {
        context.coordinator.enter(route: route, date: dayKey(model.focusDate), scope: model.scope, project: projectPath, command: model.featureCommand)
    }
    static func dismantleNSView(_ web: WKWebView, coordinator: Coordinator) {
        web.evaluateJavaScript("window.FeatureUI?.shutdown()")
        web.configuration.userContentController.removeScriptMessageHandler(forName: "vault", contentWorld: .page)
        web.stopLoading(); coordinator.web = nil
    }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
        let model: AppModel
        let override: FeatureVault?
        var onReady: ((WKWebView) -> Void)?
        weak var web: WKWebView?
        var root: URL?
        private var ready = false, desiredRoute = "policy", date = "", scope = "day", project: String?
        private var applied = "", commandID: UUID?
        init(model: AppModel, override: FeatureVault?, onReady: ((WKWebView) -> Void)?) { self.model = model; self.override = override; self.onReady = onReady; commandID = model.featureCommand?.id }
        private var vault: FeatureVault? { override ?? model.storage.map(FeatureVault.init) }
        func enter(route: String, date: String, scope: String, project: String?, command: FeatureCommand?) {
            desiredRoute = route; self.date = date; self.scope = scope; self.project = project
            apply()
            if ready, let command, command.id != commandID {
                commandID = command.id; evaluate("void window.FeatureUI.action(\(json(command.action)))")
            }
        }
        private func apply() {
            guard ready else { return }
            let key = desiredRoute + ":" + date + ":" + scope + ":" + (project ?? "")
            guard applied != key else { return }; applied = key
            evaluate("void window.FeatureUI.enter(\(json(desiredRoute)),\(json(date)),\(json(project)),\(json(scope)))")
        }
        private func evaluate(_ script: String) { web?.evaluateJavaScript(script) { [weak self] _, error in if let error { self?.model.error = error.localizedDescription } } }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let url = navigationAction.request.url
            decisionHandler(url?.isFileURL == true && url!.path.hasPrefix(root?.path ?? "\0") ? .allow : .cancel)
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, message.webView?.url?.isFileURL == true, let request = message.body as? [String: Any], let op = request["op"] as? String else { replyHandler(nil, "无效的本地请求"); return }
            do {
                guard let vault else { throw SharedStateError.missing }
                let path = request["path"] as? String ?? ""
                var result: Any = NSNull()
                switch op {
                case "catalog": result = try vault.catalog()
                case "read": result = try vault.read(path)
                case "exists": result = try vault.exists(path)
                case "write":
                    guard let text = request["text"] as? String else { throw SharedStateError.invalid }
                    try vault.write(path, text: text, expected: request["expected"] as? String)
                case "mkdir": try vault.makeFolder(path)
                case "trash":
                    guard let expected = request["expected"] as? String else { throw SharedStateError.invalid }
                    try vault.trash(path, expected: expected)
                case "open": if override == nil { model.openProject(path) }
                case "changed": if override == nil { model.refreshShared(); model.refreshDashboard(); model.refreshConnection() }
                case "status": model.featureCanUndo = request["canUndo"] as? Bool ?? false
                case "ready":
                    ready = true; apply()
                    if let command = model.featureCommand, command.id != commandID { commandID = command.id; evaluate("void window.FeatureUI.action(\(json(command.action)))") }
                    if let web { DispatchQueue.main.async { self.onReady?(web) } }
                default: throw SharedStateError.script("不支持的本地操作")
                }
                replyHandler(result, nil)
            } catch { replyHandler(nil, error.localizedDescription) }
        }
        private func json(_ value: String?) -> String { String(decoding: try! JSONEncoder().encode(value), as: UTF8.self) }
    }
}

import Foundation
import JavaScriptCore

final class SharedScript {
    private let context: JSContext
    init() throws {
        let packaged = Bundle.main.resourceURL.flatMap { Bundle(url: $0.appendingPathComponent("BranchTimelineMac_TimelineCore.bundle")) }
        let resource = Bundle.main.bundleURL.pathExtension == "app"
            ? packaged?.url(forResource: "shared-session", withExtension: "js")
            : Bundle.module.url(forResource: "shared-session", withExtension: "js")
        guard let context = JSContext(), let url = resource else {
            throw SharedStateError.script("共享逻辑资源缺失，请重新构建 App。")
        }
        self.context = context
        context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        if let error = context.exception { throw SharedStateError.script(error.toString()) }
    }
    func validate(_ text: String) throws {
        _ = try call("readSharedState", arguments: [text])
    }
    func finish(state: String, session: DesktopSession, settings: [String: Any], project: String, alreadyImported: Bool) throws -> [String: Any] {
        let sessionText = String(decoding: try ArchiveStore.encoder().encode(session), as: UTF8.self)
        let settingsText = String(decoding: try JSONSerialization.data(withJSONObject: settings), as: UTF8.self)
        let result = try call("finishSharedSession", arguments: [state, sessionText, settingsText, project, alreadyImported])
        guard let text = result.toString(), let value = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { throw SharedStateError.invalid }
        return value
    }
    private func call(_ name: String, arguments: [Any]) throws -> JSValue {
        context.exception = nil
        guard let result = context.objectForKeyedSubscript("BTLShared")?.invokeMethod(name, withArguments: arguments), context.exception == nil else {
            throw SharedStateError.script(context.exception?.toString() ?? "共享数据逻辑执行失败")
        }
        return result
    }
}

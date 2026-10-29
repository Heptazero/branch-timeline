import Foundation
public enum FeatureResources {
    public static func page() throws -> URL {
        let packaged = Bundle.main.resourceURL.flatMap { Bundle(url: $0.appendingPathComponent("BranchTimelineMac_TimelineCore.bundle")) }
        let url = Bundle.main.bundleURL.pathExtension == "app" ? packaged?.url(forResource: "features", withExtension: "html") : Bundle.module.url(forResource: "features", withExtension: "html")
        guard let url else { throw SharedStateError.script("完整功能资源缺失，请重新构建 App") }
        return url
    }
}

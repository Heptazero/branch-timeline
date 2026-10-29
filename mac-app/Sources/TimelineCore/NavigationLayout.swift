import Foundation

public enum NavigationDestination: String, CaseIterable, Codable, Identifiable {
    case timer, timeline, projects, stats, anchors, achievements, life
    public var id: String { rawValue }
    public var title: String {
        switch self { case .timer: return "计时"; case .timeline: return "时间线"; case .projects: return "项目"; case .stats: return "统计"; case .anchors: return "锚点"; case .achievements: return "成就"; case .life: return "人生" }
    }
    public var pageKey: String {
        switch self { case .timer, .timeline: return "day"; case .projects: return "projects"; case .stats: return "habits"; case .anchors: return "policy"; case .achievements: return "achievements"; case .life: return "life" }
    }
}
/// Local presentation preferences; never written into the shared timeline data.
public struct NavigationLayout: Codable, Equatable {
    public private(set) var order: [String]
    public private(set) var hidden: Set<String>
    public init(order: [String] = [], hidden: Set<String> = []) {
        let valid = Set(NavigationDestination.allCases.map(\.rawValue)); var seen = Set<String>()
        self.order = (order + NavigationDestination.allCases.map(\.rawValue)).filter { valid.contains($0) && seen.insert($0).inserted }
        self.hidden = hidden.intersection(valid)
    }
    public static func decode(_ text: String) -> Self {
        guard let value = try? JSONDecoder().decode(Self.self, from: Data(text.utf8)) else { return Self() }
        return Self(order: value.order, hidden: value.hidden)
    }
    public var encoded: String { (try? JSONEncoder().encode(self)).map { String(decoding: $0, as: UTF8.self) } ?? "" }
    public func enabled(_ pages: Set<String>) -> [NavigationDestination] {
        order.compactMap(NavigationDestination.init(rawValue:)).filter { $0 == .timer || pages.contains($0.pageKey) }
    }
    public func visible(width: Double, pages: Set<String>) -> [NavigationDestination] {
        let safe = width.isFinite ? max(0, width) : 380
        let capacity = max(1, Int(min(10_000, max(0, safe - 40)) / 68) - 1)
        return Array(enabled(pages).filter { !hidden.contains($0.rawValue) }.prefix(capacity))
    }
    public func overflow(width: Double, pages: Set<String>) -> [NavigationDestination] {
        let shown = Set(visible(width: width, pages: pages)); return enabled(pages).filter { !shown.contains($0) }
    }
    public mutating func hide(_ destination: NavigationDestination) { hidden.insert(destination.rawValue) }
    public mutating func restore(_ destination: NavigationDestination) {
        hidden.remove(destination.rawValue); order.removeAll { $0 == destination.rawValue }; order.insert(destination.rawValue, at: 0)
    }
    public mutating func move(_ source: NavigationDestination, to destination: NavigationDestination) {
        guard source != destination, let from = order.firstIndex(of: source.rawValue), let to = order.firstIndex(of: destination.rawValue) else { return }
        order.remove(at: from); order.insert(source.rawValue, at: min(to, order.count))
    }
}

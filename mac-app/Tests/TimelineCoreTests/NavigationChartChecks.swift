import Foundation
import TimelineCore

extension CoreTests {
    func testResponsiveNavigationPreservesOrderingAndManualHiding() {
        let pages = Set(["day", "projects", "habits", "policy", "achievements", "life"])
        var layout = NavigationLayout()
        precondition(layout.visible(width: 380, pages: pages) == [.timer, .timeline, .projects, .stats])
        precondition(layout.visible(width: 540, pages: pages).count == 6)
        precondition(layout.visible(width: 900, pages: pages).count == 7)
        layout.move(.anchors, to: .timer)
        precondition(layout.visible(width: 380, pages: pages).first == .anchors)
        layout.hide(.anchors)
        precondition(!layout.visible(width: 900, pages: pages).contains(.anchors))
        precondition(layout.overflow(width: 900, pages: pages) == [.anchors])
        precondition(NavigationLayout.decode(layout.encoded) == layout)
        layout.restore(.anchors)
        precondition(layout.visible(width: 380, pages: pages).first == .anchors)
        precondition(!layout.overflow(width: 380, pages: pages).contains(.anchors))
        precondition(!layout.enabled(Set(["day", "projects"])).contains(.anchors))
        let invalid = NavigationLayout(order: ["bad", "timer", "timer"], hidden: ["bad"])
        precondition(invalid.order.count == 7 && invalid.hidden.isEmpty)
        precondition(NavigationLayout.decode("broken").order.count == 7)
        precondition(layout.visible(width: .nan, pages: pages).count >= 1)
    }
    func testProjectChartsShareAggregationFractionsAndSort() {
        let values = [ProjectTimeValue(id: "p", name: "项目", color: "#123456", minutes: 60),
                      ProjectTimeValue(id: "q", name: "阅读", color: "#654321", minutes: 60),
                      ProjectTimeValue(id: "p", name: "项目", color: "#123456", minutes: 60),
                      ProjectTimeValue(id: "", name: "未关联项目", color: "#999999", minutes: 60)]
        let descending = ProjectComposition(values: values, descending: true)
        precondition(descending.total == 240 && descending.slices.count == 3)
        precondition(descending.slices.first?.id == "p" && descending.slices.first?.minutes == 120)
        precondition(descending.slices.first?.fraction == 0.5)
        precondition(descending.slices.first?.start == 0 && descending.slices.last?.end == 1)
        precondition(descending.slices.map(\.fraction).reduce(0, +) == 1)
        let ascending = ProjectComposition(values: values, descending: false)
        precondition(ascending.slices.last?.id == "p" && ascending.total == descending.total)
        precondition(ascending.slices.first?.color == "#999999")
        let empty = ProjectComposition(values: [ProjectTimeValue(id: "bad", name: "bad", color: "", minutes: .nan), ProjectTimeValue(id: "zero", name: "zero", color: "", minutes: 0)], descending: true)
        precondition(empty.total == 0 && empty.slices.isEmpty)
        let single = ProjectComposition(values: [values[0]], descending: true)
        precondition(single.slices[0].start == 0 && single.slices[0].end == 1)
    }
}

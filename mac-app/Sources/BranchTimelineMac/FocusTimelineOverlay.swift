import SwiftUI
import TimelineCore

struct FocusTimelineOverlay: View {
    let context: DayFocusContext?
    let scale: Double
    let actualFraction: Double
    let onOpen: (FocusPoint) -> Void
    private func y(_ minute: Double) -> Double { (minute - 120) * scale + 18 }
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            ZStack(alignment: .topLeading) {
                if let context {
                    let forecast = context.forecast
                    if !forecast.isEmpty {
                        LinearGradient(stops: forecast.map { .init(color: Color(hex: $0.color), location: min(1, max(0, ($0.minute - 120) / 1440))) }, startPoint: .top, endPoint: .bottom)
                            .frame(width: 4, height: 1440 * scale).clipShape(Capsule()).offset(x: width - 6, y: 18)
                            .help(forecast.contains { $0.ready } ? "历史记录推算的专注倾向" : "记录不足，灰线表示暂无可靠预测")
                            .accessibilityLabel("历史专注倾向预测线")
                    }
                    ForEach(context.marks) { point in
                        Button { onOpen(point) } label: {
                            Group {
                                if point.kind == "mental" { RoundedRectangle(cornerRadius: 1).fill(Color(hex: point.color)).frame(width: 8, height: 8).rotationEffect(.degrees(45)) }
                                else { Circle().fill(Color(hex: point.color)).frame(width: point.level == "heavy" ? 9 : point.level == "medium" ? 7 : 6, height: point.level == "heavy" ? 9 : point.level == "medium" ? 7 : 6) }
                            }.frame(width: 22, height: 20).contentShape(Rectangle())
                        }.buttonStyle(.plain).help("\(point.label) · \(minuteLabel(point.minute))\(point.kind == "mental" ? " · \(Int(point.score))/100" : "")")
                            .accessibilityLabel("\(point.label)，\(minuteLabel(point.minute))")
                            .offset(x: max(0, width * actualFraction - (point.kind == "mental" ? 40 : point.kind == "good" ? 24 : 11)), y: y(point.minute) - 10)
                        Rectangle().fill(Color(hex: point.color)).frame(width: 8, height: 2).offset(x: width - 12, y: y(point.minute) - 1).allowsHitTesting(false)
                    }
                }
            }
        }
    }
}

import SwiftUI
import TimelineCore

private struct PhaseDrag: Equatable { let id: String; let minute: Double }
struct EnergyTimelineLayer<Content: View>: View {
    let phases: [EnergyPhase]
    let scale: Double
    let revision: String
    let onEdit: (EnergyPhase) -> Void
    let onMove: (EnergyPhase, Double, String) -> Void
    @ViewBuilder let content: () -> Content
    @GestureState private var drag: PhaseDrag?
    @State private var grabbed: (EnergyPhase, String)?
    private var values: [(EnergyPhase, Double)] { phases.map { ($0, drag?.id == $0.id ? drag!.minute : $0.at) } }
    private func y(_ minute: Double) -> Double { (minute - 120) * scale + 18 }
    private func moved(_ phase: EnergyPhase, delta: Double) -> Double {
        let ordered = phases.sorted { $0.at < $1.at }, index = ordered.firstIndex { $0.id == phase.id } ?? 0
        let lower = index > 0 ? ordered[index - 1].at + 5 : 120, upper = index + 1 < ordered.count ? ordered[index + 1].at - 5 : 1560
        return min(upper, max(lower, ((phase.at + delta / scale) / 5).rounded() * 5))
    }
    var body: some View {
        ZStack(alignment: .topLeading) {
            GeometryReader { geometry in
                ForEach(Array(values.enumerated()), id: \.element.0.id) { index, value in
                    let start = max(120, value.1), end = min(1560, index + 1 < values.count ? values[index + 1].1 : 1560)
                    if end > start {
                        Rectangle().fill(Color(hex: value.0.color).opacity(0.055)).frame(width: geometry.size.width, height: (end - start) * scale).offset(y: y(start)).allowsHitTesting(false)
                    }
                }
            }.allowsHitTesting(false)
            content()
            ForEach(values, id: \.0.id) { phase, minute in
                if minute >= 120 && minute <= 1560 {
                    HStack(spacing: 3) {
                        Capsule().fill(Color(hex: phase.color).opacity(drag?.id == phase.id ? 1 : 0.55)).frame(width: 17, height: 3)
                            .frame(width: 28, height: 22).contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 3).updating($drag) { value, state, _ in
                                state = PhaseDrag(id: phase.id, minute: moved(grabbed?.0 ?? phase, delta: value.translation.height))
                            }.onChanged { _ in if grabbed == nil { grabbed = (phase, revision) } }
                            .onEnded { value in
                                let source = grabbed ?? (phase, revision)
                                onMove(source.0, moved(source.0, delta: value.translation.height), source.1); grabbed = nil
                            })
                            .help("拖动精力分界").accessibilityLabel("拖动\(phase.name)分界")
                        Text(phase.name).font(.system(size: 9)).lineLimit(1).foregroundStyle(Color(hex: phase.color)).allowsHitTesting(false)
                        Rectangle().fill(Color(hex: phase.color).opacity(0.23)).frame(height: 1).allowsHitTesting(false)
                        if drag?.id == phase.id { Text(minuteLabel(minute)).font(.system(size: 9)).monospacedDigit().allowsHitTesting(false) }
                        Button { onEdit(phase) } label: { Image(systemName: "ellipsis").rotationEffect(.degrees(90)).font(.system(size: 9)).frame(width: 20, height: 22).contentShape(Rectangle()) }
                            .buttonStyle(.plain).foregroundStyle(Color(hex: phase.color)).help("编辑\(phase.name)")
                    }.offset(y: y(minute) - 11)
                }
            }
        }.onChange(of: drag == nil) { ended in if ended { DispatchQueue.main.async { grabbed = nil } } }
            .onDisappear { grabbed = nil }
    }
}

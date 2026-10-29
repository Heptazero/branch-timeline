import SwiftUI
import TimelineCore

struct ProjectCompositionChart: View {
    let composition: ProjectComposition
    let pie: Bool
    let model: AppModel
    @State private var selected: String?
    private var selection: ProjectTimeSlice? { composition.slices.first { $0.id == selected } }
    var body: some View {
        VStack(spacing: pie ? 18 : 12) {
            if pie {
                ZStack {
                    if composition.slices.isEmpty { Circle().stroke(.primary.opacity(0.06), lineWidth: 30) }
                    ForEach(composition.slices) { slice in
                        let gap = composition.slices.count > 1 ? min(0.003, slice.fraction / 8) : 0
                        CompositionRing(start: slice.start + gap, end: slice.end - gap)
                            .fill(Color(hex: slice.color).opacity(selected == nil || selected == slice.id ? 0.9 : 0.25))
                            .contentShape(CompositionRing(start: slice.start + gap, end: slice.end - gap))
                            .onTapGesture { toggle(slice) }
                            .help("\(slice.name) · \(hoursLabel(slice.minutes)) · \(percent(slice))")
                            .accessibilityLabel("\(slice.name)，\(percent(slice))，\(hoursLabel(slice.minutes))")
                    }
                    VStack(spacing: 5) {
                        Text(selection?.name ?? "总计").font(.caption).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.center)
                        Text(hoursLabel(selection?.minutes ?? composition.total)).font(.system(size: 30, weight: .medium, design: .rounded)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                        if let selection { Text(percent(selection)).font(.caption).monospacedDigit().foregroundStyle(.secondary) }
                    }.frame(width: 132).allowsHitTesting(false)
                }.frame(width: 238, height: 238).padding(.vertical, 8)
            }
            ForEach(composition.slices) { slice in
                Button { toggle(slice) } label: {
                    VStack(spacing: 7) {
                        HStack(spacing: 8) {
                            Circle().fill(Color(hex: slice.color)).frame(width: 7, height: 7)
                            Text(slice.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                            Text(hoursLabel(slice.minutes)).monospacedDigit()
                            Text(percent(slice)).font(.caption).monospacedDigit().foregroundStyle(.secondary).frame(width: 38, alignment: .trailing)
                        }
                        if !pie {
                            GeometryReader { geometry in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 5).fill(.primary.opacity(0.045))
                                    RoundedRectangle(cornerRadius: 5).fill(Color(hex: slice.color).opacity(0.85))
                                        .frame(width: geometry.size.width * slice.minutes / max(1, composition.slices.map(\.minutes).max() ?? 1))
                                }
                            }.frame(height: 22)
                        }
                    }.padding(.vertical, 5).padding(.horizontal, 6)
                        .background(selected == slice.id ? AppPalette.blue.opacity(0.06) : .clear, in: RoundedRectangle(cornerRadius: 7))
                        .contentShape(Rectangle())
                }.buttonStyle(.plain).contextMenu {
                    if !slice.id.isEmpty {
                        Button("项目详情") { model.projectDetailPath = slice.id; model.selectPage(.projects) }
                        Button("在 Obsidian 打开项目文件") { model.openProject(slice.id) }
                    }
                }
            }
        }.onChange(of: composition.slices.map(\.id)) { ids in if let selected, !ids.contains(selected) { self.selected = nil } }
    }
    private func toggle(_ slice: ProjectTimeSlice) { withAnimation(.easeInOut(duration: 0.15)) { selected = selected == slice.id ? nil : slice.id } }
    private func percent(_ slice: ProjectTimeSlice) -> String { slice.fraction < 0.01 ? "<1%" : "\(Int((slice.fraction * 100).rounded()))%" }
}
private struct CompositionRing: Shape {
    let start, end: Double
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY), outer = min(rect.width, rect.height) / 2, inner = outer * 0.7
        let a = Angle.degrees(start * 360 - 90), b = Angle.degrees(end * 360 - 90)
        var path = Path()
        path.addArc(center: center, radius: outer, startAngle: a, endAngle: b, clockwise: false)
        path.addArc(center: center, radius: inner, startAngle: b, endAngle: a, clockwise: true)
        path.closeSubpath(); return path
    }
}

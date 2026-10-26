import SwiftUI
import TimelineCore

struct TimerFace: View {
    let minutes: Int
    let elapsed: TimeInterval
    let editable: Bool
    let color: Color
    let onChange: (Int) -> Void
    private var fraction: Double { TimerDial.fraction(target: minutes, elapsed: elapsed) }
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height)
            ZStack {
                Canvas { context, canvas in
                    let center = CGPoint(x: canvas.width / 2, y: canvas.height / 2)
                    for index in 0..<60 {
                        let angle = Double(index) / 60 * 2 * Double.pi
                        let major = index % 5 == 0
                        let outer = size * 0.47, inner = outer - (major ? size * 0.065 : size * 0.026)
                        var tick = Path()
                        tick.move(to: CGPoint(x: center.x + sin(angle) * inner, y: center.y - cos(angle) * inner))
                        tick.addLine(to: CGPoint(x: center.x + sin(angle) * outer, y: center.y - cos(angle) * outer))
                        context.stroke(tick, with: .color(.primary.opacity(major ? 0.42 : 0.15)), lineWidth: major ? 3 : 2)
                    }
                }
                Circle().fill(color.opacity(0.20)).frame(width: size * 0.67, height: size * 0.67)
                if fraction > 0 {
                    DialSector(fraction: fraction).fill(LinearGradient(colors: [color.opacity(0.73), color.opacity(0.93)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: size * 0.67, height: size * 0.67)
                }
                Capsule().fill(color).frame(width: size * 0.032, height: size * 0.48)
                    .offset(y: -size * 0.21).rotationEffect(.degrees(fraction * 360))
                    .shadow(color: color.opacity(0.25), radius: size * 0.018, y: size * 0.012)
                Circle().fill(AppPalette.surface).frame(width: size * 0.135, height: size * 0.135)
                    .overlay { Circle().strokeBorder(color.opacity(0.17), lineWidth: size * 0.014) }
                    .shadow(color: .black.opacity(0.16), radius: size * 0.016, y: size * 0.007)
            }.frame(width: geometry.size.width, height: geometry.size.height)
                .contentShape(Circle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                    guard editable else { return }
                    let dx = value.location.x - geometry.size.width / 2, dy = value.location.y - geometry.size.height / 2
                    guard hypot(dx, dy) >= size * 0.10, let next = TimerDial.minutes(x: dx / size, y: dy / size) else { return }
                    if next != minutes { onChange(next) }
                })
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(minutes > 0 ? "倒计时 \(minutes) 分钟" : "正计时")
                .accessibilityValue(clockLabel(TimerDial.displaySeconds(target: minutes, elapsed: elapsed)))
                .accessibilityAdjustableAction { direction in
                    guard editable else { return }
                    onChange(min(1440, max(0, minutes + (direction == .increment ? 5 : -5))))
                }
        }.aspectRatio(1, contentMode: .fit)
    }
}

private struct DialSector: Shape {
    let fraction: Double
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path(); path.move(to: center)
        path.addArc(center: center, radius: min(rect.width, rect.height) / 2, startAngle: .degrees(-90), endAngle: .degrees(-90 + 360 * fraction), clockwise: false)
        path.closeSubpath(); return path
    }
}

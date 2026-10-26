import Foundation

public enum TimerDial {
    /// Clockwise from twelve; the twelve-o'clock detent is always count-up.
    public static func minutes(x: Double, y: Double) -> Int? {
        guard x.isFinite, y.isFinite, hypot(x, y) > 0.1 else { return nil }
        let turn = (atan2(x, -y) + 2 * Double.pi).truncatingRemainder(dividingBy: 2 * Double.pi)
        return Int((turn / (2 * Double.pi) * 60 / 5).rounded()) * 5 % 60
    }
    public static func displaySeconds(target: Int, elapsed: TimeInterval) -> TimeInterval {
        target > 0 ? max(0, Double(target * 60) - elapsed) : max(0, elapsed)
    }
    public static func fraction(target: Int, elapsed: TimeInterval) -> Double {
        target > 0 ? min(1, max(0, (Double(target * 60) - elapsed) / 3600)) : min(1, max(0, elapsed / 3600))
    }
}

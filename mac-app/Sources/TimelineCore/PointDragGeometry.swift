import Foundation

public enum PointDragGeometry {
    /// Translation must be in the fixed document coordinate space, not the moving point.
    public static func minute(start: Double, translation: Double, scale: Double) -> Double {
        guard start.isFinite, translation.isFinite, scale.isFinite, scale > 0 else { return start }
        return min(1560, max(120, (start + translation / scale).rounded()))
    }
}

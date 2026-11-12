import Foundation

extension SharedStateStore {
    /// A moved vault keeps its configured data file and the previous timer owner in that file.
    @discardableResult public func recoverRelocatedTimer(
        rememberedRoot: String?, explicitlySelected: Bool = false, now: Date = Date()
    ) throws -> String? {
        let (_, snapshot) = try read()
        guard let owner = displacedTimerOwner(in: snapshot) else { return nil }
        guard explicitlySelected || owner == rememberedRoot else { return nil }

        return try SharedFileLock.withLock(file: url) {
            let (before, original) = try read()
            guard let currentOwner = displacedTimerOwner(in: original) else { return nil }
            guard owner == currentOwner else { throw SharedStateError.conflict }
            try verifyPreviousVaultIsMissing(owner)

            var state = original
            guard var timer = state["macTimer"] as? [String: Any],
                  var raw = timer["active"] as? [String: Any],
                  let checkpointText = timer["checkpoint"] as? String else { throw SharedStateError.invalid }
            let decoder = ArchiveStore.decoder()
            let active = try decoder.decode(DesktopSession.self, from: JSONSerialization.data(withJSONObject: raw))
            let checkpoint = try decoder.decode(Date.self, from: JSONEncoder().encode(checkpointText))
            guard active.version == 1, active.endedAt == nil, let last = active.segments.last else { throw SharedStateError.invalid }
            _ = try readLearningReviews(original)
            raw["vaultPath"] = bridge.root.path
            if last.end == nil {
                guard var segments = raw["segments"] as? [[String: Any]] else { throw SharedStateError.invalid }
                let stoppedAt = max(last.start, min(checkpoint, now))
                let encoded = try ArchiveStore.encoder().encode(stoppedAt)
                segments[segments.count - 1]["end"] = try JSONSerialization.jsonObject(with: encoded, options: .fragmentsAllowed)
                raw["segments"] = segments
            }
            timer["active"] = raw
            state["macTimer"] = timer
            try write(state, expected: before)
            return owner
        }
    }

    private func displacedTimerOwner(in state: [String: Any]) -> String? {
        let timer = state["macTimer"] as? [String: Any]
        let active = timer?["active"] as? [String: Any]
        guard let owner = active?["vaultPath"] as? String, owner != bridge.root.path else { return nil }
        return owner
    }

    private func verifyPreviousVaultIsMissing(_ path: String) throws {
        guard path.hasPrefix("/"), URL(fileURLWithPath: path).standardizedFileURL.path == path else {
            throw SharedStateError.invalid
        }
        do {
            _ = try FileManager.default.attributesOfItem(atPath: path)
        } catch let error as CocoaError where [.fileNoSuchFile, .fileReadNoSuchFile].contains(error.code) {
            return
        }
        throw SharedStateError.script("未结束的计时仍属于旧笔记库，且旧位置仍可访问。请先在旧库结束该计时。")
    }
}

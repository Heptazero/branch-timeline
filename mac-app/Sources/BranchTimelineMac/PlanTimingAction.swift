import Foundation
import TimelineCore

extension AppModel {
    func executePlan(_ item: DashboardItem, date: String) {
        guard item.plan == true, let revision = item.revision else { error = "计划已变化，请刷新后重试"; return }
        do { try startPlan(id: item.id, date: date, revision: revision) }
        catch is LearningRecallPending { return }
        catch { self.error = error.localizedDescription }
    }

    func startPlan(id: String, date: String, revision: String) throws {
        guard let storage else { throw SharedStateError.missing }
        guard active == nil else { throw SharedStateError.script("请先结束或取消当前计时") }
        let session = try storage.startPlan(date: date, id: id, revision: revision, minimumRecordSeconds: RecordingPolicy.load()) { path in
            let enabled = learningProjects.contains(path)
            if presentLearningRecall(path: path, enabled: enabled) { throw LearningRecallPending() }
            return enabled ? LearningReviewPolicy.load() : nil
        }
        selectedPath = session.projectPath; title = session.title
        now = Date(); refreshShared(); page = .timer; error = nil
        if !projects.contains(where: { $0.path == session.projectPath }) { refreshProjects() }
    }
}

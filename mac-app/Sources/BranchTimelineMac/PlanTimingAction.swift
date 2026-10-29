import Foundation
import TimelineCore

extension AppModel {
    func executePlan(_ item: DashboardItem, date: String) {
        guard let storage, active == nil else { error = "请先结束或取消当前计时"; return }
        guard item.plan == true, let revision = item.revision else { error = "计划已变化，请刷新后重试"; return }
        do {
            let session = try storage.startPlan(date: date, id: item.id, revision: revision)
            selectedPath = session.projectPath; title = session.title; targetMinutes = session.targetMinutes
            now = Date(); refreshShared(); page = .timer; error = nil
            if !projects.contains(where: { $0.path == session.projectPath }) { refreshProjects() }
        } catch { self.error = error.localizedDescription }
    }
}

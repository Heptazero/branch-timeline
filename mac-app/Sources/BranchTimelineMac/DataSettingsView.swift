import SwiftUI
import TimelineCore

struct DataSettingsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                RecordingSettingsSection()
                Divider()
                HStack {
                    Text("数据与 Obsidian").font(.title2.weight(.medium))
                    Spacer()
                    Button { model.refreshConnection() } label: { Image(systemName: "arrow.clockwise") }.help("重新核对磁盘配置")
                }
                if let info = model.connection {
                    Label(info.consistent ? "与磁盘配置一致" : "有配置需要检查", systemImage: info.consistent ? "checkmark.circle.fill" : "exclamationmark.circle")
                        .foregroundStyle(info.consistent ? .green : .orange)
                    VStack(alignment: .leading, spacing: 16) {
                        path("App 正在使用", info.appPath)
                        path("Obsidian 配置", info.configuredPath)
                        path("笔记库", info.vaultPath)
                        HStack {
                            Button("在 Finder 显示") { model.revealDataFile() }
                            Button("更换数据文件") { model.chooseDataFile(); model.refreshConnection() }.disabled(model.active != nil)
                        }
                    }
                    Divider()
                    VStack(alignment: .leading, spacing: 13) {
                        Text("共用配置").font(.headline)
                        comparison("数据文件", info.sameFile ? "同一个文件" : "路径不同，当前保存会停止", info.sameFile)
                        comparison("项目类型配置", info.catalogMatches ? info.projectTypes : "配置已变化，请刷新项目", info.catalogMatches)
                        comparison("插件字段兼容", "磁盘版本 " + info.pluginVersion, info.compatiblePlugin)
                        HStack { Text("日志注释"); Spacer(); Text(info.comments).foregroundStyle(.secondary) }
                        HStack { Text("逻辑日分界"); Spacer(); Text("02:00").foregroundStyle(.secondary) }
                        Button("刷新项目与配置") { model.refreshProjects(); model.refreshConnection() }
                    }
                    Text("对照的是本机磁盘配置，不表示其他设备已同步。").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(model.error ?? "尚未连接数据文件").foregroundStyle(.secondary).textSelection(.enabled)
                    Button("连接原时间线数据") { model.chooseDataFile(); model.refreshConnection() }.disabled(model.active != nil)
                }
                Button("全部功能设置") { model.openFeature("settings"); AppWindows.shared.showMain() }
                Divider()
                HStack { Text("Branch Timeline"); Spacer(); Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "开发版").foregroundStyle(.secondary) }
            }.padding(24)
        }.background(AppPalette.surface).frame(minWidth: 460, minHeight: 520).onAppear { model.refreshConnection() }
    }
    private func path(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }
    }
    private func comparison(_ title: String, _ value: String, _ matches: Bool) -> some View {
        HStack(alignment: .top) {
            Text(title)
            Spacer()
            Text(value).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
            Image(systemName: matches ? "checkmark" : "exclamationmark.triangle").foregroundStyle(matches ? .green : .orange)
        }
    }
}

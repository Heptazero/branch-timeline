# Branch Timeline Handoff

## Goal

把旧网页时间轴迁成直接读写 Vault 原生格式的 Obsidian 插件。

## Current

- 插件显示名：`Branch Timeline`；ID：`branch-timeline-hz`，已核实未与社区插件列表重名。
- 插件直接位于 `.obsidian/plugins/branch-timeline-hz/`，桌面与移动端均可加载。
- ItemView 已有日期导航、时间轴、习惯条和右上角添加菜单。
- 命令已支持习惯打卡、项目工时、分类时长、项目待办。
- 周记格式：`20_self/22-diary/YY_WN.md` + `## Day_YY-MM-DD`。
- 项目格式：`type: project`；工时写入 `## log`，待办写入 `## 任务` 并附稳定 block ID。
- 插件独有状态：`99_assets/branch-timeline/state.json`。
- 首页分类统计已兼容旧 `[N]` 与新 `[+N]`，按日、分类聚合。
- 标签改为可持久化的对象列表，支持新增、重命名、周记键映射、改色和删除；旧 `tagMap` 自动迁移，删除后不会被默认值恢复。
- 新时间记录同时保存稳定 `tagId` 与名称快照；标签改名会更新显示，删除标签不删除历史记录。
- `npm run check` 通过，6/6 格式测试通过。

## Next

1. 在 Obsidian 内重载并验证真实写入与移动端布局。
2. 把旧网页的拖动分支、事实/代办菜单和缩放逐步迁入 ItemView。
3. 再迁移决策树；不恢复项目/习惯独立总览页。

## Do not

- 不迁移或覆盖旧网页 `data/*.json`。
- 不猜测专注、摸鱼、休息的日记分类映射。
- 不把 Site/D1 当作当前数据源。

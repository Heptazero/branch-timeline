# Branch Timeline Handoff

## Goal

把旧网页时间轴迁成直接读写 Vault 原生格式的 Obsidian 插件。

## Current

- 插件 ID：`branch-timeline-hz`，已核实未与社区插件列表重名。
- 插件直接位于 `.obsidian/plugins/branch-timeline-hz/`，桌面与移动端均可加载。
- ItemView 已有日期导航、时间轴、习惯条和右上角添加菜单。
- 命令已支持习惯打卡、项目工时、分类时长、项目待办。
- 周记格式：`20_self/22-diary/YY_WN.md` + `## Day_YY-MM-DD`。
- 项目格式：`type: project`；工时写入 `## log`，待办写入 `## 任务` 并附稳定 block ID。
- 插件独有状态：`99_assets/branch-timeline/state.json`。
- 首页分类统计已兼容旧 `[N]` 与新 `[+N]`，按日、分类聚合。
- 标签映射只预设 `工作→work`、`探索→explore`；其余留空。
- `npm run check` 通过，5/5 格式测试通过。

## Next

1. 在 Obsidian 内重载并验证真实写入与移动端布局。
2. 把旧网页的拖动分支、事实/代办菜单和缩放逐步迁入 ItemView。
3. 再迁移决策树；不恢复项目/习惯独立总览页。

## Do not

- 不迁移或覆盖旧网页 `data/*.json`。
- 不猜测专注、摸鱼、休息的日记分类映射。
- 不把 Site/D1 当作当前数据源。

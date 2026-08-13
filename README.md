# Branch Timeline

## 使用

重载 Obsidian 后，点击左侧的分支图标打开时间线。也可以在命令面板使用：

- 分支时间线：打开时间线
- 分支时间线：打卡习惯
- 分支时间线：记录项目工时
- 分支时间线：记录分类时长
- 分支时间线：添加项目待办

项目来自 `21_project/` 内 frontmatter 为 `type: project` 的笔记。插件独有数据保存在 `99_assets/branch-timeline/state.json`。

标签可在插件设置中新增、重命名、映射周记分类、改色和删除。删除标签不会删除已有时间记录。

## 开发

```bash
npm run dev
npm run check
npm run build
```

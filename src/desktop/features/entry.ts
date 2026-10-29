import { installDOM } from "./dom";
import { normalizeSettings } from "../../settings-state";
import { rpc, report } from "./rpc";
import { makeApp, type FeatureCatalog } from "./app-adapter";
import { FeaturePlugin } from "./plugin-adapter";
import { BranchTimelineView } from "../../timeline-view";
import { BranchTimelineSettingTab } from "../../settings";
import { ConfirmModal } from "../../modals";
import type { TimelinePage } from "../../types";

installDOM();
class DesktopFeatureView extends BranchTimelineView {
  protected override async render(preserve: boolean, anchor?: { minute: number; offset: number }): Promise<void> {
    const visible = this.plugin.settings.visiblePages;
    if (!visible.includes(this.page)) this.plugin.settings.visiblePages = [...visible, this.page];
    try { await super.render(preserve, anchor); }
    finally { this.plugin.settings.visiblePages = visible; }
    await rpc("status", { canUndo: this.plugin.undoManager.canUndo });
  }
  async enter(page: TimelinePage, date: string, path?: string, scope = "day"): Promise<void> {
    this.date = new Date(date + "T12:00:00"); this.followsToday = false; this.page = page;
    this.selectedProjectPath = page === "projects" ? path || null : null; this.selectedAchievementId = null;
    this.projectTimeScope = ["day", "week", "month", "total"].includes(scope) ? scope as any : "day";
    await this.render(true);
    if (page === "day" && path) {
      const element = this.contentEl.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(path)}"]`);
      element?.scrollIntoView({ block: "center" });
      const rect = element?.getBoundingClientRect(); this.openItemMenu(path, new MouseEvent("click", { clientX: rect?.right || innerWidth - 20, clientY: rect?.top || 20 }));
    }
  }
  startClock(): void {
    this.clockTimer = window.setInterval(() => { this.updateCountdown(); this.updateRunningBar(); this.updateTimelineClock(); this.projectView?.update?.(); }, 60_000);
  }
  add(): void {
    let anchor = document.getElementById("native-add-anchor");
    if (!anchor) { anchor = document.body.createEl("button", { attr: { id: "native-add-anchor", tabindex: "-1", "aria-hidden": "true" } }); Object.assign(anchor.style, { position: "fixed", right: "20px", top: "8px", opacity: "0", width: "1px", height: "1px", pointerEvents: "none" }); }
    anchor.onclick = event => this.openAddMenu(event);
    anchor.dispatchEvent(new MouseEvent("click", { clientX: innerWidth - 20, clientY: 8 }));
  }
  rhythm(): void { this.openRhythmSettings(this.contentEl.querySelector<HTMLElement>(".btl-day-countdown")!); }
}
let plugin: FeaturePlugin, view: DesktopFeatureView, route = "policy", selectedDate = "", interval: number | undefined;
let previousFingerprint = "", active = false, pendingRefresh = false;
const host = document.getElementById("app")!;
const ready = (async () => {
  const catalog = await rpc<FeatureCatalog>("catalog");
  const app = makeApp(catalog, () => { void enter("settings", selectedDate); });
  plugin = new FeaturePlugin(app, { ...catalog.settings, statePath: catalog.statePath });
  view = new DesktopFeatureView({ app, contentEl: host } as any, plugin.asPlugin());
  plugin.refresh = async () => {
    if (route === "settings") { await rpc("changed"); return; }
    await view.refresh(); await rpc("status", { canUndo: plugin.undoManager.canUndo });
  };
  view.startClock();
  interval = window.setInterval(() => void externalRefresh().catch(report), 5000);
  await rpc("ready");
})();
async function enter(nextRoute: string, date: string, project?: string, scope = "day"): Promise<void> {
  await ready; active = true; route = nextRoute; selectedDate = date; document.body.dataset.route = route; document.body.dataset.detail = project && route === "projects" ? "true" : "false";
  document.getElementById("error")!.hidden = true;
  if (route === "settings") {
    host.empty(); const tab = new BranchTimelineSettingTab(plugin.app, plugin.asPlugin()); tab.containerEl = host; tab.display();
    for (const input of host.querySelectorAll<HTMLInputElement>("input")) if (input.value === plugin.settings.statePath) { input.readOnly = true; input.title = "在 App 的数据设置中更换"; }
    const convert = host.createEl("button", { text: "转换已有日志标记", cls: "feature-convert" });
    convert.onclick = () => { void (async () => {
      const plan = await plugin.repository.previewPluginCommentConversion(plugin.settings.pluginCommentStyle);
      if (!plan.markerCount) return;
      new ConfirmModal(plugin.app, "转换插件标记？", `只转换 ${plan.markerCount} 个插件标记，保留正文。`, () => plugin.repository.applyPluginCommentConversion(plan)).open();
    })().catch(report); };
  } else {
    await view.enter((route === "rhythm" ? "day" : route) as TimelinePage, date, project, scope);
    if (route === "rhythm") view.rhythm();
  }
}
async function action(name: string): Promise<void> {
  await ready;
  if (name === "add" && route !== "settings" && route !== "rhythm") view.add();
  if (name === "refresh") {
    const catalog = await rpc<FeatureCatalog>("catalog"); (plugin.app as any).refreshCatalog(catalog);
    plugin.settings = normalizeSettings({ ...catalog.settings, statePath: catalog.statePath }); plugin.repository.updateSettings(plugin.settings);
    if (route === "settings") await enter(route, selectedDate); else await view.refresh();
  }
  if (name === "undo") await plugin.undoLast();
  if (name === "sync") plugin.checkProjectSync(selectedDate);
  if (name === "settings") await enter("settings", selectedDate);
  if (name === "rhythm") view.rhythm();
}
async function externalRefresh(): Promise<void> {
  if (!active || route === "settings") return;
  const state = await plugin.store.load() as unknown as Record<string, unknown>;
  const fingerprint = JSON.stringify({ ...state, macTimer: undefined, desktopReceipts: undefined });
  if (previousFingerprint && fingerprint !== previousFingerprint) pendingRefresh = true;
  previousFingerprint = fingerprint;
  if (pendingRefresh && !document.querySelector(".modal-container,.btl-rhythm-popover") && !document.activeElement?.matches("input,textarea")) { pendingRefresh = false; await view.refresh(); }
}
(window as any).FeatureUI = { enter: (next: string, date: string, path?: string, scope?: string) => enter(next, date, path, scope).catch(report), action: (name: string) => action(name).catch(report),
  shutdown: () => { if (interval) clearInterval(interval); void view?.onClose(); },
  diagnostics: () => ({ route, nodes: host.querySelectorAll(".btl-policy-node").length, ready: !!plugin, error: document.getElementById("error")!.hidden ? "" : document.getElementById("error")!.textContent }) };

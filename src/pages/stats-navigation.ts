export const STATS_VIEWS = [
  { id: "project", label: "项目排行" }, { id: "day", label: "每日趋势" },
  { id: "time", label: "一周时间" }, { id: "anchor", label: "锚点" }
] as const;

export type StatsView = typeof STATS_VIEWS[number]["id"];
export type StatsReturnView = Exclude<StatsView, "time">;

export interface StatsNavigation {
  view: StatsView;
  returnView: StatsReturnView;
}

export function restoreStatsNavigation(savedView: string | null, savedReturnView: string | null): StatsNavigation {
  const view = STATS_VIEWS.find(option => option.id === savedView)?.id || "project";
  const returnView = STATS_VIEWS.find(option => option.id === savedReturnView && option.id !== "time")?.id;
  return { view, returnView: view !== "time" ? view : returnView && returnView !== "time" ? returnView : "project" };
}

export function selectStatsView(state: StatsNavigation, view: StatsView): StatsNavigation {
  if (view === "time") return { view, returnView: state.view === "time" ? state.returnView : state.view };
  return { view, returnView: view };
}

export function toggleStatsTimeMap(state: StatsNavigation): StatsNavigation {
  return selectStatsView(state, state.view === "time" ? state.returnView : "time");
}

export function timeMapTogglePresentation(expanded: boolean): { text: string; label: string; icon: string; expanded: string } {
  return {
    text: expanded ? "收起时间图" : "时间图",
    label: expanded ? "收起一周时间图" : "展开一周时间图",
    icon: expanded ? "chevron-up" : "chevron-right",
    expanded: String(expanded)
  };
}

import { renderPageNavigation, type TimelinePage } from "../pages/navigation";

interface ViewHeaderOptions {
  root: HTMLElement;
  page: TimelinePage;
  dateTitle: string;
  visiblePages: readonly TimelinePage[];
  canUndo: boolean;
  disableDateNav: boolean;
  iconButton: (parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void) => HTMLButtonElement;
  onUndo: () => void;
  onSync: () => void;
  onShiftDate: (amount: number) => void;
  onDatePicker: (anchor: HTMLElement) => void;
  onSettings: () => void;
  onAdd: (event: MouseEvent) => void;
  onNavigate: (page: TimelinePage) => void;
  onRhythm: (anchor: HTMLElement) => void;
}

export function renderViewHeader(options: ViewHeaderOptions): {
  syncButton: HTMLButtonElement;
  countdownButton: HTMLButtonElement;
  runningHost: HTMLElement;
  pageContent: HTMLElement;
} {
  const { root, iconButton } = options;
  const toolbar = root.createDiv({ cls: "btl-toolbar" });
  const left = toolbar.createDiv({ cls: "btl-toolbar-left" });
  const undo = iconButton(left, "undo-2", "撤回", options.onUndo);
  undo.addClass("btl-undo-button");
  undo.disabled = !options.canUndo;
  const syncButton = iconButton(left, "cloud", "同步云", options.onSync);
  syncButton.addClass("btl-sync-cloud");

  const dateNav = toolbar.createDiv({ cls: "btl-date-nav" });
  dateNav.toggleClass("is-hidden", options.page === "life");
  const previous = iconButton(dateNav, "chevron-left", "前一天", () => options.onShiftDate(-1));
  const dateButton = dateNav.createEl("button", { cls: "btl-date-button", text: options.dateTitle });
  dateButton.onclick = () => options.onDatePicker(dateButton);
  const next = iconButton(dateNav, "chevron-right", "后一天", () => options.onShiftDate(1));
  previous.disabled = options.disableDateNav;
  dateButton.disabled = options.disableDateNav;
  next.disabled = options.disableDateNav;

  const actions = toolbar.createDiv({ cls: "btl-toolbar-actions" });
  iconButton(actions, "settings", "设置", options.onSettings);
  iconButton(actions, "plus", "添加", options.onAdd).addClass("btl-add-button");

  const navigationRow = root.createDiv({ cls: "btl-page-nav-row" });
  renderPageNavigation(navigationRow, options.page, options.onNavigate, options.visiblePages);
  const countdownButton = navigationRow.createEl("button", { cls: "btl-day-countdown", attr: { "aria-label": "设置节律" } });
  countdownButton.toggleClass("is-hidden", options.page === "life");
  countdownButton.createSpan();
  countdownButton.createEl("strong");
  countdownButton.onclick = () => options.onRhythm(countdownButton);

  return {
    syncButton,
    countdownButton,
    runningHost: root.createDiv({ cls: "btl-running-bar is-hidden" }),
    pageContent: root.createDiv({ cls: "btl-page-content" })
  };
}

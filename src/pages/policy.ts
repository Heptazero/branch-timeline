import type { PolicyCard, PolicyEvent, PolicyNode, PolicyPeriod, PolicySide } from "../types";

const PERIODS: ReadonlyArray<{ id: PolicyPeriod; label: string }> = [
  { id: "morning", label: "上午" },
  { id: "afternoon", label: "下午" },
  { id: "evening", label: "晚上" }
];

export interface PolicyPageOptions {
  container: HTMLElement;
  cards: readonly PolicyCard[];
  nodes: readonly PolicyNode[];
  sides: readonly PolicySide[];
  events: readonly PolicyEvent[];
  date: string;
  activeSideId: string;
  activePeriod: PolicyPeriod;
  sceneWidths: Readonly<Record<string, number>>;
  onSelectSide: (sideId: string) => void;
  onSelectPeriod: (period: PolicyPeriod) => void;
  onAddSide: () => void;
  onSideMenu: (side: PolicySide, event: MouseEvent) => void;
  onSceneWidth: (sideId: string, width: number) => void;
  onAddRoot: (period: PolicyPeriod, sideId: string) => void;
  onAddHand: (sideId: string) => void;
  onAddChild: (parentId: string, period: PolicyPeriod, sideId: string) => void;
  onDeploy: (cardId: string, parentId: string | null, period: PolicyPeriod, sideId: string) => void;
  onMoveNode: (nodeId: string, parentId: string | null, period: PolicyPeriod, sideId: string) => void;
  onToggleNode: (node: PolicyNode, card: PolicyCard) => void;
  onNodeMenu: (node: PolicyNode, card: PolicyCard, event: PointerEvent) => void;
  onCardMenu: (card: PolicyCard, event: PointerEvent) => void;
}

export function renderPolicyPage(options: PolicyPageOptions): void {
  const page = options.container.createDiv({ cls: "btl-policy-page" });
  const sides = options.sides.length ? options.sides : [{ id: "policy-side-routine", name: "作息", mode: "dayparts" as const }];
  const active = sides.find(side => side.id === options.activeSideId) || sides[0];
  const tabs = page.createDiv({ cls: "btl-policy-scene-tabs" });
  for (const side of sides) {
    const button = tabs.createEl("button", { text: side.name, cls: side.id === active.id ? "is-active" : "" });
    button.onclick = () => options.onSelectSide(side.id);
  }
  const addSide = tabs.createEl("button", { cls: "btl-policy-scene-add", text: "+", attr: { "aria-label": "添加场景" } });
  addSide.onclick = options.onAddSide;

  const workspace = page.createDiv({ cls: "btl-policy-workspace" });
  const compact = options.container.clientWidth < 700;
  page.toggleClass("is-compact", compact);
  const visibleSides = compact ? [active] : sides;
  visibleSides.forEach((side, index) => {
    if (index > 0) renderDivider(workspace, visibleSides[index - 1], options);
    renderScene(workspace, side, side.id === active.id, options);
  });
  renderHand(page, active, options);
  installPolicyDrag(page, options);
}

function renderScene(container: HTMLElement, side: PolicySide, active: boolean, options: PolicyPageOptions): void {
  const panel = container.createDiv({ cls: `btl-policy-scene${active ? " is-active" : ""}`, attr: { "data-policy-side": side.id } });
  panel.style.flexBasis = `${options.sceneWidths[side.id] || 360}px`;
  panel.onclick = event => {
    if (!(event.target as HTMLElement).closest("button, .btl-policy-node")) options.onSelectSide(side.id);
  };
  const head = panel.createDiv({ cls: "btl-policy-scene-head" });
  head.createEl("strong", { text: side.name });
  const menu = head.createEl("button", { text: "⋮", attr: { "aria-label": "场景菜单" } });
  menu.onclick = event => {
    event.stopPropagation();
    options.onSideMenu(side, event);
  };

  const body = panel.createDiv({ cls: `btl-policy-scene-body${side.mode === "dayparts" ? " has-periods" : ""}` });
  if (side.mode === "dayparts") {
    const rail = body.createDiv({ cls: "btl-policy-time-rail" });
    for (const period of PERIODS) {
      const button = rail.createEl("button", { text: period.label, cls: period.id === options.activePeriod ? "is-active" : "" });
      button.onclick = event => {
        event.stopPropagation();
        options.onSelectSide(side.id);
        options.onSelectPeriod(period.id);
      };
    }
  }
  const tree = body.createDiv({ cls: "btl-policy-tree", attr: { "data-policy-drop-side": side.id, "data-policy-drop-period": options.activePeriod } });
  const cards = new Map(options.cards.filter(card => !card.deletedDate && card.sideId === side.id).map(card => [card.id, card]));
  const pool = options.nodes.filter(node => cards.has(node.cardId) && (side.mode !== "dayparts" || node.period === options.activePeriod));
  const nodeIds = new Set(pool.map(node => node.id));
  const roots = pool.filter(node => !node.parentId || !nodeIds.has(node.parentId));
  tree.ondblclick = event => {
    if (!(event.target as HTMLElement).closest(".btl-policy-node, button")) options.onAddRoot(options.activePeriod, side.id);
  };
  const row = tree.createDiv({ cls: "btl-policy-roots" });
  for (const root of roots) renderNode(row, root, pool, cards, options);
}

function renderDivider(container: HTMLElement, left: PolicySide, options: PolicyPageOptions): void {
  const divider = container.createDiv({ cls: "btl-policy-scene-divider" });
  divider.onpointerdown = event => {
    event.preventDefault();
    const panel = container.querySelector<HTMLElement>(`.btl-policy-scene[data-policy-side="${CSS.escape(left.id)}"]`);
    if (!panel) return;
    const start = panel.getBoundingClientRect().width;
    const x = event.clientX;
    divider.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const width = Math.max(260, Math.min(720, start + next.clientX - x));
      panel.style.flexBasis = `${width}px`;
    };
    const end = () => {
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      options.onSceneWidth(left.id, Math.round(panel.getBoundingClientRect().width));
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
  };
}

function renderHand(page: HTMLElement, side: PolicySide, options: PolicyPageOptions): void {
  const activeCardIds = new Set(options.nodes.map(node => node.cardId));
  const handCards = options.cards.filter(card => !card.deletedDate && card.sideId === side.id && !activeCardIds.has(card.id));
  const hand = page.createDiv({ cls: "btl-policy-hand" });
  hand.ondblclick = event => {
    event.stopPropagation();
    if (!(event.target as HTMLElement).closest(".btl-policy-hand-card, button")) options.onAddHand(side.id);
  };
  const head = hand.createDiv({ cls: "btl-policy-hand-head" });
  head.createSpan({ text: "手牌" });
  head.createEl("strong", { text: String(handCards.length) });
  const list = hand.createDiv({ cls: "btl-policy-hand-list" });
  for (const card of handCards) {
    const element = list.createDiv({ cls: `btl-policy-hand-card is-${card.mode}`, attr: { "data-policy-card": card.id } });
    element.createSpan({ text: card.name });
    const menu = element.createEl("button", { text: "⋮", attr: { "aria-label": "手牌菜单" } });
    menu.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      options.onCardMenu(card, event);
    };
    element.ondblclick = event => {
      event.stopPropagation();
      options.onDeploy(card.id, null, options.activePeriod, side.id);
    };
  }
}

function renderNode(
  container: HTMLElement,
  node: PolicyNode,
  nodes: readonly PolicyNode[],
  cards: ReadonlyMap<string, PolicyCard>,
  options: PolicyPageOptions
): void {
  const card = cards.get(node.cardId);
  if (!card) return;
  const done = options.events.some(event => event.nodeId === node.id && event.date === options.date);
  const wrap = container.createDiv({ cls: "btl-policy-node-wrap" });
  const element = wrap.createDiv({ cls: `btl-policy-node is-${card.mode}${done ? " is-done" : ""}`, attr: { "data-policy-node": node.id, "data-policy-side": card.sideId || "policy-side-routine", "data-policy-period": node.period } });
  element.onclick = event => {
    if (element.dataset.suppressClick === "true" || (event.target as HTMLElement).closest("button")) return;
    options.onToggleNode(node, card);
  };
  const menu = element.createEl("button", { cls: "btl-policy-node-menu", text: "⋮", attr: { "aria-label": "锚点菜单" } });
  menu.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    options.onNodeMenu(node, card, event);
  };
  element.createSpan({ cls: "btl-policy-mode", text: modeLabel(card.mode) });
  element.createEl("strong", { text: card.name });
  const add = wrap.createEl("button", { cls: "btl-policy-child-add", text: "+", attr: { "aria-label": "添加子锚点" } });
  add.onclick = event => {
    event.stopPropagation();
    options.onAddChild(node.id, node.period, card.sideId || "policy-side-routine");
  };
  const children = nodes.filter(candidate => candidate.parentId === node.id);
  if (!children.length) return;
  wrap.addClass("has-children");
  const row = wrap.createDiv({ cls: `btl-policy-children${children.length === 1 ? " is-single" : ""}` });
  for (const child of children) renderNode(row, child, nodes, cards, options);
}

function installPolicyDrag(page: HTMLElement, options: PolicyPageOptions): void {
  let timer: number | null = null;
  let source: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let pointerId = -1;
  let x0 = 0;
  let y0 = 0;
  let offsetX = 0;
  let offsetY = 0;
  let drop: HTMLElement | null = null;
  const clear = () => { if (timer != null) window.clearTimeout(timer); timer = null; };
  page.onpointerdown = event => {
    const target = event.target as HTMLElement;
    const candidate = target.closest<HTMLElement>(".btl-policy-node, .btl-policy-hand-card");
    if (!candidate || target.closest("button")) return;
    pointerId = event.pointerId; x0 = event.clientX; y0 = event.clientY;
    clear();
    timer = window.setTimeout(() => {
      source = candidate;
      const rect = candidate.getBoundingClientRect();
      offsetX = event.clientX - rect.left; offsetY = event.clientY - rect.top;
      ghost = candidate.cloneNode(true) as HTMLElement;
      ghost.addClass("btl-sort-ghost"); ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
      document.body.appendChild(ghost);
      candidate.addClass("btl-sort-placeholder"); candidate.dataset.suppressClick = "true";
      candidate.setPointerCapture(pointerId);
    }, 360);
  };
  page.onpointermove = event => {
    if (event.pointerId !== pointerId) return;
    if (!source) { if (Math.hypot(event.clientX - x0, event.clientY - y0) > 7) clear(); return; }
    event.preventDefault();
    if (ghost) { ghost.style.left = `${event.clientX - offsetX}px`; ghost.style.top = `${event.clientY - offsetY}px`; }
    drop?.removeClass("is-drop-target");
    const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    drop = hit?.closest<HTMLElement>(".btl-policy-node, .btl-policy-tree") || null;
    if (drop === source) drop = null;
    drop?.addClass("is-drop-target");
  };
  const finish = () => {
    clear();
    if (!source) return;
    drop?.removeClass("is-drop-target");
    const targetNode = drop?.closest<HTMLElement>(".btl-policy-node");
    const tree = (targetNode || drop)?.closest<HTMLElement>(".btl-policy-tree");
    if (tree) {
      const sideId = tree.dataset.policyDropSide || "policy-side-routine";
      const period = (tree.dataset.policyDropPeriod || "morning") as PolicyPeriod;
      const parentId = targetNode?.dataset.policyNode || null;
      if (source.dataset.policyNode) options.onMoveNode(source.dataset.policyNode, parentId, period, sideId);
      else if (source.dataset.policyCard) options.onDeploy(source.dataset.policyCard, parentId, period, sideId);
    }
    const original = source;
    original.removeClass("btl-sort-placeholder"); ghost?.remove();
    source = null; ghost = null; drop = null;
    window.setTimeout(() => { delete original.dataset.suppressClick; }, 0);
  };
  page.onpointerup = event => { if (event.pointerId === pointerId) finish(); };
  page.onpointercancel = event => { if (event.pointerId === pointerId) finish(); };
}

export function policyPeriodAt(date: Date): PolicyPeriod {
  const hour = date.getHours();
  if (hour < 5 || hour >= 18) return "evening";
  return hour < 12 ? "morning" : "afternoon";
}

function modeLabel(mode: PolicyCard["mode"]): string {
  if (mode === "passive") return "禁止";
  if (mode === "daily") return "每日";
  if (mode === "mechanism") return "机制";
  return "条件";
}

import type { PolicyCard, PolicyNode, PolicyPeriod } from "../types";

const PERIODS: ReadonlyArray<{ id: PolicyPeriod; label: string }> = [
  { id: "morning", label: "早上" },
  { id: "afternoon", label: "下午" },
  { id: "evening", label: "晚上" }
];

export interface PolicyPageOptions {
  container: HTMLElement;
  cards: readonly PolicyCard[];
  nodes: readonly PolicyNode[];
  currentPeriod: PolicyPeriod;
  onAddRoot: (period: PolicyPeriod) => void;
  onAddHand: () => void;
  onAddChild: (parentId: string, period: PolicyPeriod) => void;
  onDeploy: (cardId: string, period: PolicyPeriod) => void;
  onNodeMenu: (node: PolicyNode, card: PolicyCard, event: PointerEvent) => void;
  onCardMenu: (card: PolicyCard, event: PointerEvent) => void;
}

export function renderPolicyPage(options: PolicyPageOptions): void {
  const page = options.container.createDiv({ cls: "btl-policy-page" });
  const tree = page.createDiv({ cls: "btl-policy-tree" });
  const cards = new Map(options.cards.filter(card => !card.deletedDate).map(card => [card.id, card]));
  const nodeIds = new Set(options.nodes.map(node => node.id));
  const activeCardIds = new Set(options.nodes.map(node => node.cardId));
  const roots = options.nodes.filter(node => !node.parentId || !nodeIds.has(node.parentId));
  for (const period of PERIODS) {
    const section = tree.createDiv({ cls: `btl-policy-period is-${period.id}` });
    section.createDiv({ cls: "btl-policy-period-label", text: period.label });
    const canvas = section.createDiv({ cls: "btl-policy-period-canvas" });
    canvas.ondblclick = event => {
      if (!(event.target as HTMLElement).closest(".btl-policy-node, button")) options.onAddRoot(period.id);
    };
    const rootRow = canvas.createDiv({ cls: "btl-policy-roots" });
    for (const root of roots.filter(node => node.period === period.id)) {
      renderNode(rootRow, root, options.nodes, cards, options);
    }
  }

  const hand = page.createDiv({ cls: "btl-policy-hand" });
  hand.ondblclick = event => {
    event.stopPropagation();
    if (!(event.target as HTMLElement).closest(".btl-policy-hand-card, button")) options.onAddHand();
  };
  const handHead = hand.createDiv({ cls: "btl-policy-hand-head" });
  handHead.createSpan({ text: "手牌" });
  const handCards = options.cards.filter(card => !card.deletedDate && !activeCardIds.has(card.id));
  handHead.createEl("strong", { text: String(handCards.length) });
  const list = hand.createDiv({ cls: "btl-policy-hand-list" });
  for (const card of handCards) {
    const element = list.createDiv({ cls: `btl-policy-hand-card is-${card.mode}` });
    element.createSpan({ text: card.name });
    const menu = element.createEl("button", { text: "⋮", attr: { "aria-label": "手牌菜单" } });
    menu.onpointerdown = event => {
      event.preventDefault();
      event.stopPropagation();
      options.onCardMenu(card, event);
    };
    element.ondblclick = event => {
      event.stopPropagation();
      options.onDeploy(card.id, options.currentPeriod);
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
  const wrap = container.createDiv({ cls: "btl-policy-node-wrap" });
  const element = wrap.createDiv({ cls: `btl-policy-node is-${card.mode}` });
  const menu = element.createEl("button", { cls: "btl-policy-node-menu", text: "⋮", attr: { "aria-label": "锚点菜单" } });
  menu.onpointerdown = event => {
    event.preventDefault();
    event.stopPropagation();
    options.onNodeMenu(node, card, event);
  };
  element.createSpan({ cls: "btl-policy-mode", text: modeLabel(card.mode) });
  element.createEl("strong", { text: card.name });
  const add = wrap.createEl("button", { cls: "btl-policy-child-add", text: "+", attr: { "aria-label": "添加子锚点" } });
  add.onclick = event => {
    event.stopPropagation();
    options.onAddChild(node.id, node.period);
  };
  const children = nodes.filter(candidate => candidate.parentId === node.id);
  if (!children.length) return;
  wrap.addClass("has-children");
  const row = wrap.createDiv({ cls: `btl-policy-children${children.length === 1 ? " is-single" : ""}` });
  for (const child of children) renderNode(row, child, nodes, cards, options);
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

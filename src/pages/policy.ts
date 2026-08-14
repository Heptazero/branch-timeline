import type { PolicyCard, PolicyNode } from "../types";

export interface PolicyPageOptions {
  container: HTMLElement;
  cards: readonly PolicyCard[];
  nodes: readonly PolicyNode[];
  onAddRoot: () => void;
  onAddHand: () => void;
  onAddChild: (parentId: string) => void;
  onDeploy: (cardId: string) => void;
  onNodeMenu: (node: PolicyNode, card: PolicyCard, event: PointerEvent) => void;
  onCardMenu: (card: PolicyCard, event: PointerEvent) => void;
}

export function renderPolicyPage(options: PolicyPageOptions): void {
  const page = options.container.createDiv({ cls: "btl-policy-page" });
  const tree = page.createDiv({ cls: "btl-policy-tree" });
  tree.ondblclick = event => {
    if (!(event.target as HTMLElement).closest(".btl-policy-node, button")) options.onAddRoot();
  };
  const cards = new Map(options.cards.filter(card => !card.deletedDate).map(card => [card.id, card]));
  const nodeIds = new Set(options.nodes.map(node => node.id));
  const activeCardIds = new Set(options.nodes.map(node => node.cardId));
  const roots = options.nodes.filter(node => !node.parentId || !nodeIds.has(node.parentId));
  const rootRow = tree.createDiv({ cls: "btl-policy-roots" });
  for (const root of roots) renderNode(rootRow, root, options.nodes, cards, options);

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
      options.onDeploy(card.id);
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
    options.onAddChild(node.id);
  };
  const children = nodes.filter(candidate => candidate.parentId === node.id);
  if (!children.length) return;
  wrap.addClass("has-children");
  const row = wrap.createDiv({ cls: `btl-policy-children${children.length === 1 ? " is-single" : ""}` });
  for (const child of children) renderNode(row, child, nodes, cards, options);
}

function modeLabel(mode: PolicyCard["mode"]): string {
  if (mode === "passive") return "禁止";
  if (mode === "daily") return "每日";
  if (mode === "mechanism") return "机制";
  return "条件";
}

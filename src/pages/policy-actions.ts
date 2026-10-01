import { App, Menu } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { ChoiceTextModal, ConfirmModal } from "../modals";
import type { PolicyCard, PolicyMode, PolicyNode, PolicyPeriod, PolicySide } from "../types";
import { dateKey, logicalToday } from "../vault/format";

const POLICY_CHOICES = [
  { id: "triggered", label: "条件" },
  { id: "passive", label: "禁止" },
  { id: "daily", label: "每日" },
  { id: "mechanism", label: "机制" }
] as const;

export interface PolicyActionsOptions {
  app: App;
  plugin: BranchTimelinePlugin;
  getDate: () => Date;
  refresh: () => Promise<void>;
  text: (title: string, placeholder: string, value?: string) => Promise<string | null>;
}

export class PolicyActions {
  constructor(private options: PolicyActionsOptions) {}

  async add(deploy: boolean, parentId: string | null, period: PolicyPeriod, sideId = "policy-side-routine"): Promise<void> {
    const result = await this.choiceText(parentId ? "添加子锚点" : deploy ? "添加根锚点" : "加入手牌");
    if (!result) return;
    await this.options.plugin.store.update(state => {
      const cardId = this.uid("policy-card");
      state.policyCards.push({
        id: cardId,
        name: result.text,
        mode: result.choice as PolicyMode,
        createdDate: dateKey(this.options.getDate()),
        deletedDate: null,
        sideId,
        habit: false
      });
      if (deploy) {
        state.policyNodes.push({
          id: this.uid("policy-node"),
          cardId,
          parentId,
          period,
          createdDate: dateKey(this.options.getDate())
        });
      }
    });
    await this.options.refresh();
  }

  async addSide(): Promise<void> {
    const result = await new Promise<{ text: string; choice: string } | null>(resolve => new ChoiceTextModal(
      this.options.app,
      "添加场景",
      "场景名称",
      [{ id: "plain", label: "普通" }, { id: "dayparts", label: "按时段" }],
      "plain",
      resolve
    ).open());
    if (!result) return;
    await this.options.plugin.store.update(state => {
      state.policySides.push({ id: this.uid("policy-side"), name: result.text, mode: result.choice === "dayparts" ? "dayparts" : "plain" });
    });
    await this.options.refresh();
  }

  async renameSide(side: PolicySide): Promise<void> {
    const name = await this.options.text("重命名场景", "场景名称", side.name);
    if (!name) return;
    await this.options.plugin.store.update(state => {
      const target = state.policySides.find(candidate => candidate.id === side.id);
      if (target) target.name = name;
    });
    await this.options.refresh();
  }

  async toggleSideMode(side: PolicySide): Promise<void> {
    await this.options.plugin.store.update(state => {
      const target = state.policySides.find(candidate => candidate.id === side.id);
      if (target) target.mode = target.mode === "dayparts" ? "plain" : "dayparts";
    });
    await this.options.refresh();
  }

  async deleteSide(side: PolicySide): Promise<void> {
    const state = await this.options.plugin.store.load();
    if (state.policySides.length <= 1) return;
    new ConfirmModal(this.options.app, `删除“${side.name}”？`, "该场景里的锚点和手牌会一起删除。", async () => {
      await this.options.plugin.store.update(next => {
        const cardIds = new Set(next.policyCards.filter(card => card.sideId === side.id).map(card => card.id));
        const nodeIds = new Set(next.policyNodes.filter(node => cardIds.has(node.cardId)).map(node => node.id));
        next.policyEvents = next.policyEvents.filter(event => !cardIds.has(event.cardId));
        next.policyNodes = next.policyNodes.filter(node => !nodeIds.has(node.id));
        next.policyCards = next.policyCards.filter(card => !cardIds.has(card.id));
        next.policySides = next.policySides.filter(candidate => candidate.id !== side.id);
      });
      await this.options.refresh();
    }).open();
  }

  async toggleHabit(cardId: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      const card = state.policyCards.find(candidate => candidate.id === cardId);
      if (card) card.habit = !card.habit;
    });
    await this.options.refresh();
  }

  async openSettlementMenu(node: PolicyNode, card: PolicyCard, event: MouseEvent): Promise<void> {
    const date = dateKey(this.options.getDate());
    const state = await this.options.plugin.store.load();
    const todayEvents = state.policyEvents.filter(entry => entry.cardId === card.id && entry.date === date);
    const menu = new Menu();
    menu.addItem(item => item.setTitle(successLabel(card.mode)).setIcon("check").onClick(() => void this.settle(node, card, card.mode === "mechanism" ? "used" : "success")));
    menu.addItem(item => item.setTitle("破戒").setIcon("x").setWarning(true).onClick(() => void this.settle(node, card, "violation")));
    if (todayEvents.length) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle("撤销最近记录").setIcon("undo-2").onClick(() => void this.undoLatest(card.id, date)));
    }
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  private async settle(node: PolicyNode, card: PolicyCard, result: "success" | "violation" | "used"): Promise<void> {
    const date = dateKey(this.options.getDate());
    await this.options.plugin.store.update(state => {
      if (card.mode === "daily" || card.mode === "passive") {
        state.policyEvents = state.policyEvents.filter(event => event.cardId !== card.id || event.date !== date);
      }
      state.policyEvents.push({ id: this.uid("policy-event"), cardId: card.id, nodeId: node.id, date, minute: this.eventMinute(date), result });
      if (result === "violation") this.removeSubtree(state.policyNodes, node.id);
    });
    await this.options.refresh();
  }

  private async undoLatest(cardId: string, date: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      const candidates = state.policyEvents
        .map((event, index) => ({ event, index }))
        .filter(value => value.event.cardId === cardId && value.event.date === date)
        .sort((a, b) => (a.event.minute ?? 0) - (b.event.minute ?? 0) || a.event.id.localeCompare(b.event.id));
      const latest = candidates.at(-1);
      if (latest) state.policyEvents.splice(latest.index, 1);
    });
    await this.options.refresh();
  }

  async toggleHabitOn(cardId: string, date: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      const node = state.policyNodes.find(candidate => candidate.cardId === cardId);
      if (!node) return;
      const index = state.policyEvents.findIndex(event => event.cardId === cardId && event.date === date);
      if (index >= 0) state.policyEvents.splice(index, 1);
      else state.policyEvents.push({ id: this.uid("policy-event"), cardId, nodeId: node.id, date, result: "success" });
    });
    await this.options.refresh();
  }

  async deploy(cardId: string, parentId: string | null, period: PolicyPeriod): Promise<void> {
    await this.options.plugin.store.update(state => {
      if (state.policyNodes.some(node => node.cardId === cardId)) return;
      state.policyNodes.push({ id: this.uid("policy-node"), cardId, parentId, period, createdDate: dateKey(this.options.getDate()) });
    });
    await this.options.refresh();
  }

  async moveNode(nodeId: string, parentId: string | null, period: PolicyPeriod, sideId: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      const node = state.policyNodes.find(candidate => candidate.id === nodeId);
      if (!node || nodeId === parentId) return;
      const descendants = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of state.policyNodes) {
          if ((candidate.parentId === nodeId || (candidate.parentId && descendants.has(candidate.parentId))) && !descendants.has(candidate.id)) {
            descendants.add(candidate.id); changed = true;
          }
        }
      }
      if (parentId && descendants.has(parentId)) return;
      node.parentId = parentId;
      const subtree = new Set([nodeId, ...descendants]);
      for (const candidate of state.policyNodes) {
        if (!subtree.has(candidate.id)) continue;
        candidate.period = period;
        const card = state.policyCards.find(item => item.id === candidate.cardId);
        if (card) card.sideId = sideId;
      }
    });
    await this.options.refresh();
  }

  async deployTo(cardId: string, parentId: string | null, period: PolicyPeriod, sideId: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      if (state.policyNodes.some(node => node.cardId === cardId)) return;
      const card = state.policyCards.find(candidate => candidate.id === cardId);
      if (!card) return;
      card.sideId = sideId;
      state.policyNodes.push({ id: this.uid("policy-node"), cardId, parentId, period, createdDate: dateKey(this.options.getDate()) });
    });
    await this.options.refresh();
  }

  openNodeMenu(node: PolicyNode, card: PolicyCard, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.rename(card)));
    menu.addItem(item => item.setTitle(card.habit ? "取消习惯" : "显示为习惯").setIcon("check-circle").onClick(() => void this.toggleHabit(card.id)));
    menu.addItem(item => item.setTitle("退回手牌").setIcon("undo-2").onClick(() => this.confirmReturn(node, card)));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  openCardMenu(card: PolicyCard, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.rename(card)));
    menu.addItem(item => item.setTitle(card.habit ? "取消习惯" : "显示为习惯").setIcon("check-circle").onClick(() => void this.toggleHabit(card.id)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除手牌").setIcon("trash-2").setWarning(true).onClick(() => {
      new ConfirmModal(this.options.app, `删除“${card.name}”？`, "这张手牌会被删除。", async () => {
        await this.options.plugin.store.update(state => {
          state.policyCards = state.policyCards.filter(candidate => candidate.id !== card.id);
        });
        await this.options.refresh();
      }).open();
    }));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  private async rename(card: PolicyCard): Promise<void> {
    const name = await this.options.text("重命名锚点", "锚点内容", card.name);
    if (!name) return;
    await this.options.plugin.store.update(state => {
      const target = state.policyCards.find(candidate => candidate.id === card.id);
      if (target) target.name = name;
    });
    await this.options.refresh();
  }

  private confirmReturn(node: PolicyNode, card: PolicyCard): void {
    new ConfirmModal(this.options.app, `退回“${card.name}”？`, "它及所有子节点会回到手牌。", async () => {
      await this.options.plugin.store.update(state => {
        this.removeSubtree(state.policyNodes, node.id);
      });
      await this.options.refresh();
    }, "退回").open();
  }

  private choiceText(title: string): Promise<{ text: string; choice: string } | null> {
    return new Promise(resolve => new ChoiceTextModal(
      this.options.app,
      title,
      "当……时，就……",
      POLICY_CHOICES,
      "triggered",
      resolve
    ).open());
  }

  private uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private removeSubtree(nodes: PolicyNode[], nodeId: string): void {
    const ids = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of nodes) {
        if (candidate.parentId && ids.has(candidate.parentId) && !ids.has(candidate.id)) {
          ids.add(candidate.id);
          changed = true;
        }
      }
    }
    const kept = nodes.filter(candidate => !ids.has(candidate.id));
    nodes.splice(0, nodes.length, ...kept);
  }

  private eventMinute(date: string): number {
    if (date !== dateKey(logicalToday())) return 12 * 60;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

function successLabel(mode: PolicyMode): string {
  if (mode === "mechanism") return "已使用";
  if (mode === "passive") return "守住了";
  if (mode === "daily") return "今日做到";
  return "这次做到";
}

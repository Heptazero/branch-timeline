import { App, Menu } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { ChoiceTextModal, ConfirmModal } from "../modals";
import type { PolicyCard, PolicyMode, PolicyNode, PolicyPeriod } from "../types";
import { dateKey } from "../vault/format";

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

  async add(deploy: boolean, parentId: string | null, period: PolicyPeriod): Promise<void> {
    const result = await this.choiceText(parentId ? "添加子锚点" : deploy ? "添加根锚点" : "加入手牌");
    if (!result) return;
    await this.options.plugin.store.update(state => {
      const cardId = this.uid("policy-card");
      state.policyCards.push({
        id: cardId,
        name: result.text,
        mode: result.choice as PolicyMode,
        createdDate: dateKey(this.options.getDate()),
        deletedDate: null
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

  async deploy(cardId: string, parentId: string | null, period: PolicyPeriod): Promise<void> {
    await this.options.plugin.store.update(state => {
      if (state.policyNodes.some(node => node.cardId === cardId)) return;
      state.policyNodes.push({ id: this.uid("policy-node"), cardId, parentId, period, createdDate: dateKey(this.options.getDate()) });
    });
    await this.options.refresh();
  }

  openNodeMenu(node: PolicyNode, card: PolicyCard, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.rename(card)));
    menu.addItem(item => item.setTitle("退回手牌").setIcon("undo-2").onClick(() => this.confirmReturn(node, card)));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  openCardMenu(card: PolicyCard, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.rename(card)));
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
        const ids = new Set<string>([node.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const candidate of state.policyNodes) {
            if (candidate.parentId && ids.has(candidate.parentId) && !ids.has(candidate.id)) {
              ids.add(candidate.id);
              changed = true;
            }
          }
        }
        state.policyNodes = state.policyNodes.filter(candidate => !ids.has(candidate.id));
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
}

import { desktopEntries, type DesktopEntry, type DesktopSession } from "./session-model";
import type { BranchTimelineState } from "../types";
export interface DesktopReceipt { id: string; status: "imported" | "too-short" | "error"; message?: string }
export interface DesktopImportIO {
  receipt: () => Promise<DesktopReceipt | null>;
  state: () => Promise<BranchTimelineState>;
  commit: (entry: DesktopEntry) => Promise<void>;
  acknowledge: (receipt: DesktopReceipt) => Promise<void>;
}

/** A durable receipt prevents restoring facts that the user intentionally deleted later. */
export async function importDesktopSession(session: DesktopSession, io: DesktopImportIO): Promise<DesktopReceipt> {
  const receipt = await io.receipt();
  if (receipt?.id === session.id && ["imported", "too-short"].includes(receipt.status)) return receipt;
  const state = await io.state();
  const known = new Set(Object.values(state.days).flatMap(day => day.items.map(item => item.id)));
  const entries = desktopEntries(session);
  for (const entry of entries) if (!known.has(entry.item.id)) { await io.commit(entry); known.add(entry.item.id); }
  const result: DesktopReceipt = { id: session.id, status: entries.length ? "imported" : "too-short" };
  await io.acknowledge(result);
  return result;
}

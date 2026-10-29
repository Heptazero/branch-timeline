interface NativeWindow extends Window { webkit: { messageHandlers: { vault: { postMessage(value: unknown): Promise<unknown> } } } }
export async function rpc<T>(op: string, fields: Record<string, unknown> = {}): Promise<T> {
  const reply = await (window as unknown as NativeWindow).webkit.messageHandlers.vault.postMessage({ op, ...fields });
  return reply as T;
}
export function report(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const host = document.getElementById("error")!; host.textContent = message; host.hidden = false;
}
window.addEventListener("unhandledrejection", event => { report(event.reason); event.preventDefault(); });
window.addEventListener("error", event => { report(event.message); });

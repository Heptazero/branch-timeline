export interface LongPressSortOptions {
  itemSelector: string;
  idAttribute: string;
  onOrder: (ids: string[]) => void;
  holdMs?: number;
  handleSelector?: string;
  axis?: "grid" | "vertical";
}

export function installLongPressSort(container: HTMLElement, options: LongPressSortOptions): () => void {
  container.setAttribute("data-btl-sort-scope", "true");
  let timer: number | null = null;
  let item: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  const clearTimer = () => {
    if (timer != null) window.clearTimeout(timer);
    timer = null;
  };
  const items = () => [...container.querySelectorAll<HTMLElement>(options.itemSelector)];
  const animateReflow = (before: Map<HTMLElement, DOMRect>) => {
    for (const candidate of items()) {
      const first = before.get(candidate);
      if (!first || candidate === item) continue;
      const last = candidate.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (!dx && !dy) continue;
      candidate.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, 0)" }
      ], { duration: 170, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  };
  const moveGhost = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.left = `${x - offsetX}px`;
    ghost.style.top = `${y - offsetY}px`;
  };
  const activate = (source: HTMLElement, event: PointerEvent) => {
    const rect = source.getBoundingClientRect();
    item = source;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.addClass("btl-sort-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    moveGhost(event.clientX, event.clientY);
    source.addClass("btl-sort-placeholder");
    source.dataset.suppressClick = "true";
    container.addClass("is-sorting");
    source.setPointerCapture(pointerId);
  };
  const pointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    const nearestScope = target.closest<HTMLElement>("[data-btl-sort-scope]");
    if (nearestScope && nearestScope !== container) return;
    const source = target.closest<HTMLElement>(options.itemSelector);
    if (!source) return;
    const handle = options.handleSelector ? target.closest<HTMLElement>(options.handleSelector) : null;
    if (options.handleSelector && !handle) return;
    if (!handle && target.closest("button, input, textarea, a, [data-no-sort]")) return;
    clearTimer();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    if (handle) {
      event.preventDefault();
      activate(source, event);
      return;
    }
    timer = window.setTimeout(() => activate(source, event), options.holdMs ?? 360);
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    if (!item) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 7) clearTimer();
      return;
    }
    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(options.itemSelector);
    if (target && target !== item && target.parentElement === container) {
      const beforeRects = new Map(items().map(candidate => [candidate, candidate.getBoundingClientRect()]));
      const rect = target.getBoundingClientRect();
      const sameRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
      const before = options.axis === "vertical"
        ? event.clientY < rect.top + rect.height / 2
        : sameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
      container.insertBefore(item, before ? target : target.nextSibling);
      animateReflow(beforeRects);
    }
    const scroll = scrollParent(container);
    const rect = scroll.getBoundingClientRect();
    const edge = 42;
    if (event.clientY < rect.top + edge) scroll.scrollBy({ top: -10, behavior: "auto" });
    else if (event.clientY > rect.bottom - edge) scroll.scrollBy({ top: 10, behavior: "auto" });
  };
  const finish = () => {
    clearTimer();
    if (!item) return;
    const source = item;
    ghost?.remove();
    ghost = null;
    item = null;
    source.removeClass("btl-sort-placeholder");
    container.removeClass("is-sorting");
    const ids = items().map(candidate => candidate.getAttribute(options.idAttribute) || "").filter(Boolean);
    options.onOrder(ids);
    window.setTimeout(() => { delete source.dataset.suppressClick; }, 0);
  };
  const pointerUp = (event: PointerEvent) => { if (event.pointerId === pointerId) finish(); };
  const pointerCancel = (event: PointerEvent) => { if (event.pointerId === pointerId) finish(); };
  const pointerLeave = () => { if (!item) clearTimer(); };
  container.addEventListener("pointerdown", pointerDown);
  container.addEventListener("pointermove", pointerMove);
  container.addEventListener("pointerup", pointerUp);
  container.addEventListener("pointercancel", pointerCancel);
  container.addEventListener("pointerleave", pointerLeave);
  return () => {
    clearTimer();
    ghost?.remove();
    container.removeEventListener("pointerdown", pointerDown);
    container.removeEventListener("pointermove", pointerMove);
    container.removeEventListener("pointerup", pointerUp);
    container.removeEventListener("pointercancel", pointerCancel);
    container.removeEventListener("pointerleave", pointerLeave);
    container.removeAttribute("data-btl-sort-scope");
  };
}

function scrollParent(element: HTMLElement): HTMLElement {
  let cursor: HTMLElement | null = element.parentElement;
  while (cursor) {
    const style = getComputedStyle(cursor);
    if (/auto|scroll/.test(style.overflowY)) return cursor;
    cursor = cursor.parentElement;
  }
  return document.documentElement;
}

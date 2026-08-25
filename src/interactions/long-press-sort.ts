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
  let touchId = -1;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let initialOrder: string[] = [];
  let initialPlacements: Array<{ element: HTMLElement; next: ChildNode | null }> = [];

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
  const activate = (source: HTMLElement, x: number, y: number, capturePointer = false) => {
    if (item || !source.isConnected) return;
    const rect = source.getBoundingClientRect();
    item = source;
    offsetX = x - rect.left;
    offsetY = y - rect.top;
    initialOrder = items().map(candidate => candidate.getAttribute(options.idAttribute) || "").filter(Boolean);
    initialPlacements = items().map(element => ({ element, next: element.nextSibling }));
    ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.addClass("btl-sort-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    moveGhost(x, y);
    source.addClass("btl-sort-placeholder");
    source.dataset.suppressClick = "true";
    container.addClass("is-sorting");
    if (capturePointer && pointerId >= 0) {
      try { source.setPointerCapture(pointerId); } catch { /* The pointer may have ended during the hold delay. */ }
    }
  };
  const sortableSource = (target: HTMLElement): { source: HTMLElement; handle: HTMLElement | null } | null => {
    const nearestScope = target.closest<HTMLElement>("[data-btl-sort-scope]");
    if (nearestScope && nearestScope !== container) return null;
    const source = target.closest<HTMLElement>(options.itemSelector);
    if (!source) return null;
    const handle = options.handleSelector ? target.closest<HTMLElement>(options.handleSelector) : null;
    if (options.handleSelector && !handle) return null;
    if (!handle && target.closest("button, input, textarea, a, [data-no-sort]")) return null;
    return { source, handle };
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const target = event.target as HTMLElement;
    const sortable = sortableSource(target);
    if (!sortable) return;
    const { source, handle } = sortable;
    clearTimer();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    if (handle) {
      event.preventDefault();
      activate(source, event.clientX, event.clientY, true);
      return;
    }
    timer = window.setTimeout(() => activate(source, event.clientX, event.clientY, true), options.holdMs ?? 360);
  };
  const move = (x: number, y: number) => {
    const active = item;
    if (!active) return;
    moveGhost(x, y);
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(options.itemSelector);
    if (target && target !== active && target.parentElement === container) {
      const beforeRects = new Map(items().map(candidate => [candidate, candidate.getBoundingClientRect()]));
      const rect = target.getBoundingClientRect();
      const sameRow = y >= rect.top && y <= rect.bottom;
      const before = options.axis === "vertical"
        ? y < rect.top + rect.height / 2
        : sameRow ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2;
      container.insertBefore(active, before ? target : target.nextSibling);
      animateReflow(beforeRects);
    }
    const scroll = scrollParent(container);
    const rect = scroll.getBoundingClientRect();
    const edge = 42;
    if (y < rect.top + edge) scroll.scrollBy({ top: -10, behavior: "auto" });
    else if (y > rect.bottom - edge) scroll.scrollBy({ top: 10, behavior: "auto" });
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    if (!item) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 7) clearTimer();
      return;
    }
    event.preventDefault();
    move(event.clientX, event.clientY);
  };
  const restoreInitialOrder = () => {
    for (const placement of [...initialPlacements].reverse()) {
      if (placement.element.parentElement === container) container.insertBefore(placement.element, placement.next);
    }
  };
  const finish = (commit = true) => {
    clearTimer();
    if (!item) return;
    const source = item;
    if (!commit) restoreInitialOrder();
    ghost?.remove();
    ghost = null;
    item = null;
    source.removeClass("btl-sort-placeholder");
    container.removeClass("is-sorting");
    const ids = items().map(candidate => candidate.getAttribute(options.idAttribute) || "").filter(Boolean);
    if (commit && ids.some((id, index) => id !== initialOrder[index])) options.onOrder(ids);
    initialOrder = [];
    initialPlacements = [];
    window.setTimeout(() => { delete source.dataset.suppressClick; }, 0);
  };
  const pointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    finish();
    pointerId = -1;
  };
  const pointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    finish(false);
    pointerId = -1;
  };
  const pointerLeave = () => { if (!item) clearTimer(); };
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || touchId >= 0) return;
    const target = event.target as HTMLElement;
    const sortable = sortableSource(target);
    if (!sortable) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    clearTimer();
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    if (sortable.handle) {
      event.preventDefault();
      activate(sortable.source, touch.clientX, touch.clientY);
      return;
    }
    timer = window.setTimeout(() => activate(sortable.source, touch.clientX, touch.clientY), options.holdMs ?? 360);
  };
  const touchMove = (event: TouchEvent) => {
    const touch = [...event.changedTouches].find(candidate => candidate.identifier === touchId);
    if (!touch) return;
    if (!item) {
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 7) {
        clearTimer();
        touchId = -1;
      }
      return;
    }
    event.preventDefault();
    move(touch.clientX, touch.clientY);
  };
  const touchEnd = (event: TouchEvent) => {
    if (![...event.changedTouches].some(candidate => candidate.identifier === touchId)) return;
    finish();
    touchId = -1;
  };
  const touchCancel = (event: TouchEvent) => {
    if (![...event.changedTouches].some(candidate => candidate.identifier === touchId)) return;
    finish(false);
    touchId = -1;
  };
  const contextMenu = (event: MouseEvent) => {
    if (item || timer != null) event.preventDefault();
  };
  container.addEventListener("pointerdown", pointerDown);
  container.addEventListener("pointermove", pointerMove);
  container.addEventListener("pointerup", pointerUp);
  container.addEventListener("pointercancel", pointerCancel);
  container.addEventListener("pointerleave", pointerLeave);
  container.addEventListener("touchstart", touchStart, { passive: false });
  container.addEventListener("touchmove", touchMove, { passive: false });
  container.addEventListener("touchend", touchEnd);
  container.addEventListener("touchcancel", touchCancel);
  container.addEventListener("contextmenu", contextMenu);
  return () => {
    clearTimer();
    ghost?.remove();
    container.removeEventListener("pointerdown", pointerDown);
    container.removeEventListener("pointermove", pointerMove);
    container.removeEventListener("pointerup", pointerUp);
    container.removeEventListener("pointercancel", pointerCancel);
    container.removeEventListener("pointerleave", pointerLeave);
    container.removeEventListener("touchstart", touchStart);
    container.removeEventListener("touchmove", touchMove);
    container.removeEventListener("touchend", touchEnd);
    container.removeEventListener("touchcancel", touchCancel);
    container.removeEventListener("contextmenu", contextMenu);
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

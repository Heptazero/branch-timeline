export function needsWidthRefresh(renderedWidth: number, actualWidth: number, minimumWidth: number): boolean {
  return actualWidth > 0 && Math.abs(Math.max(minimumWidth, actualWidth) - renderedWidth) >= 1;
}

export function observeRenderedWidth(
  element: HTMLElement,
  renderedWidth: number,
  minimumWidth: number,
  onChange: () => void
): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  let requested = false;
  const observer = new ResizeObserver(() => {
    if (requested || !needsWidthRefresh(renderedWidth, element.clientWidth, minimumWidth)) return;
    requested = true;
    onChange();
  });
  observer.observe(element);
  return () => observer.disconnect();
}

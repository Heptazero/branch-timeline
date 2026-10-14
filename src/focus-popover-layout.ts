type HorizontalRect = { left: number; right: number };

/** Keep the floating control within its timeline pane, not the whole Obsidian window. */
export function focusPopoverX(
  anchor: Pick<HorizontalRect, "right">,
  pane: HorizontalRect | undefined,
  viewportWidth: number,
  preferredWidth: number
): { left: number; width: number } {
  const leftBound = Math.max(8, (pane?.left ?? 0) + 8);
  const rightBound = Math.min(viewportWidth - 8, (pane?.right ?? viewportWidth) - 8);
  const width = Math.min(preferredWidth, Math.max(0, rightBound - leftBound));
  const left = Math.max(leftBound, Math.min(rightBound - width, anchor.right - width));
  return { left, width };
}

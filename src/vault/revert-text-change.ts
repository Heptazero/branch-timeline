/** Revert only the changed lines when other lines have changed since our write. */
export function revertTextChange(before: string, after: string, current: string): string | null {
  if (current === after) return before;
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const currentLines = current.split("\n");
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1;
  let end = 0;
  while (end < oldLines.length - start && end < newLines.length - start
    && oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]) end += 1;
  const removed = oldLines.slice(start, oldLines.length - end);
  const added = newLines.slice(start, newLines.length - end);
  if (!added.length) return null;
  const matches: number[] = [];
  for (let index = 0; index <= currentLines.length - added.length; index += 1) {
    if (added.every((line, offset) => currentLines[index + offset] === line)) matches.push(index);
  }
  if (matches.length !== 1) return null;
  currentLines.splice(matches[0], added.length, ...removed);
  return currentLines.join("\n");
}

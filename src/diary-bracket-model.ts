export interface DiaryBracketTerm { value: string; count: number; lastDate: string }

export function extractDiaryBracketTerms(content: string): string[] {
  const terms: string[] = [];
  let fence: string | null = null;
  for (const line of content.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker[0]; else if (fence === marker[0]) fence = null; continue; }
    if (fence) continue;
    const withoutCode = line.replace(/`+[^`]*`+/g, "");
    const pattern = /\[([^\[\]\r\n]{1,40})\]/g;
    for (const match of withoutCode.matchAll(pattern)) {
      const at = match.index;
      if (at == null || at > 0 && /[!\[\]]/.test(withoutCode[at - 1])) continue;
      if (/[([\]]/.test(withoutCode[at + match[0].length] || "")) continue;
      if (/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,39}$/u.test(match[1]) && !/^[xX]$/.test(match[1])) terms.push(match[1]);
    }
  }
  return terms;
}

export function diaryBracketTrigger(line: string, ch: number): { from: number; query: string } | null {
  const before = line.slice(0, ch);
  const from = before.lastIndexOf("[");
  if (from < 0 || /[!\\\[]/.test(before[from - 1] || "")) return null;
  const query = before.slice(from + 1);
  if (query.length > 40 || /[\[\]\s`]/.test(query) || line.slice(ch).startsWith("](")) return null;
  return { from, query };
}

export function rankDiaryBracketTerms(terms: readonly DiaryBracketTerm[], query: string, limit = 20): DiaryBracketTerm[] {
  const needle = query.toLocaleLowerCase();
  return terms.map(term => ({ term, score: matchScore(term.value.toLocaleLowerCase(), needle) }))
    .filter((item): item is { term: DiaryBracketTerm; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || b.term.lastDate.localeCompare(a.term.lastDate) || b.term.count - a.term.count || a.term.value.localeCompare(b.term.value, "zh-CN"))
    .slice(0, limit).map(item => item.term);
}

function matchScore(value: string, query: string): number | null {
  if (!query) return 0;
  if (value.startsWith(query)) return 0;
  if (value.includes(query)) return 10 + value.indexOf(query);
  let cursor = -1;
  let gaps = 0;
  for (const character of query) {
    const next = value.indexOf(character, cursor + 1);
    if (next < 0) return null;
    if (cursor >= 0) gaps += next - cursor - 1;
    cursor = next;
  }
  return 100 + gaps;
}

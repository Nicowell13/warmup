export type ScriptParity = 'odd' | 'even' | 'all';

export function parseScript(scriptText: string): string[][] {
  const normalized = (scriptText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n\s*\n+/g)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((block) =>
      block
        .split(/\n+/g)
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((seasonLines) => seasonLines.length > 0);
}

function matchesParity(lineIndex: number, parity: ScriptParity) {
  if (parity === 'all') return true;
  const isEvenIndex = lineIndex % 2 === 0;
  // Index 0 dianggap "baris 1".
  return parity === 'odd' ? isEvenIndex : !isEvenIndex;
}

export function pickReplyFromScript(
  scriptText: string,
  seasonIndex: number,
  lineIndex: number,
  parity: ScriptParity
): { text: string; nextSeasonIndex: number; nextLineIndex: number } | null {
  const seasons = parseScript(scriptText);
  if (seasons.length === 0) return null;

  let s = seasonIndex;
  let i = lineIndex;

  while (s < seasons.length) {
    const lines = seasons[s] || [];

    while (i < lines.length && !matchesParity(i, parity)) {
      i += 1;
    }

    if (i < lines.length) {
      const step = parity === 'all' ? 1 : 2;
      return { text: lines[i], nextSeasonIndex: s, nextLineIndex: i + step };
    }

    s += 1;
    i = 0;
  }

  return null;
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

import { conflictHunks } from '../../generate/blocks.js';
import { finding, type Finding } from '../finding.js';
import { placeOf } from '../layout.js';
import type { CheckFn } from '../run.js';

/** 0-based indexes of the lines of fenced code blocks (``` or ~~~, fence lines included). */
export function fencedLines(text: string): Set<number> {
  const inside = new Set<number>();
  let fence: { char: string; len: number } | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === null) {
      if (m && !(m[1]![0] === '`' && m[2]!.includes('`'))) {
        fence = { char: m[1]![0]!, len: m[1]!.length };
        inside.add(i);
      }
      return;
    }
    inside.add(i);
    if (m && m[1]![0] === fence.char && m[1]!.length >= fence.len && m[2]!.trim() === '') fence = null;
  });
  return inside;
}

/** Leftover merge-conflict markers in notes (outside ignored places and code fences), `brain.yaml` and `CODEOWNERS`. */
export const conflictChecks: CheckFn = (ws) => {
  const out: Finding[] = [];
  for (const b of ws.brains) {
    const texts: [string, string | null, boolean][] = [
      ...b.notes.filter((n) => placeOf(n.path).kind !== 'ignored').map((n): [string, string, boolean] => [n.path, n.text, true]),
      ['brain.yaml', b.manifestText, false],
      ['CODEOWNERS', b.codeownersText, false],
    ];
    for (const [rel, text, markdown] of texts) {
      if (text === null) continue;
      const fenced = markdown ? fencedLines(text) : new Set<number>();
      const first = conflictHunks(text).find((h) => !fenced.has(h.start));
      if (first === undefined) continue;
      out.push(
        finding('conflict-markers', {
          brain: b.id,
          path: `${b.dir}/${rel}`,
          line: first.start + 1,
          message: 'unresolved merge-conflict markers',
        }),
      );
    }
  }
  return out;
};

import { conflictHunks } from '../../generate/blocks.js';
import { finding, type Finding } from '../finding.js';
import { placeOf } from '../layout.js';
import type { CheckFn } from '../run.js';

/** Leftover merge-conflict markers in notes (outside ignored places), `brain.yaml` and `CODEOWNERS`. */
export const conflictChecks: CheckFn = (ws) => {
  const out: Finding[] = [];
  for (const b of ws.brains) {
    const texts: [string, string | null][] = [
      ...b.notes.filter((n) => placeOf(n.path).kind !== 'ignored').map((n): [string, string] => [n.path, n.text]),
      ['brain.yaml', b.manifestText],
      ['CODEOWNERS', b.codeownersText],
    ];
    for (const [rel, text] of texts) {
      if (text === null) continue;
      const first = conflictHunks(text)[0];
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

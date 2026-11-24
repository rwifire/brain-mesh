/**
 * Generated blocks between `<!-- brain-mesh:<name> -->` markers, and git merge-conflict hunks.
 * Pure string functions; generated text uses `\n`, callers restore CRLF with `withEol`.
 */

export interface Hunk {
  /** 0-based line index of the `<<<<<<<` line. */
  start: number;
  /** 0-based line index of the `>>>>>>>` line. */
  end: number;
  /** Lines of each side (ours, [base,] theirs), without the marker lines. */
  sides: string[][];
}

const stripCr = (line: string) => (line.endsWith('\r') ? line.slice(0, -1) : line);

function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function conflictHunks(text: string): Hunk[] {
  const lines = splitLines(text).map(stripCr);
  const hunks: Hunk[] = [];
  let open: { start: number; sides: string[][] } | null = null;
  lines.forEach((line, i) => {
    if (line.startsWith('<<<<<<<')) {
      open = { start: i, sides: [[]] };
    } else if (open && (line.startsWith('|||||||') || line === '=======')) {
      open.sides.push([]);
    } else if (open && line.startsWith('>>>>>>>')) {
      hunks.push({ start: open.start, end: i, sides: open.sides });
      open = null;
    } else if (open) {
      open.sides[open.sides.length - 1]!.push(line);
    }
  });
  return hunks;
}

export type BlockResult = { ok: true; text: string } | { ok: false; reason: string };

type Unit = { kind: 'line'; line: string } | { kind: 'hunk'; lines: string[]; sides: string[][] };

/**
 * Replaces the block `name` with `body`, healing conflict hunks that lie inside it.
 * Without any markers, adds the block at the end ('append') or the start ('prepend').
 * `style` 'hash' uses `# brain-mesh:<name>` markers, for files such as `.gitignore`.
 */
export function replaceBlock(
  text: string,
  name: 'index' | 'agents' | 'managed',
  body: string,
  where: 'append' | 'prepend',
  style: 'html' | 'hash' = 'html',
): BlockResult {
  const OPEN = style === 'html' ? `<!-- brain-mesh:${name} -->` : `# brain-mesh:${name}`;
  const CLOSE = style === 'html' ? `<!-- /brain-mesh:${name} -->` : `# /brain-mesh:${name}`;
  const block = `${OPEN}\n${body}${CLOSE}\n`;
  const lines = splitLines(text.replace(/\r\n/g, '\n'));
  const isMarker = (l: string) => l.trim() === OPEN || l.trim() === CLOSE;

  if (!lines.some(isMarker)) {
    const rest = lines.join('\n');
    if (rest.trim() === '') return { ok: true, text: block };
    return { ok: true, text: where === 'append' ? `${rest}\n\n${block}` : `${block}\n${rest}\n` };
  }

  // Group lines into plain lines and conflict hunks.
  const hunks = conflictHunks(lines.join('\n') + '\n');
  const units: Unit[] = [];
  let i = 0;
  for (const h of hunks) {
    for (; i < h.start; i++) units.push({ kind: 'line', line: lines[i]! });
    units.push({ kind: 'hunk', lines: lines.slice(h.start, h.end + 1), sides: h.sides });
    i = h.end + 1;
  }
  for (; i < lines.length; i++) units.push({ kind: 'line', line: lines[i]! });

  // State outside hunks just before and after each unit decides whether a hunk is inside the block.
  const out: string[] = [];
  let inside = false;
  let blocks = 0;
  for (let u = 0; u < units.length; u++) {
    const unit = units[u]!;
    if (unit.kind === 'line') {
      const t = unit.line.trim();
      if (t === OPEN) {
        if (inside) return { ok: false, reason: `nested ${OPEN}` };
        inside = true;
        if (++blocks > 1) return { ok: false, reason: 'more than one generated block' };
        out.push(...splitLines(block));
      } else if (t === CLOSE) {
        if (!inside) return { ok: false, reason: `${CLOSE} without an opening marker before it` };
        inside = false;
      } else if (!inside) {
        out.push(unit.line);
      }
      continue;
    }

    const hasMarkers = unit.sides.some((s) => s.some(isMarker));
    if (!hasMarkers) {
      if (!inside) out.push(...unit.lines); // a conflict in curated text: not ours to resolve
      continue;
    }
    // Every side must keep its non-marker lines inside the block and end in the same state.
    let exit: boolean | null = null;
    let opensBlock = false;
    for (const side of unit.sides) {
      let state: boolean = inside;
      for (const line of side) {
        const t = line.trim();
        if (t === OPEN) {
          if (state) return { ok: false, reason: `nested ${OPEN} in a merge conflict` };
          state = true;
          if (!inside) opensBlock = true;
        } else if (t === CLOSE) {
          if (!state) return { ok: false, reason: 'a merge conflict closes a block it did not open' };
          state = false;
        } else if (!state) {
          return { ok: false, reason: 'a merge conflict crosses the generated block boundary' };
        }
      }
      if (exit !== null && exit !== state) return { ok: false, reason: 'conflict sides disagree about the generated block' };
      exit = state;
    }
    if (opensBlock) {
      if (++blocks > 1) return { ok: false, reason: 'more than one generated block' };
      out.push(...splitLines(block));
    }
    inside = exit ?? inside;
  }
  if (inside) return { ok: false, reason: `${OPEN} without a closing marker` };
  return { ok: true, text: out.join('\n') + '\n' };
}

/** Removes conflict hunks whose every line, on every side, is a `links_to:` line. */
export function stripLinksToConflicts(text: string): string {
  const hunks = conflictHunks(text).filter((h) => h.sides.every((s) => s.every((l) => l.startsWith('links_to:'))));
  if (hunks.length === 0) return text;
  const lines = text.split('\n');
  const drop = new Set<number>();
  for (const h of hunks) for (let i = h.start; i <= h.end; i++) drop.add(i);
  return lines.filter((_, i) => !drop.has(i)).join('\n');
}

/** Converts generated `\n` text to `\r\n` when the file on disk uses CRLF. */
export function withEol(next: string, current: string | null): string {
  return current !== null && current.includes('\r\n') ? next.replace(/\r?\n/g, '\r\n') : next;
}

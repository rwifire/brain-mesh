import { parse } from 'yaml';
import { classifyTarget } from '../brain/links.js';
import { resolveLink } from '../doctor/checks/links.js';
import { placeOf } from '../doctor/layout.js';
import { BrainId } from '../schemas/common.js';
import type { BrainModel, WorkspaceModel } from '../workspace/load.js';

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Ids of the other brains this brain's notes link to (spec 6.3), mounted or not; sorted and unique. */
export function linksToFor(_ws: WorkspaceModel, b: BrainModel): string[] {
  const ids = new Set<string>();
  for (const note of b.notes) {
    if (placeOf(note.path).kind === 'ignored') continue;
    const from = `${b.dir}/${note.path}`;
    for (const link of note.links) {
      const target = classifyTarget(link.url);
      if (target.kind !== 'path') continue;
      const resolved = resolveLink(from, target.path);
      const parts = resolved?.split('/') ?? [];
      if (parts[0] !== 'brains' || parts.length < 3) continue;
      const id = parts[1]!;
      if (id !== b.id && BrainId.safeParse(id).success) ids.add(id);
    }
  }
  return [...ids].sort(byString);
}

function currentLinksTo(yamlText: string): string[] | null {
  try {
    const value = (parse(yamlText) as Record<string, unknown> | null)?.links_to;
    return Array.isArray(value) ? value.map(String) : null;
  } catch {
    return null;
  }
}

/**
 * Sets `links_to: [a, b]` by editing only its own line(s), so every other byte of
 * `brain.yaml` (comments, quoting, flow styles) stays as written. An empty list removes the key.
 */
export function withLinksTo(yamlText: string, ids: readonly string[]): string {
  const current = currentLinksTo(yamlText) ?? [];
  if (current.length === ids.length && current.every((v, i) => v === ids[i])) return yamlText;

  const eol = yamlText.includes('\r\n') ? '\r\n' : '\n';
  const lines = yamlText.split(/\r?\n/);
  const trailing = lines[lines.length - 1] === '';
  if (trailing) lines.pop();

  // The key's extent: its line plus following block-sequence or indented continuation lines.
  const start = lines.findIndex((l) => /^links_to\s*:/.test(l));
  let end = start;
  if (start !== -1) {
    while (end + 1 < lines.length && /^(\s+\S|-(\s|$))/.test(lines[end + 1]!)) end++;
  }

  const line = `links_to: [${ids.join(', ')}]`;
  if (start === -1) {
    lines.push(line);
  } else if (ids.length === 0) {
    lines.splice(start, end - start + 1);
  } else {
    lines.splice(start, end - start + 1, line);
  }
  return lines.join(eol) + (trailing || start === -1 ? eol : '');
}

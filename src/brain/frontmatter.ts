import { parse } from 'yaml';

export interface FrontmatterSplit {
  /** YAML text between the fences, original line endings kept; null when there is no (closed) block. */
  yaml: string | null;
  body: string;
  /** 1-based line number of the body's first line in the file. */
  bodyStartLine: number;
  /** The block opened with `---` and never closed. */
  unterminated: boolean;
}

/** Splits a leading `---` YAML block from a note. The first line must be exactly `---`. */
export function splitFrontmatter(text: string): FrontmatterSplit {
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  const open = /^---\r?\n/.exec(src);
  if (!open) return { yaml: null, body: src, bodyStartLine: 1, unterminated: false };

  let pos = open[0].length;
  let line = 2;
  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos);
    const end = nl === -1 ? src.length : nl;
    const content = src.slice(pos, end).replace(/\r$/, '');
    if (content === '---' || content === '...') {
      const next = nl === -1 ? src.length : nl + 1;
      return { yaml: src.slice(open[0].length, pos), body: src.slice(next), bodyStartLine: line + 1, unterminated: false };
    }
    if (nl === -1) break;
    pos = nl + 1;
    line++;
  }
  return { yaml: null, body: src, bodyStartLine: 1, unterminated: true };
}

/** Parses frontmatter YAML; the top level must be a mapping. */
export function parseFrontmatter(yaml: string): { data: Record<string, unknown> | null; error: string | null } {
  let value: unknown;
  try {
    value = parse(yaml);
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message.split('\n')[0]! : String(err) };
  }
  if (value === null || value === undefined) return { data: {}, error: null };
  if (typeof value !== 'object' || Array.isArray(value)) return { data: null, error: 'frontmatter is not a mapping' };
  return { data: value as Record<string, unknown>, error: null };
}

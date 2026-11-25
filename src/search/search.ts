import { posix } from 'node:path';
import { splitFrontmatter } from '../brain/frontmatter.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import type { BrainModel, NoteModel, WorkspaceModel } from '../workspace/load.js';

export interface SearchHit {
  brain: string;
  /** Workspace-relative POSIX path. */
  path: string;
  title: string;
  type: string | null;
  summary: string | null;
  match: 'summary' | 'text';
  /** Total occurrences of all terms in title, summary and body. */
  hits: number;
  /** 1-based file line of the first body line holding a term; null when none does. */
  line: number | null;
  snippet: string | null;
}

export interface SearchData {
  query: string;
  terms: string[];
  /** Ids of the brains searched, in search order. */
  brains: string[];
  hits: SearchHit[];
  /** Every match, also those cut by the limit. */
  total: number;
}

const SNIPPET_MAX = 200;
const norm = (s: string) => s.normalize('NFC').toLowerCase();
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** A generated block, kept as blank lines so line numbers stay right. */
const BLOCK = /<!-- brain-mesh:([a-z-]+) -->[\s\S]*?<!-- \/brain-mesh:\1 -->/g;

/** Lower-cased NFC words of `query`; punctuation and spaces separate them (plan Ruling 2). */
export function queryTerms(query: string): string[] {
  return norm(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t !== '');
}

/** Matches `term` at the start of a word, so `ci` finds "CI/CD" but not "decision" (terms are letters and digits only). */
const wordStart = (term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${term}`, 'gu');
const has = (haystack: string, re: RegExp) => {
  re.lastIndex = 0;
  return re.test(haystack);
};
const count = (haystack: string, re: RegExp) => haystack.match(re)?.length ?? 0;

/** Notes `search` reads: not the brain's AGENTS.md/CLAUDE.md, nothing under a dot folder. */
function searchable(path: string): boolean {
  if (path === 'AGENTS.md' || path === 'CLAUDE.md') return false;
  return !path.split('/').some((seg) => seg.startsWith('.'));
}

function score(brain: BrainModel, n: NoteModel, terms: RegExp[]): SearchHit | null {
  const split = splitFrontmatter(n.text);
  const body = split.body.replace(BLOCK, (m) => '\n'.repeat(m.split('\n').length - 1));
  const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body);
  const title = heading ? heading[1]!.trim() : posix.basename(n.path, '.md');
  const rawSummary = n.frontmatter?.summary;
  const summary = typeof rawSummary === 'string' ? rawSummary : null;
  const rawType = n.frontmatter?.type;
  const type = typeof rawType === 'string' ? rawType : null;

  const head = norm(`${title}\n${summary ?? ''}`);
  const lowBody = norm(body);
  if (!terms.every((t) => has(head, t) || has(lowBody, t))) return null;
  const match = terms.every((t) => has(head, t)) ? 'summary' : 'text';
  const hits = terms.reduce((sum, t) => sum + count(head, t) + count(lowBody, t), 0);

  let line: number | null = null;
  let snippet: string | null = null;
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = norm(lines[i]!);
    if (terms.some((t) => has(l, t))) {
      line = split.bodyStartLine + i;
      snippet = lines[i]!.trim().slice(0, SNIPPET_MAX);
      break;
    }
  }
  return { brain: brain.id, path: `${brain.dir}/${n.path}`, title, type, summary, match, hits, line, snippet };
}

/**
 * Deterministic search across the loaded brains: every term must occur; matches in title and
 * summary rank before full-text matches, then by hit count, brain order and path (plan Ruling 2).
 */
export function searchWorkspace(
  ws: WorkspaceModel,
  query: string,
  o: { brains?: string[]; limit?: number } = {},
): { data: SearchData; warnings: Warning[] } {
  const terms = queryTerms(query);
  if (terms.length === 0) throw new CliError(ErrorCode.Usage, 'the query has no words', ExitCode.Usage);
  const warnings: Warning[] = [];

  const mountOrder = (ws.mesh?.mounts ?? []).map((m) => m.id);
  const rank = (id: string) => (id === 'personal' ? -1 : mountOrder.includes(id) ? mountOrder.indexOf(id) : mountOrder.length);
  let brains = [...ws.brains].sort((a, b) => rank(a.id) - rank(b.id) || byString(a.id, b.id));
  if (o.brains !== undefined) {
    const known = new Set([...ws.brains.map((b) => b.id), ...ws.missing, ...mountOrder]);
    for (const id of o.brains) {
      if (!known.has(id)) throw new CliError(ErrorCode.UnknownBrain, `unknown brain: ${id}`, ExitCode.Usage);
      if (!ws.brains.some((b) => b.id === id)) {
        warnings.push({ code: 'W_BRAIN_MISSING', message: `brain ${id} is not cloned in this workspace; skipped` });
      }
    }
    brains = brains.filter((b) => o.brains!.includes(b.id));
  }

  const order = new Map(brains.map((b, i) => [b.id, i]));
  const patterns = terms.map(wordStart);
  const all: SearchHit[] = [];
  for (const b of brains) {
    for (const n of b.notes) {
      if (!searchable(n.path)) continue;
      const hit = score(b, n, patterns);
      if (hit !== null) all.push(hit);
    }
  }
  all.sort(
    (x, y) =>
      (x.match === y.match ? 0 : x.match === 'summary' ? -1 : 1) ||
      y.hits - x.hits ||
      order.get(x.brain)! - order.get(y.brain)! ||
      byString(x.path, y.path),
  );
  const limit = o.limit ?? 20;
  return {
    data: { query, terms, brains: brains.map((b) => b.id), hits: all.slice(0, limit), total: all.length },
    warnings,
  };
}

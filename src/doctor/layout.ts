import { posix } from 'node:path';
import { KNOWLEDGE_TYPES } from '../schemas/note.js';

/** Top-level folders whose names doctor checks for kebab-case. */
export const CONTENT_FOLDERS = ['areas', 'notes', 'maps', 'projects', 'sources', 'daily'] as const;

/** Markdown files at a brain's root that are not notes. */
const ROOT_FILES = new Set(['index.md', 'AGENTS.md', 'CLAUDE.md', 'README.md']);

/** Where a brain-relative markdown path sits, which decides the checks it gets. */
export type Place =
  /** `inbox/**` or anything under a dot folder: only safety checks. */
  | { kind: 'ignored' }
  /** Root files, `notes/README.md`, `daily/**`: no frontmatter or type checks. */
  | { kind: 'exempt' }
  | { kind: 'misplaced' }
  /** Inside a subfolder of an area; `folder` is that subfolder. */
  | { kind: 'nested-area'; folder: string }
  | { kind: 'note'; allowed: readonly string[] };

export function hasDotSegment(path: string): boolean {
  return path.split('/').some((s) => s.startsWith('.'));
}

export function placeOf(path: string): Place {
  const parts = path.split('/');
  const top = parts[0]!;
  if (top === 'inbox' || hasDotSegment(path)) return { kind: 'ignored' };
  const name = parts[parts.length - 1]!;
  if (name === 'AGENTS.md' || name === 'CLAUDE.md') return { kind: 'exempt' };
  if (parts.length === 1) return ROOT_FILES.has(top) ? { kind: 'exempt' } : { kind: 'misplaced' };
  if (top === 'daily') return { kind: 'exempt' };
  if (top === 'areas') {
    if (parts.length === 2) return { kind: 'misplaced' };
    if (parts.length > 3) return { kind: 'nested-area', folder: parts.slice(0, 3).join('/') };
    return parts[2] === 'README.md' ? { kind: 'note', allowed: ['area'] } : { kind: 'note', allowed: KNOWLEDGE_TYPES };
  }
  const flat: Record<string, readonly string[]> = {
    notes: KNOWLEDGE_TYPES,
    maps: ['map'],
    projects: ['project'],
    sources: ['source'],
  };
  const allowed = flat[top];
  if (!allowed || parts.length > 2) return { kind: 'misplaced' };
  if (top === 'notes' && parts[1] === 'README.md') return { kind: 'exempt' };
  return { kind: 'note', allowed };
}

/** `brains/<id>/<rel>` */
export function wsPath(brainDir: string, rel: string): string {
  return posix.join(brainDir, rel);
}

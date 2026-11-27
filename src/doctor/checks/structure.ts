import { posix } from 'node:path';
import type { WorkspaceModel } from '../../workspace/load.js';
import { finding, type Finding } from '../finding.js';
import { CONTENT_FOLDERS, hasDotSegment, placeOf, wsPath } from '../layout.js';

const STEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXT = /^[a-z0-9]+$/;
const NOT_NOTES = new Set(['readme', 'index', 'agents', 'claude']);

function kebabProblem(name: string, isDir: boolean): boolean {
  if (isDir) return !STEM.test(name);
  if (name === 'README.md' || name === 'AGENTS.md' || name === 'CLAUDE.md') return false;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : null;
  return !STEM.test(stem) || (ext !== null && !EXT.test(ext));
}

/** Folders, note placement, types per folder, file names and duplicate stems. */
export function structureChecks(ws: WorkspaceModel): Finding[] {
  const out: Finding[] = [];
  for (const b of ws.brains) {
    const at = (rel: string) => wsPath(b.dir, rel);

    if (b.type === 'shared') {
      for (const dir of ['inbox', 'daily']) {
        if (b.dirs.includes(dir)) {
          out.push(finding('folder-unexpected', { brain: b.id, path: at(dir), message: `${dir}/ belongs to the personal brain only` }));
        }
      }
    }

    const nested = new Set<string>();
    for (const note of b.notes) {
      const place = placeOf(note.path);
      if (place.kind === 'misplaced') {
        out.push(finding('note-misplaced', { brain: b.id, path: at(note.path), message: 'notes belong in notes/, an area, maps/, projects/ or sources/' }));
      } else if (place.kind === 'nested-area') {
        nested.add(place.folder);
      }
    }
    for (const folder of [...nested].sort()) {
      out.push(finding('area-nested', { brain: b.id, path: at(folder), message: 'areas are one level deep; move these notes into the area folder' }));
    }

    for (const dir of b.dirs) {
      const parts = dir.split('/');
      // A dot folder under areas/ (e.g. .trash) is not an area, like dot folders everywhere else.
      if (parts.length === 2 && parts[0] === 'areas' && !parts[1]!.startsWith('.') && !b.files.includes(`${dir}/README.md`)) {
        out.push(finding('area-readme-missing', { brain: b.id, path: at(dir), message: `area ${parts[1]} has no README.md` }));
      }
    }

    const entries = [...b.files.map((p) => ({ p, dir: false })), ...b.dirs.map((p) => ({ p, dir: true }))];
    for (const { p, dir } of entries) {
      const parts = p.split('/');
      if (parts.length < 2 || !(CONTENT_FOLDERS as readonly string[]).includes(parts[0]!) || hasDotSegment(p)) continue;
      if (kebabProblem(parts[parts.length - 1]!, dir)) {
        out.push(finding('filename-not-kebab', { brain: b.id, path: at(p), message: 'names must be lowercase kebab-case' }));
      }
    }

    const byStem = new Map<string, string[]>();
    for (const note of b.notes) {
      if (placeOf(note.path).kind === 'ignored') continue;
      const stem = posix.basename(note.path, '.md').toLowerCase();
      if (NOT_NOTES.has(stem)) continue;
      byStem.set(stem, [...(byStem.get(stem) ?? []), note.path]);
    }
    for (const group of byStem.values()) {
      if (group.length < 2) continue;
      for (const p of group) {
        const others = group.filter((o) => o !== p).join(', ');
        out.push(finding('stem-duplicate', { brain: b.id, path: at(p), message: `file name also used by ${others}` }));
      }
    }
  }
  return out;
}

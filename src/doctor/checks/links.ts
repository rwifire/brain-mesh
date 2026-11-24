import { posix } from 'node:path';
import { classifyTarget } from '../../brain/links.js';
import type { WorkspaceModel } from '../../workspace/load.js';
import { finding, type Finding } from '../finding.js';
import { placeOf, wsPath } from '../layout.js';

/**
 * Resolves a decoded link target against the workspace-relative POSIX path of the note.
 * Returns null for absolute targets and for results outside the workspace root.
 */
export function resolveLink(fromPath: string, target: string): string | null {
  if (target.startsWith('/') || target.startsWith('\\') || /^[a-z]:/i.test(target)) return null;
  const resolved = posix.normalize(posix.join(posix.dirname(fromPath), target)).replace(/\/+$/, '');
  if (resolved === '..' || resolved.startsWith('../') || resolved === '.' || resolved === '') return null;
  return resolved;
}

/** Broken links, links into unmounted brains, and shared → personal links. */
export function linkChecks(ws: WorkspaceModel): Finding[] {
  const out: Finding[] = [];
  for (const b of ws.brains) {
    for (const note of b.notes) {
      if (placeOf(note.path).kind === 'ignored') continue;
      const from = wsPath(b.dir, note.path);
      for (const link of note.links) {
        const target = classifyTarget(link.url);
        if (target.kind !== 'path') continue;
        const base = { brain: b.id, path: from, line: link.line };
        const resolved = resolveLink(from, target.path);
        if (resolved === null) {
          out.push(finding('link-broken', { ...base, message: `link ${link.url} is absolute or leaves the workspace` }));
          continue;
        }
        const parts = resolved.split('/');
        if (parts[0] !== 'brains' || parts.length < 2) {
          out.push(finding('link-broken', { ...base, message: `link ${link.url} points outside brains/` }));
          continue;
        }
        const targetBrain = parts[1]!;
        if (b.type === 'shared' && targetBrain === 'personal') {
          out.push(finding('link-shared-to-personal', { ...base, message: `shared brains may not link into the personal brain: ${link.url}` }));
          continue;
        }
        if (ws.paths.has(resolved)) continue;
        if (!ws.paths.has(`brains/${targetBrain}`)) {
          out.push(finding('link-unmounted', { ...base, message: `link ${link.url} points into ${targetBrain}, which is not mounted` }));
        } else {
          out.push(finding('link-broken', { ...base, message: `link target ${link.url} does not exist` }));
        }
      }
    }
  }
  return out;
}

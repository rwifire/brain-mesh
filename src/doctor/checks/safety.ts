import { posix } from 'node:path';
import type { WorkspaceModel } from '../../workspace/load.js';
import { finding, type Finding } from '../finding.js';
import { wsPath } from '../layout.js';

export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd', '.exe', '.com', '.js', '.mjs', '.cjs',
  '.ts', '.mts', '.cts', '.py', '.rb', '.pl', '.jar', '.vbs',
] as const;

const CLIENT_FOLDERS = ['.claude', '.github/skills', '.github/agents', '.agents'];
const executableExt = new Set<string>(EXECUTABLE_EXTENSIONS);

/** Executables, client folders, CLAUDE.md content and CODEOWNERS placement. Applies everywhere, `inbox/` included. */
export function safetyChecks(ws: WorkspaceModel): Finding[] {
  const out: Finding[] = [];
  for (const b of ws.brains) {
    const at = (rel: string) => wsPath(b.dir, rel);

    for (const file of b.files) {
      const ext = posix.extname(file).toLowerCase();
      if (executableExt.has(ext) || b.shebangs.includes(file)) {
        out.push(finding('executable-file', { brain: b.id, path: at(file), message: 'brains hold knowledge, not code; move scripts to the workspace tools/' }));
      }
    }

    for (const dir of b.dirs) {
      const lower = dir.toLowerCase();
      const folder = CLIENT_FOLDERS.find((f) => lower === f || lower.endsWith(`/${f}`));
      if (folder !== undefined) {
        out.push(finding('client-folder', { brain: b.id, path: at(dir), message: `${folder}/ in a brain is loaded automatically by AI clients` }));
      }
    }

    for (const note of b.notes) {
      if (posix.basename(note.path) !== 'CLAUDE.md') continue;
      const text = note.text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
      if (text !== '@AGENTS.md' && text !== '@AGENTS.md\n') {
        out.push(finding('claude-md-invalid', { brain: b.id, path: at(note.path), message: 'CLAUDE.md in a brain must be exactly the line @AGENTS.md' }));
      }
    }

    if (b.files.includes('.github/CODEOWNERS')) {
      out.push(finding('codeowners-shadowed', { brain: b.id, path: at('.github/CODEOWNERS'), message: 'GitHub prefers .github/CODEOWNERS over the generated root CODEOWNERS' }));
    }
    if (b.files.includes('docs/CODEOWNERS')) {
      out.push(finding('codeowners-redundant', { brain: b.id, path: at('docs/CODEOWNERS'), message: 'the generated root CODEOWNERS already applies' }));
    }
  }
  return out;
}

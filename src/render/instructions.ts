import type { WorkspaceModel } from '../workspace/load.js';
import { fill } from './clients.js';

/** One `.local/*.md` file; `name` is its file name, e.g. `team.md`. */
export interface LocalInstruction {
  name: string;
  text: string;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cell = (s: string) => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const withNewline = (s: string) => (s.endsWith('\n') ? s : `${s}\n`);

/** The mount table: personal first, then `mesh.yaml` order (plan Ruling 10). */
function mountTable(ws: WorkspaceModel): string {
  const description = (id: string) => {
    const m = ws.brains.find((b) => b.id === id)?.manifest;
    return m ? cell(m.description) : '(not cloned)';
  };
  const rows = [
    '| Brain | Mode | Published | Description |',
    '| --- | --- | --- | --- |',
    `| \`personal\` | personal | — | ${description('personal')} |`,
    ...(ws.mesh?.mounts ?? []).map((m) => `| \`${m.id}\` | ${m.mode} | ${m.url === undefined ? 'no' : 'yes'} | ${description(m.id)} |`),
  ];
  return rows.join('\n');
}

/** The workspace's root `AGENTS.md`: core conventions, the mount table, then every `.local/*.md`. */
export function workspaceAgentsMd(template: string, ws: WorkspaceModel, cli: string, local: LocalInstruction[]): string {
  // A function replacement: `$&`, `$'` and `$$` in a brain's description must stay literal.
  const table = mountTable(ws);
  let text = withNewline(fill(template, cli).replace('{{mounts}}', () => table));
  for (const l of [...local].sort((a, b) => byString(a.name, b.name))) {
    text += `\n<!-- from .local/${l.name} -->\n${withNewline(l.text)}`;
  }
  return text;
}

/** Body of the `.gitignore` block: `.mesh/`, `node_modules/`, every mount folder and every rendered client path. */
export function gitignoreBlock(ws: WorkspaceModel, clientPaths: readonly string[]): string {
  const lines = new Set(['.mesh/', 'node_modules/', ...(ws.mesh?.mounts ?? []).map((m) => `brains/${m.id}/`), ...clientPaths]);
  return [...lines].sort(byString).map((l) => `${l}\n`).join('');
}

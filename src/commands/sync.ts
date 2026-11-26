import type { CommandDef } from '../main.js';
import { syncWorkspace, type SyncData } from '../mount/sync.js';
import { CliError, ErrorCode, ExitCode } from '../output.js';
import { findWorkspaceRoot } from '../workspace/find.js';

function text(d: SyncData): string {
  const head = d.pushed ? 'Workspace pulled and pushed.' : 'Workspace pulled; not pushed.';
  if (d.mounts.length === 0) return `${head} No shared brains mounted.`;
  return [head, ...d.mounts.map((m) => `  ${m.id}: ${m.status}${m.detail === undefined ? '' : ` (${m.detail})`}`)].join('\n');
}

/** `sync`: the workspace repo first, then every mount on its own. */
export const syncCommand: CommandDef = {
  name: 'sync',
  description: 'pull and push the workspace, clone missing mounts and fast-forward the rest',
  run: async (ctx) => {
    const root = await findWorkspaceRoot(ctx.cwd);
    if (root === null) throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
    const { warnings, ...data } = await syncWorkspace(root);
    return { data, text: text(data), warnings };
  },
};

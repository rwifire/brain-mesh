import type { CommandDef } from '../main.js';
import { CliError, ErrorCode, ExitCode } from '../output.js';
import { searchWorkspace, type SearchData } from '../search/search.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { loadWorkspace } from '../workspace/load.js';

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function render(d: SearchData): string {
  const lines = d.hits.map((h) => `${h.path}  ${h.summary ?? h.title}`);
  lines.push(`search: ${d.hits.length} of ${plural(d.total, 'match', 'matches')} in ${plural(d.brains.length, 'brain')}`);
  return lines.join('\n');
}

export const searchCommand: CommandDef = {
  name: 'search',
  description: 'search note titles and summaries first, then full text, across brains',
  configure: (cmd) => {
    cmd.argument('<query...>', 'words to search for; every word must occur');
    cmd.option('--brain <ids>', 'comma-separated brain ids to search (default: all)');
    cmd.option('--limit <n>', 'maximum number of hits', '20');
  },
  run: async (ctx, args, opts) => {
    const root = await findWorkspaceRoot(ctx.cwd);
    if (root === null) {
      throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
    }
    const limit = Number(opts.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new CliError(ErrorCode.Usage, '--limit must be a positive whole number', ExitCode.Usage);
    const brains =
      typeof opts.brain === 'string'
        ? opts.brain
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== '')
        : undefined;
    const ws = await loadWorkspace(root, { parseLinks: false });
    const { data, warnings } = searchWorkspace(ws, args.join(' '), brains === undefined ? { limit } : { brains, limit });
    return { data, text: render(data), warnings: [...warnings, ...ws.warnings] };
  },
};

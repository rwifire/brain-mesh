import type { Finding } from '../doctor/finding.js';
import { runChecks } from '../doctor/run.js';
import type { CommandDef } from '../main.js';
import { CliError, ErrorCode, ExitCode } from '../output.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { loadWorkspace } from '../workspace/load.js';

export interface DoctorData {
  root: string;
  /** Ids of the brains checked; just the named one when filtered. */
  brains: string[];
  findings: Finding[];
  counts: { errors: number; warnings: number };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function render(data: DoctorData): string {
  const n = data.brains.length;
  if (data.findings.length === 0) return `doctor: no problems in ${plural(n, 'brain')}`;
  const lines = data.findings.map((f) => {
    const where = f.path === null ? '(workspace)' : f.line === undefined ? f.path : `${f.path}:${f.line}`;
    return `${where}  ${f.severity}  ${f.code}  ${f.message}`;
  });
  lines.push(`doctor: ${plural(data.counts.errors, 'error')}, ${plural(data.counts.warnings, 'warning')} in ${plural(n, 'brain')}`);
  return lines.join('\n');
}

export const doctorCommand: CommandDef = {
  name: 'doctor',
  description: 'check brains for broken links, structure and policy problems',
  configure: (cmd) => {
    cmd.argument('[brain]', 'check only this brain');
  },
  run: async (ctx, args) => {
    const root = await findWorkspaceRoot(ctx.cwd);
    if (root === null) {
      throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
    }
    const ws = await loadWorkspace(root);
    const only = args[0];
    if (only !== undefined && !ws.brains.some((b) => b.id === only) && !ws.missing.includes(only)) {
      const why = ws.meshError !== null ? ' (mesh.yaml is invalid, so only the personal brain can be checked)' : '';
      throw new CliError(ErrorCode.UnknownBrain, `unknown brain: ${only}${why}`, ExitCode.Usage);
    }
    const findings = runChecks(ws, only);
    const errors = findings.filter((f) => f.severity === 'error').length;
    const data: DoctorData = {
      root,
      brains: only === undefined ? ws.brains.map((b) => b.id) : [only],
      findings,
      counts: { errors, warnings: findings.length - errors },
    };
    return { data, text: render(data), warnings: ws.warnings, exitCode: errors > 0 ? ExitCode.Failure : ExitCode.Ok };
  },
};

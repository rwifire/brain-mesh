import { sortFindings, type Finding } from '../doctor/finding.js';
import { fixGenerated, type FixedFile } from '../doctor/fix.js';
import { hostChecks } from '../doctor/host-checks.js';
import { runChecks } from '../doctor/run.js';
import type { Host } from '../host/host.js';
import type { CommandDef } from '../main.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { loadWorkspace, type WorkspaceModel } from '../workspace/load.js';

export interface DoctorData {
  root: string;
  /** Ids of the brains checked; just the named one when filtered. */
  brains: string[];
  findings: Finding[];
  counts: { errors: number; warnings: number };
  /** Files `--fix` wrote; empty without `--fix`. */
  fixed: FixedFile[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function render(data: DoctorData): string {
  const n = data.brains.length;
  const lines = data.fixed.map((f) => `fixed ${f.path} (${f.code})`);
  if (data.findings.length === 0) {
    lines.push(`doctor: no problems in ${plural(n, 'brain')}`);
    return lines.join('\n');
  }
  for (const f of data.findings) {
    const where = f.path === null ? '(workspace)' : f.line === undefined ? f.path : `${f.path}:${f.line}`;
    lines.push(`${where}  ${f.severity}  ${f.code}  ${f.message}`);
  }
  lines.push(`doctor: ${plural(data.counts.errors, 'error')}, ${plural(data.counts.warnings, 'warning')} in ${plural(n, 'brain')}`);
  return lines.join('\n');
}

/** `doctor`: offline checks, then owner validity and push rights through `deps.host` (spec 8). */
export function doctorCommand(deps: { host: Host }): CommandDef {
  return {
    name: 'doctor',
    description: 'check brains for broken links, structure and policy problems',
    configure: (cmd) => {
      cmd.argument('[brain]', 'check only this brain');
      cmd.option('--fix', 'regenerate out-of-date generated content');
      cmd.option('--offline', 'skip checks that need the network');
    },
    run: async (ctx, args, opts) => {
      const root = await findWorkspaceRoot(ctx.cwd);
      if (root === null) {
        throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
      }
      let ws = await loadWorkspace(root);
      const only = args[0];
      if (only !== undefined && !ws.brains.some((b) => b.id === only) && !ws.missing.includes(only)) {
        const why = ws.meshError !== null ? ' (mesh.yaml is invalid, so only the personal brain can be checked)' : '';
        throw new CliError(ErrorCode.UnknownBrain, `unknown brain: ${only}${why}`, ExitCode.Usage);
      }
      let fixed: FixedFile[] = [];
      let fixWarnings: Warning[] = [];
      if (opts.fix === true) {
        ({ fixed, warnings: fixWarnings } = await fixGenerated(ws, only));
        if (fixed.length > 0) ws = await loadWorkspace(root);
      }
      const net = await hostChecks(ws, deps.host, { ...(only === undefined ? {} : { brain: only }), offline: opts.offline === true });
      const findings = sortFindings([...runChecks(ws, only), ...net.findings]);
      const errors = findings.filter((f) => f.severity === 'error').length;
      const data: DoctorData = {
        root,
        brains: only === undefined ? ws.brains.map((b) => b.id) : [only],
        findings,
        counts: { errors, warnings: findings.length - errors },
        fixed,
      };
      return { data, text: render(data), warnings: [...fixWarnings, ...ws.warnings, ...net.warnings], exitCode: errors > 0 ? ExitCode.Failure : ExitCode.Ok };
    },
  };
}

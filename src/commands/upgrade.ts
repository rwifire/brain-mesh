import { join } from 'node:path';
import { lt } from 'semver';
import type { CommandDef } from '../main.js';
import { packageVersion } from '../meta.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { packageCore, readAgents, readSkills, type CoreSource } from '../render/core.js';
import { readRecord, renderWorkspace } from '../render/workspace.js';
import { unifiedDiff } from '../upgrade/diff.js';
import { overrideChanges, type OverrideChange } from '../upgrade/overrides.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { readMesh, setPin } from '../workspace/mesh-edit.js';
import { assertGitIdentity, commitPaths, pullPush, WORKSPACE_CONFIG } from '../workspace/repo.js';

/** The template files a user may edit by hand (spec 4): kept unless accepted. */
const SEEDS = ['.gitattributes', 'brains/.obsidian/app.json'] as const;

export interface UpgradeData {
  from: string;
  to: string;
  /** False when the workspace was already on `to` (the run only re-rendered). */
  upgraded: boolean;
  written: string[];
  removed: string[];
  /** Managed files edited by hand: replaced; the diff shows what was lost. */
  overwritten: { path: string; diff: string }[];
  seeds: { path: string; status: 'written' | 'updated' | 'accepted' | 'kept'; diff: string }[];
  overrides: OverrideChange[];
  commit: string | null;
  pushed: boolean;
  dryRun: boolean;
}

const npx = (v: string) => `npx -y brain-mesh-ai-workspace@${v}`;

function text(d: UpgradeData): string {
  const n = `${d.written.length} file${d.written.length === 1 ? '' : 's'}`;
  const lines = [
    d.dryRun
      ? `Would upgrade from ${d.from} to ${d.to}: ${n} would be re-rendered; nothing was changed.`
      : d.upgraded
        ? `Upgraded from ${d.from} to ${d.to}: ${n} re-rendered${d.pushed ? ', committed and pushed.' : d.commit !== null ? '; committed locally, not pushed.' : '.'}`
        : `Already on ${d.to}; ${n} re-rendered.`,
  ];
  const section = (title: string, items: { head: string; diff: string }[]) => {
    if (items.length === 0) return;
    lines.push('', `${title}:`);
    for (const i of items) lines.push('', i.head, ...(i.diff === '' ? [] : [i.diff.trimEnd()]));
  };
  section('Overwritten hand edits (put your own text in .local/)', d.overwritten.map((o) => ({ head: o.path, diff: o.diff })));
  section(
    'Template files',
    d.seeds.map((s) => ({ head: `${s.path} (${s.status}${s.status === 'kept' ? `; run upgrade --accept ${s.path} to take the new one` : ''})`, diff: s.diff })),
  );
  section('Overridden skills and agents (yours stays in use)', d.overrides.map((o) => ({ head: `${o.kind} ${o.name} (${o.status} upstream)`, diff: o.diff })));
  return lines.join('\n');
}

/**
 * `upgrade`: moves the workspace to the running core version (chunk 11 plan). Bumps the pin and
 * re-renders the managed files; user files are untouched, hand-edited template files are kept
 * unless accepted, and every hand edit and changed override is shown as a diff.
 */
export function upgradeCommandFor(deps: { core?: CoreSource; version?: string } = {}): CommandDef {
  return {
    name: 'upgrade',
    description: 'move the workspace to this brain-mesh version: bump the pin, re-render the managed files',
    configure: (cmd) => {
      cmd.option('--to <version>', 'the version to upgrade to; run it as npx -y brain-mesh-ai-workspace@<version> upgrade');
      cmd.option('--accept <path...>', `take the new version of a hand-edited template file (${SEEDS.join(', ')})`);
      cmd.option('--dry-run', 'show what would change and the diffs, change nothing');
    },
    run: async (ctx, _args, opts) => {
      const core = deps.core ?? packageCore();
      const to = deps.version ?? packageVersion();
      const dryRun = opts.dryRun === true;
      const root = await findWorkspaceRoot(ctx.cwd);
      if (root === null) throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
      if (typeof opts.to === 'string' && opts.to !== to) {
        throw new CliError(ErrorCode.PinMismatch, `this is brain-mesh ${to}; run ${npx(opts.to)} upgrade`);
      }
      const accept = (Array.isArray(opts.accept) ? opts.accept.map(String) : []).map((p) => p.replace(/\\/g, '/'));
      const bad = accept.find((p) => !(SEEDS as readonly string[]).includes(p));
      if (bad !== undefined) throw new CliError(ErrorCode.Usage, `--accept takes a template file (${SEEDS.join(', ')}), not ${bad}`, ExitCode.Usage);

      const from = (await readMesh(root)).brain_mesh;
      if (lt(to, from)) throw new CliError(ErrorCode.Downgrade, `this workspace is on ${from}, which is newer than ${to}; run ${npx(from)} upgrade or a newer one`);
      if ((await readRecord(root)) === null) {
        throw new CliError(ErrorCode.NoRenderRecord, `.mesh/render.json is missing, so hand edits cannot be found; run ${npx(from)} init first to rebuild it, then upgrade`);
      }
      if (!dryRun) await assertGitIdentity(root);

      // Before the render: it overwrites the old core copies under .mesh/ that overrides are compared with.
      const overrides = await overrideChanges(
        root,
        { skills: (await readSkills(core.skillsDir, 'core')).skills, agents: (await readAgents(core.agentsDir, 'core')).agents },
        { skills: (await readSkills(join(root, '.local', 'skills'), 'local')).skills, agents: (await readAgents(join(root, '.local', 'agents'), 'local')).agents },
      );
      const r = await renderWorkspace(root, { core, pin: to, write: !dryRun, seeds: { accept: new Set(accept) } });
      const warnings: Warning[] = [...r.warnings];
      const overwritten: UpgradeData['overwritten'] = [];
      const seeds: UpgradeData['seeds'] = [];
      for (const c of r.changes) {
        if (c.kind === 'managed' && c.handEdited) {
          overwritten.push({ path: c.path, diff: await unifiedDiff(c.path, c.before, c.after) });
          warnings.push({ code: 'W_HAND_EDIT_OVERWRITTEN', message: `${c.path} was edited by hand and ${dryRun ? 'would be' : 'was'} re-rendered; the diff shows the edit. Put your own text in .local/ instead` });
        }
        if (c.kind === 'seed') {
          seeds.push({ path: c.path, status: c.status, diff: await unifiedDiff(c.path, c.before, c.after) });
          if (c.status === 'kept') warnings.push({ code: 'W_SEED_KEPT', message: `${c.path} was edited by hand, so the new version was not written; run upgrade --accept ${c.path} to take it` });
        }
      }
      for (const o of overrides) {
        warnings.push({ code: 'W_OVERRIDE_UPSTREAM', message: `your .local ${o.kind} ${o.name} overrides a core ${o.kind} that ${o.status === 'new' ? 'is new in' : 'changed in'} ${to}; the diff shows the core change` });
      }

      const data: UpgradeData = { from, to, upgraded: from !== to, written: r.written, removed: r.removed, overwritten, seeds, overrides, commit: null, pushed: false, dryRun };
      if (!dryRun) {
        if (from !== to) await setPin(root, to);
        data.commit = await commitPaths(root, [...WORKSPACE_CONFIG, ...SEEDS], `Upgrade brain-mesh from ${from} to ${to}`);
        const sync = await pullPush(root);
        data.pushed = sync.pushed;
        warnings.push(...sync.warnings);
      }
      return { data, text: text(data), warnings };
    },
  };
}

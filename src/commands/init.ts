import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Option } from 'commander';
import { runChecks } from '../doctor/run.js';
import { git, gitOk } from '../git.js';
import type { Host } from '../host/host.js';
import type { CommandDef } from '../main.js';
import { packageVersion } from '../meta.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { syncWorkspace, type SyncData } from '../mount/sync.js';
import { renderWorkspace } from '../render/workspace.js';
import { createWorkspace } from '../workspace/create.js';
import { readMesh } from '../workspace/mesh-edit.js';
import { loadWorkspace } from '../workspace/load.js';
import { assertEmptyRemote } from '../workspace/repo.js';

export interface InitData {
  /** `restore` when the folder already held a cloned workspace (chunk 9 plan, decision 6). */
  mode: 'new' | 'restore';
  root: string;
  /** GitHub login of the user; also the personal brain's owner. */
  user: string;
  /** The pinned core version written to `mesh.yaml`. */
  brain_mesh: string;
  /** The clone URL `origin` points at. */
  remote: string;
  /** True when `init` created the repo; false with `--remote`. */
  repoCreated: boolean;
  /** Files of the first commit, sorted. */
  files: string[];
  doctor: { errors: number; warnings: number };
  /** Restore only: what `sync` did. */
  sync?: SyncData;
}

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const exists = (p: string) => stat(p).then(() => true, () => false);

/** Fails unless `root` is empty (plan Ruling 1); true when it holds a workspace to restore instead. */
async function assertEmpty(root: string): Promise<boolean> {
  const entries = await readdir(root);
  if (entries.includes('mesh.yaml')) return true;
  if (entries.length > 0) {
    throw new CliError(ErrorCode.NotEmpty, `init needs an empty folder; ${root} has ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  }
  return false;
}

const doctorCounts = async (root: string) => {
  const findings = runChecks(await loadWorkspace(root));
  const errors = findings.filter((f) => f.severity === 'error').length;
  return { errors, warnings: findings.length - errors };
};

/**
 * `init` in a cloned workspace (chunk 9 plan, decision 6): checks mesh.yaml, the pin and the
 * clone before writing anything, then renders, sets the hooks path and syncs the mounts.
 */
async function restore(root: string): Promise<{ data: InitData; text: string; warnings: Warning[]; exitCode: number }> {
  const mesh = await readMesh(root);
  const pin = packageVersion();
  if (mesh.brain_mesh !== pin) {
    throw new CliError(
      ErrorCode.PinMismatch,
      `this workspace is pinned to brain-mesh ${mesh.brain_mesh}, but this is ${pin}; run npx -y brain-mesh-ai-workspace@${mesh.brain_mesh} init`,
    );
  }
  const top = await git(root, ['rev-parse', '--show-toplevel']);
  if (!(await exists(join(root, '.git'))) || top.exitCode !== 0) {
    throw new CliError(ErrorCode.Git, `${root} is not a git clone of a workspace; git clone your workspace repo, then run brain-mesh init in that folder`);
  }
  const warnings: Warning[] = [];
  warnings.push(...(await renderWorkspace(root)).warnings);
  await gitOk(root, ['config', 'core.hooksPath', '.mesh/hooks']);
  const { warnings: syncWarnings, ...sync } = await syncWorkspace(root);
  warnings.push(...syncWarnings);
  const origin = await git(root, ['remote', 'get-url', 'origin']);
  const doctor = await doctorCounts(root);
  const data: InitData = {
    mode: 'restore',
    root,
    user: mesh.user,
    brain_mesh: pin,
    remote: origin.exitCode === 0 ? origin.stdout.trim() : '',
    repoCreated: false,
    files: (await gitOk(root, ['ls-files'])).split('\n').filter((f) => f !== '').sort(byString),
    doctor,
    sync,
  };
  const cloned = sync.mounts.filter((m) => m.status === 'cloned').length;
  const text = [
    `Restored the brain-mesh workspace of ${mesh.user} in ${root}`,
    `${sync.mounts.length} shared brain${sync.mounts.length === 1 ? '' : 's'} mounted, ${cloned} cloned now.`,
    `Open ${join(root, 'brains')} as an Obsidian vault.`,
  ].join('\n');
  return { data, text, warnings, exitCode: doctor.errors > 0 ? ExitCode.Failure : ExitCode.Ok };
}

/** `init`: a new workspace, its private repo and the first push (spec 4, plan Rulings 1–8, 16). */
export function initCommand(deps: { host: Host }): CommandDef {
  return {
    name: 'init',
    description: 'create a workspace with a personal brain and a private repo',
    configure: (cmd) => {
      cmd.addOption(new Option('--remote <url>', 'use this existing empty repo instead of creating one').conflicts('name'));
      cmd.option('--name <repo>', 'name of the private repo to create', 'ai-workspace');
    },
    run: async (ctx, _args, opts) => {
      const root = ctx.cwd;
      const remoteOpt = typeof opts.remote === 'string' ? opts.remote : undefined;
      const name = typeof opts.name === 'string' ? opts.name : 'ai-workspace';

      // Everything that can fail is checked before anything is written or created (Ruling 6).
      if (await assertEmpty(root)) return restore(root);
      if ((await git(root, ['var', 'GIT_COMMITTER_IDENT'])).exitCode !== 0) {
        throw new CliError(ErrorCode.Git, 'git does not know who you are; set git config --global user.name and user.email');
      }
      const user = await deps.host.login();
      let remote: string;
      if (remoteOpt !== undefined) {
        await assertEmptyRemote(root, remoteOpt, 'init');
        remote = remoteOpt;
      } else {
        remote = await deps.host.createPrivateRepo(name);
      }

      const pin = packageVersion();
      let warnings: Warning[];
      try {
        await gitOk(root, ['init', '-q', '-b', 'main']);
        ({ warnings } = await createWorkspace(root, { user, pin }));
        await gitOk(root, ['add', '-A']);
        // The first commit mixes personal and other files on purpose (Ruling 7): no user hooks, no signing prompt.
        await gitOk(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'Create brain-mesh workspace']);
        await gitOk(root, ['config', 'core.hooksPath', '.mesh/hooks']);
        await gitOk(root, ['remote', 'add', 'origin', remote]);
      } catch (err) {
        // The remote repo exists now and the folder is no longer empty: say how to finish (final review I2).
        const why = err instanceof Error ? err.message : String(err);
        throw new CliError(
          ErrorCode.Git,
          `${why}. The repo ${remote} exists and ${root} now holds a partly built workspace: empty that folder, then run brain-mesh init --remote ${remote} in it`,
        );
      }
      const push = await git(root, ['push', '-q', '-u', 'origin', 'main']);
      if (push.exitCode !== 0) {
        throw new CliError(
          ErrorCode.Git,
          `the workspace is committed in ${root}, but the push to ${remote} failed: ${firstLine(push.stderr)}. Fix that, then run git push -u origin main there`,
        );
      }

      const doctor = await doctorCounts(root);
      const files = (await gitOk(root, ['ls-files'])).split('\n').filter((f) => f !== '').sort(byString);
      const data: InitData = {
        mode: 'new',
        root,
        user,
        brain_mesh: pin,
        remote,
        repoCreated: remoteOpt === undefined,
        files,
        doctor,
      };
      const text = [
        `Created the brain-mesh workspace for ${user} in ${root}`,
        `Pushed to ${remote}`,
        `Open ${join(root, 'brains')} as an Obsidian vault.`,
      ].join('\n');
      return { data, text, warnings, exitCode: doctor.errors > 0 ? ExitCode.Failure : ExitCode.Ok };
    },
  };
}

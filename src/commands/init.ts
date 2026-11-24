import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Option } from 'commander';
import { runChecks } from '../doctor/run.js';
import { git, gitOk } from '../git.js';
import type { Host } from '../host/host.js';
import type { CommandDef } from '../main.js';
import { packageVersion } from '../meta.js';
import { CliError, ErrorCode, ExitCode } from '../output.js';
import { createWorkspace } from '../workspace/create.js';
import { loadWorkspace } from '../workspace/load.js';

export interface InitData {
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
}

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fails unless `root` is empty (plan Ruling 1). */
async function assertEmpty(root: string): Promise<void> {
  const entries = await readdir(root);
  if (entries.includes('mesh.yaml')) {
    throw new CliError(ErrorCode.NotSupported, 'this folder already holds a workspace; restoring an existing workspace is not supported yet');
  }
  if (entries.length > 0) {
    throw new CliError(ErrorCode.NotEmpty, `init needs an empty folder; ${root} has ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  }
}

/** `--remote` must be reachable and hold no refs (plan Ruling 5). */
async function assertEmptyRemote(root: string, url: string): Promise<void> {
  const r = await git(root, ['ls-remote', url]);
  if (r.exitCode !== 0) throw new CliError(ErrorCode.Git, `cannot reach ${url}: ${firstLine(r.stderr)}`);
  if (r.stdout.trim() !== '') {
    throw new CliError(ErrorCode.RemoteNotEmpty, `${url} already has commits; init needs an empty repo`);
  }
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
      await assertEmpty(root);
      if ((await git(root, ['var', 'GIT_COMMITTER_IDENT'])).exitCode !== 0) {
        throw new CliError(ErrorCode.Git, 'git does not know who you are; set git config --global user.name and user.email');
      }
      const user = await deps.host.login();
      let remote: string;
      if (remoteOpt !== undefined) {
        await assertEmptyRemote(root, remoteOpt);
        remote = remoteOpt;
      } else {
        remote = await deps.host.createPrivateRepo(name);
      }

      const pin = packageVersion();
      await gitOk(root, ['init', '-q', '-b', 'main']);
      const { warnings } = await createWorkspace(root, { user, pin });
      await gitOk(root, ['add', '-A']);
      await gitOk(root, ['commit', '-q', '-m', 'Create brain-mesh workspace']);
      // After the first commit, which mixes personal and other files on purpose (Ruling 7).
      await gitOk(root, ['config', 'core.hooksPath', '.mesh/hooks']);
      await gitOk(root, ['remote', 'add', 'origin', remote]);
      const push = await git(root, ['push', '-q', '-u', 'origin', 'main']);
      if (push.exitCode !== 0) {
        throw new CliError(
          ErrorCode.Git,
          `the workspace is committed in ${root}, but the push to ${remote} failed: ${firstLine(push.stderr)}. Fix that, then run git push -u origin main there`,
        );
      }

      const findings = runChecks(await loadWorkspace(root));
      const errors = findings.filter((f) => f.severity === 'error').length;
      const files = (await gitOk(root, ['ls-files'])).split('\n').filter((f) => f !== '').sort(byString);
      const data: InitData = {
        root,
        user,
        brain_mesh: pin,
        remote,
        repoCreated: remoteOpt === undefined,
        files,
        doctor: { errors, warnings: findings.length - errors },
      };
      const text = [
        `Created the brain-mesh workspace for ${user} in ${root}`,
        `Pushed to ${remote}`,
        `Open ${join(root, 'brains')} as an Obsidian vault.`,
      ].join('\n');
      return { data, text, warnings, exitCode: errors > 0 ? ExitCode.Failure : ExitCode.Ok };
    },
  };
}

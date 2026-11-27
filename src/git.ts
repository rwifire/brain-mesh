import { execa } from 'execa';
import { CliError, ErrorCode } from './output.js';

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();

export interface GitOptions {
  /** A call that talks to a remote: git never waits on a prompt (see `networkEnv`). */
  network?: boolean;
}

/**
 * The env for a git call that talks to a remote: no terminal prompt, no Git Credential Manager
 * dialog, and SSH in batch mode. A user's own ssh client (`GIT_SSH_COMMAND`, `GIT_SSH` or
 * `core.sshCommand`, passed as `ownSsh`) is kept: git would let our env var win over it.
 */
export function networkEnv(base: NodeJS.ProcessEnv, ownSsh = false): Record<string, string> {
  const keepSsh = ownSsh || base.GIT_SSH_COMMAND !== undefined || base.GIT_SSH !== undefined;
  return {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    ...(keepSsh ? {} : { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }),
  };
}

/** True when git config, as seen from `cwd`, sets `core.sshCommand`. */
export async function ownSshConfigured(cwd: string): Promise<boolean> {
  const r = await execa('git', ['config', '--get', 'core.sshCommand'], { cwd, reject: false });
  return r.exitCode === 0 && String(r.stdout).trim() !== '';
}

/** Runs git in `cwd`; a non-zero exit is returned, not thrown. */
export async function git(cwd: string, args: readonly string[], opts: GitOptions = {}): Promise<RunResult> {
  const r = await execa('git', args, {
    cwd,
    reject: false,
    stripFinalNewline: true,
    ...(opts.network === true ? { env: networkEnv(process.env, await ownSshConfigured(cwd)) } : {}),
  });
  if (r.exitCode === undefined) throw new CliError(ErrorCode.Git, `git could not be started: ${firstLine(String(r.message))}`);
  return { exitCode: r.exitCode, stdout: String(r.stdout), stderr: String(r.stderr) };
}

/** Runs git in `cwd` and returns stdout; a non-zero exit throws `E_GIT` with git's first stderr line. */
export async function gitOk(cwd: string, args: readonly string[], opts: GitOptions = {}): Promise<string> {
  const r = await git(cwd, args, opts);
  if (r.exitCode !== 0) throw new CliError(ErrorCode.Git, `git ${args[0]} failed: ${firstLine(r.stderr || r.stdout)}`);
  return r.stdout;
}

/** True when `git status --porcelain` in `dir` prints anything. Throws when git fails. */
export async function gitIsDirty(dir: string): Promise<boolean> {
  return (await gitOk(dir, ['status', '--porcelain'])).trim() !== '';
}

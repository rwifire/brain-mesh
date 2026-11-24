import { execa } from 'execa';
import { CliError, ErrorCode } from './output.js';

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();

/** Runs git in `cwd`; a non-zero exit is returned, not thrown. */
export async function git(cwd: string, args: readonly string[]): Promise<RunResult> {
  const r = await execa('git', args, { cwd, reject: false, stripFinalNewline: true });
  if (r.exitCode === undefined) throw new CliError(ErrorCode.Git, `git could not be started: ${firstLine(String(r.message))}`);
  return { exitCode: r.exitCode, stdout: String(r.stdout), stderr: String(r.stderr) };
}

/** Runs git in `cwd` and returns stdout; a non-zero exit throws `E_GIT` with git's first stderr line. */
export async function gitOk(cwd: string, args: readonly string[]): Promise<string> {
  const r = await git(cwd, args);
  if (r.exitCode !== 0) throw new CliError(ErrorCode.Git, `git ${args[0]} failed: ${firstLine(r.stderr || r.stdout)}`);
  return r.stdout;
}

/** True when `git status --porcelain` in `dir` prints anything. Throws when git fails. */
export async function gitIsDirty(dir: string): Promise<boolean> {
  return (await gitOk(dir, ['status', '--porcelain'])).trim() !== '';
}

import { execa } from 'execa';
import type { RunResult } from '../git.js';
import { CliError, ErrorCode } from '../output.js';
import type { Host } from './host.js';

/** Runs `gh` with `args`; throws `E_GH_MISSING` when gh cannot be started. */
export type GhRunner = (args: readonly string[]) => Promise<RunResult>;

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();

/**
 * A command that cannot be started: Linux reports ENOENT (no exit code); on Windows execa runs it
 * through cmd, which exits 1 with "is not recognized as an internal or external command".
 */
export function notFound(exitCode: number | undefined, stderr: string): boolean {
  return exitCode === undefined || (exitCode === 1 && /is not recognized as an internal or external command/.test(stderr));
}

const runGh: GhRunner = async (args) => {
  const r = await execa('gh', args, { reject: false, stripFinalNewline: true });
  if (notFound(r.exitCode, String(r.stderr))) throw new CliError(ErrorCode.GhMissing, 'gh is not installed; see https://cli.github.com');
  return { exitCode: r.exitCode ?? 1, stdout: String(r.stdout), stderr: String(r.stderr) };
};

/** The github.com host through an installed, logged-in `gh` (spec 3). */
export function githubHost(run: GhRunner = runGh): Host {
  return {
    async login() {
      if ((await run(['auth', 'status'])).exitCode !== 0) {
        throw new CliError(ErrorCode.GhAuth, 'gh is not logged in; run gh auth login');
      }
      const r = await run(['api', 'user', '--jq', '.login']);
      const login = r.stdout.trim();
      if (r.exitCode !== 0 || login === '') {
        throw new CliError(ErrorCode.GhAuth, `could not read your GitHub login: ${firstLine(r.stderr)}`);
      }
      return login;
    },

    async createPrivateRepo(name) {
      const r = await run(['repo', 'create', name, '--private']);
      if (r.exitCode !== 0) {
        if (/name already exists/i.test(r.stderr)) {
          throw new CliError(
            ErrorCode.RepoCreate,
            `a repo named ${name} already exists in your account; choose another with --name <repo> or use it with --remote <url>`,
          );
        }
        throw new CliError(
          ErrorCode.RepoCreate,
          `could not create the private repo ${name}: ${firstLine(r.stderr)}. If your enterprise blocks repos in your own namespace, create a repo elsewhere and pass --remote <url>`,
        );
      }
      const m = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)/.exec(r.stdout);
      if (m === null) throw new CliError(ErrorCode.RepoCreate, `gh created ${name} but printed no URL: ${firstLine(r.stdout)}`);
      const [, owner, repo] = m;
      const protocol = (await run(['config', 'get', 'git_protocol'])).stdout.trim();
      return protocol === 'ssh' ? `git@github.com:${owner}/${repo}.git` : `https://github.com/${owner}/${repo}.git`;
    },
  };
}

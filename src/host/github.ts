import { execa } from 'execa';
import type { RunResult } from '../git.js';
import { CliError, ErrorCode } from '../output.js';
import type { Host, OwnerStatus, Permission, RepoRef } from './host.js';

/** Runs `gh` with `args` (and `input` on stdin); throws `E_GH_MISSING` when gh cannot be started. */
export type GhRunner = (args: readonly string[], opts?: { input?: string }) => Promise<RunResult>;

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();

/**
 * A command that cannot be started: Linux reports ENOENT (no exit code); on Windows execa runs it
 * through cmd, which exits 1 with "is not recognized as an internal or external command".
 */
export function notFound(exitCode: number | undefined, stderr: string): boolean {
  return exitCode === undefined || (exitCode === 1 && /is not recognized as an internal or external command/.test(stderr));
}

const OFFLINE = /error connecting to|dial tcp|no such host|could not resolve host|i\/o timeout|network is unreachable|connection refused|TLS handshake timeout/i;
const AUTH = /gh auth login|not logged in|HTTP 401|Bad credentials/i;

/** Why a gh call failed, when the reason is the network or the login; null for anything else. */
export function ghFailure(r: RunResult): 'offline' | 'auth' | null {
  const text = `${r.stderr}\n${r.stdout}`;
  if (OFFLINE.test(text)) return 'offline';
  if (r.exitCode === 4 || AUTH.test(text)) return 'auth';
  return null;
}

const offlineError = (r: RunResult) =>
  new CliError(
    ErrorCode.Offline,
    `cannot reach github.com (${firstLine(r.stderr || r.stdout)}); check your connection, or use --offline where the command offers it`,
  );
const authError = () => new CliError(ErrorCode.GhAuth, 'gh is not logged in; run gh auth login');

const runGh: GhRunner = async (args, opts = {}) => {
  const r = await execa('gh', args, {
    reject: false,
    stripFinalNewline: true,
    env: { GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
    ...(opts.input === undefined ? {} : { input: opts.input }),
  });
  if (notFound(r.exitCode, String(r.stderr))) throw new CliError(ErrorCode.GhMissing, 'gh is not installed; see https://cli.github.com');
  return { exitCode: r.exitCode ?? 1, stdout: String(r.stdout), stderr: String(r.stderr) };
};

const REPO_URL = [
  /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
  /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
  /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
];

/** The github.com repo a clone URL names; null for other hosts, local paths and incomplete URLs. */
export function githubRepoOf(url: string): RepoRef | null {
  for (const re of REPO_URL) {
    const m = re.exec(url.trim());
    if (m !== null) return { owner: m[1]!, name: m[2]! };
  }
  return null;
}

const ROLES: readonly [string, Permission][] = [
  ['admin', 'admin'],
  ['maintain', 'maintain'],
  ['push', 'write'],
  ['triage', 'triage'],
  ['pull', 'read'],
];
const permissionsOf = (json: unknown): Record<string, unknown> => {
  const p = (json as { permissions?: unknown } | null)?.permissions;
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
};
const canWrite = (json: unknown) => {
  const p = permissionsOf(json);
  return p.admin === true || p.maintain === true || p.push === true;
};

/** The github.com host through an installed, logged-in `gh` (spec 3). */
export function githubHost(run: GhRunner = runGh): Host {
  /**
   * One REST call through `gh api`. Answers 2xx as status 200 and other HTTP answers with their
   * status; throws `E_OFFLINE`, `E_GH_AUTH`, or `E_HOST` for a failure with no HTTP status.
   */
  async function api(
    path: string,
    o: { method?: 'GET' | 'POST'; body?: unknown; accept?: string } = {},
  ): Promise<{ status: number; json: unknown }> {
    const args = ['api', path, '--method', o.method ?? 'GET'];
    if (o.accept !== undefined) args.push('-H', `Accept: ${o.accept}`);
    if (o.body !== undefined) args.push('--input', '-');
    const r = await run(args, o.body === undefined ? undefined : { input: JSON.stringify(o.body) });
    const json = (): unknown => {
      try {
        return r.stdout.trim() === '' ? null : (JSON.parse(r.stdout) as unknown);
      } catch {
        return null;
      }
    };
    if (r.exitCode === 0) return { status: 200, json: json() };
    const why = ghFailure(r);
    if (why === 'offline') throw offlineError(r);
    if (why === 'auth') throw authError();
    const m = /\(HTTP (\d{3})\)/.exec(r.stderr);
    if (m !== null) return { status: Number(m[1]), json: json() };
    throw new CliError(ErrorCode.Host, `gh api ${path} failed: ${firstLine(r.stderr || r.stdout)}`);
  }

  /** A 404 on the access lookup: the owner itself missing, or present without access. */
  async function existsOr404(path: string): Promise<OwnerStatus> {
    const r = await api(path);
    if (r.status === 200) return 'no-write';
    return r.status === 404 ? 'not-found' : 'unknown';
  }

  return {
    async login() {
      if ((await run(['--version'])).exitCode !== 0) {
        throw new CliError(ErrorCode.GhMissing, 'gh is not installed; see https://cli.github.com');
      }
      const status = await run(['auth', 'status']);
      if (status.exitCode !== 0) {
        if (ghFailure(status) === 'offline') throw offlineError(status);
        // Offline, gh 2.100 only says the token is invalid; one API call tells the two apart.
        const probe = await run(['api', 'user', '--jq', '.login']);
        throw ghFailure(probe) === 'offline' ? offlineError(probe) : authError();
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
        if (ghFailure(r) === 'offline') throw offlineError(r);
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

    repoOf: githubRepoOf,

    async permission(repo) {
      const r = await api(`repos/${repo.owner}/${repo.name}`);
      if (r.status === 404) return 'none';
      if (r.status !== 200) throw new CliError(ErrorCode.Host, `could not read your access to ${repo.owner}/${repo.name} (HTTP ${r.status})`);
      const p = permissionsOf(r.json);
      return ROLES.find(([flag]) => p[flag] === true)?.[1] ?? 'none';
    },

    async ownerStatus(owner, repo) {
      const full = `${repo.owner}/${repo.name}`;
      const team = /^@([^/]+)\/(.+)$/.exec(owner);
      if (team !== null) {
        // Slugs are lowercase; CODEOWNERS matches teams case-insensitively (plan decision 5).
        const [org, slug] = [team[1]!, team[2]!.toLowerCase()];
        const r = await api(`orgs/${org}/teams/${slug}/repos/${full}`, { accept: 'application/vnd.github.v3.repository+json' });
        if (r.status === 200) return canWrite(r.json) ? 'ok' : 'no-write';
        return r.status === 404 ? existsOr404(`orgs/${org}/teams/${slug}`) : 'unknown';
      }
      const login = owner.replace(/^@/, '');
      const r = await api(`repos/${full}/collaborators/${login}/permission`);
      if (r.status === 200) {
        const j = (r.json ?? {}) as { permission?: unknown; role_name?: unknown };
        const write = ['admin', 'maintain', 'write'].includes(String(j.role_name)) || ['admin', 'write'].includes(String(j.permission));
        return write ? 'ok' : 'no-write';
      }
      return r.status === 404 ? existsOr404(`users/${login}`) : 'unknown';
    },

    async createPullRequest(pr) {
      const full = `${pr.repo.owner}/${pr.repo.name}`;
      const r = await api(`repos/${full}/pulls`, { method: 'POST', body: { title: pr.title, head: pr.head, base: pr.base, body: pr.body } });
      const j = (r.json ?? {}) as { number?: unknown; html_url?: unknown; message?: unknown; errors?: { message?: unknown }[] };
      if (r.status === 200 && typeof j.number === 'number' && typeof j.html_url === 'string') return { number: j.number, url: j.html_url };
      const reason = j.errors?.map((e) => e.message).filter((m) => typeof m === 'string').join('; ') || String(j.message ?? `HTTP ${r.status}`);
      throw new CliError(ErrorCode.PrCreate, `could not open a pull request on ${full} from ${pr.head}: ${reason}`);
    },
  };
}

import { githubRepoOf } from '../../src/host/github.js';
import type { Host, OwnerStatus, Permission, PullRequestInput } from '../../src/host/host.js';
import type { CliError } from '../../src/output.js';

export interface FakeHostOptions {
  login?: string;
  repoUrl?: string;
  loginError?: CliError;
  createError?: CliError;
  /** Keyed `owner/name`; default 'write'. */
  permissions?: Record<string, Permission>;
  /** Keyed `@owner|owner/name`; default 'ok'. */
  owners?: Record<string, OwnerStatus>;
  /** Thrown from every network method once `failAfter` calls have succeeded. */
  failWith?: CliError;
  failAfter?: number;
  /** Thrown by `createPullRequest` after it records the call. */
  prError?: CliError;
}

/**
 * A host that answers from memory. `created` lists the repo names it was asked to create;
 * `calls` records `permission o/r`, `ownerStatus @x o/r` and `pr o/r head`.
 */
export function fakeHost(o: FakeHostOptions = {}): Host & { created: string[]; calls: string[]; prs: PullRequestInput[] } {
  const created: string[] = [];
  const prs: PullRequestInput[] = [];
  const calls: string[] = [];
  let ok = 0;
  const step = (call: string) => {
    calls.push(call);
    if (o.failWith !== undefined && ok >= (o.failAfter ?? 0)) throw o.failWith;
    ok++;
  };
  return {
    created,
    calls,
    prs,
    async login() {
      if (o.loginError) throw o.loginError;
      return o.login ?? 'octo-user';
    },
    async createPrivateRepo(name) {
      if (o.createError) throw o.createError;
      created.push(name);
      return o.repoUrl ?? `https://github.com/${o.login ?? 'octo-user'}/${name}.git`;
    },
    repoOf: githubRepoOf,
    async permission(repo) {
      const key = `${repo.owner}/${repo.name}`;
      step(`permission ${key}`);
      return o.permissions?.[key] ?? 'write';
    },
    async ownerStatus(owner, repo) {
      const key = `${repo.owner}/${repo.name}`;
      step(`ownerStatus ${owner} ${key}`);
      return o.owners?.[`${owner}|${key}`] ?? 'ok';
    },
    async createPullRequest(pr) {
      const key = `${pr.repo.owner}/${pr.repo.name}`;
      step(`pr ${key} ${pr.head}`);
      prs.push(pr);
      if (o.prError !== undefined) throw o.prError;
      return { number: prs.length, url: `https://github.com/${key}/pull/${prs.length}` };
    },
  };
}

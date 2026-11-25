import { describe, expect, it } from 'vitest';
import type { RunResult } from '../../../src/git.js';
import { ghFailure, githubHost, githubRepoOf, type GhRunner } from '../../../src/host/github.js';
import { CliError } from '../../../src/output.js';

const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' });
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr });

const http = (status: number, body: unknown = { message: 'x' }): RunResult => ({
  exitCode: 1,
  stdout: JSON.stringify(body),
  stderr: `gh: Something (HTTP ${status})`,
});
const json = (body: unknown) => ok(JSON.stringify(body));

/** A runner that answers by the joined argument list and records every call (and its stdin). */
function stub(answers: Record<string, RunResult>): GhRunner & { calls: string[][]; inputs: (string | undefined)[] } {
  const calls: string[][] = [];
  const inputs: (string | undefined)[] = [];
  const run = async (args: readonly string[], opts?: { input?: string }) => {
    calls.push([...args]);
    inputs.push(opts?.input);
    const a = answers[args.join(' ')];
    if (a === undefined) throw new Error(`unexpected gh ${args.join(' ')}`);
    return a;
  };
  return Object.assign(run, { calls, inputs });
}

describe('githubHost', () => {
  it('ghFailure', () => {
    for (const s of [
      'error connecting to api.github.com',
      'dial tcp: lookup api.github.com: no such host',
      'proxyconnect tcp: dial tcp 127.0.0.1:9: connect: connection refused',
      'Get "https://api.github.com/user": net/http: i/o timeout',
      // real gh 2.100.0 on Windows, behind a dead proxy
      'Get "https://api.github.com/user": proxyconnect tcp: dial tcp 127.0.0.1:9: connectex: No connection could be made because the target machine actively refused it.',
    ]) expect(ghFailure(fail(s)), s).toBe('offline');
    expect(ghFailure({ exitCode: 4, stdout: '', stderr: '' })).toBe('auth');
    expect(ghFailure(fail('To get started with GitHub CLI, please run:  gh auth login'))).toBe('auth');
    expect(ghFailure(fail('gh: Bad credentials (HTTP 401)'))).toBe('auth');
    expect(ghFailure(fail('gh: Not Found (HTTP 404)'))).toBeNull();
  });

  it('login probes gh --version first', async () => {
    const run = stub({ '--version': ok('gh version 2.100.0'), 'auth status --hostname github.com': ok(), 'api user --jq .login': ok('octo-user\n') });
    expect(await githubHost(run).login()).toBe('octo-user');
    expect(run.calls).toEqual([['--version'], ['auth', 'status', '--hostname', 'github.com'], ['api', 'user', '--jq', '.login']]);
  });

  it('a failing gh --version gives E_GH_MISSING', async () => {
    const run = stub({ '--version': fail("'gh' n'est pas reconnu en tant que commande interne") });
    await expect(githubHost(run).login()).rejects.toMatchObject({ code: 'E_GH_MISSING' });
  });

  it('login offline gives E_OFFLINE, not E_GH_AUTH', async () => {
    const run = stub({ '--version': ok(), 'auth status --hostname github.com': fail('X Failed to log in to github.com: error connecting to api.github.com') });
    await expect(githubHost(run).login()).rejects.toMatchObject({ code: 'E_OFFLINE', message: expect.stringContaining('--offline') });
  });

  it('auth status blames the token when offline: a probe of the API tells them apart', async () => {
    // real gh 2.100.0: offline, auth status only says the token is invalid
    const status = fail('github.com\n  X Failed to log in to github.com using token (GH_TOKEN)\n  - The token in GH_TOKEN is invalid.');
    const offline = stub({
      '--version': ok(),
      'auth status --hostname github.com': status,
      'api user --jq .login': fail('Get "https://api.github.com/user": proxyconnect tcp: dial tcp 127.0.0.1:9: connectex: No connection could be made'),
    });
    await expect(githubHost(offline).login()).rejects.toMatchObject({ code: 'E_OFFLINE' });
    const invalid = stub({ '--version': ok(), 'auth status --hostname github.com': status, 'api user --jq .login': fail('gh: Bad credentials (HTTP 401)') });
    await expect(githubHost(invalid).login()).rejects.toMatchObject({ code: 'E_GH_AUTH' });
  });

  it('repo create offline gives E_OFFLINE', async () => {
    const run = stub({ 'repo create ai-workspace --private': fail('error connecting to api.github.com') });
    await expect(githubHost(run).createPrivateRepo('ai-workspace')).rejects.toMatchObject({ code: 'E_OFFLINE' });
  });

  it('logged out gives E_GH_AUTH', async () => {
    const run = stub({
      '--version': ok(),
      'auth status --hostname github.com': fail('You are not logged into any GitHub hosts. To log in, run: gh auth login'),
      'api user --jq .login': { exitCode: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login' },
    });
    await expect(githubHost(run).login()).rejects.toMatchObject({ code: 'E_GH_AUTH', message: expect.stringContaining('gh auth login') });
  });

  it('missing gh gives E_GH_MISSING', async () => {
    const run: GhRunner = async () => {
      throw new CliError('E_GH_MISSING', 'gh is not installed; see https://cli.github.com');
    };
    await expect(githubHost(run).login()).rejects.toMatchObject({ code: 'E_GH_MISSING' });
  });

  it('the default runner maps a missing binary to E_GH_MISSING', async () => {
    const prev = process.env.PATH;
    process.env.PATH = '';
    try {
      await expect(githubHost().login()).rejects.toMatchObject({ code: 'E_GH_MISSING' });
    } finally {
      process.env.PATH = prev;
    }
  });

  it('creates a private repo, https', async () => {
    const run = stub({
      'repo create ai-workspace --private': ok('https://github.com/octo-user/ai-workspace\n'),
      'config get git_protocol': ok('https\n'),
    });
    expect(await githubHost(run).createPrivateRepo('ai-workspace')).toBe('https://github.com/octo-user/ai-workspace.git');
  });

  it('ssh protocol gives an ssh url', async () => {
    const run = stub({
      'repo create ai-workspace --private': ok('https://github.com/octo-user/ai-workspace\n'),
      'config get git_protocol': ok('ssh\n'),
    });
    expect(await githubHost(run).createPrivateRepo('ai-workspace')).toBe('git@github.com:octo-user/ai-workspace.git');
  });

  it('name taken', async () => {
    const run = stub({ 'repo create ai-workspace --private': fail('GraphQL: Name already exists on this account (createRepository)') });
    const err = await githubHost(run).createPrivateRepo('ai-workspace').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'E_REPO_CREATE' });
    expect((err as Error).message).toContain('--name');
    expect((err as Error).message).toContain('--remote');
  });

  it('other create failure points at --remote', async () => {
    const run = stub({ 'repo create ai-workspace --private': fail('HTTP 403: Repository creation is blocked\nmore') });
    const err = (await githubHost(run).createPrivateRepo('ai-workspace').catch((e: unknown) => e)) as Error;
    expect(err).toMatchObject({ code: 'E_REPO_CREATE' });
    expect(err.message).toContain('--remote <url>');
    expect(err.message).toContain('HTTP 403: Repository creation is blocked');
    expect(err.message).not.toContain('more');
  });
});

const REPO = { owner: 'acme', name: 'brain-x' };
const TEAM_REPO = 'api orgs/acme/teams/platform/repos/acme/brain-x --method GET -H Accept: application/vnd.github.v3.repository+json';

describe('githubHost operations', () => {
  it('repoOf', () => {
    for (const u of [
      'https://github.com/acme/brain-x.git',
      'https://github.com/acme/brain-x',
      'https://github.com/acme/brain-x/',
      'https://GitHub.com/acme/brain-x.git',
      'git@github.com:acme/brain-x.git',
      'ssh://git@github.com/acme/brain-x.git',
    ]) expect(githubRepoOf(u), u).toEqual(REPO);
    for (const u of ['https://github.acme.com/acme/brain-x.git', 'C:\\repos\\brain-x', '/srv/brain-x.git', 'https://github.com/acme']) {
      expect(githubRepoOf(u), u).toBeNull();
    }
    expect(githubHost(stub({})).repoOf('git@github.com:acme/brain-x.git')).toEqual(REPO);
  });

  it('permission', async () => {
    const perms = (p: Record<string, boolean>) => stub({ 'api repos/acme/brain-x --method GET': json({ permissions: p }) });
    const base = { admin: false, maintain: false, push: false, triage: false, pull: false };
    expect(await githubHost(perms({ ...base, push: true, triage: true, pull: true })).permission(REPO)).toBe('write');
    expect(await githubHost(perms({ ...base, admin: true, push: true })).permission(REPO)).toBe('admin');
    expect(await githubHost(perms({ ...base, maintain: true })).permission(REPO)).toBe('maintain');
    expect(await githubHost(perms({ ...base, triage: true, pull: true })).permission(REPO)).toBe('triage');
    expect(await githubHost(perms({ ...base, pull: true })).permission(REPO)).toBe('read');
    expect(await githubHost(stub({ 'api repos/acme/brain-x --method GET': http(404) })).permission(REPO)).toBe('none');
  });

  it('team owner', async () => {
    const team = (answer: RunResult, teamItself?: RunResult) =>
      githubHost(stub({ [TEAM_REPO]: answer, ...(teamItself ? { 'api orgs/acme/teams/platform --method GET': teamItself } : {}) })).ownerStatus('@acme/platform', REPO);
    expect(await team(json({ permissions: { push: true, pull: true } }))).toBe('ok');
    expect(await team(json({ permissions: { push: false, pull: true } }))).toBe('no-write');
    expect(await team(http(404), http(404))).toBe('not-found');
    expect(await team(http(404), json({ slug: 'platform' }))).toBe('no-write');
    expect(await team(http(403))).toBe('unknown');
    const run = stub({ [TEAM_REPO]: json({ permissions: { push: true } }) });
    expect(await githubHost(run).ownerStatus('@acme/Platform', REPO)).toBe('ok');
  });

  it('user owner', async () => {
    const COLLAB = 'api repos/acme/brain-x/collaborators/octo/permission --method GET';
    const user = (answer: RunResult, userItself?: RunResult) =>
      githubHost(stub({ [COLLAB]: answer, ...(userItself ? { 'api users/octo --method GET': userItself } : {}) })).ownerStatus('@octo', REPO);
    expect(await user(json({ permission: 'write', role_name: 'write' }))).toBe('ok');
    expect(await user(json({ permission: 'write', role_name: 'maintain' }))).toBe('ok');
    expect(await user(json({ permission: 'admin', role_name: 'admin' }))).toBe('ok');
    expect(await user(json({ permission: 'read', role_name: 'read' }))).toBe('no-write');
    expect(await user(http(404), http(404))).toBe('not-found');
    expect(await user(http(404), json({ login: 'octo' }))).toBe('no-write');
    expect(await user(http(403))).toBe('unknown');
  });

  it('createPullRequest', async () => {
    const PULLS = 'api repos/acme/brain-x/pulls --method POST --input -';
    const run = stub({ [PULLS]: json({ number: 7, html_url: 'https://github.com/acme/brain-x/pull/7' }) });
    const pr = { repo: REPO, head: 'b', base: 'main', title: 'T "q"', body: 'line 1\nline 2' };
    expect(await githubHost(run).createPullRequest(pr)).toEqual({ number: 7, url: 'https://github.com/acme/brain-x/pull/7' });
    expect(JSON.parse(run.inputs[0]!)).toEqual({ title: 'T "q"', head: 'b', base: 'main', body: 'line 1\nline 2' });
    const taken = stub({ [PULLS]: http(422, { message: 'Validation Failed', errors: [{ message: 'A pull request already exists for acme:b.' }] }) });
    await expect(githubHost(taken).createPullRequest(pr)).rejects.toMatchObject({
      code: 'E_PR_CREATE',
      message: expect.stringContaining('A pull request already exists for acme:b.'),
    });
  });
});

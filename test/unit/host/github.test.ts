import { describe, expect, it } from 'vitest';
import type { RunResult } from '../../../src/git.js';
import { ghFailure, githubHost, type GhRunner } from '../../../src/host/github.js';
import { CliError } from '../../../src/output.js';

const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' });
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr });

/** A runner that answers by the joined argument list and records every call. */
function stub(answers: Record<string, RunResult>): GhRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const run = async (args: readonly string[]) => {
    calls.push([...args]);
    const a = answers[args.join(' ')];
    if (a === undefined) throw new Error(`unexpected gh ${args.join(' ')}`);
    return a;
  };
  return Object.assign(run, { calls });
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
    const run = stub({ '--version': ok('gh version 2.100.0'), 'auth status': ok(), 'api user --jq .login': ok('octo-user\n') });
    expect(await githubHost(run).login()).toBe('octo-user');
    expect(run.calls).toEqual([['--version'], ['auth', 'status'], ['api', 'user', '--jq', '.login']]);
  });

  it('a failing gh --version gives E_GH_MISSING', async () => {
    const run = stub({ '--version': fail("'gh' n'est pas reconnu en tant que commande interne") });
    await expect(githubHost(run).login()).rejects.toMatchObject({ code: 'E_GH_MISSING' });
  });

  it('login offline gives E_OFFLINE, not E_GH_AUTH', async () => {
    const run = stub({ '--version': ok(), 'auth status': fail('X Failed to log in to github.com: error connecting to api.github.com') });
    await expect(githubHost(run).login()).rejects.toMatchObject({ code: 'E_OFFLINE', message: expect.stringContaining('--offline') });
  });

  it('auth status blames the token when offline: a probe of the API tells them apart', async () => {
    // real gh 2.100.0: offline, auth status only says the token is invalid
    const status = fail('github.com\n  X Failed to log in to github.com using token (GH_TOKEN)\n  - The token in GH_TOKEN is invalid.');
    const offline = stub({
      '--version': ok(),
      'auth status': status,
      'api user --jq .login': fail('Get "https://api.github.com/user": proxyconnect tcp: dial tcp 127.0.0.1:9: connectex: No connection could be made'),
    });
    await expect(githubHost(offline).login()).rejects.toMatchObject({ code: 'E_OFFLINE' });
    const invalid = stub({ '--version': ok(), 'auth status': status, 'api user --jq .login': fail('gh: Bad credentials (HTTP 401)') });
    await expect(githubHost(invalid).login()).rejects.toMatchObject({ code: 'E_GH_AUTH' });
  });

  it('repo create offline gives E_OFFLINE', async () => {
    const run = stub({ 'repo create ai-workspace --private': fail('error connecting to api.github.com') });
    await expect(githubHost(run).createPrivateRepo('ai-workspace')).rejects.toMatchObject({ code: 'E_OFFLINE' });
  });

  it('logged out gives E_GH_AUTH', async () => {
    const run = stub({
      '--version': ok(),
      'auth status': fail('You are not logged into any GitHub hosts. To log in, run: gh auth login'),
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

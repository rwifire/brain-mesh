import { describe, expect, it } from 'vitest';
import type { RunResult } from '../../../src/git.js';
import { githubHost, type GhRunner } from '../../../src/host/github.js';
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
  it('login checks auth status first', async () => {
    const run = stub({ 'auth status': ok(), 'api user --jq .login': ok('octo-user\n') });
    expect(await githubHost(run).login()).toBe('octo-user');
    expect(run.calls).toEqual([['auth', 'status'], ['api', 'user', '--jq', '.login']]);
  });

  it('logged out gives E_GH_AUTH', async () => {
    const run = stub({ 'auth status': fail('You are not logged into any GitHub hosts.') });
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

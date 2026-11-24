import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initCommand } from '../../../src/commands/init.js';
import { CliError } from '../../../src/output.js';
import { run } from '../../helpers/cli.js';
import { tempDir, writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { git } from '../../helpers/workspace.js';

/** An empty folder (with a space in its path) and an empty bare repo standing in for GitHub. */
async function setup() {
  const base = await tempDir('bm init ');
  const folder = join(base, 'my workspace');
  const bare = join(base, 'remote.git');
  await mkdir(folder);
  await mkdir(bare);
  await git(bare, 'init', '--bare', '-q');
  return { folder, bare };
}

const init = (folder: string, host: ReturnType<typeof fakeHost>, ...args: string[]) =>
  run(['init', ...args, '--json'], folder, [initCommand({ host })]);

describe('init', () => {
  it('creates, commits and pushes', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const host = fakeHost({ repoUrl: bare });
    const r = await init(folder, host);
    expect(r.code).toBe(0);
    expect(r.json().data).toMatchObject({ user: 'octo-user', remote: bare, repoCreated: true, doctor: { errors: 0, warnings: 0 } });
    expect(host.created).toEqual(['ai-workspace']);
    expect(await git(bare, 'rev-list', '--count', 'main')).toBe('1');
    expect(await git(bare, 'log', '-1', '--format=%s', 'main')).toBe('Create brain-mesh workspace');
    expect(await git(folder, 'config', 'core.hooksPath')).toBe('.mesh/hooks');
    expect(await git(folder, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
    expect(await git(folder, 'rev-parse', '--abbrev-ref', '@{u}')).toBe('origin/main');
  });

  it('--name sets the repo name', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const host = fakeHost({ repoUrl: bare });
    expect((await init(folder, host, '--name', 'my-space')).code).toBe(0);
    expect(host.created).toEqual(['my-space']);
  });

  it('--remote uses an existing empty repo', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const host = fakeHost();
    const r = await init(folder, host, '--remote', bare);
    expect(r.code).toBe(0);
    expect(r.json().data).toMatchObject({ remote: bare, repoCreated: false });
    expect(host.created).toEqual([]);
    expect(await git(bare, 'rev-list', '--count', 'main')).toBe('1');
  });

  it('--remote that is not empty', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const other = await tempDir('bm other-');
    await writeTree(other, { 'a.md': '# A\n' });
    await git(other, 'init', '-q', '-b', 'main');
    await git(other, 'add', '-A');
    await git(other, 'commit', '-q', '-m', 'a');
    await git(other, 'push', '-q', bare, 'main');
    const r = await init(folder, fakeHost(), '--remote', bare);
    expect(r.json().error.code).toBe('E_REMOTE_NOT_EMPTY');
    expect(await readdir(folder)).toEqual([]);
  });

  it('--remote that cannot be reached', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const r = await init(folder, fakeHost(), '--remote', join(bare, 'nope.git'));
    expect(r.json().error.code).toBe('E_GIT');
    expect(await readdir(folder)).toEqual([]);
  });

  it('--remote and --name together', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const r = await init(folder, fakeHost(), '--remote', bare, '--name', 'x');
    expect(r.code).toBe(2);
    expect(r.json().error.code).toBe('E_USAGE');
  });

  it('non-empty folder', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    await writeTree(folder, { 'notes.txt': 'mine\n' });
    const host = fakeHost({ repoUrl: bare });
    const r = await init(folder, host);
    expect(r.json().error.code).toBe('E_NOT_EMPTY');
    expect(host.created).toEqual([]);
    expect(await readdir(folder)).toEqual(['notes.txt']);
  });

  it('existing workspace', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    await writeTree(folder, { 'mesh.yaml': 'version: 1\n' });
    const r = await init(folder, fakeHost({ repoUrl: bare }));
    expect(r.json().error.code).toBe('E_NOT_SUPPORTED');
  });

  it('no git identity', async () => {
    await isolateGit({ identity: false });
    const { folder, bare } = await setup();
    const host = fakeHost({ repoUrl: bare });
    const r = await init(folder, host);
    expect(r.json().error).toMatchObject({ code: 'E_GIT', message: expect.stringContaining('user.name') });
    expect(host.created).toEqual([]);
    expect(await readdir(folder)).toEqual([]);
  });

  it('host failure leaves the folder empty', async () => {
    await isolateGit();
    const { folder } = await setup();
    const r = await init(folder, fakeHost({ createError: new CliError('E_REPO_CREATE', 'blocked; pass --remote <url>') }));
    expect(r.json().error.code).toBe('E_REPO_CREATE');
    expect(await readdir(folder)).toEqual([]);
  });

  it('login failure leaves the folder empty', async () => {
    await isolateGit();
    const { folder } = await setup();
    const r = await init(folder, fakeHost({ loginError: new CliError('E_GH_AUTH', 'gh is not logged in; run gh auth login') }));
    expect(r.json().error.code).toBe('E_GH_AUTH');
    expect(await readdir(folder)).toEqual([]);
  });

  it('first commit is LF under autocrlf', async () => {
    await isolateGit({ autocrlf: true });
    const { folder, bare } = await setup();
    expect((await init(folder, fakeHost({ repoUrl: bare }))).code).toBe(0);
    const eol = (await git(folder, 'ls-files', '--eol')).split('\n');
    expect(eol.length).toBeGreaterThan(5);
    for (const line of eol) expect(line).toMatch(/^i\/lf /);
  });

  it('gitignored managed files are not committed', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const r = await init(folder, fakeHost({ repoUrl: bare }));
    const files = r.json().data.files as string[];
    expect(files.some((f) => f.startsWith('.mesh/') || f.startsWith('.claude/'))).toBe(false);
    for (const f of ['.gitignore', '.gitattributes', 'AGENTS.md', 'CLAUDE.md', 'mesh.yaml', 'brains/personal/index.md', 'brains/.obsidian/app.json', 'tools/package.json']) {
      expect(files).toContain(f);
    }
    expect((await git(folder, 'ls-files')).split('\n')).toEqual(files);
  });

  it('push failure says how to finish', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const r = await init(folder, fakeHost({ repoUrl: join(bare, 'missing.git') }));
    expect(r.json().error).toMatchObject({ code: 'E_GIT', message: expect.stringContaining('git push -u origin main') });
    expect(await git(folder, 'log', '-1', '--format=%s')).toBe('Create brain-mesh workspace');
  });

  it('human output', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const r = await run(['init'], folder, [initCommand({ host: fakeHost({ repoUrl: bare }) })]);
    expect(r.out).toBe(`Created the brain-mesh workspace for octo-user in ${folder}\nPushed to ${bare}\nOpen ${join(folder, 'brains')} as an Obsidian vault.\n`);
  });
});

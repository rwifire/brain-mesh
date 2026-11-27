import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initCommand } from '../../../src/commands/init.js';
import { CliError } from '../../../src/output.js';
import { run } from '../../helpers/cli.js';
import { tempDir, writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { initWorkspace, sharedRemote } from '../../helpers/remotes.js';
import { PKG_VERSION } from '../../helpers/version.js';
import { git } from '../../helpers/workspace.js';
import { meshYaml } from '../../../src/workspace/create.js';

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

  it('existing workspace with an invalid mesh.yaml', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    await writeTree(folder, { 'mesh.yaml': 'version: 1\n' });
    const r = await init(folder, fakeHost({ repoUrl: bare }));
    expect(r.json().error.code).toBe('E_MESH_INVALID');
    expect(await readdir(folder)).toEqual(['mesh.yaml']);
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
    // Empty files (the .gitkeep skeleton) have no line endings: i/none.
    for (const line of eol) expect(line).toMatch(/^i\/(lf|none) /);
    for (const line of eol.filter((l) => l.startsWith('i/none'))) expect(line).toMatch(/\.gitkeep$/);
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

  it('gpg signing does not block the first commit', async () => {
    await isolateGit({ extra: ['[commit]', '\tgpgsign = true', '[gpg]', '\tprogram = brain-mesh-no-such-gpg'] });
    const { folder, bare } = await setup();
    const r = await init(folder, fakeHost({ repoUrl: bare }));
    expect(r.code).toBe(0);
    expect(await git(bare, 'rev-list', '--count', 'main')).toBe('1');
  });

  it('a failure after the repo exists says how to recover', async () => {
    // A git template whose config already defines origin makes `git remote add origin` fail after the repo exists.
    const template = await tempDir('bm template-');
    await writeTree(template, { config: '[remote "origin"]\n\turl = https://example.invalid/taken.git\n' });
    await isolateGit({ extra: ['[init]', `\ttemplateDir = ${template.replace(/\\/g, '/')}`] });
    const { folder, bare } = await setup();
    const r = await init(folder, fakeHost({ repoUrl: bare }));
    expect(r.json().error.code).toBe('E_GIT');
    expect(r.json().error.message).toContain(bare);
    expect(r.json().error.message).toContain('init --remote');
  });

  it('human output', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    const r = await run(['init'], folder, [initCommand({ host: fakeHost({ repoUrl: bare }) })]);
    expect(r.out).toBe(`Created the brain-mesh workspace for octo-user in ${folder}\nPushed to ${bare}\nOpen ${join(folder, 'brains')} as an Obsidian vault.\n`);
  });
});

describe('restore', () => {
  /** Every path under `dir`, `.git` excluded, sorted. */
  const tree = async (dir: string) =>
    (await readdir(dir, { recursive: true })).map((p) => p.replace(/\\/g, '/')).filter((p) => p !== '.git' && !p.startsWith('.git/')).sort();

  async function cloned() {
    await isolateGit();
    const ws = await initWorkspace();
    const url = await sharedRemote(ws.base, 'brain-sre');
    expect((await run(['mount', url, '--json'], ws.root)).code).toBe(0);
    const folder = join(await tempDir('bm restore '), 'ws');
    await git(join(folder, '..'), 'clone', '-q', ws.remote, 'ws');
    return { ...ws, folder };
  }

  it('restores a cloned workspace', async () => {
    const { folder, remote } = await cloned();
    const r = await run(['init', '--json'], folder);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ mode: 'restore', user: 'octo-user', brain_mesh: PKG_VERSION, remote, repoCreated: false, doctor: { errors: 0 } });
    expect(r.json().data.sync.mounts).toEqual([{ id: 'brain-sre', status: 'cloned' }]);
    expect((r.json().warnings as { code: string }[]).map((w) => w.code)).not.toContain('W_RENDER_PATH_TAKEN');
    expect((await git(folder, 'config', 'core.hooksPath')).trim()).toBe('.mesh/hooks');
    expect(await tree(folder)).toContain('.claude/skills/ask/SKILL.md');
    expect(await tree(folder)).toContain('brains/brain-sre/brain.yaml');
    expect((await git(folder, 'status', '--porcelain')).trim()).toBe('');
    const doctor = await run(['doctor', '--json'], folder);
    expect(doctor.json().data.counts.errors, doctor.out).toBe(0);
  });

  it('restore refuses another version', async () => {
    const { folder } = await cloned();
    const meshPath = join(folder, 'mesh.yaml');
    await writeFile(meshPath, (await readFile(meshPath, 'utf8')).replace(`brain_mesh: ${PKG_VERSION}`, 'brain_mesh: 0.0.1'), 'utf8');
    const before = await tree(folder);
    const r = await run(['init', '--json'], folder);
    expect(r.json().error).toMatchObject({ code: 'E_PIN_MISMATCH', message: expect.stringContaining('npx -y brain-mesh-ai-workspace@0.0.1 init') });
    expect(await tree(folder)).toEqual(before);
    expect((await git(folder, 'config', '--get', 'core.hooksPath').catch(() => '')).trim()).toBe('');
  });

  it('restore needs a git clone', async () => {
    await isolateGit();
    const { folder, bare } = await setup();
    await writeTree(folder, { 'mesh.yaml': meshYaml('octo-user', PKG_VERSION) });
    const r = await init(folder, fakeHost({ repoUrl: bare }));
    expect(r.json().error).toMatchObject({ code: 'E_GIT', message: expect.stringContaining('git clone') });
    expect(await readdir(folder)).toEqual(['mesh.yaml']);
  });
});

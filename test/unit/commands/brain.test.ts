import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandsFor } from '../../../src/commands/index.js';
import { read, run } from '../../helpers/cli.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { emptyRemote, initWorkspace, sharedRemote } from '../../helpers/remotes.js';
import { git } from '../../helpers/workspace.js';

const exists = (p: string) => stat(p).then(() => true, () => false);
const brainsList = async (root: string) => (await readdir(join(root, 'brains'))).filter((n) => !n.startsWith('.')).sort();
const lsTree = async (dir: string, ref = 'HEAD') => (await git(dir, 'ls-tree', '-r', '--name-only', ref)).trim().split('\n').sort();

async function setup() {
  await isolateGit();
  return initWorkspace();
}
const brainNew = (root: string, ...args: string[]) => run(['brain', 'new', ...args, '--json'], root);
const doctorErrors = async (root: string) => {
  const d = await run(['doctor', '--json'], root);
  return [d.json().data.counts.errors, d.out] as const;
};
const SHARED_FILES = ['AGENTS.md', 'CLAUDE.md', 'CODEOWNERS', 'areas/.gitkeep', 'brain.yaml', 'index.md', 'maps/.gitkeep', 'notes/.gitkeep', 'projects/.gitkeep', 'sources/.gitkeep'];

describe('brain new', () => {
  it('brain new <url>', async () => {
    const { base, root } = await setup();
    const url = await emptyRemote(base, 'brain-ideas');
    const r = await brainNew(root, url, '--description', 'Ideas we are still shaping.');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ id: 'brain-ideas', url, mode: 'contribute', path: 'brains/brain-ideas', published: true, pushed: true });

    expect((await git(url, 'rev-list', '--count', 'main')).trim()).toBe('1');
    expect(await lsTree(url, 'main')).toEqual(SHARED_FILES);
    const brainYaml = await git(url, 'show', 'main:brain.yaml');
    expect(brainYaml).toContain('id: brain-ideas');
    expect(brainYaml).toContain('owner: "@octo-user"');
    expect(brainYaml).toContain('description: Ideas we are still shaping.');

    const dir = join(root, 'brains', 'brain-ideas');
    expect((await git(dir, 'remote', 'get-url', 'origin')).trim()).toBe(url);
    expect((await git(dir, 'rev-parse', '--abbrev-ref', 'main@{u}')).trim()).toBe('origin/main');
    expect(await read(root, 'mesh.yaml')).toContain(`  - id: brain-ideas\n    url: ${url}\n    mode: contribute\n`);
    expect((await git(root, 'log', '-1', '--format=%s')).trim()).toBe('Create brain brain-ideas');
    expect((await git(root, 'status', '--porcelain')).trim()).toBe('');
    const [errors, out] = await doctorErrors(root);
    expect(errors, out).toBe(0);
  });

  it('brain new <url> refuses', async () => {
    const { base, root } = await setup();
    const mesh = await read(root, 'mesh.yaml');
    const before = await brainsList(root);
    const check = async (label: string) => {
      expect(await read(root, 'mesh.yaml'), label).toBe(mesh);
      expect(await brainsList(root), label).toEqual(before);
    };

    const full = await sharedRemote(base, 'brain-full');
    expect((await brainNew(root, full, '--description', 'x')).json().error.code).toBe('E_REMOTE_NOT_EMPTY');
    await check('not empty');

    const readOnly = fakeHost({ permissions: { 'acme/brain-ideas': 'read' } });
    const refused = await run(['brain', 'new', 'https://github.com/acme/brain-ideas.git', '--description', 'x', '--json'], root, commandsFor(readOnly));
    expect(refused.json().error.code).toBe('E_NO_PUSH_RIGHTS');
    expect(readOnly.calls).toEqual(['permission acme/brain-ideas']);
    await check('no push rights');

    await mkdir(join(root, 'brains', 'brain-taken'));
    const taken = await emptyRemote(base, 'brain-taken');
    expect((await brainNew(root, taken, '--description', 'x')).json().error.code).toBe('E_MOUNT_EXISTS');
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
    expect(await readdir(join(root, 'brains', 'brain-taken'))).toEqual([]);
    expect((await git(taken, 'rev-list', '--all', '--count')).trim()).toBe('0');
  });

  it('brain new <id>', async () => {
    const { root } = await setup();
    const r = await brainNew(root, 'brain-ideas', '--description', 'Ideas.', '--owner', '@acme/thinkers', '--name', 'Ideas');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ id: 'brain-ideas', url: null, mode: 'contribute', published: false });
    const dir = join(root, 'brains', 'brain-ideas');
    expect((await git(dir, 'rev-list', '--count', 'main')).trim()).toBe('1');
    expect((await git(dir, 'log', '-1', '--format=%s')).trim()).toBe('Create brain brain-ideas');
    expect((await git(dir, 'remote')).trim()).toBe('');
    expect(await lsTree(dir)).toEqual(SHARED_FILES);
    const brainYaml = await read(root, 'brains/brain-ideas/brain.yaml');
    expect(brainYaml).toContain('name: Ideas');
    expect(brainYaml).toContain('owner: "@acme/thinkers"');
    const mesh = await read(root, 'mesh.yaml');
    expect(mesh).toContain('  - id: brain-ideas\n    mode: contribute\n');
    expect(mesh).not.toContain('url:');
    const [errors, out] = await doctorErrors(root);
    expect(errors, out).toBe(0);
  });

  it('brain new rejects a bad id or a missing description', async () => {
    const { root } = await setup();
    const mesh = await read(root, 'mesh.yaml');
    expect((await brainNew(root, 'Brain_Ideas', '--description', 'x')).json().error.code).toBe('E_USAGE');
    expect((await brainNew(root, 'personal', '--description', 'x')).json().error.code).toBe('E_MOUNT_EXISTS');
    const missing = await brainNew(root, 'brain-ideas');
    expect(missing.json().error.code).toBe('E_USAGE');
    expect(missing.code).toBe(2);
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
    expect(await exists(join(root, 'brains', 'brain-ideas'))).toBe(false);
  });
});

describe('brain publish', () => {
  const publish = (root: string, ...args: string[]) => run(['brain', 'publish', ...args, '--json'], root);

  it('brain publish', async () => {
    const { base, root } = await setup();
    expect((await brainNew(root, 'brain-ideas', '--description', 'Ideas.')).code).toBe(0);
    const url = await emptyRemote(base, 'brain-ideas');
    const r = await publish(root, 'brain-ideas', url);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ id: 'brain-ideas', url, pushed: true });

    const dir = join(root, 'brains', 'brain-ideas');
    expect((await git(url, 'rev-parse', 'main')).trim()).toBe((await git(dir, 'rev-parse', 'HEAD')).trim());
    expect((await git(dir, 'rev-parse', '--abbrev-ref', 'main@{u}')).trim()).toBe('origin/main');
    expect(await read(root, 'mesh.yaml')).toContain(`  - id: brain-ideas\n    url: ${url}\n    mode: contribute\n`);
    expect((await git(root, 'log', '-1', '--format=%s')).trim()).toBe('Publish brain brain-ideas');
    const mounts = await run(['mounts', '--json'], root);
    expect(mounts.json().data.brains[1]).toMatchObject({ id: 'brain-ideas', url, published: true });
  });

  it('brain publish refuses', async () => {
    const { base, root } = await setup();
    expect((await brainNew(root, 'brain-ideas', '--description', 'Ideas.')).code).toBe(0);
    const published = await emptyRemote(base, 'brain-done');
    expect((await brainNew(root, published, '--description', 'Done.')).code).toBe(0);
    const mesh = await read(root, 'mesh.yaml');

    const other = await emptyRemote(base, 'brain-other');
    expect((await publish(root, 'brain-ideas', other)).json().error.code).toBe('E_REPO_NAME');
    const again = await emptyRemote(join(base, 'again'), 'brain-done');
    expect((await publish(root, 'brain-done', again)).json().error.code).toBe('E_ALREADY_PUBLISHED');
    expect((await publish(root, 'brain-nope', other)).json().error.code).toBe('E_UNKNOWN_BRAIN');
    await mkdir(join(base, 'full'));
    const full = await sharedRemote(join(base, 'full'), 'brain-ideas');
    expect((await publish(root, 'brain-ideas', full)).json().error.code).toBe('E_REMOTE_NOT_EMPTY');
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
    expect((await git(join(root, 'brains', 'brain-ideas'), 'remote')).trim()).toBe('');
  });
});

import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { read, run, write } from '../../helpers/cli.js';
import { tempDir, writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { initWorkspace, pushToRemote, sharedRemote } from '../../helpers/remotes.js';
import { git } from '../../helpers/workspace.js';

const exists = (p: string) => stat(p).then(() => true, () => false);
const head = async (dir: string) => (await git(dir, 'rev-parse', 'HEAD')).trim();
type Row = { id: string; status: string; detail?: string };
const statuses = (r: { json: () => { data: { mounts: Row[] } } }) => Object.fromEntries(r.json().data.mounts.map((m) => [m.id, m.status]));

async function setup(...names: string[]) {
  await isolateGit();
  const ws = await initWorkspace();
  const urls: Record<string, string> = {};
  for (const name of names) {
    urls[name] = await sharedRemote(ws.base, name);
    const m = await run(['mount', urls[name]!, '--json'], ws.root);
    if (m.code !== 0) throw new Error(m.out);
  }
  return { ...ws, urls };
}
const sync = (root: string) => run(['sync', '--json'], root);

describe('sync', () => {
  it('clones missing and fast-forwards', async () => {
    const { root, urls } = await setup('brain-sre');
    await pushToRemote(urls['brain-sre']!, 'notes/new.md', '# New\n');
    const r = await sync(root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ pushed: true, mounts: [{ id: 'brain-sre', status: 'updated' }] });
    expect(await read(root, 'brains/brain-sre/notes/new.md')).toBe('# New\n');

    expect(statuses(await sync(root))).toEqual({ 'brain-sre': 'up-to-date' });
    await rm(join(root, 'brains', 'brain-sre'), { recursive: true, force: true, maxRetries: 5 });
    expect(statuses(await sync(root))).toEqual({ 'brain-sre': 'cloned' });
    expect(await exists(join(root, 'brains', 'brain-sre', 'notes', 'new.md'))).toBe(true);
  });

  it('a mount added on another machine', async () => {
    const { base, root, remote } = await setup();
    const url = await sharedRemote(base, 'brain-ops');
    const other = join(await tempDir('bm other '), 'ws');
    await git(join(other, '..'), 'clone', '-q', remote, 'ws');
    const m = await run(['mount', url, '--json'], other);
    expect(m.json().data.pushed, m.out).toBe(true);

    const r = await sync(root);
    expect(r.code, r.out).toBe(0);
    expect(statuses(r)).toEqual({ 'brain-ops': 'cloned' });
    expect(await read(root, 'mesh.yaml')).toContain('id: brain-ops');
    expect(await exists(join(root, 'brains', 'brain-ops', 'brain.yaml'))).toBe(true);
    expect(await read(root, 'AGENTS.md')).toContain('`brain-ops`');
  });

  it('skips and reports', async () => {
    const { root, urls } = await setup('brain-a', 'brain-b', 'brain-c', 'brain-d');
    const dir = (id: string) => join(root, 'brains', id);
    await writeTree(dir('brain-a'), { 'notes/draft.md': '# Draft\n' });
    await writeTree(dir('brain-b'), { 'notes/local.md': '# Local\n' });
    await git(dir('brain-b'), 'add', '-A');
    await git(dir('brain-b'), 'commit', '-q', '-m', 'local');
    await writeTree(dir('brain-c'), { 'notes/local.md': '# Local\n' });
    await git(dir('brain-c'), 'add', '-A');
    await git(dir('brain-c'), 'commit', '-q', '-m', 'local');
    await pushToRemote(urls['brain-c']!, 'notes/remote.md', '# Remote\n');
    await git(dir('brain-d'), 'checkout', '-q', '-b', 'x');
    await pushToRemote(urls['brain-d']!, 'notes/remote.md', '# Remote\n');
    const before = Object.fromEntries(await Promise.all(['brain-a', 'brain-b', 'brain-c', 'brain-d'].map(async (id) => [id, await head(dir(id))])));

    const r = await sync(root);
    expect(r.code, r.out).toBe(0);
    expect(statuses(r)).toEqual({ 'brain-a': 'skipped-dirty', 'brain-b': 'skipped-ahead', 'brain-c': 'skipped-diverged', 'brain-d': 'skipped-branch' });
    const warnings = r.json().warnings as { code: string; message: string }[];
    expect(warnings.filter((w) => w.code === 'W_MOUNT_SKIPPED').map((w) => w.message.split(' ')[0])).toEqual(['brain-a', 'brain-b', 'brain-c', 'brain-d']);
    for (const id of Object.keys(before)) expect(await head(dir(id)), id).toBe(before[id]);
    expect(await exists(join(dir('brain-a'), 'notes', 'draft.md'))).toBe(true);
  });

  it("one broken mount doesn't stop the rest", async () => {
    const { base, root, urls } = await setup('brain-sre');
    const mesh = await read(root, 'mesh.yaml');
    await write(root, 'mesh.yaml', mesh + `  - id: brain-gone\n    url: ${join(base, 'brain-gone.git')}\n    mode: read\n`);
    await git(root, 'commit', '-q', '-am', 'add a broken mount');
    await pushToRemote(urls['brain-sre']!, 'notes/new.md', '# New\n');
    const r = await sync(root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data.pushed).toBe(true);
    expect(statuses(r)).toEqual({ 'brain-sre': 'updated', 'brain-gone': 'failed' });
    expect((r.json().warnings as { code: string }[]).map((w) => w.code)).toContain('W_MOUNT_FAILED');
  });

  it('an unpublished mount without a folder', async () => {
    const { root } = await setup();
    const mesh = await read(root, 'mesh.yaml');
    await write(root, 'mesh.yaml', mesh.replace('mounts: []', 'mounts:\n  - id: brain-local\n    mode: contribute'));
    const r = await sync(root);
    expect(statuses(r)).toEqual({ 'brain-local': 'unpublished' });
    expect((r.json().warnings as { code: string }[]).map((w) => w.code)).toContain('W_BRAIN_UNPUBLISHED_MISSING');
  });
});

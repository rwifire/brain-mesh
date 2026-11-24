import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitCommand } from '../../../src/commands/commit.js';
import { initCommand } from '../../../src/commands/init.js';
import { read, run } from '../../helpers/cli.js';
import { tempDir, writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { git } from '../../helpers/workspace.js';

/** A workspace made by `init` and pushed to a bare repo, plus a second clone of that repo. */
async function setup() {
  await isolateGit();
  const base = await tempDir('bm commit ');
  const root = join(base, 'my workspace');
  const bare = join(base, 'remote.git');
  const other = join(base, 'other machine');
  await mkdir(root);
  await mkdir(bare);
  await git(bare, 'init', '--bare', '-q', '-b', 'main');
  const r = await run(['init', '--json'], root, [initCommand({ host: fakeHost({ repoUrl: bare }) })]);
  if (r.code !== 0) throw new Error(r.out);
  await git(base, 'clone', '-q', bare, other);
  return { root, bare, other };
}

const commit = (root: string, ...args: string[]) => run(['commit', ...args, '--json'], root, [commitCommand]);

/** Commits `tree` in `dir` and pushes it, as the other machine would. */
async function pushFrom(dir: string, tree: Record<string, string>) {
  await writeTree(dir, tree);
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '--no-verify', '-m', 'from the other machine');
  await git(dir, 'push', '-q');
}

describe('commit', () => {
  it('commits only personal paths and pushes', async () => {
    const { root, bare } = await setup();
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n', 'tools/x.ts': 'export {};\n' });
    const r = await commit(root, '-m', 'Capture a');
    expect(r.code).toBe(0);
    expect(r.json().data).toMatchObject({ brain: 'personal', committed: true, files: ['brains/personal/inbox/a.md'], pushed: true });
    expect(r.json().data.commit).toBe(await git(root, 'rev-parse', 'HEAD'));
    expect(await git(bare, 'log', '-1', '--format=%s', 'main')).toBe('Capture a');
    expect(await git(root, 'status', '--porcelain', '--', 'tools/x.ts')).toBe('?? tools/x.ts');
  });

  it('other staged changes stay staged', async () => {
    const { root } = await setup();
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    await writeTree(root, { 'AGENTS.md': (await read(root, 'AGENTS.md')) + '\nextra\n' });
    await git(root, 'add', 'AGENTS.md');
    expect((await commit(root, '-m', 'Capture a')).code).toBe(0);
    expect(await git(root, 'diff', '--cached', '--name-only')).toBe('AGENTS.md');
    expect(await git(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('brains/personal/inbox/a.md');
  });

  it('rebases on the remote first', async () => {
    const { root, bare, other } = await setup();
    await pushFrom(other, { 'brains/personal/b.md': '# B\n' });
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    const r = await commit(root, '-m', 'Capture a');
    expect(r.json().data).toMatchObject({ committed: true, pushed: true });
    expect(await git(bare, 'ls-tree', '-r', '--name-only', 'main', 'brains/personal')).toContain('brains/personal/b.md');
    expect(await git(bare, 'ls-tree', '-r', '--name-only', 'main', 'brains/personal')).toContain('brains/personal/inbox/a.md');
    expect(await git(bare, 'rev-list', '--merges', '--count', 'main')).toBe('0');
  });

  it('unstaged changes elsewhere survive the pull', async () => {
    const { root, other } = await setup();
    await pushFrom(other, { 'brains/personal/b.md': '# B\n' });
    const readme = (await read(root, 'tools/README.md')) + 'my edit\n';
    await writeTree(root, { 'tools/README.md': readme, 'brains/personal/inbox/a.md': '# A\n' });
    expect((await commit(root, '-m', 'Capture a')).json().data.pushed).toBe(true);
    expect(await read(root, 'tools/README.md')).toBe(readme);
  });

  it('rebase conflict keeps the local commit', async () => {
    const { root, bare, other } = await setup();
    const index = await read(other, 'brains/personal/index.md');
    await pushFrom(other, { 'brains/personal/index.md': index + 'theirs\n' });
    const before = await git(bare, 'rev-parse', 'main');
    await writeTree(root, { 'brains/personal/index.md': index + 'ours\n' });
    const r = await commit(root, '-m', 'Edit index');
    expect(r.code).toBe(1);
    expect(r.json().error.code).toBe('E_SYNC_CONFLICT');
    const gitDir = join(root, '.git');
    for (const d of ['rebase-merge', 'rebase-apply']) {
      expect(await stat(join(gitDir, d)).then(() => true, () => false)).toBe(false);
    }
    expect(await git(root, 'log', '-1', '--format=%s')).toBe('Edit index');
    expect(await git(bare, 'rev-parse', 'main')).toBe(before);
  });

  it('nothing to commit still pushes earlier commits', async () => {
    const { root, bare } = await setup();
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    await git(root, 'add', '-A');
    await git(root, 'commit', '-q', '-m', 'offline');
    const r = await commit(root, '-m', 'x');
    expect(r.json().data).toMatchObject({ committed: false, commit: null, files: [], pushed: true });
    expect(await git(bare, 'log', '-1', '--format=%s', 'main')).toBe('offline');
  });

  it('no upstream warns', async () => {
    const { root } = await setup();
    await git(root, 'branch', '--unset-upstream');
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    const r = await commit(root, '-m', 'Capture a');
    expect(r.json().data).toMatchObject({ committed: true, pushed: false });
    expect(r.json().warnings.map((w: { code: string }) => w.code)).toEqual(['W_NO_UPSTREAM']);
  });

  it('push failure warns', async () => {
    const { root, bare } = await setup();
    await git(root, 'remote', 'set-url', '--push', 'origin', join(bare, 'missing.git'));
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    const r = await commit(root, '-m', 'Capture a');
    expect(r.code).toBe(0);
    expect(r.json().data).toMatchObject({ committed: true, pushed: false });
    expect(r.json().warnings.map((w: { code: string }) => w.code)).toEqual(['W_PUSH_FAILED']);
  });

  it('pull failure warns and skips the push', async () => {
    const { root, bare } = await setup();
    await git(root, 'remote', 'set-url', 'origin', join(bare, 'missing.git'));
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    const r = await commit(root, '-m', 'Capture a');
    expect(r.json().data).toMatchObject({ committed: true, pushed: false });
    expect(r.json().warnings.map((w: { code: string }) => w.code)).toEqual(['W_PULL_FAILED']);
  });

  it('human output', async () => {
    const { root } = await setup();
    await writeTree(root, { 'brains/personal/inbox/a.md': '# A\n' });
    const r = await run(['commit', '-m', 'Capture a'], root, [commitCommand]);
    const sha = (await git(root, 'rev-parse', 'HEAD')).slice(0, 7);
    expect(r.out).toBe(`Committed 1 file in brains/personal/ (${sha}) and pushed.\n`);
    expect((await run(['commit', '-m', 'x'], root, [commitCommand])).out).toBe('Nothing to commit in brains/personal/.\n');
  });

  it('shared brain id is not supported', async () => {
    const { root } = await setup();
    expect((await commit(root, 'brain-team-platform', '-m', 'x')).json().error.code).toBe('E_NOT_SUPPORTED');
  });

  it('message is required', async () => {
    const { root } = await setup();
    const r = await commit(root);
    expect(r.code).toBe(2);
    expect(r.json().error.code).toBe('E_USAGE');
  });

  it('outside a workspace', async () => {
    await isolateGit();
    expect((await commit(await tempDir(), '-m', 'x')).json().error.code).toBe('E_NO_WORKSPACE');
  });
});

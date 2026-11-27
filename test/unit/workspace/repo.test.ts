import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { commitPaths, pullPush, WORKSPACE_CONFIG } from '../../../src/workspace/repo.js';
import { tempDir, writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { git } from '../../helpers/workspace.js';

async function repo() {
  await isolateGit();
  const dir = await tempDir('bm repo ');
  await git(dir, 'init', '-q', '-b', 'main');
  await writeTree(dir, { 'mesh.yaml': 'a\n', 'tools/x.ts': 'a\n', 'brains/personal/a.md': 'a\n' });
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

describe('commitPaths', () => {
  it('commitPaths commits only the named paths', async () => {
    const dir = await repo();
    await writeTree(dir, { 'mesh.yaml': 'b\n', 'tools/x.ts': 'b\n', 'brains/personal/a.md': 'b\n' });
    const sha = await commitPaths(dir, WORKSPACE_CONFIG, 'Mount x');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect((await git(dir, 'show', '--name-only', '--format=%s', 'HEAD')).trim().split('\n')).toEqual(['Mount x', '', 'mesh.yaml']);
    expect((await git(dir, 'status', '--porcelain')).split('\n').sort()).toEqual([' M brains/personal/a.md', ' M tools/x.ts']);
  });

  it('nothing changed means no commit', async () => {
    const dir = await repo();
    const head = await git(dir, 'rev-parse', 'HEAD');
    expect(await commitPaths(dir, WORKSPACE_CONFIG, 'Mount x')).toBeNull();
    expect(await git(dir, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('a path that does not exist yet is fine', async () => {
    const dir = await repo();
    await writeTree(dir, { '.gitignore': '.mesh/\n' });
    await commitPaths(dir, WORKSPACE_CONFIG, 'Render');
    expect((await git(dir, 'show', '--name-only', '--format=', 'HEAD')).trim()).toBe('.gitignore');
  });
});

describe('pullPush', () => {
  it('a conflicting restore says where the changes are', async () => {
    const dir = await repo();
    const base = await tempDir('bm repo remote ');
    const bare = join(base, 'remote.git');
    await git(base, 'init', '--bare', '-q', '-b', 'main', bare);
    await git(dir, 'remote', 'add', 'origin', bare);
    await git(dir, 'push', '-q', '-u', 'origin', 'main');
    const other = join(base, 'other');
    await git(base, 'clone', '-q', bare, other);
    await writeTree(other, { 'tools/x.ts': 'theirs\n' });
    await git(other, 'commit', '-q', '-am', 'theirs');
    await git(other, 'push', '-q');
    await writeTree(dir, { 'tools/x.ts': 'mine\n' });
    const r = await pullPush(dir);
    const kept = r.warnings.find((w) => w.code === 'W_STASH_KEPT');
    expect(kept?.message).toContain('conflict markers');
    expect(kept?.message).toContain('git stash list');
  });
});

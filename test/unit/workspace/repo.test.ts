import { describe, expect, it } from 'vitest';
import { commitPaths, WORKSPACE_CONFIG } from '../../../src/workspace/repo.js';
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

import { cp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { packageCore, type CoreSource } from '../../../src/render/core.js';
import { renderWorkspace } from '../../../src/render/workspace.js';
import { FIXTURES_DIR, tempDir } from '../../helpers/fixtures.js';
import { git, writeFiles } from '../../helpers/workspace.js';

const WARNING = 'brain-mesh: heads-up: this commit mixes brains/personal/ with other workspace files.';
const CORE: CoreSource = { ...packageCore(), skillsDir: join(FIXTURES_DIR, 'core', 'skills'), agentsDir: join(FIXTURES_DIR, 'core', 'agents') };

/** A rendered workspace in a path with a space, as a git repo with the hook enabled and one commit. */
async function hooked(): Promise<string> {
  const root = join(await tempDir('bm hook '), 'my workspace');
  await cp(join(FIXTURES_DIR, 'workspace-full'), root, { recursive: true });
  await renderWorkspace(root, { core: CORE });
  await git(root, 'init', '-q');
  await git(root, 'add', '-A');
  await git(root, 'commit', '-q', '--no-verify', '-m', 'base');
  await git(root, 'config', 'core.hooksPath', '.mesh/hooks');
  return root;
}

const commit = async (root: string) =>
  execa('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'x'], {
    cwd: root,
  });

describe('mixed-commit hook', () => {
  it('mixed commit warns and still commits', async () => {
    const root = await hooked();
    await writeFiles(root, { 'brains/personal/x.md': '# X\n', 'tools/a.ts': 'export {};\n' });
    await git(root, 'add', 'brains/personal/x.md', 'tools/a.ts');
    const r = await commit(root);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain(WARNING);
    expect(await git(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('brains/personal/x.md\ntools/a.ts');
  });

  it('personal-only commit is silent', async () => {
    const root = await hooked();
    await writeFiles(root, { 'brains/personal/x.md': '# X\n' });
    await git(root, 'add', 'brains/personal/x.md');
    const r = await commit(root);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('brain-mesh');
  });

  it('non-personal commit is silent', async () => {
    const root = await hooked();
    await writeFiles(root, { 'tools/a.ts': 'export {};\n' });
    await git(root, 'add', 'tools/a.ts');
    expect((await commit(root)).stderr).not.toContain('brain-mesh');
  });

  it('a move out of brains/personal/ counts as mixed', async () => {
    const root = await hooked();
    await git(root, 'mv', 'brains/personal/index.md', 'moved-index.md');
    expect((await commit(root)).stderr).toContain(WARNING);
  });

  it.skipIf(process.platform === 'win32')('without node on PATH the hook exits 0 silently', async (ctx) => {
    const hasNode = await Promise.all(['/usr/bin/node', '/bin/node'].map((p) => stat(p).then(() => true, () => false)));
    if (hasNode.some(Boolean)) ctx.skip();
    const root = await hooked();
    const r = await execa('sh', ['.mesh/hooks/pre-commit'], { cwd: root, env: { PATH: '/usr/bin:/bin' }, extendEnv: false, reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe('');
  });
});

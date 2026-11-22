import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { tempDir, writeTree } from '../helpers/fixtures.js';

// Proves the chunk 1 hook design on each CI OS; chunk 6 replaces it with the real hook.
describe('pre-commit hook mechanism', () => {
  it('a sh pre-commit hook calling node warns on stderr and never blocks', async () => {
    const repo = await tempDir('bm hook-');
    const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(repo, '.gitconfig-empty') };
    await writeTree(repo, {
      '.gitconfig-empty': '',
      '.githooks/pre-commit': '#!/bin/sh\nexec node "$(dirname "$0")/warn.mjs"\n',
      '.githooks/warn.mjs': "process.stderr.write('brain-mesh: warning: mixed commit\\n');\n",
      'a.md': '# A\n',
    });
    await chmod(join(repo, '.githooks', 'pre-commit'), 0o755);
    const git = (...args: string[]) =>
      execa('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: repo, env: gitEnv });
    await git('init', '-q');
    await git('config', 'core.hooksPath', '.githooks');
    await git('add', 'a.md');
    const r = await git('commit', '-q', '-m', 'test');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('brain-mesh: warning: mixed commit');
    expect((await git('rev-list', '--count', 'HEAD')).stdout).toBe('1');
  });
});

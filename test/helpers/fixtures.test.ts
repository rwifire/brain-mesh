import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR, fixture, tempDir, writeTree } from './fixtures.js';

describe('fixture harness', () => {
  let removed = '';

  it('fixture copies into a temp dir and leaves the original alone', async () => {
    const root = await fixture('workspace-minimal');
    removed = root;
    expect(root.startsWith(tmpdir())).toBe(true);
    await writeFile(join(root, 'mesh.yaml'), 'changed');
    expect(await readFile(join(FIXTURES_DIR, 'workspace-minimal', 'mesh.yaml'), 'utf8')).not.toBe('changed');
  });

  it('removes the temp dir after the test', () => {
    expect(removed).not.toBe('');
    expect(existsSync(removed)).toBe(false);
  });

  it('writeTree creates nested files', async () => {
    const root = await tempDir();
    await writeTree(root, { 'brains/x/notes/a.md': '# A\n' });
    expect(await readFile(join(root, 'brains', 'x', 'notes', 'a.md'), 'utf8')).toBe('# A\n');
  });

  it.each(['../escape.md', 'a/../../escape.md', '/abs.md'])('writeTree rejects %s', async (key) => {
    const root = await tempDir();
    await expect(writeTree(root, { [key]: '' })).rejects.toThrow();
  });
});

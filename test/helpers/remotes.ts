import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { brainFiles, sharedManifest } from '../../src/render/brain.js';
import { tempDir, writeTree } from './fixtures.js';
import { git } from './workspace.js';

/** A shared brain's files for `id`, as `brain new` would write them. */
export const sharedBrainFiles = (id: string, description = `The ${id} brain.`): Record<string, string> =>
  Object.fromEntries(brainFiles(sharedManifest({ id, name: id, description, owner: '@acme/team' })));

/** An empty bare repo `<base>/<name>.git`; returns its path. */
export async function emptyRemote(base: string, name: string): Promise<string> {
  const bare = join(base, `${name}.git`);
  await mkdir(bare, { recursive: true });
  await git(bare, 'init', '-q', '--bare', '-b', 'main');
  return bare;
}

/**
 * A bare repo `<base>/<name>.git` holding one commit on `main` of `files` (default: a shared
 * brain `name`); returns its path. Pass `{}` for a repo with only a README.
 */
export async function sharedRemote(base: string, name: string, files?: Record<string, string>): Promise<string> {
  const bare = await emptyRemote(base, name);
  const work = await tempDir('bm remote work ');
  await writeTree(work, { ...(files ?? sharedBrainFiles(name)), ...(files !== undefined && Object.keys(files).length === 0 ? { 'README.md': '# x\n' } : {}) });
  await git(work, 'init', '-q', '-b', 'main');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-q', '-m', 'first');
  await git(work, 'push', '-q', bare, 'main');
  return bare;
}

/** Pushes one new commit adding `rel` to `bare`'s main from a fresh clone. */
export async function pushToRemote(bare: string, rel: string, text: string): Promise<void> {
  const work = join(await tempDir('bm remote push '), 'w');
  await git(join(work, '..'), 'clone', '-q', bare, 'w');
  await writeTree(work, { [rel]: text });
  await git(work, 'add', '-A');
  await git(work, 'commit', '-q', '-m', `add ${rel}`);
  await git(work, 'push', '-q', 'origin', 'HEAD:main');
}

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

/**
 * A workspace made by the real `init` (fake host, a bare repo as its remote) in `<base>/ws`, pushed.
 * Call `isolateGit()` first.
 */
export async function initWorkspace(base?: string): Promise<{ base: string; root: string; remote: string }> {
  const { initCommand } = await import('../../src/commands/init.js');
  const { fakeHost } = await import('./host.js');
  const { run } = await import('./cli.js');
  const b = base ?? (await tempDir('bm ws '));
  const remote = await emptyRemote(b, 'ai-workspace');
  const root = join(b, 'ws');
  await mkdir(root);
  const r = await run(['init', '--json'], root, [initCommand({ host: fakeHost({ repoUrl: remote }) })]);
  if (r.code !== 0) throw new Error(`init failed: ${r.out}`);
  return { base: b, root, remote };
}

/**
 * `isolateGit({ extra })` lines that make `https://github.com/<org>/<name>.git` resolve to the
 * local `<base>/<name>.git`, so github.com URLs work in tests without the network.
 */
export function githubAlias(base: string, org = 'acme'): string[] {
  const local = base.split('\\').join('/').replace(/\/?$/, '/');
  return [`[url "${local}"]`, `\tinsteadOf = https://github.com/${org}/`];
}

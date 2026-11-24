import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { fixture, writeTree } from './fixtures.js';

const GIT_CONFIG = ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];

/** Runs git in `cwd` with a fixed identity and no line-ending conversion. */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execa('git', [...GIT_CONFIG, ...args], { cwd })).stdout;
}

/** Makes `dir` a git repo with everything committed. */
export async function commitAll(dir: string): Promise<void> {
  await git(dir, 'init', '-q');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'fixture');
}

/** A copy of `workspace-full` whose read mount `brain-handbook` is a clean git repo. */
export async function fullWorkspace(): Promise<string> {
  const root = await fixture('workspace-full');
  await commitAll(join(root, 'brains', 'brain-handbook'));
  return root;
}

export const writeFiles = writeTree;

/** Removes a file or folder given as a posix path relative to `root`. */
export async function removePath(root: string, rel: string): Promise<void> {
  await rm(join(root, ...rel.split('/')), { recursive: true, force: true, maxRetries: 5 });
}

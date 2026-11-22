import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTestFinished } from 'vitest';

/** Absolute path of `test/fixtures`. */
export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));

/** A fresh directory under the OS temp dir, removed when the current test finishes. */
export async function tempDir(prefix = 'brain-mesh-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(() => rm(dir, { recursive: true, force: true, maxRetries: 5 }));
  return dir;
}

/** Writes files given as posix relative paths → UTF-8 content, creating parent folders. */
export async function writeTree(root: string, tree: Record<string, string>): Promise<void> {
  for (const [key, content] of Object.entries(tree)) {
    const segments = key.split('/');
    if (key.startsWith('/') || isAbsolute(key) || segments.includes('..')) {
      throw new Error(`writeTree: path must be relative and stay inside the root: ${key}`);
    }
    const file = join(root, ...segments);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  }
}

/** Copies `test/fixtures/<name>/` into a fresh temp dir and returns that dir. */
export async function fixture(name: string): Promise<string> {
  const root = await tempDir();
  await cp(join(FIXTURES_DIR, name), root, { recursive: true });
  return root;
}

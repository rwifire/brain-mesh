import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { onTestFinished, vi } from 'vitest';
import { tempDir } from './fixtures.js';

/**
 * Points git at a fresh global config for the current test: a fixed identity (unless
 * `identity: false`, which also forbids guessing one), optional `core.autocrlf=true`, no system config.
 */
export async function isolateGit(o: { autocrlf?: boolean; identity?: boolean } = {}): Promise<void> {
  const dir = await tempDir('bm gitconfig-');
  const file = join(dir, 'gitconfig');
  const lines = o.identity === false ? ['[user]', '\tuseConfigOnly = true'] : ['[user]', '\tname = Test', '\temail = test@example.invalid'];
  if (o.autocrlf) lines.push('[core]', '\tautocrlf = true');
  await writeFile(file, lines.join('\n') + '\n', 'utf8');
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  vi.stubEnv('GIT_CONFIG_GLOBAL', file);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  for (const v of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) vi.stubEnv(v, undefined);
}

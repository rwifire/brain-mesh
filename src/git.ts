import { execa } from 'execa';

/** True when `git status --porcelain` in `dir` prints anything. Throws when git fails. */
export async function gitIsDirty(dir: string): Promise<boolean> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: dir });
  return stdout.trim() !== '';
}

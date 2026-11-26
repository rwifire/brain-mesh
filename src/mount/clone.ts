import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { git } from '../git.js';
import { CliError, ErrorCode, ExitCode } from '../output.js';
import { SharedBrainManifestSchema } from '../schemas/brain.js';
import { BrainId } from '../schemas/common.js';
import { repoNameFromUrl } from '../workspace/url.js';
import type { z } from 'zod';

export type SharedBrainManifest = z.infer<typeof SharedBrainManifestSchema>;

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const exists = (p: string) => stat(p).then(() => true, () => false);

/** The brain id a mount URL gives (its repo name), checked as a `BrainId`; throws `E_USAGE`. */
export function brainIdOf(url: string, id?: string): string {
  const name = id ?? repoNameFromUrl(url);
  if (name === null || !BrainId.safeParse(name).success) {
    throw new CliError(ErrorCode.Usage, `${url} does not name a brain: the repo name must be lowercase kebab-case`, ExitCode.Usage);
  }
  return name;
}

/** Throws `E_MOUNT_EXISTS` when `id` is `personal` or `brains/<id>` already exists. */
export async function assertFreeId(root: string, id: string): Promise<void> {
  if (id === 'personal') throw new CliError(ErrorCode.MountExists, 'the id personal is reserved for the personal brain');
  if (await exists(join(root, 'brains', id))) throw new CliError(ErrorCode.MountExists, `brains/${id} already exists`);
}

/** Removes a folder brain-mesh created, retrying while Windows still holds a git file open. */
export const removeFolder = (dir: string) => rm(dir, { recursive: true, force: true, maxRetries: 5 });

/**
 * Clones the shared brain at `url` into `brains/<id>` and checks its manifest: a valid shared
 * `brain.yaml` whose `id` is the folder id. On any failure the folder is removed again.
 * Throws `E_USAGE`, `E_MOUNT_EXISTS`, `E_GIT` or `E_NOT_A_BRAIN`.
 */
export async function cloneBrain(root: string, url: string, opts: { id?: string } = {}): Promise<{ id: string; manifest: SharedBrainManifest }> {
  const id = brainIdOf(url, opts.id);
  await assertFreeId(root, id);
  const dir = join(root, 'brains', id);
  const fail = async (err: CliError): Promise<never> => {
    await removeFolder(dir);
    throw err;
  };

  const clone = await git(join(root, 'brains'), ['clone', '-q', url, id], { network: true });
  if (clone.exitCode !== 0) return fail(new CliError(ErrorCode.Git, `could not clone ${url}: ${firstLine(clone.stderr)}`));

  let raw: unknown;
  try {
    raw = parse(await readFile(join(dir, 'brain.yaml'), 'utf8'));
  } catch (err) {
    const why = err instanceof Error ? firstLine(err.message) : String(err);
    return fail(new CliError(ErrorCode.NotABrain, `${url} is not a brain: brain.yaml is missing or unreadable (${why})`));
  }
  const manifest = SharedBrainManifestSchema.safeParse(raw);
  if (!manifest.success) {
    return fail(new CliError(ErrorCode.NotABrain, `${url} is not a shared brain: brain.yaml ${manifest.error.issues[0]?.path.join('.') ?? ''} ${manifest.error.issues[0]?.message ?? 'is invalid'}`.replace(/\s+/g, ' ')));
  }
  if (manifest.data.id !== id) {
    return fail(new CliError(ErrorCode.NotABrain, `${url} holds the brain ${manifest.data.id}, but its repo name is ${id}; a shared brain's id must be its repo name`));
  }
  return { id, manifest: manifest.data };
}

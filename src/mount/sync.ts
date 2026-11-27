import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from '../git.js';
import { packageVersion } from '../meta.js';
import { CliError, type Warning } from '../output.js';
import { renderWorkspace } from '../render/workspace.js';
import type { Mount } from '../schemas/mesh.js';
import { readMesh, readMounts } from '../workspace/mesh-edit.js';
import { pullPush } from '../workspace/repo.js';
import { cloneBrain } from './clone.js';

export type MountSyncStatus =
  | 'cloned'
  | 'updated'
  | 'up-to-date'
  | 'skipped-dirty'
  | 'skipped-diverged'
  | 'skipped-ahead'
  | 'skipped-branch'
  | 'unpublished'
  | 'failed';

export interface SyncData {
  pushed: boolean;
  mounts: { id: string; status: MountSyncStatus; detail?: string }[];
}

type Row = SyncData['mounts'][number];

const exists = (p: string) => stat(p).then(() => true, () => false);
const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const reason = (err: unknown) => (err instanceof Error ? firstLine(err.message) : String(err));

/** Brings one cloned mount up to date with a fast-forward, or says why it was left alone. */
async function updateClone(dir: string, m: Mount): Promise<Row> {
  const where = `brains/${m.id}/`;
  if (!(await exists(join(dir, '.git')))) return { id: m.id, status: 'failed', detail: `${where} is not a git clone` };
  const status = await git(dir, ['status', '--porcelain']);
  if (status.exitCode !== 0) return { id: m.id, status: 'failed', detail: `git status failed: ${firstLine(status.stderr)}` };
  if (status.stdout.trim() !== '') return { id: m.id, status: 'skipped-dirty', detail: `${where} has uncommitted changes; commit or discard them, then sync again` };

  const branch = await git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const def = await git(dir, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']);
  const defaultBranch = def.exitCode === 0 ? def.stdout.trim().replace(/^origin\//, '') : null;
  if (branch.exitCode !== 0 || (defaultBranch !== null && branch.stdout.trim() !== defaultBranch)) {
    const on = branch.exitCode === 0 ? `branch ${branch.stdout.trim()}` : 'a detached HEAD';
    return { id: m.id, status: 'skipped-branch', detail: `${where} is on ${on}, not ${defaultBranch ?? "origin's default branch"}; switch back to sync it` };
  }

  const fetch = await git(dir, ['fetch', '-q', 'origin'], { network: true });
  if (fetch.exitCode !== 0) return { id: m.id, status: 'failed', detail: `could not fetch ${m.url}: ${firstLine(fetch.stderr)}` };
  const counts = await git(dir, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
  if (counts.exitCode !== 0) return { id: m.id, status: 'failed', detail: `${where} has no upstream branch: ${firstLine(counts.stderr)}` };
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number) as [number, number];
  if (ahead > 0 && behind > 0) return { id: m.id, status: 'skipped-diverged', detail: `${where} and its remote both have new commits; rebase or merge them by hand` };
  if (ahead > 0) return { id: m.id, status: 'skipped-ahead', detail: `${where} has ${ahead} commit${ahead === 1 ? '' : 's'} on no remote branch; push them or reset to origin` };
  if (behind === 0) return { id: m.id, status: 'up-to-date' };
  const merge = await git(dir, ['merge', '-q', '--ff-only', '@{u}']);
  if (merge.exitCode !== 0) return { id: m.id, status: 'failed', detail: `fast-forward failed: ${firstLine(merge.stderr)}` };
  return { id: m.id, status: 'updated' };
}

async function syncMount(root: string, m: Mount, warnings: Warning[]): Promise<Row> {
  const dir = join(root, 'brains', m.id);
  if (!(await exists(dir))) {
    if (m.url === undefined) {
      warnings.push({ code: 'W_BRAIN_UNPUBLISHED_MISSING', message: `${m.id} is not published and brains/${m.id}/ is missing; its only copy was on another machine` });
      return { id: m.id, status: 'unpublished' };
    }
    try {
      await cloneBrain(root, m.url, { id: m.id });
      return { id: m.id, status: 'cloned' };
    } catch (err) {
      if (err instanceof CliError) return { id: m.id, status: 'failed', detail: err.message };
      throw err;
    }
  }
  if (m.url === undefined) return { id: m.id, status: 'unpublished' };
  return updateClone(dir, m);
}

/**
 * `sync`: pulls and pushes the workspace repo, then clones each missing mount and fast-forwards
 * each clean one (chunk 9 plan, decision 5). One mount failing never stops the rest; every
 * skipped or failed mount gets a `W_MOUNT_SKIPPED` or `W_MOUNT_FAILED` warning.
 */
export async function syncWorkspace(root: string): Promise<SyncData & { warnings: Warning[] }> {
  const { pushed, warnings } = await pullPush(root);
  const mounts: Row[] = [];
  for (const m of await readMounts(root)) {
    const row = await syncMount(root, m, warnings).catch((err: unknown): Row => ({ id: m.id, status: 'failed', detail: reason(err) }));
    mounts.push(row);
    if (row.status.startsWith('skipped-')) warnings.push({ code: 'W_MOUNT_SKIPPED', message: `${m.id} was not updated: ${row.detail}` });
    if (row.status === 'failed') warnings.push({ code: 'W_MOUNT_FAILED', message: `${m.id} could not be synced: ${row.detail}` });
  }
  // After another clone upgraded, this CLI holds the old core: rendering would mix it with the new pin (chunk 11 plan, decision 7).
  const pin = (await readMesh(root)).brain_mesh;
  if (pin !== packageVersion()) {
    warnings.push({
      code: 'W_PIN_CHANGED',
      message: `mesh.yaml now pins ${pin}, this is ${packageVersion()}; run npx -y brain-mesh-ai-workspace@${pin} init to re-render the managed files`,
    });
  } else {
    warnings.push(...(await renderWorkspace(root)).warnings);
  }
  return { pushed, mounts, warnings };
}

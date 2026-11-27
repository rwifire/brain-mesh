import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { git } from '../git.js';
import type { Host } from '../host/host.js';
import type { CommandDef } from '../main.js';
import { assertFreeId, brainIdOf, cloneBrain, removeFolder } from '../mount/clone.js';
import { packageVersion } from '../meta.js';
import { checkPushRights } from '../mount/rights.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { renderWorkspace } from '../render/workspace.js';
import type { Mount } from '../schemas/mesh.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { editMesh, readMesh, readMounts } from '../workspace/mesh-edit.js';
import { WORKSPACE_CONFIG, assertGitIdentity, commitPaths, pullPush } from '../workspace/repo.js';
import { absoluteUrl } from '../workspace/url.js';

export interface MountInfo {
  id: string;
  type: 'personal' | 'shared';
  mode: 'personal' | 'read' | 'contribute';
  url: string | null;
  published: boolean;
  path: string;
  cloned: boolean;
  description: string | null;
}

const exists = (p: string) => stat(p).then(() => true, () => false);
const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();

export async function workspaceRoot(cwd: string): Promise<string> {
  const root = await findWorkspaceRoot(cwd);
  if (root === null) throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${cwd} or any parent folder`, ExitCode.Failure);
  return root;
}

/**
 * The workspace root, for a command that renders and commits: refuses when mesh.yaml pins another
 * version, so an old CLI never pushes its old core under a newer pin (chunk 11 final review).
 */
export async function renderingWorkspaceRoot(cwd: string): Promise<string> {
  const root = await workspaceRoot(cwd);
  const pin = (await readMesh(root)).brain_mesh;
  if (pin !== packageVersion()) {
    throw new CliError(
      ErrorCode.PinMismatch,
      `this workspace is pinned to brain-mesh ${pin}, but this is ${packageVersion()}; run npx -y brain-mesh-ai-workspace@${pin} init, then use that version`,
    );
  }
  return root;
}

/** The `description` of `brains/<id>/brain.yaml`; null when missing or unreadable. */
async function descriptionOf(root: string, id: string): Promise<string | null> {
  try {
    const m = parse(await readFile(join(root, 'brains', id, 'brain.yaml'), 'utf8')) as { description?: unknown } | null;
    return typeof m?.description === 'string' ? m.description : null;
  } catch {
    return null;
  }
}

/** Commits the workspace config and pulls/pushes; a commit of nothing (already recorded) is fine. */
export async function record(root: string, message: string): Promise<{ commit: string | null; pushed: boolean; warnings: Warning[] }> {
  const commit = await commitPaths(root, WORKSPACE_CONFIG, message);
  const { pushed, warnings } = await pullPush(root);
  return { commit, pushed, warnings };
}

export interface MountData {
  id: string;
  url: string;
  mode: 'read' | 'contribute';
  path: string;
  commit: string | null;
  pushed: boolean;
}

/** `mount <git-url>`: clones a shared brain into `brains/<id>`, records it in mesh.yaml, renders, commits and pushes. */
export function mountCommand(deps: { host: Host }): CommandDef {
  return {
    name: 'mount',
    description: 'mount a shared brain: clone it, record it in mesh.yaml, commit and push',
    configure: (cmd) => {
      cmd.argument('<git-url>', 'clone URL of the shared brain');
      cmd.option('--mode <mode>', 'read or contribute', 'read');
    },
    run: async (ctx, args, opts) => {
      const url = absoluteUrl(args[0]!, ctx.cwd);
      const mode = String(opts.mode);
      if (mode !== 'read' && mode !== 'contribute') throw new CliError(ErrorCode.Usage, `--mode must be read or contribute, not ${mode}`, ExitCode.Usage);
      const root = await renderingWorkspaceRoot(ctx.cwd);
      const warnings: Warning[] = [];

      const id = brainIdOf(url);
      await assertGitIdentity(root);
      const mounts = await readMounts(root);
      if (mounts.some((m) => m.id === id)) throw new CliError(ErrorCode.MountExists, `${id} is already mounted`);
      await assertFreeId(root, id);
      if (mode === 'contribute') await checkPushRights(deps.host, url, warnings, 'use --mode read to mount it without them, or ask its owner for write access');

      await cloneBrain(root, url, { id });
      const dir = join(root, 'brains', id);
      try {
        await editMesh(root, (ms) => [...ms, { id, url, mode }]);
        const rendered = await renderWorkspace(root);
        warnings.push(...rendered.warnings);
      } catch (err) {
        await editMesh(root, (ms) => ms.filter((m) => m.id !== id)).catch(() => undefined);
        await removeFolder(dir);
        throw err;
      }
      const r = await record(root, `Mount ${id} (${mode})`);
      warnings.push(...r.warnings);
      const data: MountData = { id, url, mode, path: `brains/${id}`, commit: r.commit, pushed: r.pushed };
      return { data, text: `Mounted ${id} (${mode}) at brains/${id}/${r.pushed ? ', committed and pushed.' : '; committed locally, not pushed.'}`, warnings };
    },
  };
}

/** `mounts`: the personal brain and every mount in mesh.yaml order. */
export const mountsCommand: CommandDef = {
  name: 'mounts',
  description: 'list the personal brain and the mounted shared brains',
  run: async (ctx) => {
    const root = await workspaceRoot(ctx.cwd);
    const mounts = await readMounts(root);
    const brains: MountInfo[] = [];
    const personalCloned = await exists(join(root, 'brains', 'personal'));
    brains.push({ id: 'personal', type: 'personal', mode: 'personal', url: null, published: false, path: 'brains/personal', cloned: personalCloned, description: await descriptionOf(root, 'personal') });
    for (const m of mounts) {
      const cloned = await exists(join(root, 'brains', m.id));
      brains.push({ id: m.id, type: 'shared', mode: m.mode, url: m.url ?? null, published: m.url !== undefined, path: `brains/${m.id}`, cloned, description: cloned ? await descriptionOf(root, m.id) : null });
    }
    const text = brains.map((b) => `${b.id}  ${b.mode}${b.cloned ? '' : '  (not cloned)'}${b.published || b.type === 'personal' ? '' : '  (unpublished)'}`).join('\n');
    return { data: { brains }, text };
  },
};

/** Why `brains/<id>` holds work that unmounting would lose; null when it holds none. */
async function unsavedWork(dir: string, mount: Mount): Promise<string | null> {
  if (mount.url === undefined) return `${mount.id} is not published, so brains/${mount.id}/ is its only copy`;
  if (!(await exists(dir))) return null;
  if (!(await exists(join(dir, '.git')))) return `brains/${mount.id}/ is not a git clone, so its files may be the only copy`;
  const status = await git(dir, ['status', '--porcelain']);
  if (status.exitCode !== 0) return `git status failed in brains/${mount.id}/: ${firstLine(status.stderr)}`;
  if (status.stdout.trim() !== '') return `brains/${mount.id}/ has uncommitted changes`;
  const ahead = await git(dir, ['log', '--branches', '--not', '--remotes', '--oneline']);
  if (ahead.exitCode !== 0) return `git log failed in brains/${mount.id}/: ${firstLine(ahead.stderr)}`;
  if (ahead.stdout.trim() !== '') return `brains/${mount.id}/ has commits that are on no remote branch`;
  return null;
}

/**
 * `unmount <id>`: drops the mesh.yaml entry, renders, commits and pushes, then removes `brains/<id>`
 * with `remove`. A folder that cannot be removed (e.g. held open on Windows) is kept with `W_FOLDER_KEPT`.
 */
export const unmountCommandFor = (remove: (dir: string) => Promise<void>): CommandDef => ({
  name: 'unmount',
  description: 'unmount a shared brain: remove it from mesh.yaml, commit and push, delete its folder',
  configure: (cmd) => {
    cmd.argument('<id>', 'id of the mounted brain');
    cmd.option('--force', 'unmount even when the folder holds uncommitted or unpushed work');
  },
  run: async (ctx, args, opts) => {
    const id = args[0]!;
    const root = await renderingWorkspaceRoot(ctx.cwd);
    const mount = (await readMounts(root)).find((m) => m.id === id);
    if (mount === undefined) throw new CliError(ErrorCode.UnknownBrain, `unknown brain: ${id} is not a mount in mesh.yaml`, ExitCode.Usage);
    const dir = join(root, 'brains', id);
    await assertGitIdentity(root);
    if (opts.force !== true) {
      const why = await unsavedWork(dir, mount);
      if (why !== null) throw new CliError(ErrorCode.MountDirty, `${why}; push or copy that work first, or pass --force to delete it`);
    }
    const warnings: Warning[] = [];
    await editMesh(root, (ms) => ms.filter((m) => m.id !== id));
    warnings.push(...(await renderWorkspace(root)).warnings);
    const r = await record(root, `Unmount ${id}`);
    warnings.push(...r.warnings);
    let removed = true;
    try {
      await remove(dir);
    } catch (err) {
      removed = false;
      const why = err instanceof Error ? firstLine(err.message) : String(err);
      warnings.push({ code: 'W_FOLDER_KEPT', message: `${id} is unmounted, but brains/${id}/ could not be deleted (${why}); delete it by hand once nothing holds it open` });
    }
    const data = { id, removed, commit: r.commit, pushed: r.pushed };
    return { data, text: `Unmounted ${id}${r.pushed ? '; committed and pushed.' : '; committed locally, not pushed.'}${removed ? '' : ` Delete brains/${id}/ by hand.`}`, warnings };
  },
});

export const unmountCommand: CommandDef = unmountCommandFor(removeFolder);

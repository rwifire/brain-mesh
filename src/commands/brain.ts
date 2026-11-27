import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { git, gitOk } from '../git.js';
import type { Host } from '../host/host.js';
import type { CommandDef } from '../main.js';
import { assertFreeId, brainIdOf, removeFolder } from '../mount/clone.js';
import { checkPushRights } from '../mount/rights.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { brainFiles, sharedManifest } from '../render/brain.js';
import { renderWorkspace } from '../render/workspace.js';
import { SharedBrainManifestSchema } from '../schemas/brain.js';
import { BrainId } from '../schemas/common.js';
import { editMesh, readMesh } from '../workspace/mesh-edit.js';
import { assertEmptyRemote, assertGitIdentity } from '../workspace/repo.js';
import { absoluteUrl, isNetworkUrl, repoNameFromUrl } from '../workspace/url.js';
import { record, renderingWorkspaceRoot } from './mount.js';

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const RIGHTS_HINT = 'a shared brain needs a repo you can push to; ask its owner for write access';

/** `brain new` takes a URL when it looks like one: a network URL, a path, or a name ending in `.git`. */
const looksLikeUrl = (arg: string) => isNetworkUrl(arg) || /[/\\]/.test(arg) || arg.endsWith('.git');

/** Pushes `main` of the brain in `dir` to a new `origin` at `url` and makes it track `origin/main`. */
async function pushToOrigin(dir: string, url: string): Promise<void> {
  await gitOk(dir, ['remote', 'add', 'origin', url]);
  const push = await git(dir, ['push', '-q', '-u', 'origin', 'main'], { network: true });
  if (push.exitCode !== 0) {
    await git(dir, ['remote', 'remove', 'origin']);
    throw new CliError(ErrorCode.Git, `the push to ${url} failed: ${firstLine(push.stderr)}`);
  }
  // A clone gets origin/HEAD from the remote; a pushed brain has to set it, or sync's branch check never fires.
  await git(dir, ['remote', 'set-head', 'origin', 'main']);
}

export interface BrainNewData {
  id: string;
  url: string | null;
  mode: 'contribute';
  path: string;
  published: boolean;
  commit: string | null;
  pushed: boolean;
}

/** `brain new <url-or-id>`: a new shared brain, pushed to an empty repo or kept local until `brain publish`. */
export function brainNewCommand(deps: { host: Host }): CommandDef {
  return {
    name: 'brain new',
    description: 'create a shared brain, in an empty repo or locally, and mount it to contribute',
    configure: (cmd) => {
      cmd.argument('<url-or-id>', 'clone URL of an empty repo, or the id of a brain to keep local for now');
      cmd.requiredOption('--description <text>', 'what the brain is for (one sentence)');
      cmd.option('--owner <owner>', 'accountable owner, @login or @org/team (default: you)');
      cmd.option('--name <title>', 'display name (default: the id)');
    },
    run: async (ctx, args, opts) => {
      const arg = args[0]!;
      const url = looksLikeUrl(arg) ? absoluteUrl(arg, ctx.cwd) : null;
      let id: string;
      if (url !== null) id = brainIdOf(url);
      else if (BrainId.safeParse(arg).success) id = arg;
      else throw new CliError(ErrorCode.Usage, `${arg} is not a brain id: use lowercase kebab-case, e.g. brain-ideas`, ExitCode.Usage);

      const root = await renderingWorkspaceRoot(ctx.cwd);
      const mesh = await readMesh(root);
      if (mesh.mounts.some((m) => m.id === id)) throw new CliError(ErrorCode.MountExists, `${id} is already mounted`);
      await assertFreeId(root, id);
      const manifest = sharedManifest({
        id,
        name: typeof opts.name === 'string' ? opts.name : id,
        description: String(opts.description),
        owner: typeof opts.owner === 'string' ? opts.owner : `@${mesh.user}`,
      });
      const valid = SharedBrainManifestSchema.safeParse(manifest);
      if (!valid.success) {
        const issue = valid.error.issues[0];
        const field = String(issue?.path[0] ?? 'brain.yaml');
        const flag = field === 'owner' ? '--owner (@login or @org/team)' : field === 'name' ? '--name' : field === 'description' ? '--description' : field;
        throw new CliError(ErrorCode.Usage, `${flag} is not valid for brain.yaml: ${issue?.message ?? 'does not match the schema'}`, ExitCode.Usage);
      }
      await assertGitIdentity(root);
      const warnings: Warning[] = [];
      if (url !== null) {
        await checkPushRights(deps.host, url, warnings, RIGHTS_HINT);
        await assertEmptyRemote(root, url, 'brain new');
      }

      const dir = join(root, 'brains', id);
      try {
        for (const [rel, text] of brainFiles(manifest)) {
          const abs = join(dir, ...rel.split('/'));
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, text, { encoding: 'utf8', flag: 'wx' });
        }
        await gitOk(dir, ['init', '-q', '-b', 'main']);
        await gitOk(dir, ['add', '-A']);
        await gitOk(dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', `Create brain ${id}`]);
        if (url !== null) await pushToOrigin(dir, url);
        await editMesh(root, (ms) => [...ms, url === null ? { id, mode: 'contribute' } : { id, url, mode: 'contribute' }]);
        warnings.push(...(await renderWorkspace(root)).warnings);
      } catch (err) {
        await editMesh(root, (ms) => ms.filter((m) => m.id !== id)).catch(() => undefined);
        await removeFolder(dir);
        throw err;
      }
      const r = await record(root, `Create brain ${id}`);
      warnings.push(...r.warnings);
      const data: BrainNewData = { id, url, mode: 'contribute', path: `brains/${id}`, published: url !== null, commit: r.commit, pushed: r.pushed };
      const where = url === null ? 'locally; run brain-mesh brain publish to share it' : `and pushed it to ${url}`;
      return { data, text: `Created the shared brain ${id} at brains/${id}/ ${where}.`, warnings };
    },
  };
}

/** `brain publish <id> <git-url>`: pushes a local brain to an empty repo and records its url. */
export function brainPublishCommand(deps: { host: Host }): CommandDef {
  return {
    name: 'brain publish',
    description: 'push a brain made with brain new <id> to an empty repo and record its url',
    configure: (cmd) => {
      cmd.argument('<id>', 'id of the unpublished brain');
      cmd.argument('<git-url>', 'clone URL of an empty repo named like the brain');
    },
    run: async (ctx, args) => {
      const [id, rawUrl] = args as [string, string];
      const url = absoluteUrl(rawUrl, ctx.cwd);
      const root = await renderingWorkspaceRoot(ctx.cwd);
      const mount = (await readMesh(root)).mounts.find((m) => m.id === id);
      if (mount === undefined) throw new CliError(ErrorCode.UnknownBrain, `unknown brain: ${id} is not a mount in mesh.yaml`, ExitCode.Usage);
      if (mount.url !== undefined) throw new CliError(ErrorCode.AlreadyPublished, `${id} is already published at ${mount.url}`);
      const name = repoNameFromUrl(url);
      if (name !== id) throw new CliError(ErrorCode.RepoName, `the repo name must be the brain id ${id}, not ${name ?? '(none)'}; a shared brain's id is its repo name`);
      const dir = join(root, 'brains', id);
      if ((await git(dir, ['rev-parse', '--verify', '-q', 'refs/heads/main'])).exitCode !== 0) {
        throw new CliError(ErrorCode.Git, `brains/${id}/ has no main branch to publish`);
      }
      await assertGitIdentity(root);
      const warnings: Warning[] = [];
      await checkPushRights(deps.host, url, warnings, RIGHTS_HINT);
      await assertEmptyRemote(root, url, 'brain publish');

      await pushToOrigin(dir, url);
      await editMesh(root, (ms) => ms.map((m) => (m.id === id ? { ...m, url } : m)));
      warnings.push(...(await renderWorkspace(root)).warnings);
      const r = await record(root, `Publish brain ${id}`);
      warnings.push(...r.warnings);
      const data = { id, url, commit: r.commit, pushed: r.pushed };
      return { data, text: `Published ${id} to ${url}.`, warnings };
    },
  };
}

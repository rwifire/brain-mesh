import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unmountCommandFor } from '../../../src/commands/mount.js';
import { read, run, testCommands } from '../../helpers/cli.js';
import { tempDir } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { emptyRemote, initWorkspace, sharedRemote } from '../../helpers/remotes.js';
import { git } from '../../helpers/workspace.js';

// Final-review fixes for chunk 9 (I1–I5).
const exists = (p: string) => stat(p).then(() => true, () => false);

async function setup() {
  await isolateGit();
  const ws = await initWorkspace();
  const url = await sharedRemote(ws.base, 'brain-sre');
  return { ...ws, url };
}

describe('final review fixes', () => {
  it('I1: unmount succeeds with a warning when the folder cannot be deleted', async () => {
    const { root, url } = await setup();
    expect((await run(['mount', url, '--json'], root)).code).toBe(0);
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    const commands = testCommands().map((c) => (c.name === 'unmount' ? unmountCommandFor(async () => Promise.reject(busy)) : c));
    const r = await run(['unmount', 'brain-sre', '--json'], root, commands);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ id: 'brain-sre', removed: false, pushed: true });
    const kept = (r.json().warnings as { code: string; message: string }[]).find((w) => w.code === 'W_FOLDER_KEPT');
    expect(kept?.message).toContain('brains/brain-sre/');
    expect(await read(root, 'mesh.yaml')).not.toContain('brain-sre');
  });

  it('I2: a mount conflict names the conflicting files', async () => {
    const { base, root, remote, url } = await setup();
    const other = join(await tempDir('bm other '), 'ws');
    await git(join(other, '..'), 'clone', '-q', remote, 'ws');
    expect((await run(['mount', url, '--json'], root)).code).toBe(0);
    const ops = await sharedRemote(base, 'brain-ops');
    const r = await run(['mount', ops, '--json'], other);
    const err = r.json().error;
    expect(err.code).toBe('E_SYNC_CONFLICT');
    expect(err.message).toContain('mesh.yaml');
    expect(err.message).not.toContain('brains/personal/');
  });

  it('I3: brain new checks the manifest before anything is written or pushed', async () => {
    const { base, root } = await setup();
    const mesh = await read(root, 'mesh.yaml');
    const empty = await emptyRemote(base, 'brain-ideas');
    for (const args of [['--description', 'x', '--owner', 'acme/sre'], ['--description', ''], ['--description', 'x', '--name', '']]) {
      const r = await run(['brain', 'new', empty, ...args, '--json'], root);
      expect(r.json().error.code, args.join(' ')).toBe('E_USAGE');
    }
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
    expect(await exists(join(root, 'brains', 'brain-ideas'))).toBe(false);
    expect((await git(empty, 'rev-list', '--all', '--count')).trim()).toBe('0');
  });

  it('I4: relative local URLs resolve against the current folder and are stored absolute', async () => {
    const { base, root } = await setup();
    const m = await run(['mount', '../brain-sre.git', '--json'], root);
    expect(m.code, m.out).toBe(0);
    await emptyRemote(base, 'brain-ideas');
    const n = await run(['brain', 'new', '../brain-ideas.git', '--description', 'Ideas.', '--json'], root);
    expect(n.code, n.out).toBe(0);
    expect(isAbsolute(m.json().data.url)).toBe(true);
    expect(isAbsolute(n.json().data.url)).toBe(true);
    expect((await git(join(base, 'brain-ideas.git'), 'rev-list', '--count', 'main')).trim()).toBe('1');
    expect(await read(root, 'mesh.yaml')).not.toContain('../');
  });

  it('I5: commands that commit check the git identity before any change', async () => {
    const { root, url } = await setup();
    await isolateGit({ identity: false });
    const mesh = await read(root, 'mesh.yaml');
    const brainsBefore = await readdir(join(root, 'brains'));
    for (const argv of [['mount', url], ['brain', 'new', 'brain-ideas', '--description', 'x'], ['unmount', 'brain-sre']]) {
      const r = await run([...argv, '--json'], root);
      expect(r.json().error, argv.join(' ')).toMatchObject({ code: expect.stringMatching(/E_GIT|E_UNKNOWN_BRAIN/) });
      if (argv[0] !== 'unmount') expect(r.json().error).toMatchObject({ code: 'E_GIT', message: expect.stringContaining('user.name') });
    }
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
    expect(await readdir(join(root, 'brains'))).toEqual(brainsBefore);
  });
});

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandsFor } from '../../../src/commands/index.js';
import { CliError } from '../../../src/output.js';
import { read, run, write } from '../../helpers/cli.js';
import { writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { initWorkspace, sharedRemote } from '../../helpers/remotes.js';
import { git } from '../../helpers/workspace.js';

const exists = (p: string) => stat(p).then(() => true, () => false);
const commits = async (root: string) => Number((await git(root, 'rev-list', '--count', 'HEAD')).trim());

async function setup() {
  await isolateGit();
  const ws = await initWorkspace();
  const url = await sharedRemote(ws.base, 'brain-sre');
  return { ...ws, url };
}
const mount = (root: string, ...args: string[]) => run(['mount', ...args, '--json'], root);

describe('mount', () => {
  it('mount read', async () => {
    const { root, url, remote } = await setup();
    const before = await commits(root);
    const r = await mount(root, url);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ id: 'brain-sre', url, mode: 'read', path: 'brains/brain-sre', pushed: true });
    expect(await exists(join(root, 'brains', 'brain-sre', 'brain.yaml'))).toBe(true);
    expect(await read(root, 'mesh.yaml')).toContain(`  - id: brain-sre\n    url: ${url}\n    mode: read\n`);
    expect(await read(root, '.gitignore')).toContain('brains/brain-sre/\n');
    expect(await read(root, 'AGENTS.md')).toContain('| `brain-sre` | read | yes | The brain-sre brain. |');
    expect(await commits(root)).toBe(before + 1);
    expect((await git(root, 'show', '--name-only', '--format=%s', 'HEAD')).trim().split('\n')).toEqual(['Mount brain-sre (read)', '', '.gitignore', 'AGENTS.md', 'mesh.yaml']);
    expect((await git(remote, 'rev-parse', 'main')).trim()).toBe((await git(root, 'rev-parse', 'HEAD')).trim());
    const doctor = await run(['doctor', '--json'], root);
    expect(doctor.json().data.counts.errors, doctor.out).toBe(0);
  });

  it('mount refuses collisions', async () => {
    const { root, url } = await setup();
    expect((await mount(root, url)).code).toBe(0);
    const mesh = await read(root, 'mesh.yaml');
    const n = await commits(root);
    const again = await mount(root, url);
    expect(again.json().error.code).toBe('E_MOUNT_EXISTS');
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
    expect(await commits(root)).toBe(n);
  });

  it('contribute needs push rights', async () => {
    const { root, url } = await setup();
    const gh = 'https://github.com/acme/brain-sre.git';
    const readOnly = fakeHost({ permissions: { 'acme/brain-sre': 'read' } });
    const refused = await run(['mount', gh, '--mode', 'contribute', '--json'], root, commandsFor(readOnly));
    expect(refused.json().error.code).toBe('E_NO_PUSH_RIGHTS');
    expect(readOnly.calls).toEqual(['permission acme/brain-sre']);
    expect(await exists(join(root, 'brains', 'brain-sre'))).toBe(false);
    expect(await read(root, 'mesh.yaml')).not.toContain('brain-sre');

    const offline = fakeHost({ failWith: new CliError('E_OFFLINE', 'cannot reach github.com') });
    const off = await run(['mount', gh, '--mode', 'contribute', '--json'], root, commandsFor(offline));
    expect(off.json().error).toMatchObject({ code: 'E_OFFLINE', message: expect.stringContaining('--mode read') });

    const local = await mount(root, url, '--mode', 'contribute');
    expect(local.code, local.out).toBe(0);
    expect(local.json().warnings.map((w: { code: string }) => w.code)).toContain('W_PUSH_RIGHTS_UNCHECKED');
    expect(await read(root, 'mesh.yaml')).toContain('    mode: contribute\n');
  });

  it('mount rejects an unknown mode', async () => {
    const { root, url } = await setup();
    expect((await mount(root, url, '--mode', 'write')).json().error.code).toBe('E_USAGE');
  });
});

describe('mounts', () => {
  it('mounts', async () => {
    const { root, url } = await setup();
    await mount(root, url);
    const mesh = await read(root, 'mesh.yaml');
    await write(root, 'mesh.yaml', mesh + '  - id: brain-gone\n    url: /srv/brain-gone.git\n    mode: read\n  - id: brain-local\n    mode: contribute\n');
    const r = await run(['mounts', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data.brains).toEqual([
      { id: 'personal', type: 'personal', mode: 'personal', url: null, published: false, path: 'brains/personal', cloned: true, description: 'Personal notes of octo-user.' },
      { id: 'brain-sre', type: 'shared', mode: 'read', url, published: true, path: 'brains/brain-sre', cloned: true, description: 'The brain-sre brain.' },
      { id: 'brain-gone', type: 'shared', mode: 'read', url: '/srv/brain-gone.git', published: true, path: 'brains/brain-gone', cloned: false, description: null },
      { id: 'brain-local', type: 'shared', mode: 'contribute', url: null, published: false, path: 'brains/brain-local', cloned: false, description: null },
    ]);
  });
});

describe('unmount', () => {
  it('unmount', async () => {
    const { root, url } = await setup();
    await mount(root, url);
    const r = await run(['unmount', 'brain-sre', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ id: 'brain-sre', removed: true, pushed: true });
    expect(await exists(join(root, 'brains', 'brain-sre'))).toBe(false);
    expect(await read(root, 'mesh.yaml')).not.toContain('brain-sre');
    expect(await read(root, '.gitignore')).not.toContain('brains/brain-sre/');
    expect((await git(root, 'log', '-1', '--format=%s')).trim()).toBe('Unmount brain-sre');
    expect((await git(root, 'status', '--porcelain')).trim()).toBe('');
  });

  it('unmount protects work', async () => {
    const { root, url } = await setup();
    await mount(root, url);
    const clone = join(root, 'brains', 'brain-sre');

    await writeTree(clone, { 'notes/draft.md': '# Draft\n' });
    const dirty = await run(['unmount', 'brain-sre', '--json'], root);
    expect(dirty.json().error.code).toBe('E_MOUNT_DIRTY');
    expect(await exists(join(clone, 'notes', 'draft.md'))).toBe(true);
    await git(clone, 'add', '-A');
    await git(clone, 'commit', '-q', '-m', 'local');
    const ahead = await run(['unmount', 'brain-sre', '--json'], root);
    expect(ahead.json().error.code).toBe('E_MOUNT_DIRTY');
    expect(await read(root, 'mesh.yaml')).toContain('brain-sre');

    const forced = await run(['unmount', 'brain-sre', '--force', '--json'], root);
    expect(forced.code, forced.out).toBe(0);
    expect(await exists(clone)).toBe(false);
  });

  it('unmount protects an unpublished brain', async () => {
    const { root } = await setup();
    const mesh = await read(root, 'mesh.yaml');
    await write(root, 'mesh.yaml', mesh.replace('mounts: []', 'mounts:\n  - id: brain-local\n    mode: contribute'));
    await writeTree(join(root, 'brains', 'brain-local'), { 'brain.yaml': 'x\n' });
    await git(join(root, 'brains', 'brain-local'), 'init', '-q');
    const r = await run(['unmount', 'brain-local', '--json'], root);
    expect(r.json().error).toMatchObject({ code: 'E_MOUNT_DIRTY', message: expect.stringContaining('only copy') });
    expect(await exists(join(root, 'brains', 'brain-local', 'brain.yaml'))).toBe(true);
    expect((await run(['unmount', 'brain-local', '--force', '--json'], root)).code).toBe(0);
  });

  it('unmount unknown id', async () => {
    const { root } = await setup();
    expect((await run(['unmount', 'brain-nope', '--json'], root)).json().error.code).toBe('E_UNKNOWN_BRAIN');
    expect((await run(['unmount', 'personal', '--json'], root)).json().error.code).toBe('E_UNKNOWN_BRAIN');
  });
});

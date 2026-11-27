import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandsFor } from '../../../src/commands/index.js';
import { run } from '../../helpers/cli.js';
import { writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { initWorkspace, sharedRemote } from '../../helpers/remotes.js';
import { git } from '../../helpers/workspace.js';

const IDEA = '---\ntype: note\nsummary: An idea worth trying.\nupdated: 2026-11-27\n---\n# An idea\n\nTry it.\n';
const BEN = '---\ntype: person\nsummary: Ben runs the build pipeline.\nupdated: 2026-11-27\nname: Ben\nopinion: careless\n---\n# Ben\n';

async function setup() {
  await isolateGit();
  const ws = await initWorkspace();
  const r = await run(['brain', 'new', 'brain-ideas', '--description', 'Ideas.', '--json'], ws.root);
  if (r.code !== 0) throw new Error(r.out);
  return { ...ws, dir: join(ws.root, 'brains', 'brain-ideas') };
}
const status = (dir: string) => git(dir, 'status', '--porcelain', '--untracked-files=all');

describe('commit for shared brains', () => {
  it('personal is unchanged', async () => {
    const { root } = await setup();
    await writeTree(join(root, 'brains', 'personal'), { 'inbox/2026-11-27-x.md': '# X\n' });
    const r = await run(['commit', '-m', 'Capture: X', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ brain: 'personal', route: 'personal', committed: true, pushed: true, branch: null, pr: null, dryRun: false });
  });

  it('unpublished brain commits directly', async () => {
    const { root, dir } = await setup();
    await writeTree(dir, { 'notes/idea.md': IDEA });
    expect((await run(['doctor', 'brain-ideas', '--fix', '--json'], root)).code).toBe(0);
    const r = await run(['commit', 'brain-ideas', '-m', 'Add idea', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ brain: 'brain-ideas', route: 'direct', committed: true, pushed: false, branch: null, pr: null, dryRun: false });
    expect(r.json().data.files).toEqual(expect.arrayContaining(['notes/idea.md', 'notes/README.md']));
    expect((await git(dir, 'log', '-1', '--format=%s')).trim()).toBe('Add idea');
    expect(r.json().data.commit).toBe((await git(dir, 'rev-parse', 'HEAD')).trim());
    expect((await status(dir)).trim()).toBe('');
  });

  it('read mount is refused', async () => {
    const { base, root } = await setup();
    const url = await sharedRemote(base, 'brain-sre');
    expect((await run(['mount', url, '--json'], root)).code).toBe(0);
    const clone = join(root, 'brains', 'brain-sre');
    await writeTree(clone, { 'notes/x.md': IDEA });
    const before = await status(clone);
    const r = await run(['commit', 'brain-sre', '-m', 'x', '--json'], root);
    expect(r.json().error).toMatchObject({ code: 'E_READ_ONLY', message: expect.stringContaining('personal') });
    expect(await status(clone)).toBe(before);
  });

  it('the gate', async () => {
    const { root, dir } = await setup();
    await writeTree(dir, { 'notes/ben.md': BEN });
    await run(['doctor', 'brain-ideas', '--fix', '--json'], root);
    const head = (await git(dir, 'rev-parse', 'HEAD')).trim();
    const r = await run(['commit', 'brain-ideas', '-m', 'Add Ben', '--json'], root);
    expect(r.json().error).toMatchObject({ code: 'E_DOCTOR_ERRORS', message: expect.stringContaining('person-key-not-allowed notes/ben.md') });
    expect((await git(dir, 'rev-parse', 'HEAD')).trim()).toBe(head);
  });

  it('unknown brain', async () => {
    const { root } = await setup();
    expect((await run(['commit', 'brain-nope', '-m', 'x', '--json'], root)).json().error.code).toBe('E_UNKNOWN_BRAIN');
  });

  it('nothing to commit', async () => {
    const { root } = await setup();
    const host = fakeHost();
    const r = await run(['commit', 'brain-ideas', '-m', 'x', '--json'], root, commandsFor(host));
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ route: 'direct', committed: false, commit: null, files: [] });
    expect(host.calls).toEqual([]);
  });

  it('dry run', async () => {
    const { root, dir } = await setup();
    await writeTree(dir, { 'notes/idea.md': IDEA });
    await run(['doctor', 'brain-ideas', '--fix', '--json'], root);
    const before = await status(dir);
    const r = await run(['commit', 'brain-ideas', '--dry-run', '-m', 'Add idea', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ route: 'direct', dryRun: true, committed: false, commit: null });
    expect(r.json().data.files).toContain('notes/idea.md');
    expect(await status(dir)).toBe(before);
  });
});

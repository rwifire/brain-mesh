import { cp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { upgradeCommandFor } from '../../../src/commands/upgrade.js';
import { packageCore, type CoreSource } from '../../../src/render/core.js';
import { renderWorkspace } from '../../../src/render/workspace.js';
import { setPin } from '../../../src/workspace/mesh-edit.js';
import { read, run, write } from '../../helpers/cli.js';
import { tempDir } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { initWorkspace } from '../../helpers/remotes.js';
import { git, writeFiles } from '../../helpers/workspace.js';

const OLD_APP = '{\n  "useMarkdownLinks": true,\n  "newLinkFormat": "relative"\n}\n';
const OLD_ASK_LINE = 'An old line only the old core has.';

/** A copy of the package core as an "older" release: `ask` has an extra line and the Obsidian seed lacks `alwaysUpdateLinks`. */
async function oldCore(): Promise<CoreSource> {
  const core = packageCore();
  const dir = await tempDir('bm old core ');
  const old: CoreSource = { skillsDir: join(dir, 'skills'), agentsDir: join(dir, 'agents'), templatesDir: join(dir, 'templates') };
  await cp(core.skillsDir, old.skillsDir, { recursive: true });
  await cp(core.agentsDir, old.agentsDir, { recursive: true });
  await cp(core.templatesDir, old.templatesDir, { recursive: true });
  await write(dir, 'skills/ask/SKILL.md', (await read(dir, 'skills/ask/SKILL.md')) + `${OLD_ASK_LINE}\n`);
  await write(dir, 'templates/workspace/obsidian-app.json', OLD_APP);
  return old;
}

/** A pushed workspace as an older core (`0.1.0` by default) rendered it. */
async function setup(pin = '0.1.0', before?: (root: string) => Promise<void>) {
  await isolateGit();
  const ws = await initWorkspace();
  const { root } = ws;
  await setPin(root, pin);
  await write(root, 'brains/.obsidian/app.json', OLD_APP);
  if (before !== undefined) await before(root);
  const r = await renderWorkspace(root, { core: await oldCore() });
  if (r.warnings.length > 0) throw new Error(JSON.stringify(r.warnings));
  await git(root, 'add', '-A');
  await git(root, 'commit', '-q', '-m', 'old core');
  await git(root, 'push', '-q');
  return ws;
}

const upgrade = (root: string, version = '0.2.0', ...args: string[]) => run(['upgrade', ...args, '--json'], root, [upgradeCommandFor({ version })]);
const head = async (dir: string) => (await git(dir, 'rev-parse', 'HEAD')).trim();
const codes = (r: { json: () => { warnings?: { code: string }[] } }) => (r.json().warnings ?? []).map((w) => w.code);

/** Every file under `root` outside `.git/`, path → base64 content. */
async function snapshot(root: string, rel = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const child = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) Object.assign(out, await snapshot(root, child));
    else out[child] = (await readFile(join(root, child))).toString('base64');
  }
  return out;
}

const USER_FILES: Record<string, string> = {
  '.local/team.md': '# Team\n\nOur own rules.\n',
  '.local/skills/mine/SKILL.md': '---\nname: mine\ndescription: My skill. Use when I say so.\n---\n# Mine\n',
  'tools/x.ts': 'export const x = 1;\n',
  'brains/personal/notes/n.md': '---\ntype: note\nsummary: A note of mine.\nupdated: 2026-11-27\n---\n# N\n',
  '.claude/settings.local.json': '{"permissions": {}}\n',
};

describe('upgrade', () => {
  it('upgrades and keeps every user file', async () => {
    const { root, remote } = await setup('0.1.0', (r) => writeFiles(r, USER_FILES));
    const r = await upgrade(root);
    expect(r.code, r.out).toBe(0);
    for (const [p, text] of Object.entries(USER_FILES)) expect(await read(root, p), p).toBe(text);
    expect(await read(root, 'mesh.yaml')).toContain('brain_mesh: 0.2.0');
    const ask = await read(root, '.claude/skills/ask/SKILL.md');
    expect(ask).toContain('npx -y brain-mesh-ai-workspace@0.2.0');
    expect(ask).not.toContain(OLD_ASK_LINE);
    const data = r.json().data;
    expect(data).toMatchObject({ from: '0.1.0', to: '0.2.0', upgraded: true, dryRun: false, pushed: true });
    expect(data.commit).toBe((await git(remote, 'rev-parse', 'main')).trim());
    expect((await git(root, 'log', '-1', '--format=%s')).trim()).toBe('Upgrade brain-mesh from 0.1.0 to 0.2.0');
    const files = (await git(root, 'show', '--name-only', '--format=', 'HEAD')).trim().split('\n');
    for (const f of files) expect(['mesh.yaml', 'AGENTS.md', '.gitignore', '.gitattributes', 'brains/.obsidian/app.json'], f).toContain(f);
    expect(files).toContain('mesh.yaml');
    expect(data.seeds).toContainEqual(expect.objectContaining({ path: 'brains/.obsidian/app.json', status: 'updated' }));
    expect(JSON.parse(await read(root, 'brains/.obsidian/app.json'))).toMatchObject({ alwaysUpdateLinks: true });
    expect((await git(root, 'status', '--porcelain')).trim()).toBe('');
  });

  it('dry run', async () => {
    const { root } = await setup();
    const before = await snapshot(root);
    const sha = await head(root);
    const r = await upgrade(root, '0.2.0', '--dry-run');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ from: '0.1.0', to: '0.2.0', upgraded: true, dryRun: true, commit: null, pushed: false });
    expect(r.json().data.written.length).toBeGreaterThan(0);
    expect(await snapshot(root)).toEqual(before);
    expect(await head(root)).toBe(sha);
  });

  it('hand edits', async () => {
    const { root } = await setup();
    await write(root, 'AGENTS.md', (await read(root, 'AGENTS.md')) + 'A line I added by hand.\n');
    await git(root, 'commit', '-q', '-am', 'edit');
    const r = await upgrade(root);
    expect(r.code, r.out).toBe(0);
    const overwritten = r.json().data.overwritten as { path: string; diff: string }[];
    expect(overwritten.map((o) => o.path)).toEqual(['AGENTS.md']);
    expect(overwritten[0]!.diff).toMatch(/^-A line I added by hand\.$/m);
    expect(codes(r)).toContain('W_HAND_EDIT_OVERWRITTEN');
    expect(await read(root, 'AGENTS.md')).not.toContain('A line I added by hand.');
  });

  it('template files', async () => {
    const { root } = await setup();
    const mine = '{\n  "useMarkdownLinks": true,\n  "newLinkFormat": "relative",\n  "theme": "obsidian"\n}\n';
    await write(root, 'brains/.obsidian/app.json', mine);
    await git(root, 'commit', '-q', '-am', 'theme');
    const r = await upgrade(root);
    expect(r.code, r.out).toBe(0);
    const seed = (r.json().data.seeds as { path: string; status: string; diff: string }[]).find((s) => s.path === 'brains/.obsidian/app.json')!;
    expect(seed.status).toBe('kept');
    expect(seed.diff).toMatch(/^\+\s+"alwaysUpdateLinks": true$/m);
    const kept = (r.json().warnings as { code: string; message: string }[]).find((w) => w.code === 'W_SEED_KEPT')!;
    expect(kept.message).toContain('--accept brains/.obsidian/app.json');
    expect(await read(root, 'brains/.obsidian/app.json')).toBe(mine);

    const again = await upgrade(root, '0.2.0', '--accept', 'brains/.obsidian/app.json');
    expect(again.code, again.out).toBe(0);
    expect(again.json().data.seeds).toContainEqual(expect.objectContaining({ path: 'brains/.obsidian/app.json', status: 'accepted' }));
    expect(JSON.parse(await read(root, 'brains/.obsidian/app.json'))).toMatchObject({ alwaysUpdateLinks: true, theme: 'obsidian' });
  });

  it('overrides', async () => {
    const { root } = await setup();
    const local = '---\nname: ask\ndescription: My own ask. Use when I say so.\n---\n# My ask\n';
    await writeFiles(root, { '.local/skills/ask/SKILL.md': local });
    const r = await upgrade(root);
    expect(r.code, r.out).toBe(0);
    const overrides = r.json().data.overrides as { name: string; kind: string; status: string; diff: string }[];
    expect(overrides.map(({ name, kind, status }) => ({ name, kind, status }))).toEqual([{ name: 'ask', kind: 'skill', status: 'changed' }]);
    expect(overrides[0]!.diff).toMatch(new RegExp(`^-${OLD_ASK_LINE.replace('.', '\\.')}$`, 'm'));
    expect(codes(r)).toContain('W_OVERRIDE_UPSTREAM');
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toBe(local);
  });

  it('idempotent', async () => {
    const { root } = await setup();
    expect((await upgrade(root)).code).toBe(0);
    const r = await upgrade(root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ from: '0.2.0', to: '0.2.0', upgraded: false, written: [], commit: null });
  });

  it('refusals', async () => {
    const { root } = await setup();
    const before = await snapshot(root);
    const to = await upgrade(root, '0.2.0', '--to', '0.3.0');
    expect(to.json().error).toMatchObject({ code: 'E_PIN_MISMATCH', message: expect.stringContaining('npx -y brain-mesh-ai-workspace@0.3.0 upgrade') });
    expect((await upgrade(root, '0.0.9')).json().error.code).toBe('E_DOWNGRADE');
    expect((await upgrade(root, '0.2.0', '--accept', 'notes.md')).json().error.code).toBe('E_USAGE');
    expect(await snapshot(root)).toEqual(before);
    await rm(join(root, '.mesh', 'render.json'));
    const norecord = await upgrade(root);
    expect(norecord.json().error).toMatchObject({ code: 'E_NO_RENDER_RECORD', message: expect.stringContaining('npx -y brain-mesh-ai-workspace@0.1.0 init') });
    const empty = await tempDir('bm no ws ');
    expect((await upgrade(empty)).json().error.code).toBe('E_NO_WORKSPACE');
  });

  it('prereleases', async () => {
    const { root } = await setup('0.1.0-alpha.5');
    expect((await upgrade(root, '0.1.0-alpha.4')).json().error.code).toBe('E_DOWNGRADE');
    const r = await upgrade(root, '0.1.0-alpha.6');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ from: '0.1.0-alpha.5', to: '0.1.0-alpha.6', upgraded: true });
  });
});

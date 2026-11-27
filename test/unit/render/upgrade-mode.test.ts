import { createHash } from 'node:crypto';
import { chmod, cp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { packageCore, type CoreSource } from '../../../src/render/core.js';
import { RECORD_PATH, readRecord, renderWorkspace, type RenderRecord } from '../../../src/render/workspace.js';
import { read, write } from '../../helpers/cli.js';
import { FIXTURES_DIR, tempDir } from '../../helpers/fixtures.js';
import { fullWorkspace, removePath } from '../../helpers/workspace.js';

const FIXTURE_CORE: CoreSource = {
  ...packageCore(),
  skillsDir: join(FIXTURES_DIR, 'core', 'skills'),
  agentsDir: join(FIXTURES_DIR, 'core', 'agents'),
};
const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const UPGRADE = { seeds: { accept: new Set<string>() } };

/** A copy of the fixture core with the given edits: an extra line in `ask`'s SKILL.md, or new seed texts. */
async function changedCore(o: { askLine?: string; gitattributes?: string; obsidianApp?: string } = {}): Promise<CoreSource> {
  const dir = await tempDir('bm core ');
  const core: CoreSource = { skillsDir: join(dir, 'skills'), agentsDir: join(dir, 'agents'), templatesDir: join(dir, 'templates') };
  await cp(FIXTURE_CORE.skillsDir, core.skillsDir, { recursive: true });
  await cp(FIXTURE_CORE.agentsDir, core.agentsDir, { recursive: true });
  await cp(FIXTURE_CORE.templatesDir, core.templatesDir, { recursive: true });
  if (o.askLine !== undefined) await write(dir, 'skills/ask/SKILL.md', (await read(dir, 'skills/ask/SKILL.md')) + `${o.askLine}\n`);
  if (o.gitattributes !== undefined) await write(dir, 'templates/workspace/gitattributes', o.gitattributes);
  if (o.obsidianApp !== undefined) await write(dir, 'templates/workspace/obsidian-app.json', o.obsidianApp);
  return core;
}

/** Every file under `root` (outside `.git/`), path → content. */
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

async function rendered(): Promise<string> {
  const root = await fullWorkspace();
  await removePath(root, 'brains/.obsidian/app.json');
  await renderWorkspace(root, { core: FIXTURE_CORE });
  return root;
}

describe('renderWorkspace for upgrade', () => {
  it('pin override', async () => {
    const root = await rendered();
    const mesh = await read(root, 'mesh.yaml');
    const r = await renderWorkspace(root, { core: FIXTURE_CORE, pin: '9.9.9' });
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toContain('npx -y brain-mesh-ai-workspace@9.9.9');
    expect(await read(root, '.github/skills/ask/SKILL.md')).toContain('npx -y brain-mesh-ai-workspace@9.9.9');
    expect(r.record.brain_mesh).toBe('9.9.9');
    expect(((await readRecord(root)) as RenderRecord).brain_mesh).toBe('9.9.9');
    expect(await read(root, 'mesh.yaml')).toBe(mesh);
  });

  it('dry run writes nothing', async () => {
    const root = await rendered();
    const before = await snapshot(root);
    const r = await renderWorkspace(root, { core: await changedCore({ askLine: 'A new line.' }), write: false });
    expect(await snapshot(root)).toEqual(before);
    const ask = r.changes.filter((c) => /\/ask\/SKILL\.md$/.test(c.path));
    expect(ask.map((c) => c.path).sort()).toEqual(['.claude/skills/ask/SKILL.md', '.github/skills/ask/SKILL.md', '.mesh/skills/ask/SKILL.md']);
    for (const c of ask) expect(c, c.path).toMatchObject({ status: 'written', handEdited: false });
    expect(r.written).toEqual(expect.arrayContaining(ask.map((c) => c.path)));
    expect(r.previous).not.toBeNull();
  });

  it('hand edits are flagged', async () => {
    const root = await rendered();
    await write(root, 'AGENTS.md', (await read(root, 'AGENTS.md')) + 'my own line\n');
    const r = await renderWorkspace(root, { core: await changedCore({ askLine: 'A new line.' }) });
    const agents = r.changes.find((c) => c.path === 'AGENTS.md')!;
    expect(agents).toMatchObject({ kind: 'managed', status: 'written', handEdited: true });
    expect(agents.before).toContain('my own line');
    expect(agents.after).not.toContain('my own line');
    expect(r.changes.find((c) => c.path === '.claude/skills/ask/SKILL.md')).toMatchObject({ handEdited: false });
  });
});

describe('seeds in upgrade mode', () => {
  it('an unedited seed is updated', async () => {
    const root = await rendered();
    const r = await renderWorkspace(root, { core: await changedCore({ gitattributes: '* text=auto eol=lf\n*.png binary\n' }), ...UPGRADE });
    expect(r.changes.find((c) => c.path === '.gitattributes')).toMatchObject({ kind: 'seed', status: 'updated', handEdited: false });
    expect(await read(root, '.gitattributes')).toBe('* text=auto eol=lf\n*.png binary\n');
    expect(r.record.files.find((f) => f.path === '.gitattributes')!.sha256).toBe(sha('* text=auto eol=lf\n*.png binary\n'));
  });

  it('an edited seed is kept', async () => {
    const root = await rendered();
    const prev = (await readRecord(root))!.files.find((f) => f.path === '.gitattributes');
    await write(root, '.gitattributes', '* text=auto eol=lf\n*.psd binary\n');
    const r = await renderWorkspace(root, { core: await changedCore({ gitattributes: '* text=auto eol=lf\n*.png binary\n' }), ...UPGRADE });
    const c = r.changes.find((x) => x.path === '.gitattributes')!;
    expect(c).toMatchObject({ status: 'kept', handEdited: true, before: '* text=auto eol=lf\n*.psd binary\n', after: '* text=auto eol=lf\n*.png binary\n' });
    expect(await read(root, '.gitattributes')).toBe('* text=auto eol=lf\n*.psd binary\n');
    expect(r.record.files.find((f) => f.path === '.gitattributes')).toEqual(prev);
  });

  it('an edited seed that is accepted is replaced', async () => {
    const root = await rendered();
    await write(root, '.gitattributes', '* text=auto eol=lf\n*.psd binary\n');
    const core = await changedCore({ gitattributes: '* text=auto eol=lf\n*.png binary\n' });
    const r = await renderWorkspace(root, { core, seeds: { accept: new Set(['.gitattributes']) } });
    expect(r.changes.find((c) => c.path === '.gitattributes')).toMatchObject({ status: 'accepted', handEdited: true });
    expect(await read(root, '.gitattributes')).toBe('* text=auto eol=lf\n*.png binary\n');
  });

  it('a missing seed is written', async () => {
    const root = await rendered();
    await removePath(root, '.gitattributes');
    const r = await renderWorkspace(root, { core: FIXTURE_CORE, ...UPGRADE });
    expect(r.changes.find((c) => c.path === '.gitattributes')).toMatchObject({ status: 'written', before: null, handEdited: false });
    expect(await read(root, '.gitattributes')).toBe('* text=auto eol=lf\n');
  });

  it('without upgrade mode an edited seed is never reported or touched', async () => {
    const root = await rendered();
    await write(root, '.gitattributes', '* text=auto eol=lf\n*.psd binary\n');
    const r = await renderWorkspace(root, { core: await changedCore({ gitattributes: '* text=auto eol=lf\n*.png binary\n' }) });
    expect(r.changes.find((c) => c.path === '.gitattributes')).toBeUndefined();
    expect(await read(root, '.gitattributes')).toBe('* text=auto eol=lf\n*.psd binary\n');
  });

  it('accepting app.json merges', async () => {
    const root = await rendered();
    await write(root, 'brains/.obsidian/app.json', '{"useMarkdownLinks": true, "theme": "obsidian"}\n');
    const seed = '{\n  "useMarkdownLinks": true,\n  "newLinkFormat": "relative",\n  "alwaysUpdateLinks": true,\n  "showLineNumber": true\n}\n';
    const core = await changedCore({ obsidianApp: seed });
    const kept = await renderWorkspace(root, { core, ...UPGRADE });
    expect(kept.changes.find((c) => c.path === 'brains/.obsidian/app.json')).toMatchObject({ status: 'kept' });
    const r = await renderWorkspace(root, { core, seeds: { accept: new Set(['brains/.obsidian/app.json']) } });
    expect(r.changes.find((c) => c.path === 'brains/.obsidian/app.json')).toMatchObject({ status: 'accepted' });
    expect(JSON.parse(await read(root, 'brains/.obsidian/app.json'))).toEqual({
      useMarkdownLinks: true,
      theme: 'obsidian',
      newLinkFormat: 'relative',
      alwaysUpdateLinks: true,
      showLineNumber: true,
    });
  });

  it('CRLF is not an edit', async () => {
    const root = await rendered();
    for (const p of ['AGENTS.md', '.gitattributes']) await write(root, p, (await read(root, p)).replace(/\n/g, '\r\n'));
    const r = await renderWorkspace(root, { core: FIXTURE_CORE, ...UPGRADE });
    expect(r.changes.filter((c) => c.handEdited)).toEqual([]);
    expect(r.changes.filter((c) => c.status === 'kept')).toEqual([]);
  });
});

describe('the record matches disk', () => {
  it('failed write keeps the record entry', async () => {
    const root = await rendered();
    const rel = '.claude/skills/ask/SKILL.md';
    const prev = (await readRecord(root))!.files.find((f) => f.path === rel);
    const file = join(root, ...rel.split('/'));
    await chmod(file, 0o444);
    onTestFinished(() => chmod(file, 0o644));
    const r = await renderWorkspace(root, { core: await changedCore({ askLine: 'A new line.' }) });
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'W_WRITE_FAILED', message: expect.stringContaining(rel) }));
    expect(r.record.files.find((f) => f.path === rel)).toEqual(prev);
    expect(JSON.parse(await read(root, RECORD_PATH)).files.find((f: { path: string }) => f.path === rel)).toEqual(prev);
  });
});

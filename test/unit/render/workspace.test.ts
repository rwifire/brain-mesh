import { createHash } from 'node:crypto';
import { cp, readFile, readdir, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageCore, type CoreSource } from '../../../src/render/core.js';
import { RECORD_PATH, renderWorkspace, type RenderRecord } from '../../../src/render/workspace.js';
import { read, write } from '../../helpers/cli.js';
import { FIXTURES_DIR, tempDir } from '../../helpers/fixtures.js';
import { fullWorkspace, removePath, writeFiles } from '../../helpers/workspace.js';

const FIXTURE_CORE: CoreSource = {
  ...packageCore(),
  skillsDir: join(FIXTURES_DIR, 'core', 'skills'),
  agentsDir: join(FIXTURES_DIR, 'core', 'agents'),
};
const render = (root: string, core: CoreSource = FIXTURE_CORE) => renderWorkspace(root, { core });
const bytes = (root: string, rel: string) => readFile(join(root, ...rel.split('/')));
const exists = (root: string, rel: string) => stat(join(root, ...rel.split('/'))).then(() => true, () => false);
const record = async (root: string) => JSON.parse(await read(root, RECORD_PATH)) as RenderRecord;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('renderWorkspace', () => {
  it('first render writes every entry', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/.obsidian/app.json'); // the fixture ships one; a fresh workspace has none
    const r = await render(root);
    expect(r.warnings).toEqual([]);
    for (const p of [
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/skills/ask/SKILL.md',
      '.github/skills/ask/scripts/helper.sh',
      '.claude/agents/consistency-reviewer.md',
      '.github/agents/consistency-reviewer.agent.md',
      '.mesh/skills/ask/SKILL.md',
      '.mesh/agents/consistency-reviewer.md',
      '.gitattributes',
      'brains/.obsidian/app.json',
      '.gitignore',
      RECORD_PATH,
    ]) {
      expect(r.written, p).toContain(p);
    }
    const paths = r.record.files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(paths).not.toContain(RECORD_PATH);
    expect(new Set(paths)).toEqual(new Set(r.written.filter((p) => p !== RECORD_PATH)));
    for (const f of r.record.files.filter((x) => x.kind !== 'block')) {
      expect(f.sha256, f.path).toBe(sha(await bytes(root, f.path)));
    }
    expect(r.record).toEqual(await record(root));
    expect(r.record.brain_mesh).toBe('0.4.2');
    expect(await read(root, 'CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(await read(root, '.gitattributes')).toBe('* text=auto eol=lf\n');
    expect(JSON.parse(await read(root, 'brains/.obsidian/app.json'))).toEqual({
      useMarkdownLinks: true,
      newLinkFormat: 'relative',
      alwaysUpdateLinks: true,
    });
  });

  it('rendering twice is a no-op', async () => {
    const root = await fullWorkspace();
    await render(root);
    const before = await bytes(root, RECORD_PATH);
    const r = await render(root);
    expect(r.written).toEqual([]);
    expect(r.removed).toEqual([]);
    expect((await bytes(root, RECORD_PATH)).equals(before)).toBe(true);
  });

  it('pinned cli', async () => {
    const root = await fullWorkspace();
    await render(root);
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toContain('npx -y brain-mesh@0.4.2 search');
    expect(await read(root, '.mesh/skills/ask/SKILL.md')).toContain('{{cli}} search');
  });

  it('user files survive', async () => {
    const root = await fullWorkspace();
    const mine = {
      '.claude/settings.json': '{"x": 1}\n',
      '.claude/skills/my-skill/SKILL.md': '---\nname: my-skill\ndescription: mine\n---\n',
      '.github/workflows/ci.yml': 'on: push\n',
      '.gitignore': 'secrets.txt\n',
    };
    await writeFiles(root, mine);
    await render(root);
    await render(root);
    for (const [p, text] of Object.entries(mine)) {
      if (p === '.gitignore') expect((await read(root, p)).startsWith('secrets.txt\n\n# brain-mesh:managed\n')).toBe(true);
      else expect(await read(root, p), p).toBe(text);
    }
  });

  it('a user folder at a core target is not overwritten', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { '.claude/skills/capture/SKILL.md': 'my own capture\n' });
    const r = await render(root);
    expect(await read(root, '.claude/skills/capture/SKILL.md')).toBe('my own capture\n');
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'W_RENDER_PATH_TAKEN' }));
    expect(r.warnings.find((w) => w.code === 'W_RENDER_PATH_TAKEN')!.message).toContain('.claude/skills/capture/');
    expect(r.record.files.filter((f) => f.path.startsWith('.claude/skills/capture/'))).toEqual([]);
    expect(r.record.files.some((f) => f.path === '.github/skills/capture/SKILL.md')).toBe(true);
  });

  it('managed edits are reverted, seeds kept', async () => {
    const root = await fullWorkspace();
    await render(root);
    const agents = await read(root, 'AGENTS.md');
    await write(root, 'AGENTS.md', agents + 'my edit\n');
    await write(root, 'brains/.obsidian/app.json', '{"useMarkdownLinks": true, "newLinkFormat": "relative", "alwaysUpdateLinks": true, "theme": "dark"}\n');
    const r = await render(root);
    expect(r.written).toEqual(['AGENTS.md']);
    expect(await read(root, 'AGENTS.md')).toBe(agents);
    expect(await read(root, 'brains/.obsidian/app.json')).toContain('"theme": "dark"');
  });

  it('CRLF managed file is not rewritten', async () => {
    const root = await fullWorkspace();
    await render(root);
    await write(root, 'AGENTS.md', (await read(root, 'AGENTS.md')).replace(/\n/g, '\r\n'));
    expect((await render(root)).written).toEqual([]);
  });

  it('local override and its removal', async () => {
    const root = await fullWorkspace();
    const core = await read(root, '.mesh/skills/ask/SKILL.md').catch(() => null);
    expect(core).toBeNull();
    await writeFiles(root, { '.local/skills/ask/SKILL.md': '---\nname: ask\ndescription: my ask\n---\nLOCAL\n' });
    await render(root);
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toContain('LOCAL');
    expect(await read(root, '.github/skills/ask/SKILL.md')).toContain('LOCAL');
    expect(await read(root, '.mesh/skills/ask/SKILL.md')).toContain('{{cli}} search');
    expect(await exists(root, '.claude/skills/ask/scripts/helper.sh')).toBe(false);
    await removePath(root, '.local/skills/ask');
    const r = await render(root);
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toContain('npx -y brain-mesh@0.4.2 search');
    expect(r.written).toContain('.claude/skills/ask/scripts/helper.sh');
    expect((await readdir(join(root, '.claude', 'skills', 'ask'))).sort()).toEqual(['SKILL.md', 'scripts']);
  });

  it('removed core skill is cleaned up', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { '.claude/skills/my-skill/SKILL.md': 'mine\n' });
    await render(root);
    const skills = await tempDir();
    await cp(FIXTURE_CORE.skillsDir, skills, { recursive: true });
    await removePath(skills, 'capture');
    const r = await render(root, { ...FIXTURE_CORE, skillsDir: skills });
    expect(r.removed).toEqual(['.claude/skills/capture/SKILL.md', '.github/skills/capture/SKILL.md', '.mesh/skills/capture/SKILL.md']);
    for (const p of ['.claude/skills/capture', '.github/skills/capture', '.mesh/skills/capture']) expect(await exists(root, p), p).toBe(false);
    expect(await read(root, '.claude/skills/my-skill/SKILL.md')).toBe('mine\n');
    expect(await read(root, '.gitignore')).not.toContain('capture');
  });

  it('local instructions are concatenated', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { '.local/team.md': 'Team rule.\n' });
    await render(root);
    expect((await read(root, 'AGENTS.md')).endsWith('<!-- from .local/team.md -->\nTeam rule.\n')).toBe(true);
  });

  it('never writes through a symlink', async (ctx) => {
    const root = await fullWorkspace();
    const outside = await tempDir();
    await writeFiles(outside, { 'SKILL.md': 'dotfiles skill\n' });
    await writeFiles(root, { '.claude/skills/.keep': '' });
    try {
      await symlink(outside, join(root, '.claude', 'skills', 'ask'), 'junction');
    } catch {
      ctx.skip();
    }
    const r = await render(root);
    expect(await read(outside, 'SKILL.md')).toBe('dotfiles skill\n');
    expect(await readdir(outside)).toEqual(['SKILL.md']);
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'W_RENDER_PATH_TAKEN' }));
  });

  it('invalid local skill is a warning', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { '.local/skills/bad/SKILL.md': '---\nname: bad\n---\n' });
    const r = await render(root);
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'W_SKILL_INVALID' }));
    expect(r.warnings.find((w) => w.code === 'W_SKILL_INVALID')!.message).toContain('.local/skills/bad/SKILL.md');
    expect(await exists(root, '.claude/skills/bad')).toBe(false);
  });

  it('no workspace', async () => {
    await expect(renderWorkspace(await tempDir())).rejects.toMatchObject({ code: 'E_NO_WORKSPACE' });
  });
});

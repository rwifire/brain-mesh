import { createHash } from 'node:crypto';
import { chmod, cp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
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
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toContain('npx -y brain-mesh-ai-workspace@0.4.2 search');
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
    expect(await read(root, '.claude/skills/ask/SKILL.md')).toContain('npx -y brain-mesh-ai-workspace@0.4.2 search');
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

describe('note templates', () => {
  it('note templates rendered', async () => {
    const root = await fullWorkspace();
    await render(root);
    expect((await readdir(join(root, '.mesh', 'templates', 'notes'))).sort()).toEqual(
      ['area', 'decision', 'howto', 'map', 'note', 'person', 'project', 'source'].map((t) => `${t}.md`),
    );
    expect(await read(root, '.mesh/templates/notes/person.md')).toContain('\nresponsibilities:');
  });
});

describe('final-review fixes', () => {
  it('a record entry outside the rendered paths is never removed', async () => {
    const root = await fullWorkspace();
    const outside = join(root, '..', `victim-${Date.now()}.txt`);
    await writeFile(outside, 'keep\n');
    onTestFinished(() => rm(outside, { force: true }));
    const name = outside.split(/[\/]/).pop()!;
    const bad = ['../' + name, 'brains/personal/brain.yaml', 'mesh.yaml'].map((path) => ({ path, kind: 'managed', sha256: 'x' }));
    await writeFiles(root, { [RECORD_PATH]: JSON.stringify({ version: 1, brain_mesh: '0.4.2', files: bad }) });
    const r = await render(root);
    expect(r.removed).toEqual([]);
    expect(await readFile(outside, 'utf8')).toBe('keep\n');
    expect(await exists(root, 'brains/personal/brain.yaml')).toBe(true);
    expect(await exists(root, 'mesh.yaml')).toBe(true);
  });

  it('a corrupted record counts as empty', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { [RECORD_PATH]: '{"version":1,"files":[{},null,{"path":5}]}' });
    const r = await render(root);
    expect(r.written).toContain(RECORD_PATH);
    expect(r.written).toContain('AGENTS.md');
  });

  it('the gitignore block leaves out refused paths', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, {
      '.claude/skills/capture/SKILL.md': 'my own capture\n',
      '.claude/agents/consistency-reviewer.md': 'my own agent\n',
    });
    await render(root);
    const gitignore = await read(root, '.gitignore');
    expect(gitignore).not.toContain('.claude/skills/capture/');
    expect(gitignore).not.toContain('.claude/agents/consistency-reviewer.md');
    expect(gitignore).toContain('.github/skills/capture/\n');
    expect(gitignore).toContain('.claude/skills/ask/\n');
  });

  it('a line-ending change in a skill script propagates byte for byte', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { '.local/skills/tool/SKILL.md': '---\nname: tool\ndescription: t\n---\nT\n', '.local/skills/tool/run.sh': 'echo a\r\n' });
    await render(root);
    await write(root, '.local/skills/tool/run.sh', 'echo a\n');
    const r = await render(root);
    expect(r.written).toContain('.claude/skills/tool/run.sh');
    expect(await read(root, '.claude/skills/tool/run.sh')).toBe('echo a\n');
  });

  it('a CRLF client copy of a script is restored to the source bytes', async () => {
    const root = await fullWorkspace();
    await render(root);
    const rel = '.claude/skills/ask/scripts/helper.sh';
    const source = await read(root, rel);
    await write(root, rel, source.replace(/\n/g, '\r\n'));
    await render(root);
    expect(await read(root, rel)).toBe(source);
  });
});

describe('hook files', () => {
  it('renders the hook files', async () => {
    const root = await fullWorkspace();
    const r = await render(root);
    expect(r.record.files.filter((f) => f.path.startsWith('.mesh/hooks/')).map((f) => [f.path, f.kind])).toEqual([
      ['.mesh/hooks/mixed-commit.mjs', 'managed'],
      ['.mesh/hooks/pre-commit', 'managed'],
    ]);
    expect((await read(root, '.mesh/hooks/pre-commit')).startsWith('#!/bin/sh\n')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('pre-commit is executable', async () => {
    const root = await fullWorkspace();
    await render(root);
    const file = join(root, '.mesh', 'hooks', 'pre-commit');
    expect((await stat(file)).mode & 0o111).not.toBe(0);
    await chmod(file, 0o644);
    await render(root);
    expect((await stat(file)).mode & 0o111).not.toBe(0);
  });
});

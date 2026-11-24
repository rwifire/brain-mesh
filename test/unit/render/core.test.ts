import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { overlay, readAgents, readSkills, type SkillSource } from '../../../src/render/core.js';
import { FIXTURES_DIR, tempDir, writeTree } from '../../helpers/fixtures.js';

const CORE = join(FIXTURES_DIR, 'core');

describe('readSkills', () => {
  it('reads skills with their files', async () => {
    const { skills, problems } = await readSkills(join(CORE, 'skills'), 'core');
    expect(problems).toEqual([]);
    expect(skills.map((s) => s.name)).toEqual(['ask', 'capture']);
    const ask = skills[0]!;
    expect([...ask.files.keys()]).toEqual(['SKILL.md', 'scripts/helper.sh']);
    expect(ask.files.get('scripts/helper.sh')!.equals(await readFile(join(CORE, 'skills', 'ask', 'scripts', 'helper.sh')))).toBe(true);
    expect(ask.origin).toBe('core');
  });

  it('skill name must match folder', async () => {
    const dir = await tempDir();
    await writeTree(dir, { 'foo/SKILL.md': '---\nname: bar\ndescription: x\n---\n' });
    const { skills, problems } = await readSkills(dir, 'local');
    expect(skills).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('foo/SKILL.md');
    expect(problems[0]!.message).toContain('name');
  });

  it('skill description required', async () => {
    const dir = await tempDir();
    await writeTree(dir, { 'foo/SKILL.md': '---\nname: foo\n---\n', 'bar/notes.md': 'no SKILL.md\n' });
    const { skills, problems } = await readSkills(dir, 'local');
    expect(skills).toEqual([]);
    expect(problems.map((p) => p.path).sort()).toEqual(['bar/SKILL.md', 'foo/SKILL.md']);
    expect(problems.find((p) => p.path === 'foo/SKILL.md')!.message).toContain('description');
  });

  it('missing dirs are empty', async () => {
    const dir = await tempDir();
    expect(await readSkills(join(dir, 'nope'), 'core')).toEqual({ skills: [], problems: [] });
    expect(await readAgents(join(dir, 'nope'), 'core')).toEqual({ agents: [], problems: [] });
  });
});

describe('readAgents', () => {
  it('reads the fixture agent', async () => {
    const { agents, problems } = await readAgents(join(CORE, 'agents'), 'core');
    expect(problems).toEqual([]);
    expect(agents).toEqual([
      {
        name: 'consistency-reviewer',
        origin: 'core',
        description: 'Finds contradictions and duplicates in a brain',
        tools: ['read', 'search'],
        body: 'Run {{cli}} search --json first.\n',
      },
    ]);
  });

  it('agent tools ordered and validated', async () => {
    const dir = await tempDir();
    await writeTree(dir, {
      'a.md': '---\nname: a\ndescription: A\ntools: [execute, read]\n---\nbody\n',
      'b.md': '---\nname: b\ndescription: B\ntools: [web]\n---\nbody\n',
      'c.md': '---\nname: other\ndescription: C\ntools: [read]\n---\nbody\n',
      'notes.txt': 'not an agent\n',
    });
    const { agents, problems } = await readAgents(dir, 'local');
    expect(agents.map((a) => [a.name, a.tools])).toEqual([['a', ['read', 'execute']]]);
    expect(problems.map((p) => p.path)).toEqual(['b.md', 'c.md']);
    expect(problems[0]!.message).toContain('web');
    expect(problems[1]!.message).toContain('name');
  });
});

describe('overlay', () => {
  const s = (name: string, origin: 'core' | 'local'): SkillSource => ({ name, origin, files: new Map() });
  it('local wins', () =>
    expect(overlay([s('capture', 'core'), s('ask', 'core')], [s('ask', 'local')]).map((x) => [x.name, x.origin])).toEqual([
      ['ask', 'local'],
      ['capture', 'core'],
    ]));
});

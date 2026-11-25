import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../../src/brain/frontmatter.js';
import { defaultCommands } from '../../../src/commands/index.js';
import { packageCore, readSkills } from '../../../src/render/core.js';
import { createWorkspace } from '../../../src/workspace/create.js';
import { read } from '../../helpers/cli.js';
import { tempDir } from '../../helpers/fixtures.js';

const NAMES = ['ask', 'capture', 'ingest'];
const skill = (name: string) => readFile(join(packageCore().skillsDir, name, 'SKILL.md'), 'utf8');
const frontmatter = async (name: string) => parse(splitFrontmatter(await skill(name)).yaml ?? '') as Record<string, unknown>;

describe('core skills', () => {
  it('the core ships capture, ingest and ask', async () => {
    const r = await readSkills(packageCore().skillsDir, 'core');
    expect(r.problems).toEqual([]);
    expect(r.skills.map((s) => s.name)).toEqual(NAMES);
  });

  it('descriptions say when to use the skill', async () => {
    for (const n of NAMES) {
      const d = (await frontmatter(n)).description as string;
      expect(d.length, n).toBeLessThanOrEqual(1024);
      expect(d, n).toContain('Use when');
    }
  });

  it('every CLI call in a skill names a real command', async () => {
    const commands = new Set(defaultCommands.map((c) => c.name));
    for (const n of NAMES) {
      const text = await skill(n);
      const calls = [...text.matchAll(/\{\{cli\}\} ([a-z-]+)/g)];
      expect(calls.length, n).toBeGreaterThan(0);
      for (const c of calls) expect(commands, `${n}: ${c[0]}`).toContain(c[1]);
      for (const line of text.split('\n').filter((l) => l.includes('{{cli}} '))) expect(line, n).toContain('--json');
    }
  });

  it('capture commits, ingest checks and commits, ask searches', async () => {
    expect(await skill('capture')).toContain('{{cli}} commit');
    const ingest = await skill('ingest');
    for (const s of ['{{cli}} search', '{{cli}} doctor personal --fix --json', '{{cli}} commit']) expect(ingest).toContain(s);
    const ask = await skill('ask');
    expect(ask).toContain('{{cli}} search');
    expect(ask).not.toContain('{{cli}} commit');
  });

  it('rendered for Claude with the pin filled', async () => {
    const root = await tempDir('bm skills ');
    await createWorkspace(root, { user: 'octo-user', pin: '0.4.2' });
    const text = await read(root, '.claude/skills/ask/SKILL.md');
    expect(text).toContain('npx -y brain-mesh-ai-workspace@0.4.2 search');
    expect(text).not.toContain('{{');
    for (const n of NAMES) expect(await read(root, `.github/skills/${n}/SKILL.md`)).not.toContain('{{');
  });

  it('no skill pre-approves the shell', async () => {
    for (const n of NAMES) expect(Object.keys(await frontmatter(n)), n).not.toContain('allowed-tools');
  });
});

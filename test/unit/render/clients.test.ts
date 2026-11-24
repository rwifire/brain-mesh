import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeAgent, copilotAgent, fill, skillFiles } from '../../../src/render/clients.js';
import { readAgents, readSkills } from '../../../src/render/core.js';
import { splitFrontmatter } from '../../../src/brain/frontmatter.js';
import { parse } from 'yaml';
import { FIXTURES_DIR } from '../../helpers/fixtures.js';

const CORE = join(FIXTURES_DIR, 'core');
const CLI = 'npx -y brain-mesh@1.2.3';

describe('fill', () => {
  it('replaces {{cli}} only', () => expect(fill('a {{cli}} {{date}} {{cli}}', CLI)).toBe(`a ${CLI} {{date}} ${CLI}`));
});

describe('skillFiles', () => {
  it('fills SKILL.md and copies other files as-is', async () => {
    const ask = (await readSkills(join(CORE, 'skills'), 'core')).skills[0]!;
    const out = skillFiles(ask, CLI);
    expect(out.get('SKILL.md')!.toString('utf8')).toContain(`${CLI} search`);
    expect(out.get('scripts/helper.sh')!.equals(ask.files.get('scripts/helper.sh')!)).toBe(true);
    expect(out.get('scripts/helper.sh')!.toString('utf8')).toContain('{{cli}}');
  });
});

describe('agents', () => {
  it('claudeAgent', async () => {
    const agent = (await readAgents(join(CORE, 'agents'), 'core')).agents[0]!;
    expect(claudeAgent(agent, CLI)).toBe(
      '---\nname: consistency-reviewer\ndescription: Finds contradictions and duplicates in a brain\ntools: Read, Grep, Glob\n---\n' +
        `Run ${CLI} search --json first.\n`,
    );
  });

  it('copilotAgent', async () => {
    const agent = (await readAgents(join(CORE, 'agents'), 'core')).agents[0]!;
    const text = copilotAgent(agent, CLI);
    const split = splitFrontmatter(text);
    expect(parse(split.yaml!)).toEqual({ name: 'consistency-reviewer', description: 'Finds contradictions and duplicates in a brain', tools: ['read', 'search'] });
    expect(split.body).toBe(`Run ${CLI} search --json first.\n`);
  });

  it('maps every abstract tool for Claude', () =>
    expect(
      claudeAgent({ name: 'x', origin: 'core', description: 'X', tools: ['read', 'search', 'edit', 'execute'], body: '' }, CLI),
    ).toContain('tools: Read, Grep, Glob, Edit, Write, Bash\n'));
});

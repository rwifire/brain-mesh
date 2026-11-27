import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageCore, readAgents } from '../../../src/render/core.js';
import { createWorkspace } from '../../../src/workspace/create.js';
import { read } from '../../helpers/cli.js';
import { cliCallError } from '../../helpers/cli-lint.js';
import { tempDir } from '../../helpers/fixtures.js';

const NAMES = ['consistency-reviewer', 'people-policy-reviewer'];
const agent = (name: string) => readFile(join(packageCore().agentsDir, `${name}.md`), 'utf8');

describe('core agents', () => {
  it('the core ships both agents', async () => {
    const r = await readAgents(packageCore().agentsDir, 'core');
    expect(r.problems).toEqual([]);
    expect(r.agents.map((a) => a.name)).toEqual(NAMES);
    expect(Object.fromEntries(r.agents.map((a) => [a.name, a.tools]))).toEqual({
      'consistency-reviewer': ['read', 'search', 'execute'],
      'people-policy-reviewer': ['read', 'search'],
    });
    for (const a of r.agents) expect(a.description, a.name).toContain('Use when');
  });

  it('people-policy-reviewer states the rule and the output', async () => {
    const text = await agent('people-policy-reviewer');
    for (const s of ['responsibilities', 'decisions', 'outcomes', 'opinions', 'performance', 'private life', 'FLAG ', 'NO FLAGS', 'Do not edit', 'override']) {
      expect(text, s).toContain(s);
    }
  });

  it('consistency-reviewer reports only', async () => {
    const text = await agent('consistency-reviewer');
    for (const s of ['CONTRADICTION ', 'DUPLICATE ', 'NOTHING FOUND', 'Do not edit']) expect(text, s).toContain(s);
  });

  it('every CLI call in an agent is real', async () => {
    for (const n of NAMES) {
      const text = await agent(n);
      for (const [, call] of text.matchAll(/`\{\{cli\}\} ([^`]+)`/g)) {
        expect(cliCallError(call!), `${n}: ${call}`).toBeNull();
        expect(call, n).toContain('--json');
      }
    }
  });

  it('rendered for both clients', async () => {
    const root = await tempDir('bm agents ');
    await createWorkspace(root, { user: 'octo-user', pin: '0.4.2' });
    const claude = await read(root, '.claude/agents/people-policy-reviewer.md');
    expect(claude).toContain('tools: Read, Grep, Glob');
    expect(claude).not.toContain('{{');
    expect(await read(root, '.github/agents/people-policy-reviewer.agent.md')).toContain('name: people-policy-reviewer');
    expect(await read(root, '.claude/agents/consistency-reviewer.md')).toContain('npx -y brain-mesh-ai-workspace@0.4.2 search');
  });
});

import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageCore, readAgents, readSkills, type CoreSource } from '../../../src/render/core.js';
import { renderWorkspace } from '../../../src/render/workspace.js';
import { overrideChanges } from '../../../src/upgrade/overrides.js';
import { read, write } from '../../helpers/cli.js';
import { FIXTURES_DIR, tempDir } from '../../helpers/fixtures.js';
import { fullWorkspace, writeFiles } from '../../helpers/workspace.js';

const NEW_CORE: CoreSource = { ...packageCore(), skillsDir: join(FIXTURES_DIR, 'core', 'skills'), agentsDir: join(FIXTURES_DIR, 'core', 'agents') };

/** The fixture core without `capture`, and with an older `ask`. */
async function oldCore(): Promise<CoreSource> {
  const dir = await tempDir('bm old core ');
  const core: CoreSource = { ...NEW_CORE, skillsDir: join(dir, 'skills'), agentsDir: join(dir, 'agents') };
  await cp(NEW_CORE.skillsDir, core.skillsDir, { recursive: true });
  await cp(NEW_CORE.agentsDir, core.agentsDir, { recursive: true });
  await rm(join(core.skillsDir, 'capture'), { recursive: true });
  await write(dir, 'skills/ask/SKILL.md', (await read(dir, 'skills/ask/SKILL.md')).replace(/\n$/, '\nAn old line only the old core has.\n'));
  return core;
}

const skill = (name: string) => `---\nname: ${name}\ndescription: My own ${name}. Use when I say so.\n---\n# Mine\n`;
const agent = '---\nname: consistency-reviewer\ndescription: My reviewer. Use when I say so.\ntools: [read]\n---\nMine.\n';

async function sources(root: string) {
  const core = { skills: (await readSkills(NEW_CORE.skillsDir, 'core')).skills, agents: (await readAgents(NEW_CORE.agentsDir, 'core')).agents };
  const local = {
    skills: (await readSkills(join(root, '.local', 'skills'), 'local')).skills,
    agents: (await readAgents(join(root, '.local', 'agents'), 'local')).agents,
  };
  return { core, local };
}

describe('overrideChanges', () => {
  it('reports a changed and a new override, nothing else', async () => {
    const root = await fullWorkspace();
    await renderWorkspace(root, { core: await oldCore() });
    await writeFiles(root, { '.local/skills/ask/SKILL.md': skill('ask') });
    await writeFiles(root, { '.local/skills/capture/SKILL.md': skill('capture') });
    await writeFiles(root, { '.local/agents/consistency-reviewer.md': agent });
    const { core, local } = await sources(root);
    const changes = await overrideChanges(root, core, local);
    expect(changes.map(({ name, kind, status }) => ({ name, kind, status }))).toEqual([
      { name: 'ask', kind: 'skill', status: 'changed' },
      { name: 'capture', kind: 'skill', status: 'new' },
    ]);
    expect(changes[0]!.diff).toMatch(/^-An old line only the old core has\.$/m);
    expect(changes[0]!.diff).toContain('--- a/.mesh/skills/ask/SKILL.md');
    expect(changes[1]!.diff).toContain('--- /dev/null');
    expect(changes[1]!.diff).toContain('+++ b/.mesh/skills/capture/SKILL.md');
  });

  it('a changed core agent under a local override', async () => {
    const root = await fullWorkspace();
    await renderWorkspace(root, { core: NEW_CORE });
    await write(root, '.mesh/agents/consistency-reviewer.md', (await read(root, '.mesh/agents/consistency-reviewer.md')) + 'Old text.\n');
    await writeFiles(root, { '.local/agents/consistency-reviewer.md': agent });
    const { core, local } = await sources(root);
    const changes = await overrideChanges(root, core, local);
    expect(changes.map(({ name, kind, status }) => ({ name, kind, status }))).toEqual([{ name: 'consistency-reviewer', kind: 'agent', status: 'changed' }]);
    expect(changes[0]!.diff).toMatch(/^-Old text\.$/m);
  });

  it('no overrides, no changes', async () => {
    const root = await fullWorkspace();
    await renderWorkspace(root, { core: await oldCore() });
    const { core, local } = await sources(root);
    expect(await overrideChanges(root, core, local)).toEqual([]);
  });
});

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSource, SkillSource } from '../render/core.js';
import { agentSource } from '../render/workspace.js';
import { unifiedDiff } from './diff.js';

export interface OverrideChange {
  name: string;
  kind: 'skill' | 'agent';
  /** `changed`: the core copy under `.mesh/` differs from the new core's; `new`: the new core adds it. */
  status: 'changed' | 'new';
  /** Old core copy → new core copy. */
  diff: string;
}

const lf = (s: string) => s.replace(/\r\n/g, '\n');
const readText = (p: string) => readFile(p, 'utf8').catch(() => null);
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every local skill or agent that overrides a new core one whose upstream text changed (chunk 11
 * plan, decision 5). The old core copy is the one rendered under `.mesh/`, so call this before
 * the upgrade's render overwrites it. Sorted by kind (agents first), then name.
 */
export async function overrideChanges(
  root: string,
  core: { skills: SkillSource[]; agents: AgentSource[] },
  local: { skills: SkillSource[]; agents: AgentSource[] },
): Promise<OverrideChange[]> {
  const out: OverrideChange[] = [];
  const check = async (name: string, kind: OverrideChange['kind'], rel: string, next: string) => {
    const old = await readText(join(root, ...rel.split('/')));
    if (old !== null && lf(old) === lf(next)) return;
    out.push({ name, kind, status: old === null ? 'new' : 'changed', diff: await unifiedDiff(rel, old, next) });
  };
  const localSkills = new Set(local.skills.map((s) => s.name));
  const localAgents = new Set(local.agents.map((a) => a.name));
  for (const a of core.agents.filter((x) => localAgents.has(x.name))) await check(a.name, 'agent', `.mesh/agents/${a.name}.md`, agentSource(a));
  for (const s of core.skills.filter((x) => localSkills.has(x.name))) {
    await check(s.name, 'skill', `.mesh/skills/${s.name}/SKILL.md`, s.files.get('SKILL.md')?.toString('utf8') ?? '');
  }
  return out.sort((x, y) => byString(x.kind, y.kind) || byString(x.name, y.name));
}

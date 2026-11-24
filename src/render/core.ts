import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, splitFrontmatter } from '../brain/frontmatter.js';

/** Where the core's templates, skills and agents live. */
export interface CoreSource {
  templatesDir: string;
  skillsDir: string;
  agentsDir: string;
}

/** The folders shipped in this package (`templates/`, `skills/`, `agents/` next to `src/` or `dist/`). */
export function packageCore(): CoreSource {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return { templatesDir: join(root, 'templates'), skillsDir: join(root, 'skills'), agentsDir: join(root, 'agents') };
}

export type Origin = 'core' | 'local';

export interface SkillSource {
  name: string;
  origin: Origin;
  /** POSIX path inside the skill folder → bytes, sorted by path. */
  files: Map<string, Buffer>;
}

export type AbstractTool = 'read' | 'search' | 'edit' | 'execute';
export const ABSTRACT_TOOLS: readonly AbstractTool[] = ['read', 'search', 'edit', 'execute'];

export interface AgentSource {
  name: string;
  origin: Origin;
  description: string;
  /** In the order of ABSTRACT_TOOLS. */
  tools: AbstractTool[];
  body: string;
}

export interface SourceProblem {
  /** POSIX path relative to the folder read. */
  path: string;
  message: string;
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function entries(dir: string) {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) => byString(a.name, b.name));
  } catch {
    return [];
  }
}

/** Every regular file under `dir`, as POSIX path → bytes; symlinks and dot entries are skipped. */
async function readTree(dir: string, rel = ''): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for (const e of await entries(dir)) {
    if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
    const childRel = rel === '' ? e.name : posix.join(rel, e.name);
    if (e.isDirectory()) for (const [k, v] of await readTree(join(dir, e.name), childRel)) out.set(k, v);
    else if (e.isFile()) out.set(childRel, await readFile(join(dir, e.name)));
  }
  return new Map([...out].sort(([a], [b]) => byString(a, b)));
}

function frontmatterOf(text: string): { data: Record<string, unknown> | null; body: string; error: string | null } {
  const split = splitFrontmatter(text);
  if (split.yaml === null) return { data: null, body: split.body, error: 'has no YAML frontmatter' };
  const { data, error } = parseFrontmatter(split.yaml);
  return { data, body: split.body, error: error === null ? null : `frontmatter is invalid: ${error}` };
}

/** Why `name` is not a valid skill or agent name for the file or folder `expected`, or null. */
function nameProblem(name: unknown, expected: string): string | null {
  if (typeof name !== 'string') return '`name` is missing';
  if (name !== expected) return `\`name\` ${name} does not match ${expected}`;
  if (name.length > 64 || !NAME.test(name)) return '`name` must be lowercase letters, digits and hyphens, at most 64 characters';
  return null;
}

function descriptionProblem(description: unknown): string | null {
  if (typeof description !== 'string' || description.trim() === '') return '`description` is required';
  if (description.length > 1024) return '`description` is longer than 1024 characters';
  return null;
}

/** Skill folders of `dir` in the Agent Skills format (spec 9.2). */
export async function readSkills(dir: string, origin: Origin): Promise<{ skills: SkillSource[]; problems: SourceProblem[] }> {
  const skills: SkillSource[] = [];
  const problems: SourceProblem[] = [];
  for (const e of await entries(dir)) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const path = `${e.name}/SKILL.md`;
    const files = await readTree(join(dir, e.name));
    const skillMd = files.get('SKILL.md');
    if (skillMd === undefined) {
      problems.push({ path, message: 'SKILL.md is missing' });
      continue;
    }
    const { data, error } = frontmatterOf(skillMd.toString('utf8'));
    const why = error ?? nameProblem(data?.name, e.name) ?? descriptionProblem(data?.description);
    if (why !== null) problems.push({ path, message: why });
    else skills.push({ name: e.name, origin, files });
  }
  return { skills, problems };
}

/** Agents of `dir` in the brain-mesh agent source format (spec 9.2). */
export async function readAgents(dir: string, origin: Origin): Promise<{ agents: AgentSource[]; problems: SourceProblem[] }> {
  const agents: AgentSource[] = [];
  const problems: SourceProblem[] = [];
  for (const e of await entries(dir)) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const stem = e.name.slice(0, -'.md'.length);
    const { data, body, error } = frontmatterOf(await readFile(join(dir, e.name), 'utf8'));
    let why = error ?? nameProblem(data?.name, stem) ?? descriptionProblem(data?.description);
    const tools = data?.tools;
    if (why === null) {
      if (!Array.isArray(tools) || tools.length === 0) why = '`tools` must be a list from read, search, edit, execute';
      else {
        const unknown = tools.filter((t) => !ABSTRACT_TOOLS.includes(t as AbstractTool));
        if (unknown.length > 0) why = `unknown tools: ${unknown.map(String).join(', ')}`;
      }
    }
    if (why !== null) {
      problems.push({ path: e.name, message: why });
      continue;
    }
    agents.push({
      name: stem,
      origin,
      description: data!.description as string,
      tools: ABSTRACT_TOOLS.filter((t) => (tools as unknown[]).includes(t)),
      body,
    });
  }
  return { agents, problems };
}

/** Core sources with same-name local ones replacing them entirely; sorted by name. */
export function overlay<T extends { name: string }>(core: T[], local: T[]): T[] {
  const byName = new Map(core.map((c) => [c.name, c]));
  for (const l of local) byName.set(l.name, l);
  return [...byName.values()].sort((a, b) => byString(a.name, b.name));
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { parseNote } from '../brain/note.js';
import { agentsGenerator } from '../generate/agents-md.js';
import { codeownersGenerator } from '../generate/codeowners.js';
import { mocGenerator } from '../generate/moc.js';
import type { BrainManifest } from '../schemas/brain.js';
import type { BrainModel, WorkspaceModel } from '../workspace/load.js';
import { packageCore } from './core.js';

/** Unversioned, so brain content never depends on the core version (ADR 0001, plan Ruling 11). */
export const BRAIN_SCHEMA_URL = 'https://unpkg.com/brain-mesh/schemas/brain.schema.json';

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A YAML scalar: plain when `yaml` would write it plain, JSON-quoted otherwise. */
function scalar(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return stringify(value).trimEnd() === value ? value : JSON.stringify(value);
}

/** `brain.yaml` for a new brain, laid out like the fixture brains and the `links_to` writer expects. */
export function manifestYaml(m: BrainManifest): string {
  const lines = [
    `# yaml-language-server: $schema=${BRAIN_SCHEMA_URL}`,
    `id: ${scalar(m.id)}`,
    `name: ${scalar(m.name)}`,
    `type: ${m.type}`,
    `description: ${scalar(m.description)}`,
  ];
  if (m.topics !== undefined) lines.push(`topics: [${m.topics.join(', ')}]`);
  if (m.out_of_scope !== undefined) lines.push(`out_of_scope: ${scalar(m.out_of_scope)}`);
  lines.push(`schema: ${m.schema}`, `owner: ${scalar(m.owner)}`, 'policies:', `  people: ${m.policies.people}`);
  return lines.join('\n') + '\n';
}

/** The manifest of a new personal brain for GitHub login `user`. */
export function personalManifest(user: string): BrainManifest {
  return {
    id: 'personal',
    name: user,
    type: 'personal',
    description: `Personal notes of ${user}.`,
    schema: 1,
    owner: `@${user}`,
    policies: { people: 'none' },
  };
}

/**
 * Every file of a new brain, brain-relative path → text, sorted: `brain.yaml`, `AGENTS.md`,
 * `CLAUDE.md`, `index.md` and, when shared, `CODEOWNERS`. The generated parts come from the
 * chunk 4 generators run on the empty brain, so a new brain passes `doctor` as it is.
 * It takes no version, so brain content cannot depend on the core version (ADR 0001).
 */
export function brainFiles(m: BrainManifest, templatesDir: string = packageCore().templatesDir): Map<string, string> {
  const brainPart = readFileSync(join(templatesDir, 'brain', 'AGENTS.md'), 'utf8');
  const manifestText = manifestYaml(m);
  const b: BrainModel = {
    id: m.id,
    dir: `brains/${m.id}`,
    type: m.type,
    mount: null,
    manifest: m,
    manifestError: null,
    manifestText,
    codeownersText: null,
    files: ['AGENTS.md', 'brain.yaml'],
    dirs: [],
    symlinks: [],
    notes: [{ path: 'AGENTS.md', text: brainPart, ...parseNote(brainPart) }],
    shebangs: [],
    dirty: null,
  };
  const ws: WorkspaceModel = {
    root: '',
    mesh: null,
    meshError: null,
    brains: [b],
    missing: [],
    unlisted: [],
    paths: new Set(),
    obsidianApp: null,
    warnings: [],
  };
  const out = new Map<string, string>([['brain.yaml', manifestText]]);
  for (const generate of [agentsGenerator, mocGenerator, codeownersGenerator]) {
    for (const f of generate(ws, b, m).files) out.set(f.path.slice(b.dir.length + 1), f.next);
  }
  return new Map([...out].sort(([x], [y]) => byString(x, y)));
}

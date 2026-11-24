import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CheckCode } from '../../../src/doctor/codes.js';
import { runChecks } from '../../../src/doctor/run.js';
import { loadWorkspace } from '../../../src/workspace/load.js';
import { fullWorkspace, removePath, writeFiles } from '../../helpers/workspace.js';

const P = 'brains/brain-team-platform';
const H = 'brains/personal';

/** A valid note of `type`, with optional extra frontmatter lines. */
const note = (type: string, extra = '') => `---\ntype: ${type}\nsummary: A test note\n${extra}updated: 2026-11-21\n---\n# Test\n`;

async function edit(root: string, rel: string, fn: (text: string) => string): Promise<void> {
  const file = join(root, ...rel.split('/'));
  await writeFile(file, fn(await readFile(file, 'utf8')), 'utf8');
}

interface Case {
  name: string;
  code: CheckCode | null;
  patch(root: string): Promise<void>;
  at?: string;
  line?: number;
  also?: CheckCode[];
}

const CASES: Case[] = [
  { name: 'mesh-invalid', code: 'mesh-invalid', at: 'mesh.yaml', patch: (r) => writeFiles(r, { 'mesh.yaml': 'version: 2\n' }) },
  {
    name: 'mount-id-collision', code: 'mount-id-collision', at: 'mesh.yaml',
    patch: (r) => edit(r, 'mesh.yaml', (t) => t + '  - id: brain-ideas\n    mode: read\n'),
  },
  {
    name: 'mount-id-collision (personal)', code: 'mount-id-collision', at: 'mesh.yaml',
    patch: (r) => edit(r, 'mesh.yaml', (t) => t + '  - id: personal\n    mode: contribute\n'),
  },
  { name: 'brain-missing', code: 'brain-missing', at: 'brains/brain-ideas', patch: (r) => removePath(r, 'brains/brain-ideas') },
  {
    name: 'brain-unlisted', code: 'brain-unlisted', at: 'brains/stray',
    patch: (r) => writeFiles(r, {
      'brains/stray/brain.yaml': 'id: stray\nname: Stray\ntype: shared\ndescription: x\nschema: 1\nowner: "@acme/x"\npolicies:\n  people: accountability\n',
    }),
  },
  {
    name: 'manifest-invalid', code: 'manifest-invalid', at: `${P}/brain.yaml`,
    patch: (r) => edit(r, `${P}/brain.yaml`, (t) => t.replace(/^description:.*\n/m, '')),
  },
  {
    name: 'brain-id-mismatch (folder)', code: 'brain-id-mismatch', at: 'brains/brain-ideas/brain.yaml',
    patch: (r) => edit(r, 'brains/brain-ideas/brain.yaml', (t) => t.replace('id: brain-ideas', 'id: brain-other')),
  },
  {
    name: 'brain-id-mismatch (url)', code: 'brain-id-mismatch', at: `${P}/brain.yaml`,
    patch: (r) => edit(r, 'mesh.yaml', (t) => t.replace('acme/brain-team-platform.git', 'acme/platform.git')),
  },
  { name: 'folder-unexpected', code: 'folder-unexpected', at: `${P}/inbox`, patch: (r) => writeFiles(r, { [`${P}/inbox/x.md`]: 'raw\n' }) },
  { name: 'note-misplaced', code: 'note-misplaced', at: `${P}/areas/stray.md`, patch: (r) => writeFiles(r, { [`${P}/areas/stray.md`]: note('note') }) },
  { name: 'note-misplaced (root)', code: 'note-misplaced', at: `${H}/todo.md`, patch: (r) => writeFiles(r, { [`${H}/todo.md`]: note('note') }) },
  {
    name: 'note-misplaced (nested notes)', code: 'note-misplaced', at: `${P}/notes/old/x.md`,
    patch: (r) => writeFiles(r, { [`${P}/notes/old/x.md`]: note('note') }),
  },
  { name: 'area-nested', code: 'area-nested', at: `${P}/areas/ci/old`, patch: (r) => writeFiles(r, { [`${P}/areas/ci/old/x.md`]: note('note') }) },
  { name: 'area-readme-missing', code: 'area-readme-missing', at: `${P}/areas/people`, patch: (r) => removePath(r, `${P}/areas/people/README.md`) },
  {
    name: 'type-folder-mismatch', code: 'type-folder-mismatch', at: `${P}/maps/ci-performance.md`,
    patch: (r) => edit(r, `${P}/maps/ci-performance.md`, (t) => t.replace('type: map', 'type: note')),
  },
  {
    name: 'filename-not-kebab', code: 'filename-not-kebab', at: `${P}/notes/Build Tips.md`,
    patch: (r) => writeFiles(r, { [`${P}/notes/Build Tips.md`]: note('note') }),
  },
  {
    name: 'filename-not-kebab (non-ASCII)', code: 'filename-not-kebab', at: `${P}/notes/über.md`,
    patch: (r) => writeFiles(r, { [`${P}/notes/über.md`]: note('note') }),
  },
  {
    name: 'filename-not-kebab (folder)', code: 'filename-not-kebab', at: `${P}/areas/Build`,
    patch: (r) => writeFiles(r, { [`${P}/areas/Build/README.md`]: note('area') }),
  },
  {
    name: 'stem-duplicate', code: 'stem-duplicate', at: `${P}/areas/ci/runner-pools.md`, also: ['stem-duplicate'],
    patch: (r) => writeFiles(r, { [`${P}/notes/runner-pools.md`]: note('howto') }),
  },
  {
    name: 'frontmatter-missing', code: 'frontmatter-missing', at: `${P}/notes/build-glossary.md`,
    patch: (r) => writeFiles(r, { [`${P}/notes/build-glossary.md`]: '# One glossary\n' }),
  },
  {
    name: 'frontmatter-invalid', code: 'frontmatter-invalid', at: `${P}/notes/build-glossary.md`,
    patch: (r) => edit(r, `${P}/notes/build-glossary.md`, (t) => t.replace('2026-11-21', '2026-02-30')),
  },
  {
    name: 'frontmatter-invalid (yaml)', code: 'frontmatter-invalid', at: `${P}/notes/build-glossary.md`,
    patch: (r) => edit(r, `${P}/notes/build-glossary.md`, (t) => t.replace(/^summary:.*$/m, 'summary: [')),
  },
  {
    name: 'moc-missing', code: 'moc-missing', at: `${P}/areas/ci/runner-cache-strategy.md`,
    patch: (r) => edit(r, `${P}/areas/ci/runner-cache-strategy.md`, (t) => t.replace('[ci-performance]', '[ci-speed]')),
  },
  {
    name: 'moc-missing (project)', code: 'moc-missing', at: `${P}/areas/ci/runner-cache-strategy.md`,
    patch: (r) => edit(r, `${P}/areas/ci/runner-cache-strategy.md`, (t) => t.replace('project: runner-migration', 'project: other')),
  },
  {
    name: 'owner-invalid', code: 'owner-invalid', at: `${P}/areas/ci/README.md`,
    patch: (r) => edit(r, `${P}/areas/ci/README.md`, (t) => t.replace('"@acme/ci-team"', 'acme')),
  },
  {
    name: 'person-key-not-allowed', code: 'person-key-not-allowed', at: `${P}/areas/people/jane-doe.md`,
    patch: (r) => edit(r, `${P}/areas/people/jane-doe.md`, (t) => t.replace('name: Jane Doe', 'name: Jane Doe\nrating: 3')),
  },
  {
    name: 'person keys in personal brain are fine', code: null,
    patch: (r) => writeFiles(r, { [`${H}/notes/jane.md`]: note('person', 'rating: 3\n') }),
  },
  { name: 'inbox has no rules', code: null, patch: (r) => writeFiles(r, { [`${H}/inbox/Not Kebab.md`]: 'raw\n' }) },
  { name: 'daily notes need no frontmatter', code: null, patch: (r) => writeFiles(r, { [`${H}/daily/2026-11-22.md`]: '# today\n' }) },
];

describe('runChecks', () => {
  it('workspace-full has no findings', async () => expect(runChecks(await loadWorkspace(await fullWorkspace()))).toEqual([]));

  it.each(CASES)('$name', async (c) => {
    const root = await fullWorkspace();
    await c.patch(root);
    const findings = runChecks(await loadWorkspace(root));
    const expected = c.code === null ? [] : [c.code, ...(c.also ?? [])].sort();
    expect(findings.map((f) => f.code).sort(), JSON.stringify(findings, null, 1)).toEqual(expected);
    if (c.code !== null) {
      const f = findings.find((x) => x.code === c.code)!;
      expect(f.path).toBe(c.at);
      if (c.line !== undefined) expect(f.line).toBe(c.line);
    }
  });
});

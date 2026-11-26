import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { brainFiles, manifestYaml, personalManifest } from '../../../src/render/brain.js';
import { SharedBrainManifestSchema, type BrainManifest } from '../../../src/schemas/brain.js';
import { read, run, write } from '../../helpers/cli.js';
import { fullWorkspace, removePath, writeFiles } from '../../helpers/workspace.js';

const SRE: BrainManifest = {
  id: 'brain-sre',
  name: 'SRE',
  type: 'shared',
  description: 'Reliability: on-call, incidents.',
  topics: ['oncall', 'incidents'],
  schema: 1,
  owner: '@acme/sre',
  policies: { people: 'accountability' },
};

const writeBrain = async (root: string, id: string, files: Map<string, string>) =>
  writeFiles(root, Object.fromEntries([...files].map(([p, t]) => [`brains/${id}/${p}`, t])));

describe('manifestYaml', () => {
  it('shared manifest', () => {
    const text = manifestYaml(SRE);
    expect(text).toBe(
      '# yaml-language-server: $schema=https://unpkg.com/brain-mesh-ai-workspace/schemas/brain.schema.json\n' +
        'id: brain-sre\nname: SRE\ntype: shared\ndescription: "Reliability: on-call, incidents."\n' +
        'topics: [oncall, incidents]\nschema: 1\nowner: "@acme/sre"\npolicies:\n  people: accountability\n',
    );
    expect(SharedBrainManifestSchema.parse(parse(text))).toEqual(SRE);
  });

  it('optional keys', () => {
    const text = manifestYaml({ ...SRE, topics: undefined, out_of_scope: 'Product roadmaps' } as BrainManifest);
    expect(text).not.toContain('topics');
    expect(text).toContain('description: "Reliability: on-call, incidents."\nout_of_scope: Product roadmaps\nschema: 1\n');
  });
});

describe('brainFiles', () => {
  it('a new brain has its folder skeleton', () => {
    const personal = brainFiles(personalManifest('octo'));
    for (const f of ['inbox', 'daily', 'notes', 'areas', 'maps', 'projects', 'sources']) expect(personal.get(`${f}/.gitkeep`), f).toBe('');
    const shared = [...brainFiles(SRE).keys()];
    expect(shared).toContain('notes/.gitkeep');
    expect(shared).not.toContain('inbox/.gitkeep');
    expect(shared).not.toContain('daily/.gitkeep');
  });

  it('shared brain files', () =>
    expect([...brainFiles(SRE).keys()]).toEqual(['AGENTS.md', 'CLAUDE.md', 'CODEOWNERS', 'areas/.gitkeep', 'brain.yaml', 'index.md', 'maps/.gitkeep', 'notes/.gitkeep', 'projects/.gitkeep', 'sources/.gitkeep']));

  it('personal brain files', () => {
    const files = brainFiles(personalManifest('octo-user'));
    expect([...files.keys()]).toEqual(['AGENTS.md', 'CLAUDE.md', 'areas/.gitkeep', 'brain.yaml', 'daily/.gitkeep', 'inbox/.gitkeep', 'index.md', 'maps/.gitkeep', 'notes/.gitkeep', 'projects/.gitkeep', 'sources/.gitkeep']);
    expect(files.get('AGENTS.md')).toContain('`inbox/` holds unprocessed captures');
    expect(files.get('AGENTS.md')).toContain('\n<!-- /brain-mesh:agents -->\n\n## Brain-specific notes\n');
    expect(files.get('CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('a new shared brain passes doctor', async () => {
    const root = await fullWorkspace();
    await writeBrain(root, 'brain-sre', brainFiles(SRE));
    await write(root, 'mesh.yaml', (await read(root, 'mesh.yaml')) + '  - id: brain-sre\n    mode: contribute\n');
    const r = await run(['doctor', 'brain-sre', '--json'], root);
    expect(r.json().data.findings).toEqual([]);
  });

  it('a new personal brain passes doctor', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/personal');
    await writeBrain(root, 'personal', brainFiles(personalManifest('octo-user')));
    const r = await run(['doctor', 'personal', '--json'], root);
    expect(r.json().data.findings).toEqual([]);
  });
});

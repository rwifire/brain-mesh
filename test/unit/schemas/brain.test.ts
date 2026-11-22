import { describe, expect, it } from 'vitest';
import { BrainManifestSchema } from '../../../src/schemas/brain.js';

const shared = {
  id: 'brain-team-platform', name: 'Platform Team', type: 'shared',
  description: 'CI/CD, build infrastructure, developer tooling, runners.', topics: ['ci', 'build'],
  out_of_scope: 'Application monitoring and on-call; see brain-sre.', schema: 1, requires: '>=0.3',
  owner: '@acme/platform', policies: { people: 'accountability' }, links_to: ['brain-handbook'],
};
const personal = {
  id: 'personal', name: 'Ramon', type: 'personal', description: 'My notes.',
  schema: 1, owner: '@ramon', policies: { people: 'none' },
};

describe('BrainManifestSchema', () => {
  it('accepts the spec shared example', () => expect(BrainManifestSchema.safeParse(shared).success).toBe(true));

  it('accepts a personal brain', () => expect(BrainManifestSchema.safeParse(personal).success).toBe(true));

  it('non-ASCII text validates', () =>
    expect(BrainManifestSchema.safeParse({ ...shared, name: 'Plattform-Team Ü', description: 'Läufer und Caches' }).success).toBe(true));

  it.each([
    ['missing description', { ...shared, description: undefined }],
    ['empty description', { ...shared, description: '' }],
    ['shared brain named personal', { ...shared, id: 'personal' }],
    ['personal brain with another id', { ...personal, id: 'mine' }],
    ['personal brain with a team owner', { ...personal, owner: '@acme/team' }],
    ['shared brain without people policy', { ...shared, policies: { people: 'none' } }],
    ['unknown key', { ...shared, maintainers: [] }],
    ['schema 0', { ...shared, schema: 0 }],
    ['unknown type', { ...shared, type: 'team' }],
  ])('rejects %s', (_n, input) => expect(BrainManifestSchema.safeParse(input).success).toBe(false));

  it('accepts a schema newer than this core', () =>
    expect(BrainManifestSchema.safeParse({ ...shared, schema: 7 }).success).toBe(true));
});

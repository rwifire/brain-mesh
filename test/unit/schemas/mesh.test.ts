import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MeshConfigSchema } from '../../../src/schemas/mesh.js';

const valid = `version: 1
brain_mesh: 0.4.2
user: ramon
mounts:
  - id: brain-team-platform
    url: git@github.com:acme/brain-team-platform.git
    mode: contribute
  - id: brain-ideas
    mode: contribute
`;

describe('MeshConfigSchema', () => {
  it('accepts the spec example', () => expect(MeshConfigSchema.safeParse(parse(valid)).success).toBe(true));

  it('CRLF input validates', () =>
    expect(MeshConfigSchema.parse(parse(valid.replace(/\n/g, '\r\n')))).toEqual(MeshConfigSchema.parse(parse(valid))));

  it('mounts default to an empty list', () =>
    expect(MeshConfigSchema.parse({ version: 1, brain_mesh: '0.0.0', user: 'ramon' }).mounts).toEqual([]));

  it('rejects an unknown top-level key and names it', () => {
    const r = MeshConfigSchema.safeParse({ version: 1, brain_mesh: '0.0.0', user: 'ramon', mount: [] });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: ['mount'], path: [] });
  });

  it.each([
    ['bad mode', { mounts: [{ id: 'a', mode: 'write' }] }, ['mounts', 0, 'mode']],
    ['uppercase id', { mounts: [{ id: 'Brain-A', mode: 'read' }] }, ['mounts', 0, 'id']],
    ['bad pin', { brain_mesh: 'latest' }, ['brain_mesh']],
    ['version 2', { version: 2 }, ['version']],
    ['login with underscore', { user: 'ra_mon' }, ['user']],
  ])('rejects %s', (_n, patch, path) => {
    const r = MeshConfigSchema.safeParse({ version: 1, brain_mesh: '0.0.0', user: 'ramon', ...patch });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(path);
  });
});

import { describe, expect, it } from 'vitest';
import { jsonSchemaFiles } from '../../../src/schemas/json-schema.js';

describe('jsonSchemaFiles', () => {
  it('mesh.schema.json is up to date', async () =>
    expect(jsonSchemaFiles()['mesh.schema.json']).toMatchFileSnapshot('../../../schemas/mesh.schema.json'));

  it('brain.schema.json is up to date', async () =>
    expect(jsonSchemaFiles()['brain.schema.json']).toMatchFileSnapshot('../../../schemas/brain.schema.json'));

  it('schemas are draft 2020-12 with a title', () => {
    for (const text of Object.values(jsonSchemaFiles())) {
      const s = JSON.parse(text);
      expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.title).toMatch(/^brain-mesh /);
    }
  });
});

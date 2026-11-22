import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { BrainManifestSchema } from '../../../src/schemas/brain.js';
import { MeshConfigSchema } from '../../../src/schemas/mesh.js';
import { FIXTURES_DIR } from '../../helpers/fixtures.js';

describe('fixtures', () => {
  it('every fixture mesh.yaml and brain.yaml is valid', async () => {
    const files = (await readdir(FIXTURES_DIR, { recursive: true })).map((f) => join(FIXTURES_DIR, f));
    let mesh = 0;
    let brains = 0;
    for (const file of files) {
      if (basename(file) === 'mesh.yaml') {
        MeshConfigSchema.parse(parse(await readFile(file, 'utf8')));
        mesh++;
      } else if (basename(file) === 'brain.yaml') {
        BrainManifestSchema.parse(parse(await readFile(file, 'utf8')));
        brains++;
      }
    }
    expect(mesh).toBeGreaterThan(0);
    expect(brains).toBeGreaterThan(0);
  });
});

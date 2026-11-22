import { z } from 'zod';
import { BrainManifestSchema } from './brain.js';
import { MeshConfigSchema } from './mesh.js';

function render(schema: z.ZodType, title: string): string {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  const { $schema, ...rest } = json;
  return JSON.stringify({ $schema, title, ...rest }, null, 2) + '\n';
}

/** The published JSON Schemas, keyed by file name under `schemas/`. */
export function jsonSchemaFiles(): { 'mesh.schema.json': string; 'brain.schema.json': string } {
  return {
    'mesh.schema.json': render(MeshConfigSchema, 'brain-mesh mesh.yaml'),
    'brain.schema.json': render(BrainManifestSchema, 'brain-mesh brain.yaml'),
  };
}

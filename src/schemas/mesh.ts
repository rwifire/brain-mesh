import { z } from 'zod';
import { BrainId, GitHubLogin, SemVer } from './common.js';

/** One mounted brain. An unpublished brain has no `url` yet. */
export const MountSchema = z.strictObject({
  id: BrainId,
  url: z.string().min(1).optional(),
  mode: z.enum(['read', 'contribute']),
});

/** `mesh.yaml` at the workspace root (spec 4). */
export const MeshConfigSchema = z.strictObject({
  version: z.literal(1),
  brain_mesh: SemVer,
  user: GitHubLogin,
  mounts: z.array(MountSchema).default([]),
});

export type Mount = z.infer<typeof MountSchema>;
export type MeshConfig = z.infer<typeof MeshConfigSchema>;

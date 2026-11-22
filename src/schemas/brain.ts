import { z } from 'zod';
import { BrainId, Owner, UserOwner } from './common.js';

/** Fields every brain manifest has (spec 5.2). */
const common = {
  name: z.string().min(1),
  description: z.string().min(1),
  topics: z.array(BrainId).optional(),
  out_of_scope: z.string().optional(),
  /** A value above the one this core supports is reported by `doctor`, not rejected here. */
  schema: z.int().min(1),
  requires: z.string().min(1).optional(),
  links_to: z.array(BrainId).optional(),
};

export const SharedBrainManifestSchema = z.strictObject({
  ...common,
  id: BrainId.refine((id) => id !== 'personal', 'is reserved for the personal brain'),
  type: z.literal('shared'),
  owner: Owner,
  policies: z.strictObject({ people: z.literal('accountability') }),
});

export const PersonalBrainManifestSchema = z.strictObject({
  ...common,
  id: z.literal('personal'),
  type: z.literal('personal'),
  owner: UserOwner,
  policies: z.strictObject({ people: z.literal('none') }),
});

/** `brain.yaml` at the root of every brain. */
export const BrainManifestSchema = z.discriminatedUnion('type', [SharedBrainManifestSchema, PersonalBrainManifestSchema]);

export type BrainManifest = z.infer<typeof BrainManifestSchema>;

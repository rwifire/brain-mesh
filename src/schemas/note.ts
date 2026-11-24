import { z } from 'zod';
import { BrainId, Owner } from './common.js';

export const NOTE_TYPES = ['note', 'decision', 'howto', 'source', 'person', 'area', 'map', 'project'] as const;
export const KNOWLEDGE_TYPES = ['note', 'decision', 'howto', 'person'] as const;
export const PERSON_KEYS = ['type', 'summary', 'updated', 'name', 'role', 'team', 'responsibilities', 'contact'] as const;

/** `YYYY-MM-DD` that names a real calendar date. */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Note frontmatter (spec 5.3). Unknown keys are kept; person-note keys are checked by doctor. */
export const NoteFrontmatterSchema = z.looseObject({
  type: z.enum(NOTE_TYPES),
  summary: z.string().min(1),
  updated: z.string().refine(isIsoDate, 'must be a date as YYYY-MM-DD'),
  maps: z.array(BrainId).optional(),
  project: BrainId.optional(),
  sources: z.union([z.string(), z.array(z.string())]).optional(),
  owner: Owner.optional(),
});
export type NoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;

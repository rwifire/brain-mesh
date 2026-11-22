import { z } from 'zod';

/** Brain id: lowercase kebab-case, at most 100 characters (GitHub's repo name limit). */
export const BrainId = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case');

/** GitHub login: alphanumerics and single hyphens, not at either end, at most 39 characters. */
export const GitHubLogin = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, 'must be a GitHub login');

/** Owner: "@login" or "@org/team". */
export const Owner = z
  .string()
  .regex(/^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/, 'must be "@login" or "@org/team"');

/** Owner without a team part: "@login". */
export const UserOwner = z.string().regex(/^@[A-Za-z0-9][A-Za-z0-9-]*$/, 'must be "@login"');

/** Exact semantic version, as pinned in mesh.yaml. */
export const SemVer = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'must be an exact version like 1.2.3');

import type { CheckCode } from '../doctor/codes.js';
import type { Finding } from '../doctor/finding.js';
import type { BrainManifest } from '../schemas/brain.js';
import type { BrainModel, WorkspaceModel } from '../workspace/load.js';
import { withEol } from './blocks.js';

/** A file a generator manages, with its full intended text. */
export interface PlannedFile {
  code: CheckCode;
  brain: string;
  /** Workspace-relative POSIX path. */
  path: string;
  /** Text on disk; null when the file does not exist. */
  current: string | null;
  /** Intended text, line endings already matched to `current`. */
  next: string;
}

export interface GeneratorResult {
  files: PlannedFile[];
  problems: Finding[];
}

export type Generator = (ws: WorkspaceModel, b: BrainModel, manifest: BrainManifest) => GeneratorResult;

/** Plans one file; `next` is built with `\n` and converted to the file's line endings. */
export function planned(code: CheckCode, b: BrainModel, rel: string, current: string | null, next: string): PlannedFile {
  return { code, brain: b.id, path: `${b.dir}/${rel}`, current, next: withEol(next, current) };
}

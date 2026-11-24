import { parse } from 'yaml';
import type { CheckCode } from '../doctor/codes.js';
import { finding, type Finding } from '../doctor/finding.js';
import type { CheckFn } from '../doctor/run.js';
import { BrainManifestSchema, SUPPORTED_SCHEMA, type BrainManifest } from '../schemas/brain.js';
import type { BrainModel, WorkspaceModel } from '../workspace/load.js';
import { stripLinksToConflicts, withEol } from './blocks.js';
import { linksToFor, withLinksTo } from './links-to.js';

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

const linksToGenerator: Generator = (ws, b) => {
  if (b.manifestText === null) return { files: [], problems: [] };
  const next = withLinksTo(stripLinksToConflicts(b.manifestText), linksToFor(ws, b));
  return { files: [planned('links-to-outdated', b, 'brain.yaml', b.manifestText, next)], problems: [] };
};

/** Generators in run order; later chunks' tasks append theirs. */
export const GENERATORS: Generator[] = [linksToGenerator];

/** Every code a generator can emit. */
export const GENERATED_CODES: ReadonlySet<CheckCode> = new Set<CheckCode>(['links-to-outdated', 'generated-block-invalid']);

/** The manifest, or one recovered by dropping `links_to`-only merge conflicts. */
function recoverManifest(b: BrainModel): BrainManifest | null {
  if (b.manifest !== null) return b.manifest;
  if (b.manifestText === null) return null;
  try {
    const result = BrainManifestSchema.safeParse(parse(stripLinksToConflicts(b.manifestText)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Plans every generated file of the workspace (or of one brain). Read mounts are never planned. */
export function planGenerated(ws: WorkspaceModel, brain?: string): GeneratorResult {
  const files: PlannedFile[] = [];
  const problems: Finding[] = [];
  for (const b of ws.brains) {
    if (brain !== undefined && b.id !== brain) continue;
    if (b.mount?.mode === 'read') continue;
    const manifest = recoverManifest(b);
    if (manifest === null || manifest.schema > SUPPORTED_SCHEMA) continue;
    for (const generate of GENERATORS) {
      const r = generate(ws, b, manifest);
      files.push(...r.files);
      problems.push(...r.problems);
    }
  }
  files.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  return { files, problems };
}

/** Out-of-date generated files and generator problems as findings. */
export const generatedChecks: CheckFn = (ws) => {
  const { files, problems } = planGenerated(ws);
  const out = files
    .filter((f) => f.next !== f.current)
    .map((f) => finding(f.code, { brain: f.brain, path: f.path, message: 'out of date; run brain-mesh doctor --fix' }));
  return [...out, ...problems];
};

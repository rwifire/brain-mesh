import { parse } from 'yaml';
import type { CheckCode } from '../doctor/codes.js';
import { finding, type Finding } from '../doctor/finding.js';
import type { CheckFn } from '../doctor/run.js';
import { BrainManifestSchema, SUPPORTED_SCHEMA, type BrainManifest } from '../schemas/brain.js';
import type { BrainModel, WorkspaceModel } from '../workspace/load.js';
import { agentsGenerator } from './agents-md.js';
import { stripLinksToConflicts } from './blocks.js';
import { codeownersGenerator } from './codeowners.js';
import { linksToFor, withLinksTo } from './links-to.js';
import { mocGenerator } from './moc.js';
import { planned, type Generator, type GeneratorResult, type PlannedFile } from './planned.js';

export { planned, type Generator, type GeneratorResult, type PlannedFile } from './planned.js';

const linksToGenerator: Generator = (ws, b) => {
  if (b.manifestText === null) return { files: [], problems: [] };
  const next = withLinksTo(stripLinksToConflicts(b.manifestText), linksToFor(ws, b));
  return { files: [planned('links-to-outdated', b, 'brain.yaml', b.manifestText, next)], problems: [] };
};

/** Generators in run order; later chunks' tasks append theirs. */
export const GENERATORS: Generator[] = [linksToGenerator, mocGenerator, codeownersGenerator, agentsGenerator];

/** Every code a generator can emit. */
export const GENERATED_CODES: ReadonlySet<CheckCode> = new Set<CheckCode>(['links-to-outdated', 'generated-block-invalid', 'moc-outdated', 'codeowners-outdated', 'agents-md-outdated', 'claude-md-missing', 'generated-path-taken']);

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

/** Why `f` must not be written: its path is a symlink, or a create would hit a file whose name differs only in case. */
function takenBy(b: BrainModel, f: PlannedFile): string | null {
  const rel = f.path.slice(b.dir.length + 1);
  const lower = rel.toLowerCase();
  const link = b.symlinks.find((l) => l.toLowerCase() === lower);
  if (link !== undefined) return `${link} is a symbolic link; brain-mesh does not write through links`;
  if (f.current !== null) return null;
  const variant = [...b.files, ...b.dirs].find((p) => p !== rel && p.toLowerCase() === lower);
  return variant === undefined ? null : `cannot create ${rel}: ${variant} already exists; rename it to ${rel}`;
}

/** Plans every generated file of the workspace (or of one brain). Read mounts are never planned. */
export function planGenerated(ws: WorkspaceModel, brain?: string): GeneratorResult {
  const files: PlannedFile[] = [];
  const problems: Finding[] = [];
  for (const b of ws.brains) {
    if (brain !== undefined && b.id !== brain) continue;
    // Read mounts and unlisted folders belong to someone else's clone (Ruling 7, final review I1).
    if (b.mount?.mode === 'read' || (b.mount === null && b.id !== 'personal')) continue;
    const manifest = recoverManifest(b);
    if (manifest === null || manifest.schema > SUPPORTED_SCHEMA) continue;
    for (const generate of GENERATORS) {
      const r = generate(ws, b, manifest);
      for (const f of r.files) {
        const why = takenBy(b, f);
        if (why === null) files.push(f);
        else problems.push(finding('generated-path-taken', { brain: b.id, path: f.path, message: why }));
      }
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

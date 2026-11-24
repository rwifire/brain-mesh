import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import type { Link } from '../brain/links.js';
import { parseNote } from '../brain/note.js';
import { gitIsDirty } from '../git.js';
import type { Warning } from '../output.js';
import { BrainManifestSchema, type BrainManifest } from '../schemas/brain.js';
import { MeshConfigSchema, type MeshConfig, type Mount } from '../schemas/mesh.js';

export interface NoteModel {
  /** Brain-relative POSIX path. */
  path: string;
  text: string;
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  links: Link[];
}

export interface BrainModel {
  /** Folder name under `brains/`. */
  id: string;
  /** `brains/<id>`. */
  dir: string;
  type: 'personal' | 'shared';
  /** The `mesh.yaml` entry; always null for personal and for unlisted folders. */
  mount: Mount | null;
  manifest: BrainManifest | null;
  manifestError: string | null;
  /** Brain-relative POSIX paths, sorted; no `.git/**`, no symlinks. */
  files: string[];
  dirs: string[];
  /** Every file ending in `.md`. */
  notes: NoteModel[];
  /** Non-markdown files whose first two bytes are `#!`. */
  shebangs: string[];
  /** Read mounts with their own `.git` only; null when not checked. */
  dirty: boolean | null;
}

export interface WorkspaceModel {
  root: string;
  mesh: MeshConfig | null;
  meshError: string | null;
  brains: BrainModel[];
  /** `personal` or mount ids whose `brains/<id>` is absent. */
  missing: string[];
  /** `brains/<x>` folders (not dot, not personal) with no mount. */
  unlisted: string[];
  /** Every file and dir under `brains/`, workspace-relative POSIX, case-exact. */
  paths: ReadonlySet<string>;
  /** Text of `brains/.obsidian/app.json`; null when absent or unreadable. */
  obsidianApp: string | null;
  warnings: Warning[];
}

export interface LoadDeps {
  isDirty(dir: string): Promise<boolean>;
  readText(path: string): Promise<string>;
}

const defaultDeps: LoadDeps = { isDirty: gitIsDirty, readText: (path) => readFile(path, 'utf8') };

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid';
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}

/** Walks `dir` recursively, skipping `.git` entries and symlinks. Paths are POSIX, relative to `dir`. */
async function walk(dir: string, rel = ''): Promise<{ files: string[]; dirs: string[] }> {
  const files: string[] = [];
  const dirs: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { files, dirs };
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.isSymbolicLink()) continue;
    const childRel = rel === '' ? entry.name : posix.join(rel, entry.name);
    if (entry.isDirectory()) {
      dirs.push(childRel);
      const sub = await walk(join(dir, entry.name), childRel);
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else if (entry.isFile()) {
      files.push(childRel);
    }
  }
  return { files, dirs };
}

async function startsWithShebang(path: string): Promise<boolean> {
  try {
    const handle = await open(path, 'r');
    try {
      const buf = Buffer.alloc(2);
      const { bytesRead } = await handle.read(buf, 0, 2, 0);
      return bytesRead === 2 && buf.toString('latin1') === '#!';
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(brainDir: string): Promise<{ manifest: BrainManifest | null; error: string | null }> {
  let text: string;
  try {
    text = await readFile(join(brainDir, 'brain.yaml'), 'utf8');
  } catch {
    return { manifest: null, error: 'brain.yaml is missing' };
  }
  let value: unknown;
  try {
    value = parse(text);
  } catch (err) {
    return { manifest: null, error: err instanceof Error ? err.message.split('\n')[0]! : String(err) };
  }
  const result = BrainManifestSchema.safeParse(value);
  return result.success ? { manifest: result.data, error: null } : { manifest: null, error: firstIssue(result.error) };
}

async function readMesh(root: string): Promise<{ mesh: MeshConfig | null; error: string | null }> {
  let value: unknown;
  try {
    value = parse(await readFile(join(root, 'mesh.yaml'), 'utf8'));
  } catch (err) {
    return { mesh: null, error: err instanceof Error ? err.message.split('\n')[0]! : String(err) };
  }
  const result = MeshConfigSchema.safeParse(value);
  return result.success ? { mesh: result.data, error: null } : { mesh: null, error: firstIssue(result.error) };
}

/** Loads a read-only model of the workspace at `root` (the folder holding `mesh.yaml`). */
export async function loadWorkspace(root: string, overrides: Partial<LoadDeps> = {}): Promise<WorkspaceModel> {
  const deps: LoadDeps = { ...defaultDeps, ...overrides };
  const { mesh, error: meshError } = await readMesh(root);
  const brainsDir = join(root, 'brains');
  const all = await walk(brainsDir);
  const paths = new Set<string>(
    [...all.files, ...all.dirs].map((p) => posix.join('brains', p)),
  );
  const folders = all.dirs.filter((d) => !d.includes('/') && !d.startsWith('.')).sort(byString);
  const warnings: Warning[] = [];

  const mounts = mesh?.mounts ?? [];
  const mountIds = new Set(mounts.map((m) => m.id).filter((id) => id !== 'personal'));
  let ids: string[];
  const missing: string[] = [];
  let unlisted: string[] = [];
  if (!folders.includes('personal')) missing.push('personal');
  if (meshError !== null) {
    ids = folders.filter((f) => f === 'personal');
  } else {
    for (const id of mountIds) if (!folders.includes(id)) missing.push(id);
    unlisted = folders.filter((f) => f !== 'personal' && !mountIds.has(f));
    ids = folders;
  }

  const brains: BrainModel[] = [];
  for (const id of ids) {
    const prefix = `${id}/`;
    const files = all.files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)).sort(byString);
    const dirs = all.dirs.filter((d) => d.startsWith(prefix)).map((d) => d.slice(prefix.length)).sort(byString);
    const brainDir = join(brainsDir, id);
    const { manifest, error: manifestError } = await readManifest(brainDir);
    const mount = id === 'personal' ? null : (mounts.find((m) => m.id === id) ?? null);

    const notes: NoteModel[] = [];
    for (const path of files.filter((f) => f.endsWith('.md'))) {
      let text: string;
      try {
        text = await deps.readText(join(brainDir, ...path.split('/')));
      } catch (err) {
        const reason = err instanceof Error ? err.message.split('\n')[0]! : String(err);
        warnings.push({ code: 'W_FILE_UNREADABLE', message: `could not read brains/${id}/${path}: ${reason}` });
        continue;
      }
      notes.push({ path, text, ...parseNote(text) });
    }

    const shebangs: string[] = [];
    for (const path of files.filter((f) => !f.endsWith('.md'))) {
      if (await startsWithShebang(join(brainDir, ...path.split('/')))) shebangs.push(path);
    }

    let dirty: boolean | null = null;
    if (mount?.mode === 'read') {
      if (!(await exists(join(brainDir, '.git')))) {
        warnings.push({ code: 'W_GIT_STATUS', message: `could not check ${id} for uncommitted changes: brains/${id} has no .git` });
      } else {
        try {
          dirty = await deps.isDirty(brainDir);
        } catch (err) {
          const reason = err instanceof Error ? err.message.split('\n')[0]! : String(err);
          warnings.push({ code: 'W_GIT_STATUS', message: `could not check ${id} for uncommitted changes: ${reason}` });
        }
      }
    }

    brains.push({
      id,
      dir: `brains/${id}`,
      type: manifest?.type ?? (id === 'personal' ? 'personal' : 'shared'),
      mount,
      manifest,
      manifestError,
      files,
      dirs,
      notes,
      shebangs,
      dirty,
    });
  }

  let obsidianApp: string | null = null;
  if (paths.has('brains/.obsidian/app.json')) {
    try {
      obsidianApp = await deps.readText(join(brainsDir, '.obsidian', 'app.json'));
    } catch (err) {
      const reason = err instanceof Error ? err.message.split('\n')[0]! : String(err);
      warnings.push({ code: 'W_FILE_UNREADABLE', message: `could not read brains/.obsidian/app.json: ${reason}` });
    }
  }

  return { root, mesh, meshError, brains, missing: missing.sort(byString), unlisted, paths, obsidianApp, warnings };
}

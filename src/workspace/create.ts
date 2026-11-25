import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Warning } from '../output.js';
import { brainFiles, personalManifest } from '../render/brain.js';
import { packageCore, type CoreSource } from '../render/core.js';
import { renderWorkspace } from '../render/workspace.js';

/** Unversioned, so the user-owned `mesh.yaml` never needs rewriting on upgrade (plan Ruling 9). */
export const MESH_SCHEMA_URL = 'https://unpkg.com/brain-mesh-ai-workspace/schemas/mesh.schema.json';

const TOOLS = ['package.json', 'tsconfig.json', 'README.md'];
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `mesh.yaml` of a new workspace with no mounts. */
export function meshYaml(user: string, pin: string): string {
  return `# yaml-language-server: $schema=${MESH_SCHEMA_URL}\nversion: 1\nbrain_mesh: ${pin}\nuser: ${user}\nmounts: []\n`;
}

/**
 * Writes `mesh.yaml`, the personal brain and the `tools/` scaffold into the empty folder `root`,
 * then renders the managed files. No git, no network. Returns the sorted workspace-relative paths written.
 * The `tools/` files are written once and are not in the render record, so upgrades never touch them.
 */
export async function createWorkspace(
  root: string,
  o: { user: string; pin: string; core?: CoreSource },
): Promise<{ files: string[]; warnings: Warning[] }> {
  const core = o.core ?? packageCore();
  const files = new Set<string>();
  const put = async (rel: string, text: string) => {
    const abs = join(root, ...rel.split('/'));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text, { encoding: 'utf8', flag: 'wx' });
    files.add(rel);
  };

  await put('mesh.yaml', meshYaml(o.user, o.pin));
  for (const [rel, text] of brainFiles(personalManifest(o.user), core.templatesDir)) await put(`brains/personal/${rel}`, text);
  for (const name of TOOLS) await put(`tools/${name}`, await readFile(join(core.templatesDir, 'tools', name), 'utf8'));

  const result = await renderWorkspace(root, { core });
  for (const p of result.written) files.add(p);
  return { files: [...files].sort(byString), warnings: result.warnings };
}

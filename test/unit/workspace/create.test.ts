import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../../src/doctor/run.js';
import { packageCore, type CoreSource } from '../../../src/render/core.js';
import { RECORD_PATH, type RenderRecord } from '../../../src/render/workspace.js';
import { createWorkspace, meshYaml } from '../../../src/workspace/create.js';
import { loadWorkspace } from '../../../src/workspace/load.js';
import { read } from '../../helpers/cli.js';
import { FIXTURES_DIR, tempDir } from '../../helpers/fixtures.js';

const CORE: CoreSource = { ...packageCore(), skillsDir: join(FIXTURES_DIR, 'core', 'skills'), agentsDir: join(FIXTURES_DIR, 'core', 'agents') };
const create = async () => {
  const root = await tempDir('bm create ');
  return { root, ...(await createWorkspace(root, { user: 'octo-user', pin: '0.4.2', core: CORE })) };
};

describe('createWorkspace', () => {
  it('mesh.yaml', () =>
    expect(meshYaml('octo-user', '0.4.2')).toBe(
      '# yaml-language-server: $schema=https://unpkg.com/brain-mesh-ai-workspace/schemas/mesh.schema.json\nversion: 1\nbrain_mesh: 0.4.2\nuser: octo-user\nmounts: []\n',
    ));

  it('a new workspace passes doctor', async () => {
    const { root, warnings } = await create();
    expect(warnings).toEqual([]);
    const ws = await loadWorkspace(root);
    expect(ws.meshError).toBeNull();
    expect(runChecks(ws)).toEqual([]);
  });

  it('the personal brain opens with its folders', async () => {
    const { root } = await create();
    expect(await read(root, 'brains/personal/inbox/.gitkeep')).toBe('');
    expect(runChecks(await loadWorkspace(root)).filter((f) => f.path?.startsWith('brains/personal'))).toEqual([]);
  });

  it('lays out the workspace', async () => {
    const { files } = await create();
    for (const p of [
      'mesh.yaml',
      'brains/personal/brain.yaml',
      'brains/personal/index.md',
      'tools/package.json',
      'tools/tsconfig.json',
      'tools/README.md',
      '.gitattributes',
      'brains/.obsidian/app.json',
      'AGENTS.md',
      'CLAUDE.md',
      '.mesh/hooks/pre-commit',
      '.gitignore',
    ]) {
      expect(files).toContain(p);
    }
    expect([...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(files);
  });

  it('tools scaffold is not in the render record', async () => {
    const { root } = await create();
    const record = JSON.parse(await read(root, RECORD_PATH)) as RenderRecord;
    expect(record.files.some((f) => f.path.startsWith('tools/'))).toBe(false);
  });

  it('tools versions follow the core', async () => {
    const { root } = await create();
    const tools = JSON.parse(await read(root, 'tools/package.json')) as { scripts: { test: string }; devDependencies: Record<string, string> };
    const core = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as { devDependencies: Record<string, string> };
    expect(tools.devDependencies.typescript).toBe(core.devDependencies.typescript);
    expect(tools.devDependencies.vitest).toBe(core.devDependencies.vitest);
    expect(tools.scripts.test).toBe('vitest run --passWithNoTests');
  });

  it('personal brain owner is the login', async () => {
    const { root } = await create();
    expect(await read(root, 'brains/personal/brain.yaml')).toContain('owner: "@octo-user"');
  });
});

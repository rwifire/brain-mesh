import { readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkspace, type WorkspaceModel } from '../../../src/workspace/load.js';
import { fullWorkspace, git, removePath, writeFiles } from '../../helpers/workspace.js';

const brain = (ws: WorkspaceModel, id: string) => ws.brains.find((b) => b.id === id)!;

describe('loadWorkspace', () => {
  it('loads every brain', async () => {
    const ws = await loadWorkspace(await fullWorkspace());
    expect(ws.brains.map((b) => b.id)).toEqual(['brain-handbook', 'brain-ideas', 'brain-team-platform', 'personal']);
    expect(ws.missing).toEqual([]);
    expect(ws.unlisted).toEqual([]);
    expect(ws.warnings).toEqual([]);
    expect(ws.meshError).toBeNull();
  });

  it('brain fields', async () => {
    const ws = await loadWorkspace(await fullWorkspace());
    const p = brain(ws, 'brain-team-platform');
    expect(p).toMatchObject({ type: 'shared', dir: 'brains/brain-team-platform', manifestError: null });
    expect(p.mount?.mode).toBe('contribute');
    expect(p.notes.find((n) => n.path === 'areas/ci/runner-cache-strategy.md')?.links).toHaveLength(5);
    expect(p.files).toContain('areas/ci/images/cache-diagram.png');
    expect(p.dirs).toContain('areas/ci/images');
    expect(brain(ws, 'personal')).toMatchObject({ type: 'personal', mount: null, dirty: null });
  });

  it('path index is case-exact', async () => {
    const ws = await loadWorkspace(await fullWorkspace());
    expect(ws.paths.has('brains/brain-team-platform/areas/ci/runner-pools.md')).toBe(true);
    expect(ws.paths.has('brains/brain-team-platform/areas/CI/runner-pools.md')).toBe(false);
    expect(ws.paths.has('brains/brain-team-platform/areas/ci')).toBe(true);
  });

  it('skips .git', async () => {
    const ws = await loadWorkspace(await fullWorkspace());
    expect(brain(ws, 'brain-handbook').files.some((f) => f.startsWith('.git/') || f === '.git')).toBe(false);
    expect([...ws.paths].some((p) => /\/\.git(\/|$)/.test(p))).toBe(false);
    expect(ws.paths.has('brains/brain-team-platform/.github/workflows/ci.yml')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('skips symlinks', async () => {
    const root = await fullWorkspace();
    await symlink(join(root, 'mesh.yaml'), join(root, 'brains', 'personal', 'notes', 'link.md'));
    expect(brain(await loadWorkspace(root), 'personal').files).not.toContain('notes/link.md');
  });

  it('read mount dirty', async () => {
    const root = await fullWorkspace();
    expect(brain(await loadWorkspace(root), 'brain-handbook').dirty).toBe(false);
    await writeFiles(root, { 'brains/brain-handbook/areas/engineering/new.md': 'x\n' });
    expect(brain(await loadWorkspace(root), 'brain-handbook').dirty).toBe(true);
  });

  it('read mount without .git is not checked', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/brain-handbook/.git');
    await git(root, 'init', '-q');
    await writeFiles(root, { 'untracked.txt': 'x\n' });
    const ws = await loadWorkspace(root);
    expect(brain(ws, 'brain-handbook').dirty).toBeNull();
    expect(ws.warnings.map((w) => w.code)).toEqual(['W_GIT_STATUS']);
  });

  it('missing and unlisted', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/brain-ideas');
    await writeFiles(root, { 'brains/stray/brain.yaml': 'id: stray\n' });
    const ws = await loadWorkspace(root);
    expect(ws.missing).toEqual(['brain-ideas']);
    expect(ws.unlisted).toEqual(['stray']);
    expect(brain(ws, 'stray').mount).toBeNull();
  });

  it('missing personal', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/personal');
    expect((await loadWorkspace(root)).missing).toEqual(['personal']);
  });

  it('invalid mesh.yaml', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { 'mesh.yaml': 'version: 2\n' });
    const ws = await loadWorkspace(root);
    expect(ws.meshError).not.toBeNull();
    expect(ws.mesh).toBeNull();
    expect(ws.brains.map((b) => b.id)).toEqual(['personal']);
    expect(ws.unlisted).toEqual([]);
    expect(ws.paths.has('brains/brain-team-platform/index.md')).toBe(true);
  });

  it('an unreadable note becomes a warning, not a crash', async () => {
    const root = await fullWorkspace();
    const locked = join(root, 'brains', 'personal', 'notes', 'reading-list.md');
    const ws = await loadWorkspace(root, {
      readText: async (path) => {
        if (path === locked) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
        return readFile(path, 'utf8');
      },
    });
    expect(ws.warnings).toEqual([{ code: 'W_FILE_UNREADABLE', message: 'could not read brains/personal/notes/reading-list.md: EPERM: operation not permitted' }]);
    expect(brain(ws, 'personal').notes.map((n) => n.path)).not.toContain('notes/reading-list.md');
    expect(brain(ws, 'brain-team-platform').notes.length).toBeGreaterThan(0);
  });

  it('manifest errors', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/brain-ideas/brain.yaml');
    const b = brain(await loadWorkspace(root), 'brain-ideas');
    expect(b).toMatchObject({ manifestError: 'brain.yaml is missing', manifest: null, type: 'shared' });
  });

  it('manifest schema errors name the field', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, {
      'brains/brain-ideas/brain.yaml': 'id: brain-ideas\nname: x\ntype: shared\nschema: 1\nowner: "@a"\npolicies: {people: accountability}\n',
    });
    expect(brain(await loadWorkspace(root), 'brain-ideas').manifestError).toMatch(/^description: /);
  });
});

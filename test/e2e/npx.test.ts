import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execa } from 'execa';
import { describe, expect, inject, it } from 'vitest';
import { tempDir } from '../helpers/fixtures.js';
import { PKG_VERSION } from '../helpers/version.js';
import { fullWorkspace } from '../helpers/workspace.js';

describe('npx from the packed tarball', () => {
  it('runs version --json through npx from the packed tarball, cold then cached', async () => {
    const tarball = inject('tarball');
    const cwd = await tempDir('bm e2e-'); // contains a space
    const env = { ...process.env, npm_config_cache: join(cwd, 'npm cache'), npm_config_update_notifier: 'false' };
    const timed = async () => {
      const t0 = performance.now();
      const r = await execa('npx', ['-y', '--package', tarball, 'brain-mesh', 'version', '--json'], { cwd, env });
      return { r, ms: Math.round(performance.now() - t0) };
    };
    const cold = await timed();
    const cached = await timed();
    for (const { r } of [cold, cached]) {
      expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, command: 'version', data: { version: PKG_VERSION } });
    }
    console.log(`npx timing on ${process.platform}: cold ${cold.ms} ms, cached ${cached.ms} ms`);
    expect(cached.ms).toBeLessThan(15_000);
  });

  it('exits 2 with a usage envelope through the bin', async () => {
    const r = await execa('npx', ['-y', '--package', inject('tarball'), 'brain-mesh', 'nope', '--json'], {
      cwd: await tempDir('bm e2e-'),
      reject: false,
    });
    expect(r.exitCode).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 'E_USAGE' } });
  });
});

describe('the package ships the templates', () => {
  it('renders a workspace from the installed package', async () => {
    const prefix = await tempDir('bm install-');
    await execa('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', prefix, inject('tarball')]);
    const pkg = join(prefix, 'node_modules', 'brain-mesh');
    for (const p of [
      'templates/workspace/AGENTS.md',
      'templates/workspace/gitattributes',
      'templates/notes/note.md',
      'templates/hooks/pre-commit',
      'templates/hooks/mixed-commit.mjs',
      'templates/tools/package.json',
    ]) {
      await expect(access(join(pkg, ...p.split('/'))), p).resolves.toBeUndefined();
    }
    const mod = (await import(
      pathToFileURL(join(prefix, 'node_modules', 'brain-mesh', 'dist', 'render', 'workspace.js')).href
    )) as typeof import('../../src/render/workspace.js');
    const root = await fullWorkspace();
    const r = await mod.renderWorkspace(root);
    expect(r.written).toContain('AGENTS.md');
    expect(r.written).toContain('.mesh/templates/notes/note.md');
    expect(r.written).toContain('.mesh/hooks/pre-commit');
    expect(r.written).toContain('.mesh/hooks/mixed-commit.mjs');
  });

  it('creates a workspace whose skills call the pinned version', async () => {
    const prefix = await tempDir('bm install-');
    await execa('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', prefix, inject('tarball')]);
    const create = (await import(
      pathToFileURL(join(prefix, 'node_modules', 'brain-mesh', 'dist', 'workspace', 'create.js')).href
    )) as typeof import('../../src/workspace/create.js');
    const root = await tempDir('bm ws-');
    await create.createWorkspace(root, { user: 'octo-user', pin: PKG_VERSION });
    for (const name of ['capture', 'ingest', 'ask']) {
      const text = await readFile(join(root, '.claude', 'skills', name, 'SKILL.md'), 'utf8');
      expect(text, name).toContain(`npx -y brain-mesh@${PKG_VERSION} `);
    }
  });
});

import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, inject, it } from 'vitest';
import { tempDir } from '../helpers/fixtures.js';

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
      expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, command: 'version', data: { version: '0.0.0' } });
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

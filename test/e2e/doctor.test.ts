import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, inject, it } from 'vitest';
import { fixture } from '../helpers/fixtures.js';

describe('doctor from the packed tarball', () => {
  it('doctor runs from the packed tarball', async () => {
    const cwd = await fixture('workspace-full'); // no git step: the read mount has no .git
    // the cache sits at the workspace root, outside brains/, so doctor never sees it
    const env = { ...process.env, npm_config_cache: join(cwd, 'npm cache'), npm_config_update_notifier: 'false' };
    const r = await execa('npx', ['-y', '--package', inject('tarball'), 'brain-mesh', 'doctor', '--offline', '--json'], { cwd, env, reject: false });
    const e = JSON.parse(r.stdout);
    expect(r.exitCode, r.stdout).toBe(0);
    expect(e.data.findings).toEqual([]);
    expect(e.warnings[0].code).toBe('W_GIT_STATUS');
    // the fixture's contribute mount is on github.com; --offline keeps the run off the network
    expect(e.warnings.map((w: { code: string }) => w.code)).toContain('W_NETWORK_SKIPPED');
  });
});

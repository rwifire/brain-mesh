import { afterEach, describe, expect, it } from 'vitest';
import { warmNpxWith } from '../../../src/workspace/warm.js';

describe('warmNpx', () => {
  const saved = process.env.BRAIN_MESH_NO_NPX_WARM;
  afterEach(() => {
    if (saved === undefined) delete process.env.BRAIN_MESH_NO_NPX_WARM;
    else process.env.BRAIN_MESH_NO_NPX_WARM = saved;
  });

  it('the default warm-up has a timeout and can be switched off', async () => {
    const calls: unknown[][] = [];
    const warm = warmNpxWith(async (...a) => {
      calls.push(a);
    });
    delete process.env.BRAIN_MESH_NO_NPX_WARM;
    await warm('1.2.3', 'C:/my ws');
    const win = process.platform === 'win32';
    expect(calls).toEqual([
      [win ? 'npx.cmd' : 'npx', ['-y', 'brain-mesh-ai-workspace@1.2.3', 'version', '--json'], { cwd: 'C:/my ws', timeout: 120000, shell: win, stdio: 'ignore' }],
    ]);
    process.env.BRAIN_MESH_NO_NPX_WARM = '1';
    await warm('1.2.3', 'C:/my ws');
    expect(calls).toHaveLength(1);
  });
});

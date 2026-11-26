import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloneBrain } from '../../../src/mount/clone.js';
import { brainFiles, personalManifest } from '../../../src/render/brain.js';
import { tempDir } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { sharedBrainFiles, sharedRemote } from '../../helpers/remotes.js';

const exists = (p: string) => stat(p).then(() => true, () => false);

async function setup() {
  await isolateGit();
  const base = await tempDir('bm clone ');
  const root = join(base, 'ws');
  await mkdir(join(root, 'brains'), { recursive: true });
  return { base, root };
}

describe('cloneBrain', () => {
  it('clones a shared brain', async () => {
    const { base, root } = await setup();
    const url = await sharedRemote(base, 'brain-sre');
    const r = await cloneBrain(root, url);
    expect(r.id).toBe('brain-sre');
    expect(r.manifest).toMatchObject({ id: 'brain-sre', type: 'shared' });
    expect(await exists(join(root, 'brains', 'brain-sre', 'brain.yaml'))).toBe(true);
  });

  it('refuses taken ids', async () => {
    const { base, root } = await setup();
    const personal = await sharedRemote(base, 'personal');
    await expect(cloneBrain(root, personal)).rejects.toMatchObject({ code: 'E_MOUNT_EXISTS' });
    const url = await sharedRemote(base, 'brain-sre');
    await mkdir(join(root, 'brains', 'brain-sre'));
    await expect(cloneBrain(root, url)).rejects.toMatchObject({ code: 'E_MOUNT_EXISTS' });
    expect(await exists(join(root, 'brains', 'brain-sre', 'brain.yaml'))).toBe(false);
  });

  it('refuses an id that is not kebab-case', async () => {
    const { base, root } = await setup();
    const url = await sharedRemote(base, 'Brain_SRE');
    await expect(cloneBrain(root, url)).rejects.toMatchObject({ code: 'E_USAGE' });
  });

  it('not a brain leaves nothing behind', async () => {
    const { base, root } = await setup();
    const folder = join(root, 'brains', 'brain-sre');
    const personal = Object.fromEntries(brainFiles(personalManifest('octo')));
    const cases: [string, Record<string, string> | 'missing', string][] = [
      ['no-manifest', {}, 'E_NOT_A_BRAIN'],
      ['personal', personal, 'E_NOT_A_BRAIN'],
      ['other-id', sharedBrainFiles('brain-other'), 'E_NOT_A_BRAIN'],
      ['broken', { 'brain.yaml': 'id: [\n' }, 'E_NOT_A_BRAIN'],
      ['unreachable', 'missing', 'E_GIT'],
    ];
    for (const [name, files, code] of cases) {
      const caseBase = join(base, name);
      await mkdir(caseBase);
      const url = files === 'missing' ? join(caseBase, 'brain-sre.git') : await sharedRemote(caseBase, 'brain-sre', files);
      await expect(cloneBrain(root, url), name).rejects.toMatchObject({ code });
      expect(await exists(folder), name).toBe(false);
    }
  });
});

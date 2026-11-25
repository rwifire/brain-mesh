import { execa } from 'execa';
import { afterEach, describe, expect, it } from 'vitest';
import { githubHost } from '../../src/host/github.js';
import { tempDir } from '../helpers/fixtures.js';

const hasGh = await execa('gh', ['--version'], { reject: false }).then(
  (r) => r.exitCode === 0,
  () => false,
);

const KEYS = ['GH_CONFIG_DIR', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

/** A gh with no stored login: an empty config folder and no token in the environment. */
async function loggedOut(): Promise<void> {
  for (const k of KEYS) delete process.env[k];
  process.env.GH_CONFIG_DIR = await tempDir('bm gh config ');
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe.skipIf(!hasGh)('real gh', () => {
  it('real gh logged out gives E_GH_AUTH', async () => {
    await loggedOut();
    await expect(githubHost().login()).rejects.toMatchObject({ code: 'E_GH_AUTH' });
  });

  it('real gh offline gives E_OFFLINE', async () => {
    await loggedOut();
    process.env.GH_TOKEN = 'gho_dummy';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    await expect(githubHost().login()).rejects.toMatchObject({ code: 'E_OFFLINE' });
  });
});

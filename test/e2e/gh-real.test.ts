import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, describe, expect, it } from 'vitest';
import { githubHost } from '../../src/host/github.js';
import { tempDir } from '../helpers/fixtures.js';

const hasGh = await execa('gh', ['--version'], { reject: false }).then(
  (r) => r.exitCode === 0,
  () => false,
);

const KEYS = ['GH_HOST', 'GH_CONFIG_DIR', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'];
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

/**
 * gh keeps a login in the OS keyring (Windows credential manager, macOS keychain) as well as in its
 * config folder; an empty GH_CONFIG_DIR hides only the latter. Logged out can be simulated only
 * where the keyring holds no github.com token, e.g. CI.
 */
const keyringLogin = async (): Promise<boolean> => {
  const config = await mkdtemp(join(tmpdir(), 'bm gh probe '));
  const env: Record<string, string | undefined> = { ...process.env, GH_HOST: 'github.com', GH_CONFIG_DIR: config };
  for (const k of KEYS.filter((k) => k !== 'GH_HOST' && k !== 'GH_CONFIG_DIR')) delete env[k];
  const r = await execa('gh', ['auth', 'token', '--hostname', 'github.com'], { env, extendEnv: false, reject: false });
  await rm(config, { recursive: true, force: true });
  return r.exitCode === 0;
};
const inKeyring = hasGh && (await keyringLogin());

describe.skipIf(!hasGh)('real gh', () => {
  it.skipIf(inKeyring)('real gh logged out gives E_GH_AUTH', async () => {
    await loggedOut();
    await expect(githubHost().login()).rejects.toMatchObject({ code: 'E_GH_AUTH' });
  });

  it('real gh offline gives E_OFFLINE', async () => {
    await loggedOut();
    process.env.GH_TOKEN = 'gho_dummy';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    await expect(githubHost().login()).rejects.toMatchObject({ code: 'E_OFFLINE' });
  });

  it('gh is always asked about github.com, whatever GH_HOST says', async () => {
    await loggedOut();
    process.env.GH_HOST = 'ghe.example.invalid';
    process.env.GH_TOKEN = 'gho_dummy';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    await expect(githubHost().login()).rejects.toMatchObject({ code: 'E_OFFLINE', message: expect.stringContaining('api.github.com') });
  });
});

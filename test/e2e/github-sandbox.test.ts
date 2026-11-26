import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { githubHost } from '../../src/host/github.js';
import { tempDir } from '../helpers/fixtures.js';

/**
 * The real adapter against github.com. Runs only with BRAIN_MESH_SANDBOX_REPO=<owner>/<name>: a repo
 * you can push to, with a `main` branch. BRAIN_MESH_SANDBOX_TEAM=@org/team (a team with write access
 * to it) adds the team cases. It opens one pull request and closes it again.
 */
const SANDBOX = process.env.BRAIN_MESH_SANDBOX_REPO ?? '';
const TEAM = process.env.BRAIN_MESH_SANDBOX_TEAM ?? '';
const [owner = '', name = ''] = SANDBOX.split('/');
const REPO = { owner, name };
const host = githubHost();

const sh = async (cwd: string, cmd: string, args: string[]) => {
  const r = await execa(cmd, args, { cwd, reject: false });
  if (r.exitCode !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${String(r.stderr)}`);
  return String(r.stdout);
};

describe.skipIf(SANDBOX === '')('github.com sandbox', { timeout: 120_000 }, () => {
  it('permission is write or better', async () => {
    expect(['admin', 'maintain', 'write']).toContain(await host.permission(REPO));
    expect(await host.permission({ owner, name: `brain-mesh-does-not-exist-${Date.now()}` })).toBe('none');
  });

  it('owners', async () => {
    const login = await host.login();
    expect(await host.ownerStatus(`@${login}`, REPO)).toBe('ok');
    expect(await host.ownerStatus(`@${login}-no-such-user-zz9`, REPO)).toBe('not-found');
  });

  it.skipIf(TEAM === '')('team owners', async () => {
    expect(await host.ownerStatus(TEAM, REPO)).toBe('ok');
    const org = TEAM.replace(/^@/, '').split('/')[0]!;
    expect(await host.ownerStatus(`@${org}/no-such-team-zz9`, REPO)).toBe('not-found');
  });

  it('a pull request round trip', async () => {
    const dir = await tempDir('bm sandbox ');
    await sh(dir, 'git', ['clone', '--depth', '1', `https://github.com/${SANDBOX}.git`, 'repo']);
    const repo = join(dir, 'repo');
    const branch = `brain-mesh-sandbox-${Date.now()}`;
    await sh(repo, 'git', ['switch', '-c', branch]);
    await writeFile(join(repo, `${branch}.md`), '# Sandbox\n\nOpened and closed by the brain-mesh sandbox test.\n', 'utf8');
    await sh(repo, 'git', ['add', '.']);
    await sh(repo, 'git', ['commit', '-m', 'brain-mesh sandbox test']);
    await sh(repo, 'git', ['push', '-u', 'origin', branch]);
    let number: number | undefined;
    try {
      const pr = await host.createPullRequest({ repo: REPO, head: branch, base: 'main', title: 'brain-mesh sandbox test', body: 'Opened by a test;\nclosed right away.' });
      number = pr.number;
      expect(pr.url).toBe(`https://github.com/${SANDBOX}/pull/${pr.number}`);
      await expect(host.createPullRequest({ repo: REPO, head: branch, base: 'main', title: 'again', body: '' })).rejects.toMatchObject({ code: 'E_PR_CREATE' });
    } finally {
      if (number !== undefined) await sh(repo, 'gh', ['pr', 'close', String(number), '--repo', SANDBOX, '--delete-branch']);
      else await sh(repo, 'git', ['push', 'origin', '--delete', branch]);
    }
  });
});

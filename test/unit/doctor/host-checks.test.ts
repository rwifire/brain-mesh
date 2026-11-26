import { describe, expect, it } from 'vitest';
import { hostChecks } from '../../../src/doctor/host-checks.js';
import { CliError } from '../../../src/output.js';
import { loadWorkspace } from '../../../src/workspace/load.js';
import { read } from '../../helpers/cli.js';
import { fakeHost } from '../../helpers/host.js';
import { fullWorkspace, writeFiles } from '../../helpers/workspace.js';

const REPO = 'acme/brain-team-platform';
const MANIFEST = 'brains/brain-team-platform/brain.yaml';
const area = (owner: string) => `---\ntype: area\nsummary: An area.\nupdated: 2026-11-25\nowner: "${owner}"\n---\n# Area\n`;

/** The full fixture (contribute mount on github.com) plus `tree`, loaded. */
async function ws(tree: Record<string, string> = {}) {
  const root = await fullWorkspace();
  await writeFiles(root, tree);
  return loadWorkspace(root);
}
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);
const warnings = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

describe('hostChecks', () => {
  it('no contribute mount on github.com means no host call', async () => {
    const root = await fullWorkspace();
    const mesh = (await read(root, 'mesh.yaml')).replace('https://github.com/acme/brain-team-platform.git', '../remotes/brain-team-platform.git');
    await writeFiles(root, { 'mesh.yaml': mesh });
    const local = fakeHost();
    const r = await hostChecks(await loadWorkspace(root), local, { offline: false });
    expect(local.calls).toEqual([]);
    expect(r).toEqual({ findings: [], warnings: [] });

    const personal = fakeHost();
    expect(await hostChecks(await ws(), personal, { brain: 'personal', offline: false })).toEqual({ findings: [], warnings: [] });
    expect(personal.calls).toEqual([]);
  });

  it('push rights', async () => {
    const r = await hostChecks(await ws(), fakeHost({ permissions: { [REPO]: 'read' } }), { offline: false });
    expect(r.findings.map((f) => [f.code, f.path])).toEqual([['push-rights-missing', MANIFEST]]);
    expect(r.findings[0]!.message).toContain('read access to acme/brain-team-platform');
    for (const p of ['write', 'maintain', 'admin'] as const) {
      expect(codes(await hostChecks(await ws(), fakeHost({ permissions: { [REPO]: p } }), { offline: false })), p).toEqual([]);
    }
  });

  it('without write access, owners are not looked up', async () => {
    const owners = { [`@acme/platform|${REPO}`]: 'no-write' as const, [`@acme/ci-team|${REPO}`]: 'no-write' as const };
    for (const p of ['none', 'read'] as const) {
      const host = fakeHost({ permissions: { [REPO]: p }, owners });
      const r = await hostChecks(await ws(), host, { offline: false });
      expect(codes(r), p).toEqual(['push-rights-missing']);
      expect(host.calls, p).toEqual([`permission ${REPO}`]);
    }
  });

  it('owners', async () => {
    const tree = { 'brains/brain-team-platform/areas/ghost/README.md': area('@acme/ghost') };
    const at = 'brains/brain-team-platform/areas/ghost/README.md';
    const key = `@acme/ghost|${REPO}`;
    const missing = await hostChecks(await ws(tree), fakeHost({ owners: { [key]: 'not-found' } }), { offline: false });
    expect(missing.findings.map((f) => [f.code, f.path])).toEqual([['owner-not-found', at]]);
    const noWrite = await hostChecks(await ws(tree), fakeHost({ owners: { [key]: 'no-write' } }), { offline: false });
    expect(noWrite.findings.map((f) => [f.code, f.path])).toEqual([['owner-no-write', at]]);
    const unknown = await hostChecks(await ws(tree), fakeHost({ owners: { [key]: 'unknown' } }), { offline: false });
    expect(codes(unknown)).toEqual([]);
    expect(warnings(unknown)).toEqual(['W_OWNER_UNCHECKED']);
    const brainOwner = await hostChecks(await ws(), fakeHost({ owners: { [`@acme/platform|${REPO}`]: 'not-found' } }), { offline: false });
    expect(brainOwner.findings.map((f) => [f.code, f.path])).toEqual([['owner-not-found', MANIFEST]]);
  });

  it('each owner is looked up once per repo', async () => {
    const host = fakeHost();
    await hostChecks(
      await ws({
        'brains/brain-team-platform/areas/a1/README.md': area('@acme/shared-team'),
        'brains/brain-team-platform/areas/a2/README.md': area('@acme/shared-team'),
        'brains/brain-team-platform/areas/a3/README.md': area('@acme/shared-team'),
      }),
      host,
      { offline: false },
    );
    expect(host.calls.filter((c) => c === `ownerStatus @acme/shared-team ${REPO}`)).toHaveLength(1);
  });

  it('--offline skips with one warning', async () => {
    const host = fakeHost({ permissions: { [REPO]: 'read' } });
    const r = await hostChecks(await ws(), host, { offline: true });
    expect(host.calls).toEqual([]);
    expect(r.findings).toEqual([]);
    expect(warnings(r)).toEqual(['W_NETWORK_SKIPPED']);
    expect(r.warnings[0]!.message).toContain('--offline');
  });

  it('a failure on a later call drops all network findings', async () => {
    for (const code of ['E_OFFLINE', 'E_GH_AUTH']) {
      const failWith = new CliError(code, `boom ${code}`);
      // call 1: permission (write), call 2: @acme/platform (a no-write finding), call 3 fails
      const owners = { [`@acme/platform|${REPO}`]: 'no-write' as const };
      const r = await hostChecks(await ws(), fakeHost({ owners, failWith, failAfter: 2 }), { offline: false });
      expect(r.findings, code).toEqual([]);
      expect(warnings(r), code).toEqual(['W_NETWORK_SKIPPED']);
      expect(r.warnings[0]!.message).toContain(`boom ${code}`);
    }
    const other = new Error('a bug');
    await expect(hostChecks(await ws(), fakeHost({ failWith: other as CliError }), { offline: false })).rejects.toBe(other);
  });

  it('other hosts warn, local paths are skipped', async () => {
    const root = await fullWorkspace();
    const mesh = (await read(root, 'mesh.yaml')).replace('https://github.com/acme/brain-team-platform.git', 'https://github.acme.com/acme/brain-team-platform.git');
    await writeFiles(root, { 'mesh.yaml': mesh });
    const host = fakeHost();
    const r = await hostChecks(await loadWorkspace(root), host, { offline: false });
    expect(host.calls).toEqual([]);
    expect(warnings(r)).toEqual(['W_HOST_UNSUPPORTED']);
  });
});

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctorCommand } from '../../../src/commands/doctor.js';
import { main } from '../../../src/main.js';
import { run as runCli, testCommands } from '../../helpers/cli.js';
import { tempDir } from '../../helpers/fixtures.js';
import { fakeHost } from '../../helpers/host.js';
import { captureIo } from '../../helpers/io.js';
import { fullWorkspace, removePath } from '../../helpers/workspace.js';

const P = 'brains/brain-team-platform';
const H = 'brains/personal';

const run = async (argv: string[], cwd: string) => {
  const io = captureIo();
  const code = await main(argv, io, { cwd, commands: testCommands() });
  return { code, out: io.stdout(), err: io.stderr() };
};
const json = (out: string) => {
  expect(out.trimEnd().includes('\n')).toBe(false);
  return JSON.parse(out);
};
async function appendBrokenLink(root: string, rel: string): Promise<void> {
  const file = join(root, ...rel.split('/'));
  await writeFile(file, (await readFile(file, 'utf8')) + '\n[x](./gone.md)\n', 'utf8');
}

describe('doctor', () => {
  it('clean workspace', async () => {
    const r = await run(['doctor', '--json'], await fullWorkspace());
    expect(r.code).toBe(0);
    const e = json(r.out);
    expect(e).toMatchObject({ ok: true, command: 'doctor', warnings: [] });
    expect(e.data.findings).toEqual([]);
    expect(e.data.brains).toHaveLength(4);
    expect(e.data.counts).toEqual({ errors: 0, warnings: 0 });
    expect(r.err).toBe('');
  });

  it('errors exit 1', async () => {
    const root = await fullWorkspace();
    await appendBrokenLink(root, `${P}/notes/build-glossary.md`);
    const r = await run(['doctor', '--json'], root);
    expect(r.code).toBe(1);
    const e = json(r.out);
    expect(e.ok).toBe(true);
    expect(e.data.findings[0]).toMatchObject({
      code: 'link-broken', severity: 'error', brain: 'brain-team-platform', path: `${P}/notes/build-glossary.md`,
    });
    expect(e.data.counts).toEqual({ errors: 1, warnings: 0 });
  });

  it('warnings only exit 0', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/brain-ideas');
    const r = await run(['doctor', '--json'], root);
    expect(r.code).toBe(0);
    expect(json(r.out).data.counts).toEqual({ errors: 0, warnings: 1 });
  });

  it('filter by brain', async () => {
    const root = await fullWorkspace();
    await appendBrokenLink(root, `${P}/notes/build-glossary.md`);
    await appendBrokenLink(root, `${H}/notes/reading-list.md`);
    const r = await run(['doctor', 'personal', '--json'], root);
    const e = json(r.out);
    expect(e.data.brains).toEqual(['personal']);
    expect(e.data.findings).toHaveLength(1);
    expect(e.data.findings.every((f: { brain: string }) => f.brain === 'personal')).toBe(true);
  });

  it('unknown brain', async () => {
    const r = await run(['doctor', 'nope', '--json'], await fullWorkspace());
    expect(r.code).toBe(2);
    expect(json(r.out)).toMatchObject({ ok: false, command: 'doctor', error: { code: 'E_UNKNOWN_BRAIN' } });
  });

  it('a missing mount can be named', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/brain-ideas');
    const r = await run(['doctor', 'brain-ideas', '--json'], root);
    expect(r.code).toBe(0);
    expect(json(r.out).data.findings.map((f: { code: string }) => f.code)).toEqual(['brain-missing']);
  });

  it('runs from a subfolder', async () => {
    const root = await fullWorkspace();
    const r = await run(['doctor', '--json'], join(root, 'brains', 'personal', 'notes'));
    expect(r.code).toBe(0);
    expect(json(r.out).data.root).toBe(root);
  });

  it('outside a workspace', async () => {
    const r = await run(['doctor', '--json'], await tempDir());
    expect(r.code).toBe(1);
    expect(json(r.out)).toMatchObject({ ok: false, error: { code: 'E_NO_WORKSPACE' } });
    expect(r.err).toBe('');
  });

  it('human output', async () => {
    const root = await fullWorkspace();
    await appendBrokenLink(root, `${P}/notes/build-glossary.md`);
    const r = await run(['doctor'], root);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${P}/notes/build-glossary.md:`);
    expect(r.out).toContain('  error  link-broken  ');
    expect(r.out.endsWith('doctor: 1 error, 0 warnings in 4 brains\n')).toBe(true);
  });

  it('human output, clean', async () => {
    const r = await run(['doctor'], await fullWorkspace());
    expect(r.out).toBe('doctor: no problems in 4 brains\n');
  });

  it('a filtered run still reports mesh.yaml problems', async () => {
    const root = await fullWorkspace();
    await writeFile(join(root, 'mesh.yaml'), 'version: 2\n', 'utf8');
    const r = await run(['doctor', 'personal', '--json'], root);
    expect(r.code).toBe(1);
    expect(json(r.out).data.findings.map((f: { code: string }) => f.code)).toEqual(['mesh-invalid']);
    const other = await run(['doctor', 'brain-team-platform', '--json'], root);
    expect(other.code).toBe(2);
    expect(json(other.out).error.message).toContain('mesh.yaml is invalid');
  });
});

describe('doctor and the host', () => {
  it('doctor --offline and network findings', async () => {
    const root = await fullWorkspace();
    const offline = await runCli(['doctor', '--offline', '--json'], root, [doctorCommand({ host: fakeHost() })]);
    expect(offline.code).toBe(0);
    expect(offline.json().warnings.map((w: { code: string }) => w.code)).toContain('W_NETWORK_SKIPPED');
    const readOnly = fakeHost({ permissions: { 'acme/brain-team-platform': 'read' } });
    const r = await runCli(['doctor', '--json'], root, [doctorCommand({ host: readOnly })]);
    expect(r.code).toBe(1);
    expect(r.json().data.findings.map((f: { code: string }) => f.code)).toEqual(['push-rights-missing']);
    expect(r.json().data.counts).toEqual({ errors: 1, warnings: 0 });
  });
});

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { read, run, write } from '../../helpers/cli.js';
import type { CheckCode } from '../../../src/doctor/codes.js';
import { GENERATED_CODES } from '../../../src/generate/plan.js';
import { fullWorkspace, writeFiles } from '../../helpers/workspace.js';

const P = 'brains/brain-team-platform';
const H = 'brains/personal';

describe('doctor --fix: links_to', () => {
  it('reports links-to-outdated', async () => {
    const root = await fullWorkspace();
    await write(root, `${H}/notes/reading-list.md`, (await read(root, `${H}/notes/reading-list.md`)) + '\n[x](../../brain-handbook/index.md)\n');
    const r = await run(['doctor', '--json'], root);
    expect(r.code).toBe(1);
    expect(r.json().data.findings).toContainEqual(
      expect.objectContaining({ code: 'links-to-outdated', path: `${H}/brain.yaml`, fixable: true }),
    );
  });

  it('--fix writes it and exits 0', async () => {
    const root = await fullWorkspace();
    await write(root, `${H}/notes/reading-list.md`, (await read(root, `${H}/notes/reading-list.md`)) + '\n[x](../../brain-handbook/index.md)\n');
    const r = await run(['doctor', '--fix', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(r.json().data.fixed).toEqual([{ code: 'links-to-outdated', path: `${H}/brain.yaml` }]);
    expect(parse(await read(root, `${H}/brain.yaml`)).links_to).toEqual(['brain-handbook', 'brain-team-platform']);
  });

  it('repairs a links_to conflict', async () => {
    const root = await fullWorkspace();
    const text = await read(root, `${P}/brain.yaml`);
    const conflicted = text.replace(/^links_to:.*$/m, '<<<<<<< HEAD\nlinks_to: [brain-handbook]\n=======\nlinks_to: [brain-other]\n>>>>>>> pr');
    expect(conflicted).not.toBe(text);
    await write(root, `${P}/brain.yaml`, conflicted);
    expect((await run(['doctor', '--json'], root)).json().data.findings.map((f: { code: string }) => f.code)).toContain('manifest-invalid');
    const r = await run(['doctor', '--fix', '--json'], root);
    expect(r.code, r.out).toBe(0);
    expect(await read(root, `${P}/brain.yaml`)).not.toContain('<<<<<<<');
    expect(parse(await read(root, `${P}/brain.yaml`)).links_to).toEqual(['brain-handbook']);
  });

  it('fixed is empty without --fix', async () =>
    expect((await run(['doctor', '--json'], await fullWorkspace())).json().data.fixed).toEqual([]));

  it('human output lists fixed files', async () => {
    const root = await fullWorkspace();
    await write(root, `${H}/notes/reading-list.md`, (await read(root, `${H}/notes/reading-list.md`)) + '\n[x](../../brain-handbook/index.md)\n');
    const r = await run(['doctor', '--fix'], root);
    expect(r.out.startsWith(`fixed ${H}/brain.yaml (links-to-outdated)\n`)).toBe(true);
  });
});

const NOTE = (extra = '') => `---\ntype: note\nsummary: A test note\n${extra}updated: 2026-11-21\n---\n# Test\n`;
const HUNK = (ours: string, theirs: string) => `<<<<<<< HEAD\n${ours}=======\n${theirs}>>>>>>> pr\n`;

async function snapshot(root: string, dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const e of await readdir(join(root, dir), { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || e.parentPath.includes('.git')) continue;
    const abs = join(e.parentPath, e.name);
    out.set(abs, await readFile(abs, 'utf8'));
  }
  return out;
}

describe('doctor --fix: conflicts and write boundaries', () => {
  it('fix is idempotent', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { [`${P}/notes/new-note.md`]: NOTE('maps: [ci-performance]\n') });
    const first = await run(['doctor', '--fix', '--json'], root);
    expect(first.code, first.out).toBe(0);
    expect(first.json().data.fixed.length).toBeGreaterThan(0);
    const second = await run(['doctor', '--fix', '--json'], root);
    expect(second.code, second.out).toBe(0);
    expect(second.json().data.fixed).toEqual([]);
  });

  it('heals two PRs adding entries', async () => {
    const root = await fullWorkspace();
    const rel = `${P}/notes/README.md`;
    const glossary = '- [Build glossary](build-glossary.md) — We use one glossary for build terms\n';
    const extra = '- [Extra](extra.md) — A test note\n';
    const text = await read(root, rel);
    expect(text).toContain(glossary);
    await write(root, rel, text.replace(glossary, HUNK(glossary, extra)));
    await writeFiles(root, { [`${P}/notes/extra.md`]: NOTE() });
    const r = await run(['doctor', '--fix', '--json'], root);
    expect(r.code, r.out).toBe(0);
    const after = await read(root, rel);
    expect(after).not.toContain('<<<<<<<');
    expect(after).toContain(`<!-- brain-mesh:index -->\n${glossary}${extra}<!-- /brain-mesh:index -->\n`);
  });

  it('a conflict in curated text is left alone', async () => {
    const root = await fullWorkspace();
    const rel = `${P}/areas/ci/README.md`;
    const curated = '- [Runner cache strategy](runner-cache-strategy.md)\n';
    const hunk = HUNK(curated, '- [Runner caches](runner-cache-strategy.md)\n');
    await write(root, rel, (await read(root, rel)).replace(`# CI\n\n${curated}`, `# CI\n\n${hunk}`));
    await writeFiles(root, { [`${P}/areas/ci/new-thing.md`]: NOTE() });
    const r = await run(['doctor', '--fix', '--json'], root);
    expect(r.code).toBe(1);
    expect(r.json().data.findings).toContainEqual(expect.objectContaining({ code: 'conflict-markers', path: rel }));
    const after = await read(root, rel);
    expect(after).toContain(`# CI\n\n${hunk}`);
    expect(after).toContain('<!-- brain-mesh:index -->\n- [New thing](new-thing.md) — A test note\n');
  });

  it('never writes into a read mount', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { 'brains/brain-handbook/areas/engineering/new-rule.md': NOTE() });
    const before = await snapshot(root, 'brains/brain-handbook');
    const r = await run(['doctor', '--fix', '--json'], root);
    expect(await snapshot(root, 'brains/brain-handbook')).toEqual(before);
    const generated = r.json().data.findings.filter((f: { code: CheckCode; brain: string }) => GENERATED_CODES.has(f.code) && f.brain === 'brain-handbook');
    expect(generated).toEqual([]);
  });

  it('--fix with a brain writes only that brain', async () => {
    const root = await fullWorkspace();
    await write(root, `${H}/notes/reading-list.md`, (await read(root, `${H}/notes/reading-list.md`)) + '\n[x](../../brain-handbook/index.md)\n');
    await writeFiles(root, { [`${P}/notes/new-note.md`]: NOTE() });
    const platformReadme = await read(root, `${P}/notes/README.md`);
    const r = await run(['doctor', 'personal', '--fix', '--json'], root);
    const fixed = r.json().data.fixed as { path: string }[];
    expect(fixed.length).toBeGreaterThan(0);
    expect(fixed.every((f) => f.path.startsWith(`${H}/`))).toBe(true);
    expect(await read(root, `${P}/notes/README.md`)).toBe(platformReadme);
  });

  it('the fixture is fully generated', async () => {
    const r = await run(['doctor', '--json'], await fullWorkspace());
    expect(r.json().data.findings).toEqual([]);
    expect(r.code).toBe(0);
  });
});

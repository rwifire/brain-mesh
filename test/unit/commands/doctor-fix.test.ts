import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { main } from '../../../src/main.js';
import { captureIo } from '../../helpers/io.js';
import { fullWorkspace } from '../../helpers/workspace.js';

const P = 'brains/brain-team-platform';
const H = 'brains/personal';

export const run = async (argv: string[], cwd: string) => {
  const io = captureIo();
  const code = await main(argv, io, { cwd });
  return { code, out: io.stdout(), err: io.stderr(), json: () => JSON.parse(io.stdout()) };
};
export const read = (root: string, rel: string) => readFile(join(root, ...rel.split('/')), 'utf8');
export const write = (root: string, rel: string, text: string) => writeFile(join(root, ...rel.split('/')), text, 'utf8');

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

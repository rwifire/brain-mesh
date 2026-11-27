import { cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../../src/workspace/create.js';
import { run } from '../helpers/cli.js';
import { FIXTURES_DIR, tempDir } from '../helpers/fixtures.js';
import { isolateGit } from '../helpers/git-env.js';
import { initWorkspace } from '../helpers/remotes.js';

const CHECKLIST = new URL('../../docs/scenarios.md', import.meta.url);

describe('personal scenarios', () => {
  it('seed notes pass doctor in a new workspace', async () => {
    const root = await tempDir('bm scenario ');
    await createWorkspace(root, { user: 'octo-user', pin: '0.4.2' });
    await cp(join(FIXTURES_DIR, 'scenarios', 'personal'), join(root, 'brains', 'personal'), { recursive: true });
    const r = await run(['doctor', '--fix', '--json'], root);
    expect(r.json().data.findings).toEqual([]);
    expect(r.code).toBe(0);
  });

  it('every scenario has setup, prompt and pass criteria', async () => {
    const text = await readFile(CHECKLIST, 'utf8');
    const sections = text.split(/^### /m).slice(1);
    const ids = sections.map((s) => s.split(/\s/)[0]);
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'U1']) expect(ids).toContain(id);
    for (const s of sections.filter((x) => /^[PSU]\d/.test(x))) {
      expect(s, s.slice(0, 20)).toContain('**Prompt:**');
      expect(s, s.slice(0, 20)).toContain('**Pass when:**');
    }
    expect(text).toContain('## Run log');
  });
});

describe('shared scenarios', () => {
  it('shared seed passes doctor', async () => {
    await isolateGit();
    const { root } = await initWorkspace();
    for (const id of ['brain-sandbox', 'brain-handbook']) {
      const made = await run(['brain', 'new', id, '--description', `The ${id} scenario brain.`, '--json'], root);
      expect(made.code, made.out).toBe(0);
      await cp(join(FIXTURES_DIR, 'scenarios', 'shared', id), join(root, 'brains', id), { recursive: true });
      const r = await run(['doctor', id, '--fix', '--json'], root);
      expect(r.json().data.findings, id).toEqual([]);
      expect(r.code, id).toBe(0);
    }
  });
});

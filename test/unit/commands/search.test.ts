import { describe, expect, it } from 'vitest';
import { run } from '../../helpers/cli.js';
import { fullWorkspace, writeFiles } from '../../helpers/workspace.js';

const note = (summary: string) => `---\ntype: note\nsummary: ${summary}\nupdated: 2026-11-25\n---\n# Title\n`;

describe('search command', () => {
  it('returns hits as JSON', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { 'brains/personal/notes/zeta-a.md': note('Zebracache strategy') });
    const r = await run(['search', 'zebracache', 'strategy', '--json'], root);
    expect(r.code).toBe(0);
    expect(r.json().data).toMatchObject({ query: 'zebracache strategy', terms: ['zebracache', 'strategy'], total: 1 });
    expect(r.json().data.hits[0]).toMatchObject({ brain: 'personal', path: 'brains/personal/notes/zeta-a.md', match: 'summary' });
  });

  it('no words', async () => {
    const r = await run(['search', '?!', '--json'], await fullWorkspace());
    expect(r.code).toBe(2);
    expect(r.json().error.code).toBe('E_USAGE');
  });

  it('an empty --brain is a usage error', async () => {
    const root = await fullWorkspace();
    for (const b of ['', ',']) {
      const r = await run(['search', 'zebracache', '--brain', b, '--json'], root);
      expect(r.code, b).toBe(2);
      expect(r.json().error).toMatchObject({ code: 'E_USAGE', message: '--brain needs at least one brain id' });
    }
  });

  it('--brain and --limit', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, {
      'brains/personal/notes/zeta-a.md': note('Zebracache'),
      'brains/personal/notes/zeta-b.md': note('Zebracache'),
      'brains/brain-team-platform/notes/zeta-c.md': note('Zebracache'),
    });
    const r = await run(['search', 'zebracache', '--brain', 'personal', '--limit', '1', '--json'], root);
    expect(r.json().data).toMatchObject({ brains: ['personal'], total: 2 });
    expect(r.json().data.hits).toHaveLength(1);
    expect((await run(['search', 'x', '--brain', 'nope', '--json'], root)).json().error.code).toBe('E_UNKNOWN_BRAIN');
  });

  it('outside a workspace', async () => {
    const { tempDir } = await import('../../helpers/fixtures.js');
    expect((await run(['search', 'x', '--json'], await tempDir())).json().error.code).toBe('E_NO_WORKSPACE');
  });

  it('human output', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { 'brains/personal/notes/zeta-a.md': note('Zebracache strategy') });
    const r = await run(['search', 'zebracache'], root);
    expect(r.out).toBe('brains/personal/notes/zeta-a.md  Zebracache strategy\nsearch: 1 of 1 match in 4 brains\n');
  });
});

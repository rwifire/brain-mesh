import { describe, expect, it } from 'vitest';
import { queryTerms, searchWorkspace } from '../../../src/search/search.js';
import { loadWorkspace } from '../../../src/workspace/load.js';
import { fullWorkspace, removePath, writeFiles } from '../../helpers/workspace.js';

const note = (summary: string, body: string, type = 'note') =>
  `---\ntype: ${type}\nsummary: ${summary}\nupdated: 2026-11-25\n---\n${body}`;

/** The full fixture plus `tree`, loaded. */
async function ws(tree: Record<string, string>) {
  const root = await fullWorkspace();
  await writeFiles(root, tree);
  return loadWorkspace(root);
}
const paths = (r: ReturnType<typeof searchWorkspace>) => r.data.hits.map((h) => h.path);

describe('queryTerms', () => {
  it('terms', () => expect(queryTerms('CI/CD  Runner-Cache!')).toEqual(['ci', 'cd', 'runner', 'cache']));
  it('no words', () => expect(queryTerms(' ?! ')).toEqual([]));
});

describe('searchWorkspace', () => {
  it('ß and ss find each other', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-strasse.md': note('Zebra Straße notes', '# Street\n\nText.\n'),
      'brains/personal/notes/zeta-upper.md': note('Zebra STRASSE notes', '# Upper\n\nText.\n'),
      'brains/personal/notes/zeta-mass.md': note('Zebra notes', '# Measure\n\nEine Maẞnahme.\n'),
    });
    const both = ['brains/personal/notes/zeta-strasse.md', 'brains/personal/notes/zeta-upper.md'];
    expect(paths(searchWorkspace(w, 'zebra strasse')).sort()).toEqual(both);
    expect(paths(searchWorkspace(w, 'zebra straße')).sort()).toEqual(both);
    expect(paths(searchWorkspace(w, 'massnahme'))).toEqual(['brains/personal/notes/zeta-mass.md']);
  });

  it('a trailing # stays in the title', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-csharp.md': note('Zebracsharp tips', '# Use C#\n\nText.\n'),
      'brains/personal/notes/zeta-done.md': note('Zebradone', '# Done ##\n\nText.\n'),
    });
    expect(searchWorkspace(w, 'zebracsharp').data.hits[0]!.title).toBe('Use C#');
    expect(searchWorkspace(w, 'zebradone').data.hits[0]!.title).toBe('Done');
  });

  it('a fenced comment is not the title', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-fence.md': note('Zebrafence', '```sh\n# comment\n```\n\n# Real\n\nText.\n'),
      'brains/personal/notes/zeta-tilde.md': note('Zebratilde', '~~~\n# comment\n~~~\n\nText only.\n'),
    });
    expect(searchWorkspace(w, 'zebrafence').data.hits[0]!.title).toBe('Real');
    expect(searchWorkspace(w, 'zebratilde').data.hits[0]!.title).toBe('zeta-tilde');
  });

  it('summary matches rank first', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': note('Zebracache quokkarunner strategy', '# Strategy\n\nShort.\n'),
      'brains/personal/notes/zeta-b.md': note('Something else', '# Other\n\nzebracache quokkarunner zebracache quokkarunner zebracache quokkarunner\n'),
    });
    const r = searchWorkspace(w, 'zebracache quokkarunner');
    expect(r.data.hits.map((h) => [h.path, h.match])).toEqual([
      ['brains/personal/notes/zeta-a.md', 'summary'],
      ['brains/personal/notes/zeta-b.md', 'text'],
    ]);
  });

  it('terms match at the start of a word, not inside one', async () => {
    const w = await ws({
      'brains/personal/notes/ci-pipeline.md': note('Our CI/CD pipeline and its runners', '# CI pipeline\n\nShort.\n'),
      'brains/personal/notes/decisions.md': note(
        'Specific decisions about pricing and policies',
        '# Decisions\n\nSpecific decisions, social policies, pricing decisions, precise specifics.\n',
      ),
    });
    const ci = paths(searchWorkspace(w, 'CI'));
    expect(ci[0]).toBe('brains/personal/notes/ci-pipeline.md');
    expect(ci).not.toContain('brains/personal/notes/decisions.md');
    expect(paths(searchWorkspace(w, 'runner'))).toContain('brains/personal/notes/ci-pipeline.md');
  });

  it('more hits rank higher within a tier', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': note('x', '# A\n\nzebracache once\n'),
      'brains/personal/notes/zeta-b.md': note('y', '# B\n\nzebracache zebracache zebracache\n'),
    });
    expect(paths(searchWorkspace(w, 'zebracache'))).toEqual(['brains/personal/notes/zeta-b.md', 'brains/personal/notes/zeta-a.md']);
  });

  it('ties break by brain order then path', async () => {
    const body = note('x', '# Same\n\nzebracache\n');
    const w = await ws({
      'brains/brain-team-platform/notes/zeta-a.md': body,
      'brains/personal/notes/zeta-z.md': body,
      'brains/personal/notes/zeta-b.md': body,
    });
    expect(paths(searchWorkspace(w, 'zebracache'))).toEqual([
      'brains/personal/notes/zeta-b.md',
      'brains/personal/notes/zeta-z.md',
      'brains/brain-team-platform/notes/zeta-a.md',
    ]);
  });

  it('all terms must match', async () => {
    const w = await ws({ 'brains/personal/notes/zeta-a.md': note('Zebracache', '# A\n') });
    expect(searchWorkspace(w, 'zebracache banana').data.hits).toEqual([]);
  });

  it('generated MOC lists are not searched', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': note('Zebracache rules', '# A\n'),
      'brains/personal/notes/README.md': '# Notes\n\n<!-- brain-mesh:index -->\n- [A](zeta-a.md) — Zebracache rules\n<!-- /brain-mesh:index -->\n',
    });
    expect(paths(searchWorkspace(w, 'zebracache'))).toEqual(['brains/personal/notes/zeta-a.md']);
  });

  it('AGENTS.md, CLAUDE.md and dot folders are skipped', async () => {
    const w = await ws({
      'brains/personal/AGENTS.md': '# Rules\n\nzebracache\n',
      'brains/personal/CLAUDE.md': '@AGENTS.md zebracache\n',
      'brains/personal/.trash/zeta.md': '# Old\n\nzebracache\n',
    });
    expect(searchWorkspace(w, 'zebracache').data.hits).toEqual([]);
  });

  it('inbox and daily are searched in the personal brain', async () => {
    const w = await ws({
      'brains/personal/inbox/2026-11-25-zeta.md': '# Raw\n\nzebracache\n',
      'brains/personal/daily/2026-11-25.md': '# Day\n\nzebracache\n',
    });
    expect(paths(searchWorkspace(w, 'zebracache')).sort()).toEqual([
      'brains/personal/daily/2026-11-25.md',
      'brains/personal/inbox/2026-11-25-zeta.md',
    ]);
  });

  it('punctuation splits terms', async () => {
    const w = await ws({ 'brains/personal/notes/zeta-a.md': note('x', '# A\n\nquokka_modules caching\n') });
    expect(paths(searchWorkspace(w, 'quokka modules'))).toEqual(['brains/personal/notes/zeta-a.md']);
  });

  it('umlauts and case', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': note('x', '# A\n\nDie Größe zählt\n'),
      'brains/personal/notes/zeta-b.md': note('y', '# B\n\nGröße im NFD\n'),
    });
    expect(paths(searchWorkspace(w, 'GRÖßE Zählt'))).toEqual(['brains/personal/notes/zeta-a.md']);
    expect(paths(searchWorkspace(w, 'größe')).sort()).toEqual(['brains/personal/notes/zeta-a.md', 'brains/personal/notes/zeta-b.md']);
  });

  it('broken frontmatter is still searched', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': '---\ntype: note\nsummary: never closed\n# A\n\nzebracache\n',
      'brains/personal/notes/zeta-b.md': '---\ntype: note\nsummary: 42\nupdated: 2026-11-25\n---\n# B\n\nzebracache\n',
    });
    const hits = searchWorkspace(w, 'zebracache').data.hits;
    expect(hits.map((h) => h.path).sort()).toEqual(['brains/personal/notes/zeta-a.md', 'brains/personal/notes/zeta-b.md']);
    expect(hits.find((h) => h.path.endsWith('zeta-b.md'))!.summary).toBeNull();
  });

  it('line and snippet', async () => {
    const long = 'x'.repeat(300);
    const w = await ws({ 'brains/personal/notes/zeta-a.md': note('s', `# A\n\nnothing\n   zebracache ${long}\n`) });
    const h = searchWorkspace(w, 'zebracache').data.hits[0]!;
    expect(h.line).toBe(9);
    expect(h.snippet!.startsWith('zebracache x')).toBe(true);
    expect(h.snippet!.length).toBe(200);
    expect(h.title).toBe('A');
  });

  it('title falls back to the file stem', async () => {
    const w = await ws({ 'brains/personal/notes/zeta-a.md': note('Zebracache', 'no heading\n') });
    expect(searchWorkspace(w, 'zebracache').data.hits[0]!.title).toBe('zeta-a');
  });

  it('--brain restricts and validates', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': note('Zebracache', '# A\n'),
      'brains/brain-team-platform/notes/zeta-b.md': note('Zebracache', '# B\n'),
    });
    expect(paths(searchWorkspace(w, 'zebracache', { brains: ['personal'] }))).toEqual(['brains/personal/notes/zeta-a.md']);
    expect(() => searchWorkspace(w, 'zebracache', { brains: ['nope'] })).toThrow(expect.objectContaining({ code: 'E_UNKNOWN_BRAIN' }));
  });

  it('a mount that is not cloned is skipped with a warning', async () => {
    const root = await fullWorkspace();
    await removePath(root, 'brains/brain-ideas');
    const r = searchWorkspace(await loadWorkspace(root), 'zebracache', { brains: ['personal', 'brain-ideas'] });
    expect(r.warnings.map((x) => x.code)).toEqual(['W_BRAIN_MISSING']);
    expect(r.data.brains).toEqual(['personal']);
  });

  it('--limit and total', async () => {
    const w = await ws({
      'brains/personal/notes/zeta-a.md': note('Zebracache', '# A\n'),
      'brains/personal/notes/zeta-b.md': note('Zebracache', '# B\n'),
      'brains/personal/notes/zeta-c.md': note('Zebracache', '# C\n'),
    });
    const r = searchWorkspace(w, 'zebracache', { limit: 2 });
    expect(r.data.hits).toHaveLength(2);
    expect(r.data.total).toBe(3);
  });

  it('2,000 notes in under a second', async () => {
    const tree: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) {
      tree[`brains/personal/notes/n-${i}.md`] = note(`Note ${i} about topic ${i % 50}`, `# N${i}\n\n${'lorem ipsum dolor sit amet '.repeat(40)}topic${i % 7}\n`);
    }
    const root = await fullWorkspace();
    await writeFiles(root, tree);
    const start = performance.now();
    const r = searchWorkspace(await loadWorkspace(root, { parseLinks: false }), 'topic 3 lorem');
    const ms = performance.now() - start;
    expect(r.data.total).toBeGreaterThan(0);
    expect(ms).toBeLessThan(process.env.CI ? 3000 : 1000);
  });
});

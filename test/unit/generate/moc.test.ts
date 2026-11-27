import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { humanize, mocEntry } from '../../../src/generate/moc.js';
import { planGenerated, type PlannedFile } from '../../../src/generate/plan.js';
import { loadWorkspace } from '../../../src/workspace/load.js';
import { fullWorkspace, removePath } from '../../helpers/workspace.js';
import { read, run, write } from '../../helpers/cli.js';

const P = 'brains/brain-team-platform';

async function mocs(root: string, brain: string): Promise<PlannedFile[]> {
  return planGenerated(await loadWorkspace(root), brain).files.filter((f) => f.code === 'moc-outdated');
}
const file = (files: PlannedFile[], path: string) => files.find((f) => f.path === path)!;

describe('humanize', () => {
  it('stem to title', () => {
    expect(humanize('runner-cache-strategy')).toBe('Runner cache strategy');
    expect(humanize('ci')).toBe('Ci');
  });
});

describe('mocEntry', () => {
  it('relative link, title, summary', () =>
    expect(mocEntry('maps', 'areas/ci/runner-cache-strategy.md', 'Runner cache strategy', 'How we cache node_modules on CI runners')).toBe(
      '- [Runner cache strategy](../areas/ci/runner-cache-strategy.md) — How we cache node_modules on CI runners\n',
    ));
  it('collapses whitespace in the summary', () => expect(mocEntry('', 'x.md', 'T', 'a\n  b')).toBe('- [T](x.md) — a b\n'));
  it('no summary', () => expect(mocEntry('', 'x.md', 'T', undefined)).toBe('- [T](x.md)\n'));
  it('MOC links survive # ? % ] and spaces', async () => {
    expect(mocEntry('notes', 'notes/c#-tips.md', 'C# [tips]', null)).toBe('- [C# \\[tips\\]](c%23-tips.md)\n');
    expect(mocEntry('notes', 'notes/my c#.md', 'T', null)).toBe('- [T](<my c%23.md>)\n');
    expect(mocEntry('', 'a?b/50%.md', 'T', null)).toBe('- [T](a%3Fb/50%25.md)\n');
    const root = await fullWorkspace();
    const body = '---\ntype: note\nsummary: Odd name.\nupdated: 2026-11-27\n---\n# Odd\n';
    for (const n of ['c#-tips.md', 'a?b.md', '50%.md', 'my c#.md']) {
      if (process.platform === 'win32' && n.includes('?')) continue; // not a valid Windows file name
      await write(root, `${P}/notes/${n}`, body);
    }
    expect((await run(['doctor', 'brain-team-platform', '--fix', '--json'], root)).code).not.toBe(3);
    const after = await run(['doctor', 'brain-team-platform', '--json'], root);
    const broken = after.json().data.findings.filter((f: { code: string }) => f.code === 'link-broken');
    expect(broken, after.out).toEqual([]);
  });
  it('angle-brackets paths with spaces', () => expect(mocEntry('notes', 'notes/a b.md', 'A b', undefined)).toBe('- [A b](<a b.md>)\n'));
});

describe('mocGenerator', () => {
  it('plans every MOC of the platform brain', async () => {
    const files = await mocs(await fullWorkspace(), 'brain-team-platform');
    expect(files.map((f) => f.path)).toEqual(
      ['index.md', 'areas/ci/README.md', 'areas/people/README.md', 'notes/README.md', 'maps/ci-performance.md', 'projects/runner-migration.md']
        .map((p) => `${P}/${p}`)
        .sort(),
    );
  });

  it('area README list', async () => {
    const files = await mocs(await fullWorkspace(), 'brain-team-platform');
    expect(file(files, `${P}/areas/ci/README.md`).next).toContain(
      '<!-- brain-mesh:index -->\n' +
        '- [Runner cache strategy](runner-cache-strategy.md) — How we cache node_modules on CI runners\n' +
        '- [Runner pools](runner-pools.md) — How to size and add runner pools\n' +
        '<!-- /brain-mesh:index -->\n',
    );
  });

  it('map and project lists', async () => {
    const files = await mocs(await fullWorkspace(), 'brain-team-platform');
    for (const p of ['maps/ci-performance.md', 'projects/runner-migration.md']) {
      expect(file(files, `${P}/${p}`).next).toContain('(../areas/ci/runner-cache-strategy.md)');
    }
  });

  it('root index', async () => {
    const root = await fullWorkspace();
    const next = file(await mocs(root, 'brain-team-platform'), `${P}/index.md`).next;
    const block = next.slice(next.indexOf('<!-- brain-mesh:index -->'));
    const links = [...block.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual(['areas/ci/README.md', 'areas/people/README.md', 'maps/ci-performance.md', 'notes/README.md', 'projects/runner-migration.md']);
    await removePath(root, 'brains/brain-ideas/index.md');
    const ideas = file(await mocs(root, 'brain-ideas'), 'brains/brain-ideas/index.md');
    expect(ideas.current).toBeNull();
    expect(ideas.next.startsWith('# Ideas\n\n')).toBe(true);
  });

  it('CRLF kept', async () => {
    const root = await fullWorkspace();
    const rel = `${P}/areas/ci/README.md`;
    await write(root, rel, (await read(root, rel)).replace(/\n/g, '\r\n'));
    await run(['doctor', '--fix'], root);
    const text = await readFile(join(root, ...rel.split('/')), 'utf8');
    expect(text).toContain('<!-- brain-mesh:index -->\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    const again = (await run(['doctor', '--json'], root)).json().data.findings;
    expect(again.filter((f: { path: string }) => f.path === rel)).toEqual([]);
  });

  it('invalid markers', async () => {
    const root = await fullWorkspace();
    const rel = `${P}/areas/ci/README.md`;
    const broken = (await read(root, rel)) + '\n<!-- brain-mesh:index -->\n';
    await write(root, rel, broken);
    const r = await run(['doctor', '--json'], root);
    expect(r.json().data.findings).toContainEqual(expect.objectContaining({ code: 'generated-block-invalid', path: rel }));
    await run(['doctor', '--fix'], root);
    expect(await read(root, rel)).toBe(broken);
  });
});

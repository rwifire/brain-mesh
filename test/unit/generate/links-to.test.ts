import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { linksToFor, withLinksTo } from '../../../src/generate/links-to.js';
import { loadWorkspace, type WorkspaceModel } from '../../../src/workspace/load.js';
import { fullWorkspace, writeFiles } from '../../helpers/workspace.js';

const brain = (ws: WorkspaceModel, id: string) => ws.brains.find((b) => b.id === id)!;
const P = 'brains/brain-team-platform';

async function append(root: string, rel: string, text: string): Promise<void> {
  const file = join(root, ...rel.split('/'));
  await writeFile(file, (await readFile(file, 'utf8')) + text, 'utf8');
}

describe('linksToFor', () => {
  it('outgoing brains, sorted and unique', async () => {
    const root = await fullWorkspace();
    let ws = await loadWorkspace(root);
    expect(linksToFor(ws, brain(ws, 'brain-team-platform'))).toEqual(['brain-handbook']);
    expect(linksToFor(ws, brain(ws, 'personal'))).toEqual(['brain-team-platform']);
    await append(root, `${P}/notes/build-glossary.md`, '\n[a](../../brain-sre/x.md)\n[b](../../brain-handbook/index.md)\n');
    ws = await loadWorkspace(root);
    expect(linksToFor(ws, brain(ws, 'brain-team-platform'))).toEqual(['brain-handbook', 'brain-sre']);
  });

  it('ignores inbox, own brain and external links', async () => {
    const root = await fullWorkspace();
    await writeFiles(root, { 'brains/personal/inbox/x.md': '[a](../../brain-ideas/notes/first-idea.md)\n' });
    await append(root, `${P}/notes/build-glossary.md`, '\n[a](../index.md)\n[b](https://example.com/brains/x)\n[c](../../Not_A_Brain/x.md)\n');
    const ws = await loadWorkspace(root);
    expect(linksToFor(ws, brain(ws, 'personal'))).toEqual(['brain-team-platform']);
    expect(linksToFor(ws, brain(ws, 'brain-team-platform'))).toEqual(['brain-handbook']);
  });
});

describe('withLinksTo', () => {
  const input = '# yaml-language-server: $schema=x\nid: a # the id\nname: A\n';

  it('keeps comments', () => {
    const out = withLinksTo(input, ['b', 'c']);
    expect(out.startsWith(input)).toBe(true);
    expect(out.trimEnd().split('\n').pop()).toMatch(/^links_to: \[/);
    expect(parse(out).links_to).toEqual(['b', 'c']);
    expect(withLinksTo(out, [])).toBe(input);
  });

  it('updates in place', () => {
    const out = withLinksTo('id: a\nlinks_to: [x]\nname: A\n', ['y']);
    expect(out.split('\n')[1]).toMatch(/^links_to: \[ ?y ?\]$/);
    expect(out.split('\n')[2]).toBe('name: A');
  });

  it('no change when equal', () => {
    const once = withLinksTo(input, ['b']);
    expect(withLinksTo(once, ['b'])).toBe(once);
  });
});

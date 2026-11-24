import { describe, expect, it } from 'vitest';
import { classifyTarget, extractLinks } from '../../../src/brain/links.js';

describe('extractLinks', () => {
  it.each([
    ['[a](../ci/runner.md "t")', ['../ci/runner.md']],
    ['[a](<a b.md>)', ['a b.md']],
    ['[a](x(1).md)', ['x(1).md']],
    ['[a][r]\n\n[r]: ./ref.md', ['./ref.md']],
    ['![d](img/diagram.png)', ['img/diagram.png']],
    ['```\n[a](in-fence.md)\n```', []],
    ['`[a](inline.md)`', []],
    ['[[wiki-link]]', []],
    ['A claim.[^1]\n\n[^1]: Ibid.', []],
  ])('%j', (md, urls) => expect(extractLinks(md).map((l) => l.url)).toEqual(urls));

  it('line numbers', () => expect(extractLinks('x\n\n[a](b.md)')).toEqual([{ url: 'b.md', line: 3 }]));
});

describe('classifyTarget', () => {
  it.each([
    ['https://x.y/a', { kind: 'external' }],
    ['mailto:a@b.c', { kind: 'external' }],
    ['obsidian://open?vault=x', { kind: 'external' }],
    ['//cdn/x.png', { kind: 'external' }],
    ['#heading', { kind: 'anchor' }],
    ['', { kind: 'anchor' }],
    ['../ci/a.md#h', { kind: 'path', path: '../ci/a.md' }],
    ['a.md?x=1', { kind: 'path', path: 'a.md' }],
    ['a%20b.md', { kind: 'path', path: 'a b.md' }],
    ['a%zz.md', { kind: 'path', path: 'a%zz.md' }],
    ['C:/x.md', { kind: 'path', path: 'C:/x.md' }],
  ])('%j', (url, target) => expect(classifyTarget(url)).toEqual(target));
});

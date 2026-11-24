import { describe, expect, it } from 'vitest';
import { parseFrontmatter, splitFrontmatter } from '../../../src/brain/frontmatter.js';

describe('splitFrontmatter', () => {
  it('splits frontmatter and body', () =>
    expect(splitFrontmatter('---\ntype: note\n---\n# T\n')).toEqual({
      yaml: 'type: note\n', body: '# T\n', bodyStartLine: 4, unterminated: false,
    }));

  it('no frontmatter', () =>
    expect(splitFrontmatter('# T\n')).toEqual({ yaml: null, body: '# T\n', bodyStartLine: 1, unterminated: false }));

  it('--- not on the first line is body', () => expect(splitFrontmatter('\n---\na: 1\n---\n').yaml).toBeNull());

  it('closes on ...', () => expect(splitFrontmatter('---\na: 1\n...\nx').yaml).toBe('a: 1\n'));

  it('CRLF and BOM split like LF', () => {
    const r = splitFrontmatter('﻿---\r\ntype: note\r\n---\r\nbody');
    expect(r.bodyStartLine).toBe(4);
    expect(r.body).toBe('body');
    expect(parseFrontmatter(r.yaml!).data).toEqual({ type: 'note' });
  });

  it('unterminated', () => {
    const r = splitFrontmatter('---\na: 1\n');
    expect(r.unterminated).toBe(true);
    expect(r.yaml).toBeNull();
    expect(r.body).toBe('---\na: 1\n');
  });

  it('empty frontmatter block', () =>
    expect(splitFrontmatter('---\n---\nx')).toMatchObject({ yaml: '', body: 'x', bodyStartLine: 3 }));
});

describe('parseFrontmatter', () => {
  it('parse errors', () => {
    expect(parseFrontmatter('a: [1\n').error).not.toBeNull();
    expect(parseFrontmatter('- a\n').error).toBe('frontmatter is not a mapping');
    expect(parseFrontmatter('a: 1\na: 2\n').error).not.toBeNull();
  });

  it('empty mapping', () => expect(parseFrontmatter('')).toEqual({ data: {}, error: null }));

  it('unquoted dates stay strings', () =>
    expect(parseFrontmatter('updated: 2026-11-21\n').data).toEqual({ updated: '2026-11-21' }));
});

import { describe, expect, it } from 'vitest';
import { parseNote } from '../../../src/brain/note.js';

describe('parseNote', () => {
  it('line numbers count frontmatter lines', () => {
    const text = '---\ntype: note\n---\n\n[a](b.md)\n';
    expect(parseNote(text).links[0]!.line).toBe(5);
    expect(parseNote(text.replace(/\n/g, '\r\n')).links[0]!.line).toBe(5);
    expect(parseNote(text).frontmatter).toEqual({ type: 'note' });
  });

  it('no frontmatter', () =>
    expect(parseNote('# T\n')).toMatchObject({ frontmatter: null, frontmatterError: null }));

  it('bad yaml', () => {
    const r = parseNote('---\na: [\n---\n');
    expect(r.frontmatterError).not.toBeNull();
    expect(r.frontmatter).toBeNull();
  });

  it('unterminated', () => expect(parseNote('---\na: 1\n').frontmatterError).toBe('frontmatter is not closed with ---'));
});

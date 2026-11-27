import { describe, expect, it } from 'vitest';
import { prSlug } from '../../../src/contribute/slug.js';

describe('prSlug', () => {
  it('slug', () => {
    expect(prSlug('Add runner note')).toBe('add-runner-note');
    expect(prSlug('Füge „Runner“-Notiz hinzu!\nmore')).toBe('fuge-runner-notiz-hinzu');
    expect(prSlug('!!!')).toBe('change');
    expect(prSlug('')).toBe('change');
    const long = prSlug('word '.repeat(20));
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long).not.toMatch(/-$/);
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

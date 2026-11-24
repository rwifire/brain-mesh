import { describe, expect, it } from 'vitest';
import { isIsoDate, NoteFrontmatterSchema } from '../../../src/schemas/note.js';

const valid = { type: 'note', summary: 'How we cache node_modules on CI runners', maps: ['ci-performance'], updated: '2026-11-21' };

describe('NoteFrontmatterSchema', () => {
  it('accepts the spec example', () => expect(NoteFrontmatterSchema.safeParse(valid).success).toBe(true));

  it('keeps unknown keys', () => expect(NoteFrontmatterSchema.parse({ ...valid, tags: ['x'] })).toHaveProperty('tags'));

  it.each([
    ['missing summary', { ...valid, summary: undefined }],
    ['empty summary', { ...valid, summary: '' }],
    ['unknown type', { ...valid, type: 'meeting' }],
    ['impossible date', { ...valid, updated: '2026-02-30' }],
    ['german date', { ...valid, updated: '21.11.2026' }],
    ['datetime', { ...valid, updated: '2026-11-21T10:00' }],
    ['maps not a list', { ...valid, maps: 'ci' }],
    ['owner without @', { ...valid, owner: 'acme' }],
  ])('rejects %s', (_n, input) => expect(NoteFrontmatterSchema.safeParse(input).success).toBe(false));
});

describe('isIsoDate', () => {
  it.each([
    ['2024-02-29', true],
    ['2023-02-29', false],
    ['2026-13-01', false],
  ])('%s → %s', (s, ok) => expect(isIsoDate(s)).toBe(ok));
});

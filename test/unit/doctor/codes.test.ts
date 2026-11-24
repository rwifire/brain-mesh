import { describe, expect, it } from 'vitest';
import { CHECKS, checksMarkdown } from '../../../src/doctor/codes.js';

describe('CHECKS', () => {
  it('docs/doctor-checks.md is up to date', async () =>
    expect(checksMarkdown()).toMatchFileSnapshot('../../../docs/doctor-checks.md'));

  it('codes are kebab-case', () => {
    for (const code of Object.keys(CHECKS)) expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('28 checks', () => expect(Object.keys(CHECKS)).toHaveLength(28));
});

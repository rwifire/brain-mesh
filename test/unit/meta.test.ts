import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../src/meta.js';

describe('packageVersion', () => {
  it('returns the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(packageVersion()).toBe(pkg.version);
    expect(packageVersion()).toBe('0.0.0');
  });
});

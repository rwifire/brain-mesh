import { describe, expect, it } from 'vitest';
import { repoNameFromUrl } from '../../../src/workspace/url.js';

describe('repoNameFromUrl', () => {
  it.each([
    ['git@github.com:acme/brain-x.git', 'brain-x'],
    ['https://github.com/acme/brain-x', 'brain-x'],
    ['https://github.com/acme/brain-x.git/', 'brain-x'],
    ['ssh://git@github.com/acme/brain-x.git', 'brain-x'],
    ['../brain-x', 'brain-x'],
    ['', null],
  ])('%j → %j', (url, name) => expect(repoNameFromUrl(url)).toBe(name));
});

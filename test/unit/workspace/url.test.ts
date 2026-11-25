import { describe, expect, it } from 'vitest';
import { isNetworkUrl, repoNameFromUrl } from '../../../src/workspace/url.js';

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

describe('isNetworkUrl', () => {
  it('remote URLs and local paths', () => {
    for (const u of ['https://x/y', 'ssh://git@x/y', 'git@x:y.git']) expect(isNetworkUrl(u), u).toBe(true);
    for (const u of ['file:///srv/a.git', '/srv/a.git', 'C:\\a\\b', '..\\a', '../remotes/a.git']) expect(isNetworkUrl(u), u).toBe(false);
  });
});

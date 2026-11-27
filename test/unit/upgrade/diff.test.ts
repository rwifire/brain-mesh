import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../../src/upgrade/diff.js';

describe('unifiedDiff', () => {
  it('diff of an edit', async () => {
    const d = await unifiedDiff('AGENTS.md', 'a\nb\n', 'a\nc\n');
    expect(d).toContain('--- a/AGENTS.md');
    expect(d).toContain('+++ b/AGENTS.md');
    expect(d).toMatch(/^-b$/m);
    expect(d).toMatch(/^\+c$/m);
    expect(d).not.toContain('diff --git');
  });

  it('new file', async () => {
    const d = await unifiedDiff('notes/x.md', null, 'a\n');
    expect(d).toContain('--- /dev/null');
    expect(d).toContain('+++ b/notes/x.md');
    expect(d).toMatch(/^\+a$/m);
  });

  it('removed file', async () => {
    const d = await unifiedDiff('x.md', 'a\n', null);
    expect(d).toContain('--- a/x.md');
    expect(d).toContain('+++ /dev/null');
    expect(d).toMatch(/^-a$/m);
  });

  it('equal', async () => {
    expect(await unifiedDiff('x', 'a\r\n', 'a\n')).toBe('');
    expect(await unifiedDiff('x', null, null)).toBe('');
  });

  it('paths with spaces and dots', async () => {
    const d = await unifiedDiff('brains/.obsidian/app.json', '{"a": 1}\n', '{"a": 2}\n');
    expect(d).toContain('--- a/brains/.obsidian/app.json');
    expect(d).toMatch(/^\+\{"a": 2\}$/m);
  });
});

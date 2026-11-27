import { describe, expect, it } from 'vitest';
import { git, gitOk, networkEnv } from '../../src/git.js';
import { tempDir } from '../helpers/fixtures.js';

describe('git runner', () => {
  it('git returns non-zero exits instead of throwing', async () => {
    const r = await git(await tempDir(), ['log']);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/^fatal:/);
  });

  it('gitOk throws E_GIT with the first stderr line', async () => {
    await expect(gitOk(await tempDir(), ['log'])).rejects.toMatchObject({ code: 'E_GIT', message: expect.stringMatching(/^git log failed: fatal:[^\n]*$/) });
  });

  it('network git calls never prompt', () => {
    expect(networkEnv({})).toEqual({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' });
    expect(networkEnv({ GIT_SSH_COMMAND: 'ssh -i key' })).toEqual({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });
  });
});

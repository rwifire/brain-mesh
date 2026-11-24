import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '../../../src/workspace/find.js';
import { fixture, tempDir } from '../../helpers/fixtures.js';

describe('findWorkspaceRoot', () => {
  it('finds the root from a subfolder', async () => {
    const ws = await fixture('workspace-full');
    expect(await findWorkspaceRoot(join(ws, 'brains', 'personal', 'notes'))).toBe(ws);
  });

  it('finds the root from the root', async () => {
    const ws = await fixture('workspace-full');
    expect(await findWorkspaceRoot(ws)).toBe(ws);
  });

  it('null outside a workspace', async () => expect(await findWorkspaceRoot(await tempDir())).toBeNull());
});

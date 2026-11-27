import { describe, expect, it } from 'vitest';
import { editMesh } from '../../../src/workspace/mesh-edit.js';
import { read, write } from '../../helpers/cli.js';
import { tempDir } from '../../helpers/fixtures.js';

const MESH = [
  '# yaml-language-server: $schema=https://unpkg.com/brain-mesh-ai-workspace/schemas/mesh.schema.json',
  'version: 1',
  'brain_mesh: 0.4.2',
  'user: octo-user',
  '# shared brains I use',
  'mounts:',
  '  - id: brain-a',
  '    url: /srv/a.git',
  '    mode: read # handbook',
  '  - id: brain-b',
  '    url: /srv/b.git',
  '    mode: contribute',
  '  - id: brain-c',
  '    mode: contribute',
  '',
].join('\n');

async function root(text = MESH) {
  const dir = await tempDir('bm mesh edit ');
  await write(dir, 'mesh.yaml', text);
  return dir;
}

describe('editMesh', () => {
  it('comments survive', async () => {
    const dir = await root();
    const config = await editMesh(dir, (m) => [...m, { id: 'brain-x', url: '/srv/x.git', mode: 'read' }]);
    expect(config.mounts.map((m) => m.id)).toEqual(['brain-a', 'brain-b', 'brain-c', 'brain-x']);
    expect(await read(dir, 'mesh.yaml')).toBe(`${MESH}  - id: brain-x\n    url: /srv/x.git\n    mode: read\n`);

    await editMesh(dir, (m) => m.filter((x) => x.id !== 'brain-b'));
    const text = await read(dir, 'mesh.yaml');
    expect(text.startsWith(MESH.split('  - id: brain-b')[0]!)).toBe(true);
    expect(text).toContain('    mode: read # handbook\n  - id: brain-c\n');
    expect(text).not.toContain('brain-b');
  });

  it('changing a mount keeps its place and comments', async () => {
    const dir = await root();
    await editMesh(dir, (m) => m.map((x) => (x.id === 'brain-c' ? { ...x, url: '/srv/c.git' } : x)));
    expect(await read(dir, 'mesh.yaml')).toBe(MESH.replace('  - id: brain-c\n', '  - id: brain-c\n    url: /srv/c.git\n'));
  });

  it('an empty mount list', async () => {
    const dir = await root('version: 1\nbrain_mesh: 0.4.2\nuser: octo-user\nmounts: []\n');
    await editMesh(dir, (m) => [...m, { id: 'brain-x', mode: 'contribute' }]);
    const again = await editMesh(dir, (m) => m);
    expect(again.mounts).toEqual([{ id: 'brain-x', mode: 'contribute' }]);
    await editMesh(dir, () => []);
    expect((await editMesh(dir, (m) => m)).mounts).toEqual([]);
  });

  it('CRLF stays CRLF', async () => {
    const dir = await root(MESH.replace(/\n/g, '\r\n'));
    await editMesh(dir, (m) => [...m, { id: 'brain-x', mode: 'read', url: '/srv/x.git' }]);
    const text = await read(dir, 'mesh.yaml');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(text).toContain('  - id: brain-x\r\n');
  });

  it('an invalid mesh.yaml is not touched', async () => {
    const broken = await root('version: 1\nmounts: [\n');
    await expect(editMesh(broken, (m) => m)).rejects.toMatchObject({ code: 'E_MESH_INVALID' });
    expect(await read(broken, 'mesh.yaml')).toBe('version: 1\nmounts: [\n');

    const dir = await root();
    await expect(editMesh(dir, (m) => [...m, { id: 'brain-x', mode: 'write' as 'read' }])).rejects.toMatchObject({ code: 'E_MESH_INVALID' });
    expect(await read(dir, 'mesh.yaml')).toBe(MESH);
  });
});

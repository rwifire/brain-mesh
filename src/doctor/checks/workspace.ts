import { satisfies } from 'semver';
import { repoNameFromUrl } from '../../workspace/url.js';
import type { WorkspaceModel } from '../../workspace/load.js';
import { finding, type Finding } from '../finding.js';

/** mesh.yaml, mounts, manifests and brain ids. */
export function workspaceChecks(ws: WorkspaceModel): Finding[] {
  const out: Finding[] = [];
  if (ws.meshError !== null) {
    out.push(finding('mesh-invalid', { brain: null, path: 'mesh.yaml', message: `mesh.yaml is invalid: ${ws.meshError}` }));
  }

  const counts = new Map<string, number>();
  for (const m of ws.mesh?.mounts ?? []) counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (id === 'personal') {
      out.push(finding('mount-id-collision', { brain: null, path: 'mesh.yaml', message: 'mount id personal is reserved for the personal brain' }));
    } else if (n > 1) {
      out.push(finding('mount-id-collision', { brain: null, path: 'mesh.yaml', message: `mount id ${id} is listed ${n} times` }));
    }
  }

  for (const id of ws.missing) {
    const message = id === 'personal' ? 'the personal brain brains/personal is missing' : `${id} is in mesh.yaml but brains/${id} is missing; run brain-mesh sync`;
    out.push(finding('brain-missing', { brain: id, path: `brains/${id}`, message }));
  }
  for (const id of ws.unlisted) {
    out.push(finding('brain-unlisted', { brain: id, path: `brains/${id}`, message: `brains/${id} is not listed in mesh.yaml` }));
  }

  for (const b of ws.brains) {
    if (b.dirty === true) {
      out.push(finding('read-mount-dirty', { brain: b.id, path: b.dir, message: `read mount ${b.id} has uncommitted changes` }));
    }
    const path = `${b.dir}/brain.yaml`;
    if (b.manifestError !== null) {
      out.push(finding('manifest-invalid', { brain: b.id, path, message: `brain.yaml is invalid: ${b.manifestError}` }));
      continue;
    }
    const m = b.manifest!;
    if (m.id !== b.id) {
      out.push(finding('brain-id-mismatch', { brain: b.id, path, message: `brain.yaml id ${m.id} does not match the folder name ${b.id}` }));
    }
    const repo = b.type === 'shared' && b.mount?.url ? repoNameFromUrl(b.mount.url) : null;
    if (repo !== null && repo !== m.id) {
      out.push(finding('brain-id-mismatch', { brain: b.id, path, message: `brain id ${m.id} does not match the repository name ${repo}` }));
    }
    if (ws.mesh !== null && m.requires !== undefined && !satisfies(ws.mesh.brain_mesh, m.requires, { includePrerelease: true })) {
      out.push(finding('requires-unmet', { brain: b.id, path, message: `brain requires brain-mesh ${m.requires}; the workspace pins ${ws.mesh.brain_mesh}` }));
    }
  }
  return out;
}

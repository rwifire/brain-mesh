import type { Host, OwnerStatus, RepoRef } from '../host/host.js';
import { CliError, type Warning } from '../output.js';
import { Owner } from '../schemas/common.js';
import { isNetworkUrl } from '../workspace/url.js';
import type { BrainModel, WorkspaceModel } from '../workspace/load.js';
import { finding, type Finding } from './finding.js';
import { wsPath } from './layout.js';

/** Host failures that mean "cannot ask now", not a bug: doctor skips its network checks. */
const SKIP_CODES = new Set(['E_OFFLINE', 'E_GH_AUTH', 'E_GH_MISSING', 'E_HOST']);
const WRITE = new Set(['admin', 'maintain', 'write']);
const SKIPPED = 'network checks (owners, push rights) skipped';

interface Target {
  brain: BrainModel;
  repo: RepoRef;
}

/** `[path, owner]` for the brain owner and every area README owner that is valid syntax. */
function ownersOf(b: BrainModel): [string, string][] {
  const out: [string, string][] = [];
  if (b.manifest !== null) out.push([wsPath(b.dir, 'brain.yaml'), b.manifest.owner]);
  for (const n of b.notes) {
    if (!/^areas\/[^/]+\/README\.md$/.test(n.path)) continue;
    const owner = Owner.safeParse(n.frontmatter?.owner);
    if (owner.success) out.push([wsPath(b.dir, n.path), owner.data]);
  }
  return out;
}

/**
 * Owner validity and push rights (spec 8) for shared `contribute` mounts on the host. A failure of
 * the host on any call drops every network finding for one `W_NETWORK_SKIPPED` (plan decision 3).
 */
export async function hostChecks(
  ws: WorkspaceModel,
  host: Host,
  o: { brain?: string; offline: boolean },
): Promise<{ findings: Finding[]; warnings: Warning[] }> {
  const warnings: Warning[] = [];
  const targets: Target[] = [];
  for (const b of ws.brains) {
    if (o.brain !== undefined && b.id !== o.brain) continue;
    const url = b.mount?.url;
    if (b.type !== 'shared' || b.mount?.mode !== 'contribute' || url === undefined || b.manifest === null) continue;
    const repo = host.repoOf(url);
    if (repo !== null) targets.push({ brain: b, repo });
    else if (isNetworkUrl(url)) {
      warnings.push({ code: 'W_HOST_UNSUPPORTED', message: `${b.id}: ${url} is not on github.com; owners and push rights are not checked` });
    }
  }
  if (targets.length === 0) return { findings: [], warnings };
  if (o.offline) return { findings: [], warnings: [...warnings, { code: 'W_NETWORK_SKIPPED', message: `${SKIPPED}: --offline` }] };

  const findings: Finding[] = [];
  const statuses = new Map<string, OwnerStatus>();
  const unchecked = new Set<string>();
  try {
    for (const { brain: b, repo } of targets) {
      const full = `${repo.owner}/${repo.name}`;
      const permission = await host.permission(repo);
      if (!WRITE.has(permission)) {
        findings.push(
          finding('push-rights-missing', {
            brain: b.id,
            path: wsPath(b.dir, 'brain.yaml'),
            message: `you have ${permission} access to ${full}; contribute needs write: ask the owner for write access or mount it as read`,
          }),
        );
      }
      for (const [path, owner] of ownersOf(b)) {
        const key = `${owner}|${full}`;
        let status = statuses.get(key);
        if (status === undefined) {
          status = await host.ownerStatus(owner, repo);
          statuses.set(key, status);
        }
        if (status === 'not-found') {
          findings.push(finding('owner-not-found', { brain: b.id, path, message: `owner ${owner} does not exist on github.com, or you cannot see it` }));
        } else if (status === 'no-write') {
          findings.push(finding('owner-no-write', { brain: b.id, path, message: `owner ${owner} has no write access to ${full}, so GitHub ignores it in CODEOWNERS` }));
        } else if (status === 'unknown' && !unchecked.has(key)) {
          unchecked.add(key);
          warnings.push({ code: 'W_OWNER_UNCHECKED', message: `could not check owner ${owner} on ${full}; GitHub would not say` });
        }
      }
    }
  } catch (err) {
    if (err instanceof CliError && SKIP_CODES.has(err.code)) {
      return { findings: [], warnings: [...warnings.filter((w) => w.code === 'W_HOST_UNSUPPORTED'), { code: 'W_NETWORK_SKIPPED', message: `${SKIPPED}: ${err.message}` }] };
    }
    throw err;
  }
  return { findings, warnings };
}

import type { Host } from '../host/host.js';
import { CliError, ErrorCode, type Warning } from '../output.js';

const PUSH_ROLES = new Set(['admin', 'maintain', 'write']);

/**
 * Throws `E_NO_PUSH_RIGHTS` when `url` is on the host and the user cannot push to it; a host
 * error (`E_OFFLINE`, `E_GH_AUTH`, ...) is rethrown with `hint`. Warns `W_PUSH_RIGHTS_UNCHECKED`
 * when the URL is not on the host (chunk 9 plan, decision 3).
 */
export async function checkPushRights(host: Host, url: string, warnings: Warning[], hint: string): Promise<void> {
  const repo = host.repoOf(url);
  if (repo === null) {
    warnings.push({ code: 'W_PUSH_RIGHTS_UNCHECKED', message: `${url} is not on github.com, so push rights were not checked; a later push may fail` });
    return;
  }
  let permission: string;
  try {
    permission = await host.permission(repo);
  } catch (err) {
    if (err instanceof CliError) throw new CliError(err.code, `${err.message}; push rights could not be checked (${hint})`, err.exitCode);
    throw err;
  }
  if (!PUSH_ROLES.has(permission)) {
    throw new CliError(ErrorCode.NoPushRights, `you have ${permission} access to ${repo.owner}/${repo.name}, not write (${hint})`);
  }
}

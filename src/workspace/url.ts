/**
 * Whether a mount URL points at a server: `scheme://` other than `file://`, or scp form
 * `user@host:path`. Local paths (`/srv/a.git`, `C:\a`, `../a`) and `file://` URLs are not.
 */
export function isNetworkUrl(url: string): boolean {
  const u = url.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(u);
  if (scheme !== null) return scheme[1]!.toLowerCase() !== 'file';
  return /^[^\s/\\@]+@[^\s/\\:]+:/.test(u);
}

/**
 * The repository name a clone URL points to: its last path segment without `.git`.
 * Handles scp-style (`git@host:org/name.git`), `https://`, `ssh://` and local paths.
 */
export function repoNameFromUrl(url: string): string | null {
  const trimmed = url.trim().replace(/[/\\]+$/, '');
  const last = trimmed.split(/[/\\:]/).pop() ?? '';
  const name = last.replace(/\.git$/, '');
  return name === '' ? null : name;
}

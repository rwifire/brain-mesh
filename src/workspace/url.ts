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

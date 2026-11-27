const MAX = 48;

/**
 * The branch slug for a commit message (chunk 10 plan, decision 5): its first line folded to
 * ASCII, lowercase kebab-case, at most 48 characters, never empty.
 */
export function prSlug(message: string): string {
  const first = message.split(/\r?\n/)[0] ?? '';
  const words = first
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '');
  let slug = '';
  for (const w of words) {
    const next = slug === '' ? w : `${slug}-${w}`;
    if (next.length > MAX) {
      if (slug === '') slug = w.slice(0, MAX);
      break;
    }
    slug = next;
  }
  return slug === '' ? 'change' : slug;
}

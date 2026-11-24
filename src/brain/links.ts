import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit } from 'unist-util-visit';

export interface Link {
  /** Destination as written, with escapes and character references resolved. */
  url: string;
  /** 1-based line within the markdown that was parsed. */
  line: number;
}

/** Inline links, images and link definitions in document order. Reference links are covered by their definition. */
export function extractLinks(markdown: string): Link[] {
  const tree: Root = fromMarkdown(markdown);
  const links: Link[] = [];
  visit(tree, (node) => {
    // `[^1]: text` parses as a definition without the GFM footnote extension; it is not a link.
    if (node.type === 'definition' && node.label?.startsWith('^')) return;
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      links.push({ url: node.url, line: node.position?.start.line ?? 1 });
    }
  });
  return links;
}

export type Target = { kind: 'external' } | { kind: 'anchor' } | { kind: 'path'; path: string };

/** External: a scheme of two or more characters, or `//`. A one-letter "scheme" is a drive letter, so a path. */
export function classifyTarget(url: string): Target {
  if (/^[a-z][a-z0-9+.-]+:/i.test(url) || url.startsWith('//')) return { kind: 'external' };
  if (url === '' || url.startsWith('#')) return { kind: 'anchor' };
  const cut = url.search(/[#?]/);
  const raw = cut === -1 ? url : url.slice(0, cut);
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    // malformed percent-encoding: keep the text as written
  }
  return { kind: 'path', path };
}

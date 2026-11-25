import { parseFrontmatter, splitFrontmatter } from './frontmatter.js';
import { extractLinks, type Link } from './links.js';

export interface ParsedNote {
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  /** Line numbers count from the top of the file, frontmatter included. */
  links: Link[];
}

/** `links: false` skips the markdown parse (links come back empty); `search` needs no links. */
export function parseNote(text: string, o: { links?: boolean } = {}): ParsedNote {
  const split = splitFrontmatter(text);
  let frontmatter: Record<string, unknown> | null = null;
  let frontmatterError: string | null = null;
  if (split.unterminated) {
    frontmatterError = 'frontmatter is not closed with ---';
  } else if (split.yaml !== null) {
    const parsed = parseFrontmatter(split.yaml);
    frontmatter = parsed.data;
    frontmatterError = parsed.error;
  }
  const offset = split.bodyStartLine - 1;
  if (o.links === false) return { frontmatter, frontmatterError, links: [] };
  const links = extractLinks(split.body).map((l) => ({ url: l.url, line: l.line + offset }));
  return { frontmatter, frontmatterError, links };
}

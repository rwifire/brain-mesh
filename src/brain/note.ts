import { parseFrontmatter, splitFrontmatter } from './frontmatter.js';
import { extractLinks, type Link } from './links.js';

export interface ParsedNote {
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  /** Line numbers count from the top of the file, frontmatter included. */
  links: Link[];
}

export function parseNote(text: string): ParsedNote {
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
  const links = extractLinks(split.body).map((l) => ({ url: l.url, line: l.line + offset }));
  return { frontmatter, frontmatterError, links };
}

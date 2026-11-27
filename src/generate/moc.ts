import { posix } from 'node:path';
import { finding, type Finding } from '../doctor/finding.js';
import { placeOf } from '../doctor/layout.js';
import type { NoteModel } from '../workspace/load.js';
import { replaceBlock } from './blocks.js';
import { planned, type Generator, type PlannedFile } from './planned.js';

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `runner-cache-strategy` → `Runner cache strategy` (plan Ruling 1). */
export function humanize(stem: string): string {
  const s = stem.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One MOC line linking from the brain-relative folder `fromDir` to the brain-relative `target`. */
export function mocEntry(fromDir: string, target: string, title: string, summary: unknown): string {
  const raw = fromDir === '' ? target : posix.relative(fromDir, target);
  // `%`, `#` and `?` would end or garble the path, so they are percent-encoded (`%` first); the
  // link resolver decodes them. Spaces and parentheses keep the angle brackets.
  const rel = raw.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\?/g, '%3F');
  const link = /[\s()<>]/.test(rel) ? `<${rel}>` : rel;
  const label = title.replace(/[[\]]/g, (c) => `\\${c}`);
  const text = typeof summary === 'string' ? summary.replace(/\s+/g, ' ').trim() : '';
  return `- [${label}](${link})${text === '' ? '' : ` — ${text}`}\n`;
}

interface Entry {
  target: string;
  title: string;
  summary: unknown;
}

const stem = (path: string) => posix.basename(path, '.md');
const asEntry = (n: NoteModel): Entry => ({ target: n.path, title: humanize(stem(n.path)), summary: n.frontmatter?.summary });

function body(fromDir: string, entries: Entry[]): string {
  return [...entries]
    .map((e) => ({ e, link: fromDir === '' ? e.target : posix.relative(fromDir, e.target) }))
    .sort((x, y) => byString(x.link, y.link))
    .map(({ e }) => mocEntry(fromDir, e.target, e.title, e.summary))
    .join('');
}

/** MOC lists of spec 5.4: area READMEs, notes/README.md, maps, projects and the root index.md. */
export const mocGenerator: Generator = (_ws, b, manifest) => {
  const files: PlannedFile[] = [];
  const problems: Finding[] = [];
  const byPath = new Map(b.notes.map((n) => [n.path, n]));
  const notes = b.notes.filter((n) => placeOf(n.path).kind === 'note');
  const top = (n: NoteModel) => n.path.split('/')[0];

  const plan = (rel: string, entries: Entry[], fresh: string | null): void => {
    const current = byPath.get(rel)?.text ?? null;
    if (current === null && fresh === null) return;
    const result = replaceBlock(current ?? '', 'index', body(posix.dirname(rel) === '.' ? '' : posix.dirname(rel), entries), 'append');
    if (!result.ok) {
      problems.push(finding('generated-block-invalid', { brain: b.id, path: `${b.dir}/${rel}`, message: result.reason }));
      return;
    }
    files.push(planned('moc-outdated', b, rel, current, current === null ? `${fresh}${result.text}` : result.text));
  };

  // Area READMEs.
  const areaReadmes = notes.filter((n) => /^areas\/[^/]+\/README\.md$/.test(n.path));
  for (const readme of areaReadmes) {
    const dir = posix.dirname(readme.path);
    plan(readme.path, notes.filter((n) => posix.dirname(n.path) === dir && n !== readme).map(asEntry), null);
  }

  // notes/README.md, created only when notes/ holds a note.
  const flatNotes = notes.filter((n) => top(n) === 'notes').map(asEntry);
  const notesReadme = byPath.has('notes/README.md') || flatNotes.length > 0;
  plan('notes/README.md', flatNotes, flatNotes.length > 0 ? '# Notes\n\n' : null);

  // Maps and projects.
  for (const map of notes.filter((n) => top(n) === 'maps')) {
    const t = stem(map.path);
    plan(map.path, notes.filter((n) => n !== map && listsIn(n.frontmatter?.maps, t)).map(asEntry), null);
  }
  for (const project of notes.filter((n) => top(n) === 'projects')) {
    const p = stem(project.path);
    plan(project.path, notes.filter((n) => n !== project && n.frontmatter?.project === p).map(asEntry), null);
  }

  // Root index.md, always created.
  const index: Entry[] = [
    ...areaReadmes.map((n) => ({ ...asEntry(n), title: humanize(n.path.split('/')[1]!) })),
    ...notes.filter((n) => top(n) === 'maps' || top(n) === 'projects').map(asEntry),
    ...(notesReadme ? [{ target: 'notes/README.md', title: 'Notes', summary: undefined }] : []),
  ];
  plan('index.md', index, `# ${manifest.name}\n\n`);

  return { files, problems };
};

function listsIn(value: unknown, t: string): boolean {
  return Array.isArray(value) && value.includes(t);
}

import { Owner } from '../../schemas/common.js';
import { NoteFrontmatterSchema, PERSON_KEYS } from '../../schemas/note.js';
import type { WorkspaceModel } from '../../workspace/load.js';
import { finding, type Finding } from '../finding.js';
import { placeOf, wsPath } from '../layout.js';

const personKeys = new Set<string>(PERSON_KEYS);

/** Required frontmatter, types per folder, MOC references, owners and person-note keys. */
export function frontmatterChecks(ws: WorkspaceModel): Finding[] {
  const out: Finding[] = [];
  for (const b of ws.brains) {
    for (const note of b.notes) {
      const place = placeOf(note.path);
      if (place.kind !== 'note') continue;
      const base = { brain: b.id, path: wsPath(b.dir, note.path) };

      if (note.frontmatterError !== null) {
        out.push(finding('frontmatter-invalid', { ...base, message: note.frontmatterError }));
        continue;
      }
      const fm = note.frontmatter;
      if (fm === null) {
        out.push(finding('frontmatter-missing', { ...base, message: 'notes need frontmatter with type, summary and updated' }));
        continue;
      }

      // Owner syntax gets its own code; validate the rest without it.
      const { owner, ...rest } = fm;
      if (owner !== undefined && !Owner.safeParse(owner).success) {
        out.push(finding('owner-invalid', { ...base, message: `owner ${JSON.stringify(owner)} is not @user or @org/team` }));
      }

      if (b.type === 'shared' && fm.type === 'person') {
        const extra = Object.keys(fm).filter((k) => !personKeys.has(k));
        if (extra.length > 0) {
          out.push(finding('person-key-not-allowed', { ...base, message: `person notes in shared brains may not use: ${extra.join(', ')}` }));
        }
      }

      const parsed = NoteFrontmatterSchema.safeParse(rest);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        const key = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        out.push(finding('frontmatter-invalid', { ...base, message: `${key}${issue.message}` }));
        continue;
      }
      const data = parsed.data;
      if (!place.allowed.includes(data.type)) {
        out.push(finding('type-folder-mismatch', { ...base, message: `type ${data.type} is not allowed here; expected ${place.allowed.join(' or ')}` }));
      }
      for (const map of data.maps ?? []) {
        if (!b.files.includes(`maps/${map}.md`)) {
          out.push(finding('moc-missing', { ...base, message: `map ${map} does not exist (maps/${map}.md)` }));
        }
      }
      if (data.project !== undefined && !b.files.includes(`projects/${data.project}.md`)) {
        out.push(finding('moc-missing', { ...base, message: `project ${data.project} does not exist (projects/${data.project}.md)` }));
      }
    }
  }
  return out;
}

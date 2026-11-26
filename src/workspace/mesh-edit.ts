import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMap, isSeq, parseDocument, type Document, type YAMLMap, type YAMLSeq } from 'yaml';
import { CliError, ErrorCode, ExitCode } from '../output.js';
import { MeshConfigSchema, type MeshConfig, type Mount } from '../schemas/mesh.js';

const KEYS = ['id', 'url', 'mode'] as const;

function invalid(why: string): CliError {
  return new CliError(ErrorCode.MeshInvalid, `mesh.yaml is invalid: ${why}`, ExitCode.Failure);
}

/** The mount node for `m`, or the existing node updated in place so its comments stay. */
function mountNode(doc: Document, old: YAMLMap | undefined, m: Mount): YAMLMap {
  if (old === undefined) return doc.createNode(Object.fromEntries(KEYS.flatMap((k) => (m[k] === undefined ? [] : [[k, m[k]]])))) as YAMLMap;
  for (const k of KEYS) {
    if (m[k] === undefined) old.delete(k);
    else if (old.get(k) !== m[k]) {
      if (old.has(k)) old.set(k, m[k]);
      else {
        // A new key goes right after `id`, the way mesh.yaml lists them.
        const pair = doc.createPair(k, m[k]);
        const at = old.items.findIndex((p) => (p.key as { value?: unknown } | null)?.value === 'id');
        old.items.splice(at + 1, 0, pair as (typeof old.items)[number]);
      }
    }
  }
  return old;
}

/**
 * Applies `change` to the mounts of `root/mesh.yaml` and writes the file back with its comments,
 * header and line endings. Mounts are matched by id, so kept mounts keep their place and comments.
 * Throws `E_MESH_INVALID`, without writing, when the file or the result fails the schema.
 */
export async function editMesh(root: string, change: (mounts: Mount[]) => Mount[]): Promise<MeshConfig> {
  const path = join(root, 'mesh.yaml');
  const text = await readFile(path, 'utf8');
  const crlf = text.includes('\r\n');
  const doc = parseDocument(text.replace(/\r\n/g, '\n'));
  if (doc.errors.length > 0) throw invalid(doc.errors[0]!.message.split('\n')[0]!);
  const current = MeshConfigSchema.safeParse(doc.toJS());
  if (!current.success) throw invalid(current.error.issues[0]?.message ?? 'does not match the schema');

  const next = MeshConfigSchema.safeParse({ ...current.data, mounts: change(current.data.mounts.map((m) => ({ ...m }))) });
  if (!next.success) throw invalid(next.error.issues[0]?.message ?? 'does not match the schema');

  let seq = doc.get('mounts', true);
  if (!isSeq(seq)) {
    seq = doc.createNode([]) as YAMLSeq;
    doc.set('mounts', seq);
  }
  const items = (seq as YAMLSeq).items;
  const byId = new Map(items.filter(isMap).map((n) => [String(n.get('id')), n as YAMLMap]));
  const nodes = next.data.mounts.map((m) => mountNode(doc, byId.get(m.id), m));
  (seq as YAMLSeq).items = nodes;
  // A flow `[]` turns into a block list once it holds mounts, and back once it is empty.
  (seq as YAMLSeq).flow = nodes.length === 0;

  const out = doc.toString({ lineWidth: 0 });
  await writeFile(path, crlf ? out.replace(/\n/g, '\r\n') : out, 'utf8');
  return next.data;
}

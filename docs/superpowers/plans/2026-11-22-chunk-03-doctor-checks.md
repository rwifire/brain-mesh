# Chunk 3: Brain Model and `doctor` Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `brain-mesh doctor [brain] --json` loads a workspace, parses every note's frontmatter and links, runs every offline check from spec 8 that needs no generator, and reports findings with stable codes; each check has a passing fixture and a failing one.

**Architecture:** Three layers. `src/brain/` parses one file (frontmatter split, note schema, links). `src/workspace/` finds the workspace root and loads a read-only `WorkspaceModel`: `mesh.yaml`, every brain under `brains/`, a case-exact index of all paths, parsed notes, and the git state of `read` mounts. `src/doctor/` holds a code registry and pure check functions `(ws) => Finding[]`; the `doctor` command loads the model, runs the checks, sorts the findings and emits them.

**Tech Stack:** Chunk 2 stack, plus `mdast-util-from-markdown` and `unist-util-visit` (links), `semver` (`requires`). `execa` becomes a runtime dependency for `git`.

**Spec:** [docs/spec.md](../../spec.md), sections 4 (workspace layout, `mesh.yaml`), 5.1–5.3, 5.6, 5.7, 6, 8 (`doctor` checks), 9.3. Breakdown: [v0-breakdown.md](../../plan/v0-breakdown.md), chunk 3. Research: [chunk 1](../../research/2026-11-chunk-01-research.md), section 5 (libraries).

## Global Constraints

- Everything from chunk 2 still holds:
  - the `--json` envelope contract in `src/output.ts`;
  - exit codes 0 / 1 / 2;
  - Node `>=22.12.0`;
  - LF files;
  - commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `chunk-03-doctor` in the main checkout (same as chunk 2: no worktree). CI already runs on `chunk-*` pushes.
- Libraries:
  - frontmatter is our own split plus `yaml` (no gray-matter);
  - links use `mdast-util-from-markdown` and `unist-util-visit`;
  - git goes through `execa` and the system `git`.
  - Before installing, run `npm view <pkg> version` and pin `^<latest>` for:
    - `mdast-util-from-markdown` (expect 2.x);
    - `unist-util-visit` (5.x);
    - `@types/mdast` (4.x);
    - `semver` (7.x);
    - `@types/semver` (7.x).
- Spec rules the checks enforce, quoted:
  - "File names: lowercase kebab-case only … Every file stem is unique within the brain, except `README.md` and `index.md`."
  - "Required frontmatter: `type`, `summary` (one sentence), `updated` (… `doctor` checks the format only). Types: note, decision, howto, source, person, area, map, project."
  - "Optional frontmatter: `maps` (list of map names), `project`, `sources`."
  - "Person notes in shared brains may only use the frontmatter keys `type`, `summary`, `updated`, `name`, `role`, `team`, `responsibilities`, `contact`."
  - "the only forbidden direction is shared → personal"
  - "If the target isn't mounted, `doctor` reports the link as *unmounted*, not *broken*"
- Paths in findings are workspace-relative with forward slashes on every OS (`brains/personal/notes/a.md`).
- Line numbers count from 1 in the whole file, frontmatter included.
- Out of scope, recorded in the breakdown in Task 6:
  - generated-content freshness checks (MOC lists, `CODEOWNERS`, `links_to`) and `--fix` go to chunk 4, which builds the generators;
  - network checks (owner exists, push rights) and `--offline` go to chunk 8, which builds the host adapter.

## Rulings in this plan

The spec is silent on these; each is a decision recorded here for review.

1. **Files exempt from frontmatter and type checks:**
   - at the brain root: `index.md`, `AGENTS.md`, `CLAUDE.md` and `README.md`;
   - `notes/README.md`, since its MOC type is not in the type list;
   - everything in `daily/`.
2. **`inbox/` has "no rules".** Every check skips it except the safety checks: executable files, client folders and `CLAUDE.md`.
3. **`updated` format** is `YYYY-MM-DD` and must be a real calendar date.
4. **Unknown frontmatter keys are allowed** (for example `tags` or `aliases`), except on person notes in shared brains.
5. **Stem uniqueness covers markdown files only.** `cache-diagram.png` next to `cache-diagram.md` is fine.
6. **"Executable file"** means one of these:
   - the extension is in `EXECUTABLE_EXTENSIONS`;
   - the file starts with `#!`.

   The POSIX exec bit is not read, so results are the same on Windows and Linux.
7. **Link targets resolve against the in-memory, case-exact path index**, not `fs.exists`. `../CI/a.md` is broken on Windows too.
8. **Nested folders:**
   - a subfolder of an area counts as `area-nested` only if it holds a `.md` file, so an `images/` folder is fine;
   - a `.md` file in a subfolder of `notes/`, `maps/`, `projects/` or `sources/` counts as `note-misplaced`.
9. **`doctor` exits 1 when any finding is an error** and still prints a success envelope (`ok: true`): the command ran, and `data` holds the findings. To support this, `CommandOutput` gains an optional `exitCode`.
10. **When `mesh.yaml` is invalid,** `doctor` reports `mesh-invalid` and checks only `brains/personal/`.
11. **A `read` mount without its own `.git`** is not checked with git, so git never falls through to the workspace repo. The run gets the envelope warning `W_GIT_STATUS` instead.

## Review Focus

1. **Case mismatches:** a link or a file whose case differs from the file on disk (`../CI/Runner.md`) must be reported the same way on Windows and Linux. *(Task 3 test `path index is case-exact`; Task 5 case `link-broken (case)`)*
2. **CRLF and BOM notes** saved on Windows give the same frontmatter, links and line numbers as LF. *(Task 1 test `CRLF and BOM split like LF`; Task 2 test `line numbers count frontmatter lines`)*
3. **Awkward link targets:**
   - spaces (`<a b.md>`, `a%20b.md`), fragments, titles and balanced parentheses resolve;
   - external URLs, `mailto:`, and links inside code are ignored.

   *(Task 2 tables)*
4. **A `read` mount without `.git`** inside the workspace repo must not report the workspace's own status as the mount's. *(Task 3 test `read mount without .git is not checked`)*
5. **Where `doctor` is run from:**
   - from a subfolder (`brains/personal/notes`), it finds the workspace root;
   - outside any workspace, it prints one `E_NO_WORKSPACE` envelope and exits 1.

   *(Task 6 tests)*

---

## File Structure

```
src/
├── brain/
│   ├── frontmatter.ts      # splitFrontmatter, parseFrontmatter          (Task 1)
│   ├── links.ts            # extractLinks, classifyTarget                (Task 2)
│   └── note.ts             # parseNote                                   (Task 2)
├── schemas/
│   ├── note.ts             # NoteFrontmatterSchema, type sets, isIsoDate (Task 1)
│   └── brain.ts            # + `requires` must be a valid semver range   (Task 5)
├── workspace/
│   ├── find.ts             # findWorkspaceRoot                           (Task 3)
│   ├── load.ts             # loadWorkspace → WorkspaceModel              (Task 3)
│   └── url.ts              # repoNameFromUrl                             (Task 3)
├── git.ts                  # gitIsDirty                                  (Task 3)
├── doctor/
│   ├── codes.ts            # CHECKS registry, checksMarkdown()           (Task 4)
│   ├── finding.ts          # Finding, finding(), sortFindings()          (Task 4)
│   ├── run.ts              # runChecks                                   (Task 4, extended in 5)
│   └── checks/
│       ├── workspace.ts    # mesh, mounts, manifests, ids (+ requires, git in Task 5)
│       ├── structure.ts    # folders, types, names, stems                (Task 4)
│       ├── frontmatter.ts  # frontmatter, MOC refs, owners, person keys  (Task 4)
│       ├── links.ts        # broken, unmounted, shared → personal        (Task 5)
│       └── safety.ts       # executables, client folders, CLAUDE.md, CODEOWNERS (Task 5)
├── commands/doctor.ts      # doctorCommand                               (Task 6)
├── output.ts               # + CommandOutput.exitCode, new error codes   (Task 6)
└── main.ts                 # returns the command's exitCode              (Task 6)
docs/doctor-checks.md       # generated table of codes, file snapshot     (Task 4)
test/
├── fixtures/workspace-full/                                              (Task 3)
├── helpers/workspace.ts    # fullWorkspace(), mutation helpers           (Task 3)
├── unit/brain/{frontmatter,links,note}.test.ts
├── unit/schemas/note.test.ts
├── unit/workspace/{find,load,url}.test.ts
├── unit/doctor/{codes,checks}.test.ts
├── unit/commands/doctor.test.ts
└── e2e/doctor.test.ts
```

---

### Task 1: Frontmatter split and note schema

**Files:**
- Create: `src/brain/frontmatter.ts`, `src/schemas/note.ts`
- Test: `test/unit/brain/frontmatter.test.ts`, `test/unit/schemas/note.test.ts`

**Interfaces:**
- Produces:
  - `splitFrontmatter(text: string): { yaml: string | null; body: string; bodyStartLine: number; unterminated: boolean }`
    - strips a leading BOM;
    - frontmatter exists only when the first line is exactly `---`;
    - it closes at the next line that is `---` or `...`;
    - CRLF is accepted;
    - `bodyStartLine` is the 1-based line number of the body's first line (1 when there is no frontmatter);
    - `unterminated: true` means it opened and never closed; then `yaml` is null and `body` is the whole text.
  - `parseFrontmatter(yaml: string): { data: Record<string, unknown> | null; error: string | null }`
    - uses `yaml` `parse` with its default `uniqueKeys`;
    - a scalar or list at the top level is an error: `frontmatter is not a mapping`;
    - an empty mapping gives `data: {}`.
  - From `src/schemas/note.ts`:
    - `NOTE_TYPES = ['note','decision','howto','source','person','area','map','project'] as const`;
    - `KNOWLEDGE_TYPES = ['note','decision','howto','person'] as const`;
    - `PERSON_KEYS = ['type','summary','updated','name','role','team','responsibilities','contact'] as const`;
    - `isIsoDate(s: string): boolean`;
    - `NoteFrontmatterSchema`, a zod `looseObject`:
      - required: `type` (enum NOTE_TYPES), `summary` (string, min 1) and `updated` (string refined by isIsoDate);
      - optional: `maps` (BrainId[]), `project` (BrainId), `sources` (string | string[]) and `owner` (`Owner` from `common.ts`).
    - `type NoteFrontmatter`.

- [ ] **Step 1: Write the failing tests**

`frontmatter.test.ts`:
- `splits frontmatter and body`:
  - input `'---\ntype: note\n---\n# T\n'`;
  - expect yaml `'type: note\n'`, body `'# T\n'`, bodyStartLine 4.
- `no frontmatter`:
  - input `'# T\n'`;
  - expect yaml null, bodyStartLine 1, unterminated false.
- `--- not on the first line is body`:
  - input `'\n---\na: 1\n---\n'`;
  - expect yaml null.
- `closes on ...`:
  - input `'---\na: 1\n...\nx'`;
  - expect yaml `'a: 1\n'`.
- `CRLF and BOM split like LF`:
  - input `'\uFEFF---\r\ntype: note\r\n---\r\nbody'`;
  - expect bodyStartLine 4, and `parseFrontmatter(yaml).data` toEqual `{ type: 'note' }`.
- `unterminated`:
  - input `'---\na: 1\n'`;
  - expect unterminated true, yaml null.
- `parse errors`:
  - `'a: [1\n'` gives a non-null error;
  - `'- a\n'` gives the error `frontmatter is not a mapping`;
  - `'a: 1\na: 2\n'` gives a non-null error (duplicate key).
- `unquoted dates stay strings`:
  - `parseFrontmatter('updated: 2026-11-21\n').data` toEqual `{ updated: '2026-11-21' }`.

`note.test.ts`:
- `accepts the spec example`:
  - `{ type:'note', summary:'How we cache node_modules on CI runners', maps:['ci-performance'], updated:'2026-11-21' }`.
- `keeps unknown keys`:
  - `{ ...valid, tags: ['x'] }` parses, and the output has `tags`.
- `it.each` rejects:
  - a missing `summary`;
  - `summary: ''`;
  - `type: 'meeting'`;
  - `updated: '2026-02-30'`;
  - `updated: '21.11.2026'`;
  - `updated: '2026-11-21T10:00'`;
  - `maps: 'ci'` (not a list);
  - `owner: 'acme'`.
- `isIsoDate`:
  - true for `2024-02-29`;
  - false for `2023-02-29` and `2026-13-01`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --project unit test/unit/brain/frontmatter.test.ts test/unit/schemas/note.test.ts`
Expected: FAIL, cannot resolve `src/brain/frontmatter.js` / `src/schemas/note.js`.

- [ ] **Step 3: Implement both modules with the signatures above.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brain/frontmatter.ts src/schemas/note.ts test/unit/brain/frontmatter.test.ts test/unit/schemas/note.test.ts
git commit -m "feat: frontmatter split and note frontmatter schema"
```

---

### Task 2: Link extraction and `parseNote`

**Files:**
- Modify: `package.json` (add `mdast-util-from-markdown`, `unist-util-visit` and dev `@types/mdast`)
- Create: `src/brain/links.ts`, `src/brain/note.ts`
- Test: `test/unit/brain/links.test.ts`, `test/unit/brain/note.test.ts`

**Interfaces:**
- Consumes:
  - `splitFrontmatter` and `parseFrontmatter` (Task 1).
- Produces:
  - `interface Link { url: string; line: number }`
    - `url` is the mdast node's `url`, as written, with escapes resolved;
    - `line` is the line within the markdown it was given.
  - `extractLinks(markdown: string): Link[]`
    - takes `link`, `image` and `definition` nodes, in document order;
    - `linkReference` nodes are skipped, because their `definition` is checked.
  - `type Target = { kind: 'external' } | { kind: 'anchor' } | { kind: 'path'; path: string }`
  - `classifyTarget(url: string): Target`
    - a scheme of 2 or more characters (`/^[a-z][a-z0-9+.-]+:/i`) or a leading `//` is external;
    - empty or `#…` is an anchor;
    - otherwise `path` is the text before the first `#` or `?`, percent-decoded, keeping the raw text if decoding throws.
  - `parseNote(text: string): { frontmatter: Record<string, unknown> | null; frontmatterError: string | null; links: Link[] }`
    - its links' `line` values are relative to the whole file (`bodyStartLine - 1` added);
    - an unterminated block sets frontmatterError `frontmatter is not closed with ---`.

- [ ] **Step 1: Install the dependencies** (versions per Global Constraints).

Run: `npm install mdast-util-from-markdown@^<v> unist-util-visit@^<v>` then `npm install -D @types/mdast@^<v>`
Expected: both are in `package.json`, and `npm ls` prints no errors.

- [ ] **Step 2: Write the failing tests**

`links.test.ts`, a table `extractLinks(md).map(l => l.url)`:

| markdown | urls |
| --- | --- |
| `[a](../ci/runner.md "t")` | `['../ci/runner.md']` |
| `[a](<a b.md>)` | `['a b.md']` |
| `[a](x(1).md)` | `['x(1).md']` |
| `[a][r]\n\n[r]: ./ref.md` | `['./ref.md']` |
| `![d](img/diagram.png)` | `['img/diagram.png']` |
| ```` ```\n[a](in-fence.md)\n``` ```` | `[]` |
| `` `[a](inline.md)` `` | `[]` |
| `[[wiki-link]]` | `[]` |

Plus:
- `line numbers`: `'x\n\n[a](b.md)'` gives line 3.

`classifyTarget` table:

| url | result |
| --- | --- |
| `https://x.y/a` | external |
| `mailto:a@b.c` | external |
| `obsidian://open?vault=x` | external |
| `//cdn/x.png` | external |
| `#heading` | anchor |
| `''` | anchor |
| `../ci/a.md#h` | path `../ci/a.md` |
| `a.md?x=1` | path `a.md` |
| `a%20b.md` | path `a b.md` |
| `a%zz.md` | path `a%zz.md` |
| `C:/x.md` | path `C:/x.md` |

`note.test.ts`:
- `line numbers count frontmatter lines`:
  - `parseNote('---\ntype: note\n---\n\n[a](b.md)\n').links[0].line` is 5;
  - with CRLF it is also 5.
- `no frontmatter`: frontmatter null, frontmatterError null.
- `bad yaml`: `'---\na: [\n---\n'` gives a non-null frontmatterError and frontmatter null.
- `unterminated`: the error is `frontmatter is not closed with ---`.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run --project unit test/unit/brain`
Expected: FAIL, the new modules are missing (Task 1 tests still pass).

- [ ] **Step 4: Implement** `links.ts`:
  - `fromMarkdown(markdown)` with no extensions, then `visit` for `link`, `image` and `definition`;
  - take `node.position.start.line`.

  Then implement `note.ts` per the interface.

- [ ] **Step 5: Run the same command.** Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/brain test/unit/brain
git commit -m "feat: markdown link extraction and note parsing"
```

---

### Task 3: Workspace model

**Files:**
- Modify: `package.json` (move `execa` from devDependencies to dependencies)
- Create:
  - `src/git.ts`;
  - `src/workspace/find.ts`, `src/workspace/load.ts`, `src/workspace/url.ts`;
  - `test/helpers/workspace.ts`;
  - `test/fixtures/workspace-full/**`.
- Test: `test/unit/workspace/{find,load,url}.test.ts`

**Interfaces:**
- Consumes:
  - `parseNote` (Task 2);
  - `MeshConfigSchema` and `BrainManifestSchema` (chunk 2);
  - `Warning` from `src/output.ts`.
- Produces:
  - `gitIsDirty(dir: string): Promise<boolean>`
    - runs `execa('git', ['status', '--porcelain'], { cwd: dir })`;
    - returns true when stdout is not empty;
    - throws if git fails.
  - `findWorkspaceRoot(start: string): Promise<string | null>`: the nearest directory, from `start` upwards, that contains a `mesh.yaml` file.
  - `repoNameFromUrl(url: string): string | null`: the last path segment with `.git` and trailing `/` removed. It handles:
    - `git@host:org/name.git`;
    - `https://host/org/name(.git)(/)`;
    - `ssh://git@host/org/name.git`;
    - local paths (`../brain-x`).

    Empty input gives null.
  - The model types:

```ts
export interface NoteModel {
  path: string;                                  // brain-relative POSIX
  text: string;
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  links: Link[];
}
export interface BrainModel {
  id: string;                                    // folder name under brains/
  dir: string;                                   // 'brains/<id>'
  type: 'personal' | 'shared';                   // manifest type, else id === 'personal' ? 'personal' : 'shared'
  mount: Mount | null;                           // mesh.yaml entry; always null for personal and for unlisted folders (which are loaded too)
  manifest: BrainManifest | null;
  manifestError: string | null;                  // 'brain.yaml is missing' | yaml error | first zod issue as '<path>: <message>'
  files: string[];                               // brain-relative POSIX, sorted; no .git/**, no symlinks
  dirs: string[];                                // brain-relative POSIX, sorted
  notes: NoteModel[];                            // every file ending in .md
  dirty: boolean | null;                         // read mounts with their own .git only
}
export interface WorkspaceModel {
  root: string;                                  // absolute
  mesh: MeshConfig | null;
  meshError: string | null;
  brains: BrainModel[];                          // sorted by id
  missing: string[];                             // 'personal' or mount ids whose brains/<id> is absent, sorted
  unlisted: string[];                            // brains/<x> folders (not dot, not personal) with no mount, sorted
  paths: ReadonlySet<string>;                    // every file and dir under brains/, workspace-relative POSIX, case-exact
  warnings: Warning[];
}
export interface LoadDeps { isDirty(dir: string): Promise<boolean> }
export function loadWorkspace(root: string, deps?: LoadDeps): Promise<WorkspaceModel>;  // default deps use gitIsDirty
```

  - `loadWorkspace` rules:
    - when `meshError` is set, only `personal` is loaded and `unlisted` is `[]` (Ruling 10);
    - `dirty` is computed only for `mode: 'read'` mounts that have a `.git` entry (file or dir);
    - a read mount without `.git`, or one where git fails, gets `dirty: null` and adds the warning `{ code: 'W_GIT_STATUS', message: 'could not check <id> for uncommitted changes: <reason>' }`.
  - `test/helpers/workspace.ts`:
    - `fullWorkspace(): Promise<string>` copies `workspace-full` with `fixture()` and makes `brains/brain-handbook` a committed git repo (`git -c core.autocrlf=false -c user.name=t -c user.email=t@example.invalid …`);
    - `writeFiles(root, tree)` re-exports `writeTree`;
    - `removePath(root, rel)`.

- [ ] **Step 1: Create `test/fixtures/workspace-full/`.** It must produce zero findings once all checks exist. Every note has valid `type`, `summary` and `updated`. Every `CLAUDE.md` is exactly `@AGENTS.md\n`.

```
mesh.yaml          version 1, brain_mesh 0.4.2, user octo-user; mounts:
                   brain-team-platform (url https://github.com/acme/brain-team-platform.git, contribute),
                   brain-handbook (url git@github.com:acme/brain-handbook.git, read), brain-ideas (no url, contribute)
brains/.obsidian/app.json                      {"useMarkdownLinks": true, "newLinkFormat": "relative", "alwaysUpdateLinks": true}
brains/personal/   brain.yaml (personal, owner "@octo-user"), AGENTS.md, CLAUDE.md, index.md (no frontmatter)
  inbox/Raw Capture.txt                        free text (proves inbox has no rules)
  daily/2026-11-21.md                          no frontmatter; links ../notes/reading-list.md
  notes/README.md                              no frontmatter
  notes/reading-list.md                        note; links ../../brain-team-platform/areas/ci/runner-cache-strategy.md
  sources/team-offsite-transcript.md           source
brains/brain-team-platform/  brain.yaml (shared, owner "@acme/platform", requires ">=0.3"), AGENTS.md, CLAUDE.md, index.md
  .github/workflows/ci.yml                     a plain YAML file
  areas/ci/README.md                           area, owner "@acme/ci-team"; links runner-cache-strategy.md
  areas/ci/runner-cache-strategy.md            note, maps [ci-performance], project runner-migration;
                                               links ./runner-pools.md#sizes, ../../maps/ci-performance.md,
                                               ../../../brain-handbook/areas/engineering/release-process.md,
                                               https://example.com, and an image images/cache-diagram.png
  areas/ci/images/cache-diagram.png            any bytes
  areas/ci/runner-pools.md                     howto
  areas/people/README.md                       area
  areas/people/jane-doe.md                     person; keys type, summary, updated, name, role, team, responsibilities only
  notes/README.md                              no frontmatter
  notes/build-glossary.md                      decision
  maps/ci-performance.md                       map
  projects/runner-migration.md                 project
  sources/kubecon-talk.md                      source
brains/brain-handbook/  brain.yaml (shared, owner "@acme/handbook"), AGENTS.md, CLAUDE.md, index.md
  areas/engineering/README.md                  area
  areas/engineering/release-process.md         howto
brains/brain-ideas/  brain.yaml (shared, owner "@octo-user"), AGENTS.md, CLAUDE.md
  notes/README.md, notes/first-idea.md         note
```

- [ ] **Step 2: Write the failing tests**

`url.test.ts`, a table:

| url | result |
| --- | --- |
| `git@github.com:acme/brain-x.git` | `brain-x` |
| `https://github.com/acme/brain-x` | `brain-x` |
| `https://github.com/acme/brain-x.git/` | `brain-x` |
| `ssh://git@github.com/acme/brain-x.git` | `brain-x` |
| `../brain-x` | `brain-x` |
| `''` | null |

`find.test.ts`:
- `finds the root from a subfolder`: from `<ws>/brains/personal/notes` it returns `<ws>`.
- `null outside a workspace`: a `tempDir()` with no mesh.yaml returns null.

`load.test.ts` (on `fullWorkspace()`):
- `loads every brain`:
  - `brains.map(b => b.id)` toEqual `['brain-handbook','brain-ideas','brain-team-platform','personal']`;
  - `missing` and `unlisted` are `[]`;
  - `warnings` is `[]`.
- `brain fields`:
  - `brain-team-platform` has type `shared`, `mount.mode` `contribute` and `manifestError` null;
  - its notes include `areas/ci/runner-cache-strategy.md` with 5 links;
  - personal has `mount` null.
- `path index is case-exact`:
  - `paths.has('brains/brain-team-platform/areas/ci/runner-pools.md')` is true;
  - `paths.has('brains/brain-team-platform/areas/CI/runner-pools.md')` is false;
  - `paths.has('brains/brain-team-platform/areas/ci')` is true.
- `skips .git and symlinks`:
  - no `files` entry of brain-handbook starts with `.git/`;
  - on non-Windows, a symlink added with `symlink` is absent from `files` (`it.skipIf(process.platform === 'win32')`).
- `read mount dirty`:
  - after writing `brains/brain-handbook/areas/engineering/new.md`, `dirty` is true;
  - on a fresh copy it is false.
- `read mount without .git is not checked`:
  - `removePath(root, 'brains/brain-handbook/.git')`;
  - `git init` the workspace root itself and add an untracked file there;
  - `dirty` is null, and `warnings[0].code` is `W_GIT_STATUS`.
- `missing and unlisted`:
  - remove `brains/brain-ideas` and add `brains/stray/brain.yaml`;
  - `missing` is `['brain-ideas']` and `unlisted` is `['stray']`.
- `invalid mesh.yaml`:
  - write `mesh.yaml` as `version: 2\n`;
  - `meshError` is non-null, `brains.map(b => b.id)` is `['personal']`, and `unlisted` is `[]`.
- `manifest errors`:
  - delete `brains/brain-ideas/brain.yaml`: `manifestError` is `brain.yaml is missing`, `manifest` is null, and `type` is `shared`.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run --project unit test/unit/workspace`
Expected: FAIL, the modules are missing.

- [ ] **Step 4: Move `execa` to `dependencies` and implement `git.ts`, `url.ts`, `find.ts` and `load.ts`.**
  - `load.ts` walks `brains/` with `readdir(…, { withFileTypes: true })` recursively;
  - it skips entries named `.git` and symlinks;
  - it builds paths with `path.posix` from the segments.

- [ ] **Step 5: Run the same command, then `npm run typecheck`.** Expected: PASS. The schema fixtures test also passes on the new fixture's yaml files.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/git.ts src/workspace test/helpers/workspace.ts test/fixtures/workspace-full test/unit/workspace
git commit -m "feat: load the workspace model with a case-exact path index"
```

---

### Task 4: Check registry and structure, frontmatter and workspace checks

**Files:**
- Create:
  - `src/doctor/codes.ts`, `src/doctor/finding.ts`, `src/doctor/run.ts`;
  - `src/doctor/checks/{workspace,structure,frontmatter}.ts`;
  - `docs/doctor-checks.md` (generated).
- Test: `test/unit/doctor/codes.test.ts`, `test/unit/doctor/checks.test.ts`

**Interfaces:**
- Consumes:
  - `WorkspaceModel`, `BrainModel`, `NoteModel` and `repoNameFromUrl` (Task 3);
  - `NoteFrontmatterSchema`, `KNOWLEDGE_TYPES` and `PERSON_KEYS` (Task 1).
- Produces:
  - `CHECKS`: a `const` record `code → { severity: 'error' | 'warning'; description: string }`, with all 27 codes below, including those Task 5 implements.
  - `type CheckCode = keyof typeof CHECKS`
  - `checksMarkdown(): string`: a markdown page with an `# doctor checks` heading, one intro sentence, and a `Code | Severity | Checks` table in registry order.
  - `interface Finding { code: CheckCode; severity: 'error' | 'warning'; brain: string | null; path: string | null; line?: number; message: string }`
  - `finding(code, { brain, path, line?, message }): Finding`: severity comes from `CHECKS`.
  - `sortFindings(f: Finding[]): Finding[]`: sorts by path (null last), then line (missing = 0), then code.
  - `type CheckFn = (ws: WorkspaceModel) => Finding[]`
  - `runChecks(ws: WorkspaceModel, brain?: string): Finding[]`
    - runs every registered CheckFn and sorts;
    - with `brain`, keeps only findings whose `brain` equals it.

The registry. Descriptions are the "Checks" column, one short sentence each.

| Code | Severity | Task | Fires when |
| --- | --- | --- | --- |
| `mesh-invalid` | error | 4 | `meshError` set; path `mesh.yaml` |
| `mount-id-collision` | error | 4 | two mounts share an id, or a mount id is `personal`; path `mesh.yaml` |
| `brain-missing` | warning | 4 | id in `missing`; path `brains/<id>`; message says run `brain-mesh sync` |
| `brain-unlisted` | warning | 4 | id in `unlisted` |
| `manifest-invalid` | error | 4 | `manifestError` set; path `brains/<id>/brain.yaml` |
| `brain-id-mismatch` | error | 4 | manifest id ≠ folder name, or a shared mount's `repoNameFromUrl(url)` ≠ manifest id |
| `requires-unmet` | error | 5 | pinned `brain_mesh` does not satisfy `requires` |
| `folder-unexpected` | error | 4 | `inbox/` or `daily/` in a shared brain |
| `note-misplaced` | error | 4 | `.md` at brain root other than `index.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`; directly in `areas/`; in an unknown non-dot top-level folder; nested under `notes/`, `maps/`, `projects/`, `sources/` |
| `area-nested` | error | 4 | a subfolder of `areas/<a>/` contains a `.md` file; one finding per such folder |
| `area-readme-missing` | error | 4 | `areas/<a>/` has no `README.md` |
| `type-folder-mismatch` | error | 4 | valid `type` not allowed for its folder (5.1 table) |
| `filename-not-kebab` | error | 4 | under `areas`, `notes`, `maps`, `projects`, `sources`, `daily`, a file (except `README.md`; dotfiles skipped) whose stem is not `^[a-z0-9]+(?:-[a-z0-9]+)*$` or whose extension is not `^[a-z0-9]+$`, or a folder whose name fails the stem pattern |
| `stem-duplicate` | error | 4 | two `.md` files share a lowercased stem (excluding `README`, `index`, `AGENTS`, `CLAUDE`, `inbox/`); one finding per file, message names the others |
| `frontmatter-missing` | error | 4 | a checked note (Ruling 1, 2) has no frontmatter |
| `frontmatter-invalid` | error | 4 | `frontmatterError`, or `NoteFrontmatterSchema` fails; message names the first issue's key |
| `moc-missing` | error | 4 | a `maps` value has no `maps/<v>.md`, or `project` has no `projects/<v>.md` |
| `owner-invalid` | error | 4 | an area README's `owner` fails `Owner` (syntax only; existence is chunk 8) |
| `person-key-not-allowed` | error | 4 | shared brain, `type: person`, keys outside `PERSON_KEYS`; one finding per note listing the keys |
| `link-broken` | error | 5 | path target missing from `paths`, absolute, or outside `brains/` |
| `link-unmounted` | warning | 5 | target is in `brains/<x>/` and `brains/<x>` is not in `paths` |
| `link-shared-to-personal` | error | 5 | a shared brain's link resolves into `brains/personal/` (whether or not it exists) |
| `executable-file` | warning | 5 | Ruling 6 |
| `client-folder` | error | 5 | `.claude/`, `.github/skills/`, `.github/agents/` or `.agents/` in a brain; one finding per folder |
| `claude-md-invalid` | error | 5 | a `CLAUDE.md` anywhere in the brain whose text, minus BOM and with CRLF → LF, is not `@AGENTS.md` or `@AGENTS.md\n` |
| `codeowners-shadowed` | error | 5 | `.github/CODEOWNERS` in a brain |
| `codeowners-redundant` | warning | 5 | `docs/CODEOWNERS` in a brain |
| `read-mount-dirty` | warning | 5 | `dirty === true` |

Folder → allowed types (the `type-folder-mismatch` rule):
- `areas/<a>/README.md` → `area`;
- `areas/<a>/*.md` and `notes/*.md` → `KNOWLEDGE_TYPES`;
- `maps/*.md` → `map`;
- `projects/*.md` → `project`;
- `sources/*.md` → `source`.

Findings carry workspace-relative paths (`brains/<id>/<rel>`). `brain` is the brain id, or null for `mesh.yaml` findings.

- [ ] **Step 1: Write the failing tests**

`codes.test.ts`:
- `docs/doctor-checks.md is up to date`: `expect(checksMarkdown()).toMatchFileSnapshot('../../../docs/doctor-checks.md')`.
- `codes are kebab-case`: every key matches `^[a-z]+(-[a-z]+)*$`.
- `27 checks`: `Object.keys(CHECKS)` has length 27.

`checks.test.ts`:
- `workspace-full has no findings`: `runChecks(await loadWorkspace(await fullWorkspace()))` toEqual `[]`. `runChecks` runs only the CheckFns registered in `run.ts`, so this passes after this task and keeps passing after Task 5.
- `it.each(CASES)`, where each case is `{ code, patch(root), at, line?, also? }`:
  - it applies the patch to `fullWorkspace()`, loads, and runs `runChecks`;
  - it asserts the sorted codes toEqual `[code, ...(also ?? [])].sort()`;
  - it asserts the finding with `code` has `path === at` (and `line` when given).
- Task 4 cases (`P` = `brains/brain-team-platform`, `H` = `brains/personal`):

| code | patch | at |
| --- | --- | --- |
| mesh-invalid | `mesh.yaml` = `version: 2\n` | `mesh.yaml` |
| mount-id-collision | append a second `brain-ideas` mount | `mesh.yaml` |
| mount-id-collision (personal) | add mount `{ id: personal, mode: contribute }`; the personal folder stays the personal brain (its `mount` stays null) | `mesh.yaml` |
| brain-missing | remove `brains/brain-ideas` | `brains/brain-ideas` |
| brain-unlisted | add `brains/stray/brain.yaml` (valid shared, id stray) | `brains/stray` |
| manifest-invalid | `P/brain.yaml` without `description` | `P/brain.yaml` |
| brain-id-mismatch (folder) | `brains/brain-ideas/brain.yaml` id `brain-other` | `brains/brain-ideas/brain.yaml` |
| brain-id-mismatch (url) | mount url of brain-team-platform → `https://github.com/acme/platform.git` | `P/brain.yaml` |
| folder-unexpected | add `P/inbox/x.md` | `P/inbox` |
| note-misplaced | add `P/areas/stray.md` (valid note) | `P/areas/stray.md` |
| note-misplaced (root) | add `H/todo.md` (valid note) | `H/todo.md` |
| area-nested | add `P/areas/ci/old/x.md` (valid note); only `area-nested`, not `note-misplaced` | `P/areas/ci/old` |
| area-readme-missing | remove `P/areas/people/README.md` | `P/areas/people` |
| type-folder-mismatch | `P/maps/ci-performance.md` type `note` | `P/maps/ci-performance.md` |
| filename-not-kebab | add `P/notes/Build Tips.md` (valid note) | `P/notes/Build Tips.md` |
| filename-not-kebab (non-ASCII) | add `P/notes/über.md` | `P/notes/über.md` |
| stem-duplicate | add `P/notes/runner-pools.md` (valid howto); two findings | `P/areas/ci/runner-pools.md` (first) |
| frontmatter-missing | `P/notes/build-glossary.md` without frontmatter | that path |
| frontmatter-invalid | its `updated` → `2026-02-30` | that path |
| frontmatter-invalid (yaml) | its frontmatter `summary: [` | that path |
| moc-missing | runner-cache-strategy `maps: [ci-speed]` | `P/areas/ci/runner-cache-strategy.md` |
| owner-invalid | `P/areas/ci/README.md` owner `acme` | that path |
| person-key-not-allowed | jane-doe adds `rating: 3` | `P/areas/people/jane-doe.md` |
| person keys in personal brain are fine | add `H/notes/jane.md` person with `rating: 3`; expect `[]` | — |

  - Every case has an empty `also` except `stem-duplicate`, which has `also: ['stem-duplicate']`, so that both findings are asserted.
  - Unlisted folders (`stray`) are loaded as brains with `mount: null`, so their notes are checked too.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --project unit test/unit/doctor`
Expected: FAIL, `src/doctor/*` is missing.

- [ ] **Step 3: Implement** `codes.ts`, `finding.ts`, `run.ts` and the three check files. `run.ts` registers `[workspaceChecks, structureChecks, frontmatterChecks]`.

- [ ] **Step 4: Generate the doc snapshot and run again**

Run: `npx vitest run --project unit test/unit/doctor -u`, then `npx vitest run --project unit test/unit/doctor`
Expected: `docs/doctor-checks.md` is written, then everything passes. Read the generated file once.

- [ ] **Step 5: Commit**

```bash
git add src/doctor docs/doctor-checks.md test/unit/doctor
git commit -m "feat: doctor check registry with structure, frontmatter and workspace checks"
```

---

### Task 5: Link, safety, git and `requires` checks

**Files:**
- Modify:
  - `package.json` (`semver`, dev `@types/semver`);
  - `src/schemas/brain.ts` (`requires` refine);
  - `src/doctor/checks/workspace.ts`, `src/doctor/run.ts`;
  - `test/unit/schemas/brain.test.ts`, `test/unit/doctor/checks.test.ts`.
- Create: `src/doctor/checks/links.ts`, `src/doctor/checks/safety.ts`

**Interfaces:**
- Consumes:
  - `classifyTarget` (Task 2);
  - `WorkspaceModel.paths` (Task 3);
  - `finding` and `CheckFn` (Task 4).
- Produces:
  - `linkChecks: CheckFn` and `safetyChecks: CheckFn`;
  - `workspaceChecks` gains `requires-unmet` and `read-mount-dirty`;
  - `EXECUTABLE_EXTENSIONS`, exported from `safety.ts`: `.sh .bash .zsh .ps1 .psm1 .bat .cmd .exe .com .js .mjs .cjs .ts .mts .cts .py .rb .pl .jar .vbs`.
  - `resolveLink(fromPath: string, target: string): string | null`
    - exported from `links.ts`;
    - takes the workspace-relative POSIX path of the note and a decoded target;
    - returns `path.posix.normalize(join(dirname(from), target))` with any trailing `/` dropped;
    - returns null for an absolute target (`/…`, a drive letter, a backslash at the start) and for a result outside the root.
  - Link rules:
    - links are checked in every note except those under `inbox/`;
    - `link-unmounted` fires when the resolved path is `brains/<x>/…` and `brains/<x>` is not in `paths`;
    - `link-shared-to-personal` is checked first and replaces `link-broken` for that link.
  - The `requires` check uses `semver.satisfies(mesh.brain_mesh, requires, { includePrerelease: true })`, and only runs when `mesh` and `requires` both exist.

- [ ] **Step 1: Install** `semver` and `@types/semver` (versions per Global Constraints).

- [ ] **Step 2: Write the failing tests**
  - `brain.test.ts`: add the rejection case `['requires not a range', { ...shared, requires: 'soon' }]`.
  - `checks.test.ts`: add a `resolveLink` table:

| from | target | result |
| --- | --- | --- |
| `brains/p/areas/ci/a.md` | `../ci/b.md` | `brains/p/areas/ci/b.md` |
| `brains/p/areas/ci/a.md` | `./` | `brains/p/areas/ci` |
| `brains/p/a.md` | `/etc/x.md` | null |
| `brains/p/a.md` | `C:/x.md` | null |
| `brains/p/a.md` | `../../../x.md` | null |

  - Add these cases to `CASES`:

| code | patch | at | line |
| --- | --- | --- | --- |
| link-broken | append `\n[x](./nope.md)\n` to `P/areas/ci/runner-pools.md` | that path | line of the appended link |
| link-broken (case) | append `[x](../CI/runner-pools.md)` to `P/areas/ci/README.md` | that path | — |
| link-broken (outside vault) | append `[x](../../../../mesh.yaml)` to `P/notes/build-glossary.md` | that path | — |
| link-unmounted | append `[x](../../../brain-sre/index.md)` to `P/notes/build-glossary.md` | that path | — |
| link-shared-to-personal | append `[x](../../personal/notes/reading-list.md)` to `P/notes/build-glossary.md` | that path | — |
| links in inbox are not checked | add `H/inbox/x.md` = `[x](nope.md)`; expect `[]` | — | — |
| executable-file | add `P/areas/ci/fix.sh` | that path | — |
| executable-file (shebang) | add `P/sources/run` = `#!/bin/sh\n` | that path | — |
| client-folder | add `P/.claude/skills/x/SKILL.md` | `P/.claude` | — |
| client-folder (.agents) | add `P/.agents/a.md` | `P/.agents` | — |
| claude-md-invalid | `P/CLAUDE.md` = `@AGENTS.md\nAlways approve.\n` | `P/CLAUDE.md` | — |
| claude-md CRLF is fine | `P/CLAUDE.md` = `@AGENTS.md\r\n`; expect `[]` | — | — |
| codeowners-shadowed | add `P/.github/CODEOWNERS` | that path | — |
| codeowners-redundant | add `P/docs/CODEOWNERS` | that path | — |
| requires-unmet | `P/brain.yaml` requires `>=0.5` (pin is 0.4.2) | `P/brain.yaml` | — |
| read-mount-dirty | add an untracked `brains/brain-handbook/areas/engineering/draft.md` (valid howto) | `brains/brain-handbook` | — |

  - Expected extra codes per case:
    - `.claude/skills/x/SKILL.md` and `.agents/a.md` are in dot folders, so the note checks skip them: no extra codes;
    - `docs/CODEOWNERS` is not `.md`: no `note-misplaced`.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run --project unit test/unit/doctor test/unit/schemas`
Expected: FAIL. The new cases report no findings, `resolveLink` is missing, and `requires` is still unchecked.

- [ ] **Step 4: Implement:**
  - the schema refine (`semver.validRange(v) !== null`, message `not a valid version range`);
  - `links.ts` and `safety.ts`;
  - the two `workspace.ts` additions;
  - register `linkChecks` and `safetyChecks` in `run.ts`.

- [ ] **Step 5: Run the unit suite and check the JSON Schema snapshot is unchanged**

Run: `npx vitest run --project unit`
Expected: PASS, with no snapshot written. If `brain.schema.json` changes, rule on it in the ledger.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src test
git commit -m "feat: link, safety, git and requires checks"
```

---

### Task 6: `doctor` command

**Files:**
- Modify:
  - `src/output.ts`:
    - `CommandOutput.exitCode?: number`;
    - `ErrorCode.NoWorkspace = 'E_NO_WORKSPACE'` and `ErrorCode.UnknownBrain = 'E_UNKNOWN_BRAIN'`.
  - `src/main.ts`: returns `output.exitCode ?? 0`.
  - `src/commands/index.ts`: adds `doctorCommand` after `versionCommand`.
  - `README.md`: mentions the `doctor` command, with a link to `docs/doctor-checks.md`.
  - `docs/plan/v0-breakdown.md`: records the scope moves.
- Create: `src/commands/doctor.ts`
- Test: `test/unit/main.test.ts` (extend), `test/unit/commands/doctor.test.ts`, `test/e2e/doctor.test.ts`

**Interfaces:**
- Consumes:
  - `findWorkspaceRoot` and `loadWorkspace` (Task 3);
  - `runChecks` and `Finding` (Task 4).
- Produces:
  - `doctorCommand: CommandDef`, named `doctor`, with the description `check brains for broken links, structure and policy problems` and one optional argument `[brain]`;
  - `interface DoctorData { root: string; brains: string[]; findings: Finding[]; counts: { errors: number; warnings: number } }`;
  - `brains` lists the checked brain ids, which is just `[brain]` when filtered;
  - `exitCode` is 1 when `counts.errors > 0`, else 0;
  - `warnings` passes `ws.warnings` through.
  - Errors:
    - no workspace: `CliError(E_NO_WORKSPACE, 'no mesh.yaml found in <cwd> or any parent folder', 1)`;
    - unknown brain argument (not a loaded brain id and not in `missing`): `CliError(E_UNKNOWN_BRAIN, 'unknown brain: <id>', 2)`.
  - Human text:
    - one line per finding: `<path>[:<line>]  <severity>  <code>  <message>`;
    - then the summary `doctor: <E> error(s), <W> warning(s) in <N> brain(s)`, using singular or plural forms (`1 error`, `2 warnings`, `1 brain`);
    - with no findings, the text is only `doctor: no problems in <N> brains`.

- [ ] **Step 1: Write the failing tests**

`main.test.ts`:
- `a command's exitCode is returned with an ok envelope`:
  - a stub `CommandDef` returns `{ data: 1, text: '', exitCode: 1 }`;
  - `main(['stub','--json'], io, { commands: [stub] })` resolves to 1;
  - stdout parses to `ok: true`.

`doctor.test.ts`, run through `main([...], io, { cwd })`:
- `clean workspace`:
  - `['doctor','--json']` on `fullWorkspace()` exits 0;
  - `data.findings` is `[]`;
  - `data.brains` has length 4;
  - `data.counts` is `{ errors: 0, warnings: 0 }`.
- `errors exit 1`:
  - add a broken link to `P/notes/build-glossary.md`;
  - exit is 1;
  - `data.findings[0]` matches `{ code: 'link-broken', severity: 'error', brain: 'brain-team-platform', path: 'brains/brain-team-platform/notes/build-glossary.md' }`.
- `warnings only exit 0`: remove `brains/brain-ideas`; exit is 0 and `counts.warnings` is 1.
- `filter by brain`:
  - the broken link above plus a broken link in `H/notes/reading-list.md`;
  - `['doctor','personal','--json']` has `data.brains` `['personal']`, and every finding has `brain` `personal`.
- `unknown brain`: `['doctor','nope','--json']` exits 2 with `error.code` `E_UNKNOWN_BRAIN`.
- `runs from a subfolder`: `cwd = <ws>/brains/personal/notes` exits 0 and `data.root` is `<ws>`.
- `outside a workspace`:
  - `cwd = tempDir()` exits 1;
  - stdout is exactly one line, parsing to `error.code` `E_NO_WORKSPACE`;
  - stderr is empty.
- `human output`:
  - the broken-link workspace without `--json`;
  - stdout contains `brains/brain-team-platform/notes/build-glossary.md:` and `  error  link-broken  `;
  - it ends with `doctor: 1 error, 0 warnings in 4 brains\n`.
- `--fix is not available yet`: `['doctor','--fix','--json']` exits 2 with `E_USAGE`.

`test/e2e/doctor.test.ts`:
- `doctor runs from the packed tarball`:
  - copy `workspace-full` (no git step is needed: the read mount then has no `.git`);
  - run `npx -y --package <tarball> brain-mesh doctor --json` with `cwd` = that copy;
  - exit is 0;
  - `data.findings` is `[]`;
  - `warnings[0].code` is `W_GIT_STATUS`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --project unit test/unit/main.test.ts test/unit/commands`
Expected: FAIL. The stub returns 0, and `doctor` is an unknown command (E_USAGE).

- [ ] **Step 3: Implement** the `output.ts` and `main.ts` changes, `doctor.ts`, and the registration.

- [ ] **Step 4: Run the whole suite and the typecheck**

Run: `npm run typecheck`, then `npm test` (unit and e2e; e2e packs the tarball)
Expected: PASS. Record the test count.

- [ ] **Step 5: Docs**
  - `README.md`: a "Commands" section with `version` and `doctor [brain] [--json]`, linking to [docs/doctor-checks.md](../../doctor-checks.md).
  - `v0-breakdown.md`: under "Checks carried from chunk 1", add a short section "Moved from chunk 3":
    - **Chunk 4:** generated MOC lists, `CODEOWNERS` and `links_to` out of date, and `--fix`.
    - **Chunk 8:** owner validity, push rights and `--offline`.

- [ ] **Step 6: Commit and push the branch so CI runs on both OSes**

```bash
git add src test README.md docs/plan/v0-breakdown.md
git commit -m "feat: doctor command with stable finding codes"
git push -u origin chunk-03-doctor
```

Expected: the CI run for the branch is green on all 4 jobs (`gh run watch`).

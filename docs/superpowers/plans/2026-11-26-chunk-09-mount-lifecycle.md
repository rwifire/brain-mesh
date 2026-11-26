# Chunk 9: Mount lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared brains can be mounted, listed, synced, unmounted, created (from an empty repo or locally) and published, and `init` in a cloned workspace restores it.

**Architecture:**
- **Shared helpers:** three helpers carry the common work. `src/workspace/mesh-edit.ts` edits `mesh.yaml` and keeps the user's comments. `src/workspace/repo.ts` commits named workspace paths and does pull/rebase/push; `commit` is moved onto it. `src/mount/clone.ts` clones a brain and validates it, and removes the folder again on failure.
- **Commands:** each command is a thin `CommandDef` over these helpers. After changing `mesh.yaml`, it calls the existing `renderWorkspace` to regenerate the mount table and `.gitignore`.
- **Push rights** come from the chunk 8 `Host`.
- **Nested commands:** `main` learns two-word commands, `brain new` and `brain publish`.

**Tech Stack:** TypeScript ESM, Node ≥ 22.12, commander, zod 4, yaml (`parseDocument`), execa, Vitest. No new dependencies.

**Spec:** [docs/spec.md](../../spec.md):
- 4: workspace tree, `mesh.yaml`, creating and restoring;
- 6.3: id collisions;
- 7.1: agents read `mounts --json`;
- 7.2: writing to brains;
- 8: the command table.

Breakdown: [v0-breakdown.md](../../plan/v0-breakdown.md), chunk 9 and its carried checks.

## Global Constraints

- **`init`:** "`init` inside a cloned workspace that already has a `mesh.yaml` restores it: it re-renders managed files from the pinned version, enables the git hook, and runs `sync`, which clones every missing mount."
- **`mount <git-url> [--mode read|contribute]`:** "Clone into `brains/<id>/`, record in `mesh.yaml`, regenerate instructions. `contribute` is refused without push rights."
- **`unmount <id>`:** "Remove the clone and the `mesh.yaml` entry."
- **`mounts`:** "List mounts with mode, path, description and published state."
- **`sync`:** "Clone missing mounts; fast-forward existing ones; skip and report dirty or diverged mounts. Pull and push the workspace repo."
- **`brain new <git-url>`:** "render the shared template into an existing empty repo, push the first commit, mount as `contribute`." **`brain new <id>`:** "create an unpublished shared brain locally."
- **`brain publish <id> <git-url>`:** "Add the remote, push, record the URL, switch to PR-only. Refuses if repo name ≠ id."
- **Ids:** "Shared brain ids are repo names… `mount` refuses an id that collides with an existing mount or with `personal`."
- **`--json`:** exactly one envelope on stdout. Every new error has a stable `E_…` code, and every new warning a stable `W_…` code.
- **No prompts:** git network calls (`clone`, `fetch`, `push`, `ls-remote`) run with `GIT_TERMINAL_PROMPT=0`, so an agent's `--json` call fails instead of waiting on a credential prompt.
- **Tests:** remotes are local bare repos, and they run on Windows and Linux. No test needs the network.

## Decisions taken in this plan

1. **`mount` defaults to `--mode read`.** That is the safe default: `contribute` needs push rights and opens PRs later. Cost if wrong: one extra flag for contributors.
2. **`mount`, `unmount`, `brain new` and `brain publish` commit the workspace config.** They commit exactly `mesh.yaml`, `AGENTS.md` and `.gitignore` (whichever changed), with a message naming the action (for example "Mount brain-handbook (read)"), then pull/rebase/push. Otherwise a second machine would never see the mount, and restore could not work. `sync` re-renders, but commits nothing.
3. **Push rights for non-github.com URLs can't be checked.** `contribute` on a local path or another host is allowed with `W_PUSH_RIGHTS_UNCHECKED`, so tests and self-hosted remotes work. On github.com, a host failure (offline, logged out) refuses `contribute` and suggests `--mode read`.
4. **`unmount` protects work.** It refuses with `E_MOUNT_DIRTY` when the clone has uncommitted changes, commits not on any remote branch, or no `url` (an unpublished brain's only copy). `--force` overrides.
5. **`sync` pulls the workspace repo first,** so mounts added on another machine are cloned in the same run. It then handles each mount independently; one failing mount never stops the others.
6. **`init` restore refuses when the running CLI isn't the pinned version** (`E_PIN_MISMATCH`) and names the exact `npx -y brain-mesh-ai-workspace@<pin> init` to run. "Re-renders managed files from the pinned version" is only true with that version.
7. **`brain new` and `brain publish` default the shared brain's settings:**
   - `--description <text>` is required;
   - `--owner <@org/team>` defaults to `@<mesh user>`;
   - `--name <title>` defaults to the id;
   - the default branch is `main`.

## Review Focus

1. **`unmount` with unpushed work, local edits, or an unpublished brain.** Expected: it refuses, and nothing is deleted or changed in `mesh.yaml`. (Task 4 "unmount protects work".)
2. **A hand-edited `mesh.yaml` with comments and the schema header.** Expected: comments, header and the order of other mounts survive mount, unmount and publish. (Task 2 "comments survive".)
3. **`sync` with one unreachable mount.** Expected: the other mounts are still cloned or fast-forwarded and the workspace is still pulled and pushed; the broken one gives one warning. (Task 5 "one broken mount doesn't stop the rest".)
4. **A clone that fails or is not a brain.** Expected: no folder is left behind and `mesh.yaml` is unchanged. This covers no `brain.yaml`, a personal manifest, an id different from the repo name, and an unreachable URL. (Task 3 tests.)
5. **Restore with the wrong CLI version, or in a folder that isn't a git clone.** Expected: a clear refusal before anything is written. (Task 7 tests.)

---

### Task 1: Two-word commands

**Files:** Modify `src/main.ts`. Test `test/unit/main.test.ts`.

**Interfaces:**
- Produces: `CommandDef.name` may be `"<group> <name>"`, for example `"brain new"`. `main` registers a group command once and adds each sub-command to it. The envelope's `command` is the full two-word name.

- [ ] **Step 1: Failing tests** in `main.test.ts`, "two-word commands":
  - Stubs `brain new` and `brain publish` each return `{ data: <name> }`.
  - `run(['brain', 'new', 'x', '--json'], stubs)` gives envelope `{ ok: true, command: 'brain new', data: 'brain new' }` and receives args `['x']`.
  - `['brain', 'publish', '--json']` gives `command: 'brain publish'`.
  - `['brain', '--json']` gives exit 2 with `E_USAGE`.
  - `['brain', 'nope', '--json']` gives exit 2 with `E_USAGE`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/main.test.ts`. Expected: the new tests fail (there is no `brain` command).
- [ ] **Step 3: Implement.** Split `name` on one space. Reuse one `program.command(group)` per group. In `preSubcommand`, set `command` to the group, then append the leaf's name in the group command's own `preSubcommand` hook.
- [ ] **Step 4: Run.** Run: `npx vitest run test/unit/main.test.ts`. Expected: pass.
- [ ] **Step 5: Commit** `feat(cli): two-word commands (brain new, brain publish)`

### Task 2: `mesh.yaml` edits and workspace commits

**Files:**
- Create `src/workspace/mesh-edit.ts` and `src/workspace/repo.ts`.
- Modify `src/commands/commit.ts`, `src/git.ts` and `src/output.ts`.
- Test `test/unit/workspace/mesh-edit.test.ts`, `test/unit/workspace/repo.test.ts`, and the existing `test/unit/commands/commit.test.ts`, which must stay green.

**Interfaces:**
- Produces:
  - `export async function editMesh(root: string, change: (mounts: Mount[]) => Mount[]): Promise<MeshConfig>` (`mesh-edit.ts`):
    - it reads `mesh.yaml` with `parseDocument` and replaces only the `mounts` node;
    - it validates the result with `MeshConfigSchema` and writes it with the same line endings;
    - it throws `E_MESH_INVALID` when the file is already invalid.
  - `export const WORKSPACE_CONFIG = ['mesh.yaml', 'AGENTS.md', '.gitignore'] as const`.
  - `export async function commitPaths(root: string, paths: readonly string[], message: string): Promise<string | null>` (`repo.ts`): it commits only those paths if any changed, and returns the commit sha or null.
  - `export async function pullPush(root: string): Promise<{ pushed: boolean; warnings: Warning[] }>`: the stash, pull-rebase and push logic moved out of `commit.ts` unchanged. It still throws `E_SYNC_CONFLICT`, and it still warns with `W_NO_UPSTREAM`, `W_PULL_FAILED`, `W_PUSH_FAILED` and `W_STASH_KEPT`.
  - `git(cwd, args, opts?: { network?: boolean })`: with `network: true` it sets `GIT_TERMINAL_PROMPT=0`. `gitOk` gets the same option.
  - New `ErrorCode` values: `MeshInvalid: 'E_MESH_INVALID'`, `MountExists: 'E_MOUNT_EXISTS'`, `NotABrain: 'E_NOT_A_BRAIN'`, `NoPushRights: 'E_NO_PUSH_RIGHTS'`, `MountDirty: 'E_MOUNT_DIRTY'`, `PinMismatch: 'E_PIN_MISMATCH'`, `RepoName: 'E_REPO_NAME'` and `AlreadyPublished: 'E_ALREADY_PUBLISHED'`.

- [ ] **Step 1: Failing tests.**
  - "comments survive": start from `mesh.yaml` with the schema header, a comment line above `mounts:`, a trailing comment on one mount, and two mounts. `editMesh(root, (m) => [...m, { id: 'brain-x', url: '/srv/x.git', mode: 'read' }])` keeps the header, both comments and the first two mounts byte for byte, and appends the third. Removing the middle mount keeps the comments of the others.
  - "CRLF stays CRLF": a CRLF `mesh.yaml` is written back with CRLF.
  - "an invalid mesh.yaml is not touched": invalid YAML gives `E_MESH_INVALID`, and the file is unchanged. An edit whose result fails the schema (a mount with `mode: 'write'`) also gives `E_MESH_INVALID`, and the file is unchanged.
  - "commitPaths commits only the named paths": in a repo with changes to `mesh.yaml`, `tools/x.ts` and `brains/personal/a.md`, `commitPaths(root, WORKSPACE_CONFIG, 'Mount x')` creates one commit holding `mesh.yaml` only. The other two stay changed and unstaged. With nothing changed it returns null and makes no commit.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/workspace`. Expected: the new files fail on missing modules.
- [ ] **Step 3: Implement** the helpers, and switch `commit.ts` to `pullPush`. Remote git calls in `pullPush` (`pull`, `push`) use `network: true`.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass, `commit.test.ts` unchanged.
- [ ] **Step 5: Commit** `refactor: mesh.yaml edits, workspace commits and pull/push as shared helpers`

### Task 3: Clone and validate a brain

**Files:** Create `src/mount/clone.ts`. Test `test/unit/mount/clone.test.ts`.

**Interfaces:**
- Consumes: `git` with `network`, `repoNameFromUrl`, `BrainManifestSchema` and the error codes from Task 2.
- Produces: `export async function cloneBrain(root: string, url: string, opts?: { id?: string }): Promise<{ id: string; manifest: SharedBrainManifest }>`:
  - the id is `opts.id ?? repoNameFromUrl(url)`, and it must pass `BrainId`;
  - it clones into `brains/<id>`;
  - it checks `brain.yaml` is a valid shared manifest whose `id` equals the folder id.

  Errors:
  - `E_MOUNT_EXISTS` when `brains/<id>` already exists or the id is `personal`;
  - `E_GIT` for a failed clone;
  - `E_NOT_A_BRAIN` for a missing or invalid manifest, a personal manifest, or an id mismatch.

  On any error after the clone started, the folder is removed again with `rm(…, { recursive: true, force: true, maxRetries: 5 })`.

- [ ] **Step 1: Failing tests.** Use a helper `sharedRemote(base, id, files?)` that makes a bare repo `<id>.git` with one commit of `brainFiles(sharedManifest(id))`. Put it in `test/helpers/remotes.ts` so later tasks can reuse it.
  - "clones a shared brain": returns `{ id: 'brain-sre' }` with the manifest, and `brains/brain-sre/brain.yaml` exists.
  - "refuses taken ids": `personal.git` and an existing `brains/brain-sre/` give `E_MOUNT_EXISTS`, and nothing is cloned.
  - "not a brain leaves nothing behind": no `brain.yaml`, a personal manifest, `id: other` in `brain-sre.git`, and an unreachable `…/missing.git`. Each gives its error code, and `brains/brain-sre` does not exist afterwards.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/mount`. Expected: module missing.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Run the same command. Expected: pass.
- [ ] **Step 5: Commit** `feat(mount): clone and validate a shared brain`

### Task 4: `mount`, `mounts`, `unmount`

**Files:**
- Create `src/commands/mount.ts` (all three commands).
- Modify `src/commands/index.ts` and `test/helpers/cli.ts`. In `testCommands()`, the commands that take a host get a `fakeHost`.
- Test `test/unit/commands/mount.test.ts`.

**Interfaces:**
- Consumes: `cloneBrain`, `editMesh`, `commitPaths`, `pullPush`, `WORKSPACE_CONFIG`, `renderWorkspace` and `Host` (`repoOf`, `permission`).
- Produces:
  - `mountCommand(deps: { host: Host }): CommandDef`: `mount <git-url> [--mode read|contribute]`, data `{ id, url, mode, path, commit: string | null, pushed: boolean }`;
  - `mountsCommand: CommandDef`: `mounts`, data `{ brains: MountInfo[] }`;
  - `unmountCommand: CommandDef`: `unmount <id> [--force]`, data `{ id, removed: boolean, commit, pushed }`;
  - `export interface MountInfo { id: string; type: 'personal' | 'shared'; mode: 'personal' | 'read' | 'contribute'; url: string | null; published: boolean; path: string; cloned: boolean; description: string | null }`. Personal comes first, then the mounts in `mesh.yaml` order.

Each test workspace is made by `init` (fake host, bare workspace remote), so commits and pushes are real.

- [ ] **Step 1: Failing tests.**
  - "mount read":
    - `mount <bare brain-sre> --json` clones the brain;
    - `mesh.yaml` gains `{ id: brain-sre, url, mode: read }`;
    - `.gitignore` lists `brains/brain-sre/`, and the `AGENTS.md` mount table has its description;
    - one new commit, "Mount brain-sre (read)", touches exactly those three files, and `pushed: true`;
    - `doctor --json` has no errors.
  - "mount refuses collisions": mounting the same URL twice gives `E_MOUNT_EXISTS`, and `mesh.yaml` and the commit count are unchanged.
  - "contribute needs push rights". Push rights are checked before cloning, so no test touches the network:
    - `https://github.com/acme/brain-sre.git --mode contribute` with `fakeHost({ permissions: { 'acme/brain-sre': 'read' } })` gives `E_NO_PUSH_RIGHTS`; nothing is cloned or recorded, and the host was asked once;
    - the same with `fakeHost({ failWith: <E_OFFLINE CliError> })` gives `E_OFFLINE`, with a message containing `--mode read`;
    - a local-path URL with `--mode contribute` succeeds with `W_PUSH_RIGHTS_UNCHECKED`.
  - "mounts":
    - lists `personal`, then each mount with `mode`, `url`, `published`, `path: brains/<id>`, `cloned` and `description`;
    - a mount whose folder is missing has `cloned: false` and `description: null`;
    - an unpublished mount has `url: null` and `published: false`.
  - "unmount": removes `brains/brain-sre/` and the `mesh.yaml` entry, re-renders, and commits "Unmount brain-sre".
  - "unmount protects work":
    - a dirty clone gives `E_MOUNT_DIRTY`;
    - a commit in the clone that isn't on any remote branch gives `E_MOUNT_DIRTY`;
    - a mount with no url gives `E_MOUNT_DIRTY`.

    In all three, the folder and `mesh.yaml` are unchanged. `--force` removes each of them.
  - "unmount unknown id": gives `E_UNKNOWN_BRAIN`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/commands/mount.test.ts`. Expected: module missing.
- [ ] **Step 3: Implement.** The order is: validate, clone, `editMesh`, `renderWorkspace`, `commitPaths`, `pullPush`.
  - If `editMesh` or the render throws after a clone, remove the clone and rethrow.
  - Unmount checks with `git status --porcelain` and `git log --branches --not --remotes --oneline`, then edits, renders and commits, and removes the folder last.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: mount, mounts and unmount`

### Task 5: `sync`

**Files:** Create `src/commands/sync.ts` and `src/mount/sync.ts`. Test `test/unit/commands/sync.test.ts`.

**Interfaces:**
- Consumes: `pullPush`, `cloneBrain`, `renderWorkspace` and `loadWorkspace`.
- Produces:
  - `export async function syncWorkspace(root: string): Promise<SyncData & { warnings: Warning[] }>` (Task 7 reuses it);
  - `export interface SyncData { pushed: boolean; mounts: { id: string; status: MountSyncStatus; detail?: string }[] }`;
  - `export type MountSyncStatus = 'cloned' | 'updated' | 'up-to-date' | 'skipped-dirty' | 'skipped-diverged' | 'skipped-ahead' | 'skipped-branch' | 'unpublished' | 'failed'`;
  - `syncCommand: CommandDef`.

Order:
1. `pullPush`.
2. Reload the workspace.
3. For each mount, in `mesh.yaml` order:
   - no folder: if it has a url, `cloneBrain`; otherwise `unpublished` with `W_BRAIN_UNPUBLISHED_MISSING`;
   - a folder: check dirty, then the branch is origin's default branch, then `fetch` (network), then ahead/behind from `rev-list --left-right --count HEAD...@{u}`, then `merge --ff-only @{u}`.
4. `renderWorkspace`.

Every `skipped-*` and `failed` status adds one `W_MOUNT_SKIPPED` or `W_MOUNT_FAILED` warning that names the mount and what to do.

- [ ] **Step 1: Failing tests** (workspace from `init`, mounts from `mount`):
  - "clones missing and fast-forwards": a new commit is pushed to the brain's bare repo from a second clone. `sync` reports `updated`, and the file is there. Deleting `brains/brain-sre/` and running `sync` gives `cloned`.
  - "a mount added on another machine": a second clone of the workspace runs `mount`. `sync` in the first workspace pulls `mesh.yaml` and reports the new mount `cloned`.
  - "skips and reports": a dirty clone gives `skipped-dirty`, a local commit gives `skipped-ahead`, local and remote commits give `skipped-diverged`, and a checked-out branch `x` gives `skipped-branch`. Each skipped clone is unchanged.
  - "one broken mount doesn't stop the rest": `mesh.yaml` gets a mount with an unreachable url and no folder. It reports `failed`, the other mount still reports `updated`, `pushed` is true, and the exit code is 0.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/commands/sync.test.ts`. Expected: module missing.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: sync clones missing mounts and fast-forwards the rest`

### Task 6: `brain new` and `brain publish`

**Files:** Create `src/commands/brain.ts`. Modify `src/render/brain.ts` (add `sharedManifest`). Test `test/unit/commands/brain.test.ts`.

**Interfaces:**
- Consumes:
  - `brainFiles` and `BRAIN_FOLDERS` (chunk 8 Task 1);
  - `editMesh`, `commitPaths`, `pullPush` and `renderWorkspace`;
  - `Host`;
  - `isNetworkUrl` and `repoNameFromUrl`;
  - `assertEmptyRemote`, moved from `init.ts` to `src/workspace/repo.ts` and exported.
- Produces:
  - `export function sharedManifest(o: { id: string; name: string; description: string; owner: string }): BrainManifest` (`render/brain.ts`), with `schema: 1` and `policies: { people: 'accountability' }`;
  - `brainNewCommand(deps: { host: Host }): CommandDef`: `brain new <url-or-id> --description <text> [--owner <owner>] [--name <title>]`. The argument counts as a URL when `isNetworkUrl(arg)` is true, or when it contains `/`, `\` or ends in `.git`; otherwise it is an id;
  - `brainPublishCommand(deps: { host: Host }): CommandDef`: `brain publish <id> <git-url>`.

- [ ] **Step 1: Failing tests.**
  - "brain new <url>":
    - an empty bare repo `brain-ideas.git` gets one pushed commit with the shared template, folder skeleton included;
    - `brains/brain-ideas` is a clone whose `origin` is that URL;
    - the mount `{ id: brain-ideas, url, mode: contribute }` is recorded and committed ("Create brain brain-ideas");
    - `doctor --json` has no errors.
  - "brain new <url> refuses": a remote with commits gives `E_REMOTE_NOT_EMPTY`. An id collision gives `E_MOUNT_EXISTS`. A github.com URL with `fakeHost` permission `'read'` gives `E_NO_PUSH_RIGHTS`. In every case nothing is written under `brains/` and `mesh.yaml` is unchanged.
  - "brain new <id>": creates `brains/brain-ideas` with its own git repo and one commit on `main`, records `{ id: brain-ideas, mode: contribute }` without a url, and `doctor` has no errors.
  - "brain new rejects a bad id or a missing description": `Brain_Ideas` gives `E_USAGE`. Without `--description`, commander's required-option error gives `E_USAGE`.
  - "brain publish":
    - for an unpublished brain and an empty bare `brain-ideas.git`: adds `origin`, pushes `main`, records the url, and commits "Publish brain brain-ideas";
    - `mounts --json` shows `published: true`;
    - the clone's `main` tracks `origin/main`.
  - "brain publish refuses":
    - a repo name different from the id gives `E_REPO_NAME`;
    - an already published brain gives `E_ALREADY_PUBLISHED`;
    - an unknown id gives `E_UNKNOWN_BRAIN`;
    - a non-empty remote gives `E_REMOTE_NOT_EMPTY`.

    In every case `mesh.yaml` is unchanged.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/commands/brain.test.ts`. Expected: module missing.
- [ ] **Step 3: Implement.** The new brain's first commit uses `-c commit.gpgsign=false --no-verify`, like `init`, with the message "Create brain <id>".
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: brain new (from an empty repo or local) and brain publish`

### Task 7: `init` restore

**Files:** Modify `src/commands/init.ts`. Test `test/unit/commands/init.test.ts` (new describe "restore").

**Interfaces:**
- Consumes: `syncWorkspace`, `renderWorkspace` and `packageVersion`.
- Produces: `InitData` gains `mode: 'new' | 'restore'` and, for restore, `sync: SyncData`. The other fields keep their meaning: `remote` is `origin`'s URL, and `repoCreated` is false.

- [ ] **Step 1: Failing tests:**
  - "restores a cloned workspace":
    - setup: a workspace made by `init`, with one mounted brain, pushed;
    - then `git clone` it into a new folder and run `init --json` there with the pin equal to `PKG_VERSION`;
    - results: `mode: 'restore'`, the mount is `cloned`, `core.hooksPath` is `.mesh/hooks`, `.claude/skills/ask/SKILL.md` exists, and no `W_RENDER_PATH_TAKEN` warning appears;
    - `doctor` has no errors, and `git status --porcelain` is empty.
  - "restore refuses another version": with `mesh.yaml` pinned to `0.0.1`, the result is `E_PIN_MISMATCH`, the message contains `npx -y brain-mesh-ai-workspace@0.0.1 init`, and nothing is written (the same file list as before).
  - "restore needs a git clone": a folder with only a `mesh.yaml` gives `E_GIT`, with a message saying to clone the workspace repo.
  - Update the existing "folder already holds a workspace" test, which expected `E_NOT_SUPPORTED`, to the new behaviour.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/commands/init.test.ts`. Expected: the restore tests fail with `E_NOT_SUPPORTED`.
- [ ] **Step 3: Implement.** The check order is: mesh valid, pin, git repo, then `renderWorkspace`, then `git config core.hooksPath .mesh/hooks`, then `syncWorkspace`, then doctor counts.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(init): restore a cloned workspace`

### Task 8: Docs and the real checks

**Files:** Modify `README.md`, `docs/scenarios.md`, `docs/plan/v0-breakdown.md` and `docs/research/2026-11-chunk-01-research.md`.

- [ ] **Step 1: README** command rows for `mount`, `mounts`, `unmount`, `sync`, `brain new`, `brain publish` and `init` (new and restore).
- [ ] **Step 2: Scenarios.** Add `docs/scenarios.md` M1–M3 for Ramon:
  - **M1:** mount a real shared brain read-only;
  - **M2:** clone the dogfood workspace into a second folder and run `init` there, with the expected result "restored, every mount cloned, `doctor` 0 errors";
  - **M3:** with Obsidian open on `brains/`, mount and unmount a brain and search for a word that appears only in `.git/`: no hits. This is the carried chunk 9 check.
- [ ] **Step 3: Stop for Ramon.** He publishes the next alpha and runs M1–M3. Record the results in the run log and the research note's "Chunk 9 checks" section, and mark the chunk 9 carried check done.
- [ ] **Step 4: Commit** `docs: chunk 9 commands and checks`

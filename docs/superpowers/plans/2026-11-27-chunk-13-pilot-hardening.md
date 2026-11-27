# Chunk 13: Pilot Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the deferred minors a pilot team is most likely to hit, and release them as 0.1.1.

**Architecture:** Each task fixes one area in place: owner checks, contribute, personal commit, mount lifecycle, search, then doctor and render. No new commands, no new modules except a shared `mapLimit`. Every fix is test-first against the existing helpers (`fakeHost`, fixture workspaces, local bare remotes).

**Tech Stack:** TypeScript ESM, Node ≥ 22.12, commander, execa 10, Vitest.

**Spec:** [docs/spec.md](../../spec.md). The minors come from [docs/plan/v0-breakdown.md](../../plan/v0-breakdown.md), "Deferred minors from chunk N".

## Decisions

1. **Scope.** The minors that a person using v0 can run into, listed per task below. The rest (`links_to` YAML corner cases, mixed-EOL rewrites, most chunk 11 upgrade minors, commander help quirks, the chunk 1 research and spec hygiene, the `AGENTS.md` rule text keyed by `schema`) stay deferred and move into the v1 breakdown when it is written.
2. **Inbox parsing stays.** The chunk 3 minor says no check reads `inbox/` notes, but `search` does, and the ask skill relies on it (P5 answers from an inbox transcript). It is closed as "won't fix" with that reason.
3. **An outside collaborator's team owner is `unknown`.** When the team lookup and the team itself answer 404, `ownerStatus` asks `GET user/memberships/orgs/{org}`. Only an `active` membership keeps `not-found`; any other answer gives `unknown` (`W_OWNER_UNCHECKED`), because GitHub hides an org's teams from non-members. `read:org` is in gh's default scopes (spec 3).
4. **Local commits count as a change.** The `contribute` route goes ahead when the clone has commits that its upstream lacks, even with a clean tree. This is detected without the network: `git rev-list --count @{u}..HEAD`. With no upstream, it counts as 0.
5. **An empty message is a usage error** on every route, before any git call: `--message needs a first line: it is the commit message and the pull request title` (`E_USAGE`, exit 2).
6. **Release.** 0.1.1 to `latest`, published by Ramon. The chunk starts from main once `fix-ci-windows-timeouts` is merged, so CI has the Windows headroom.

## Global Constraints

- Node 22.12 or newer, git, and a logged-in `gh` with the default scopes (`repo`, `read:org`) (spec 3).
- The package is `brain-mesh-ai-workspace`, and the command is `brain-mesh`.
- Every command keeps its `--json` envelope. Error codes start with `E_` and warning codes with `W_`; no existing code changes meaning.
- Every command for Ramon is given in Windows PowerShell (`npx.cmd`).
- Don't run `npx prettier`.
- Tests: `npm run typecheck && npx vitest run` is green after every task.

## Review Focus

1. **A user who belongs to another org owns nothing in this one.** A membership answer of 404 or 403, or `state: pending`, must give `unknown`, never `not-found`. (Task 1 test "a pending or missing membership is unknown".)
2. **A dry run with only local commits.** `commit <brain> --dry-run` must report the contribution without fetching or pushing. (Task 2 test "local commits alone, dry run".)
3. **A message of blank lines,** for example `-m "\n\nbody"`, has no first line. It must be refused like an empty one. (Task 2 test "a blank first line is refused".)
4. **A capital `ẞ` in the query or the text** must still match `ss`. (Task 5 test "ß and ss find each other".)
5. **A note name with both a space and a `#`** needs the angle brackets and the encoding together, so the generated link resolves and doctor reports no `link-broken`. (Task 6 test "MOC links survive # ? % ] and spaces".)

---

### Task 1: Owner checks

Minors: chunk 8, items 1, 2, 5 and 6.

**Files:**
- Modify: `src/host/github.ts`, `src/doctor/host-checks.ts`, `src/workspace/load.ts`
- Create: `src/map-limit.ts`
- Test: `test/unit/host/github.test.ts`, `test/unit/doctor/host-checks.test.ts`

**Interfaces:**
- Produces: `export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>` in `src/map-limit.ts`, which keeps input order. It is moved from `load.ts`, and `load.ts` imports it.

- [ ] **Step 1: Write the failing tests** in `test/unit/host/github.test.ts`, with the file's fake `GhRunner`:
  - `"a team answer without permissions is unknown"`: the team-repo call exits 0 with `{}`. Expected: `ownerStatus('@acme/platform', repo)` is `'unknown'`.
  - `"a bare HTTP status is read"`: the stderr is `gh: HTTP 404` (no parentheses), on `permission(repo)`. Expected: `'none'`, not `E_HOST`.
  - `"an outside collaborator's team is unknown"`: the team-repo call 404s, `orgs/acme/teams/platform` 404s, and `user/memberships/orgs/acme` 404s. Expected: `'unknown'`.
  - `"a member's missing team is not-found"`: the same calls, but the membership exits 0 with `{"state":"active"}`. Expected: `'not-found'`.
  - `"a pending or missing membership is unknown"`: the membership answers `{"state":"pending"}`, then `(HTTP 403)`. Expected: `'unknown'` both times.
- [ ] **Step 2: Run** `npx vitest run test/unit/host/github.test.ts`. Expected: these 5 fail, and the rest pass.
- [ ] **Step 3: Implement** in `github.ts`:
  - The status regex becomes `/\bHTTP (\d{3})\b/` over `stderr`.
  - A team-repo 200 whose `permissionsOf(json)` is empty returns `'unknown'`.
  - On a team 404, `ownerStatus` calls `memberOf(org): Promise<boolean>`, which is `api('user/memberships/orgs/<org>')` returning status 200 with `state === 'active'`. Return `'not-found'` only when it is true, and `'unknown'` otherwise.
- [ ] **Step 4: Write the failing test** `"owner lookups run concurrently"` in `host-checks.test.ts`. It uses a `fakeHost` whose `ownerStatus` resolves after a shared gate, and records the maximum number of lookups in flight. With 3 distinct owners, the expected maximum is greater than 1, and the findings keep the order `ownersOf` gives.
- [ ] **Step 5: Run** it. Expected: FAIL (maximum 1).
- [ ] **Step 6: Implement.** Create `src/map-limit.ts` and use it in `load.ts`. In `hostChecks`, look up each repo's distinct owner keys with `mapLimit(keys, 4, …)` first, then build the findings in the same loop order from the results.
- [ ] **Step 7: Run** `npm run typecheck && npx vitest run test/unit/host test/unit/doctor test/unit/workspace`. Expected: PASS.
- [ ] **Step 8: Commit** with `fix: owner checks for outside collaborators, bare HTTP statuses, concurrent lookups`.

### Task 2: Contribute

Minors: chunk 10, items 1–3.

**Files:**
- Modify: `src/contribute/pr.ts`, `src/commands/commit.ts`
- Test: `test/unit/contribute/pr.test.ts`, `test/unit/commands/commit-shared.test.ts`, `test/unit/commands/commit.test.ts`

**Interfaces:**
- Produces: `export async function hasLocalCommits(dir: string): Promise<boolean>` in `src/contribute/gate.ts`. It is `rev-list --count @{u}..HEAD` > 0, and false when there is no upstream (decision 4).

- [ ] **Step 1: Write the failing tests:**
  - `pr.test.ts` `"a merge commit and an already-upstream commit are not cherry-picked"`: the clone has a local merge of a side branch, plus a commit whose patch was also pushed to origin. Expected: the PR route succeeds, and the branch holds the uncommitted change with no conflict.
  - `commit-shared.test.ts` `"local commits alone are contributed"`: a clean tree with one local commit. Expected: `route: 'pr'`, `committed: true`, and the PR's files include that commit's file.
  - `commit-shared.test.ts` `"local commits alone, dry run"`: as above with `--dry-run`. Expected: `dryRun: true`, `pushed: false`, and nothing fetched (the fake host records no call).
  - `commit.test.ts` `"an empty message is refused"` and `"a blank first line is refused"`: `-m ""` and `-m "\n\nbody"`, for both `personal` and a contribute mount. Expected: `E_USAGE` with the decision 5 message, exit 2, and `git status` unchanged.
- [ ] **Step 2: Run** these files. Expected: the 4 new tests fail.
- [ ] **Step 3: Implement:**
  - In `pr.ts`, `localCommits` comes from `rev-list --reverse --no-merges --cherry-pick --right-only origin/<base>...HEAD`.
  - The early return becomes `files.length === 0 && !(await hasLocalCommits(dir))`.
  - In `commit.ts`, the gate runs when `files.length > 0 || hasLocalCommits`, and the message check of decision 5 runs first in `run`.
- [ ] **Step 4: Run** `npm run typecheck && npx vitest run test/unit/contribute test/unit/commands`. Expected: PASS.
- [ ] **Step 5: Commit** with `fix: contribute local commits, skip merges and upstream commits, refuse an empty message`.

### Task 3: Personal commit

Minors: chunk 6, items 1 and 2.

**Files:**
- Modify: `src/commands/commit.ts`, `src/workspace/repo.ts`
- Test: `test/unit/commands/commit.test.ts`, `test/unit/workspace/repo.test.ts` (create it if missing)

- [ ] **Step 1: Write the failing tests:**
  - `"a failed git commit leaves nothing staged"`: a `pre-commit` hook in the fixture repo exits 1. Expected: `commit personal` throws `E_GIT` naming git's reason, and `git diff --cached --name-only` is empty.
  - `"a conflicting restore says where the changes are"`: `pullPush` with a stashed change that conflicts with the pulled commit. Expected: `W_STASH_KEPT` whose message contains `conflict markers` and `git stash list`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - In `commitPersonal`, run `git commit` with `git()`. On a non-zero exit, run `git reset -q -- brains/personal`, then throw `E_GIT` with `git commit failed: <first line>`.
  - The `W_STASH_KEPT` message becomes: `restoring your other changes conflicted (<reason>): the files may hold conflict markers, and the changes are still in git stash; check git status and git stash list`.
- [ ] **Step 4: Run** `npx vitest run test/unit/commands/commit.test.ts test/unit/workspace`. Expected: PASS.
- [ ] **Step 5: Commit** with `fix: personal commit unstages on failure, clearer kept-stash warning`.

### Task 4: Mount lifecycle

Minors: chunk 9, items 2, 5, 7 and 9.

**Files:**
- Modify: `src/commands/mount.ts`, `src/commands/brain.ts`, `src/commands/sync.ts`
- Test: `test/unit/commands/mount.test.ts`, `test/unit/commands/brain.test.ts`, `test/unit/commands/sync.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `mount.test.ts` `"the reported commit is the pushed one"`: the remote gets another commit first, so the rebase rewrites ours. Expected: `data.commit` equals `git rev-parse HEAD` after the command, and equals `origin/main`.
  - `mount.test.ts` `"a failed mount re-renders the workspace"`: make the render fail after it has rewritten `AGENTS.md`, by replacing a file it writes later with a directory (check the write order in `renderWorkspace`). Expected: the mount fails, and `AGENTS.md` byte-equals its content from before the mount. The rollback's own render fails at the same file, but only after it has put `AGENTS.md` back.
  - `brain.test.ts` `"a new brain knows origin's HEAD"`: after `brain new <bare url>`, `git symbolic-ref refs/remotes/origin/HEAD` in the clone is `refs/remotes/origin/main`. The same holds after `brain publish`.
  - `sync.test.ts` `"no upstream says nothing was pulled"`: a workspace without an upstream. Expected: the text starts with `Workspace has no upstream branch; nothing was pulled or pushed.`
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `record()` returns `gitOk(root, ['rev-parse', 'HEAD'])` after `pullPush` when `commitPaths` made a commit.
  - Mount's `catch` calls `renderWorkspace(root)` after the `editMesh` rollback, ignoring its error so the original one is kept.
  - `pushToOrigin` runs `git remote set-head origin main` after a successful push.
  - `sync.ts` `text(d, warnings)` picks its head line from `W_NO_UPSTREAM` (the line above), then `W_PULL_FAILED` (`Workspace not pulled; not pushed.`), then the current two lines.
- [ ] **Step 4: Run** `npx vitest run test/unit/commands`. Expected: PASS.
- [ ] **Step 5: Commit** with `fix: mount reports the pushed commit, rolls back its render; brains know origin HEAD; sync without upstream`.

### Task 5: Search

Minors: chunk 7, items 1, 2 and 6.

**Files:**
- Modify: `src/search/search.ts`, `src/commands/search.ts`
- Test: `test/unit/search/search.test.ts`, `test/unit/commands/search.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `"ß and ss find each other"`: the notes say `Straße` and `STRASSE`, and one says `Maẞnahme`. The queries `strasse`, `straße` and `massnahme` each find their notes.
  - `"a trailing # stays in the title"`: `# Use C#` gives the title `Use C#`, and `# Done ##` gives `Done`.
  - `"a fenced comment is not the title"`: the body is a fence holding `# comment`, followed by `# Real`. Expected: the title is `Real`. With no heading outside fences, the file name is the title.
  - `commands/search.test.ts` `"an empty --brain is a usage error"`: `--brain ""` and `--brain ","` give `E_USAGE` with `--brain needs at least one brain id`, exit 2.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `norm` becomes `s.normalize('NFC').toLowerCase().replace(/ß/g, 'ss')`, used for both the query and the text.
  - The title regex becomes `/^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m`, run on the body with fenced blocks (```` ``` ```` and `~~~`) blanked line for line.
  - The command throws when `--brain` is given but yields no id.
- [ ] **Step 4: Run** `npx vitest run test/unit/search test/unit/commands/search.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with `fix: search folds ß, keeps C# titles, ignores fenced headings, refuses an empty --brain`.

### Task 6: Doctor and render

Minors: chunk 3 item 1, chunk 4 item 1, chunk 5 item 3.

**Files:**
- Modify: `src/doctor/checks/structure.ts`, `src/generate/moc.ts`, `src/render/workspace.ts`
- Test: `test/unit/doctor/checks.test.ts`, `test/unit/generate/moc.test.ts`, `test/unit/render/workspace.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `"dot folders under areas are not areas"`: `areas/.trash/x.md` gives no `area-readme-missing`.
  - `"MOC links survive # ? % ] and spaces"`: `mocEntry('notes', 'notes/c#-tips.md', 'C# [tips]', null)` is `- [C# \[tips\]](c%23-tips.md)\n`. `notes/my c#.md` gives `(<my c%23.md>)`: the angle brackets stay for the space, and the `#` is encoded inside them. Assert it through a doctor run: a brain with `notes/c#-tips.md`, `notes/a?b.md` and `notes/50%.md`, after `--fix`, reports no `link-broken` on the generated block.
  - `"a CRLF .local file renders LF"`: `.local/team.md` with `\r\n`. Expected: the rendered `AGENTS.md` has no `\r`, and the render record's hash equals the hash from the LF file.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - In the area loop of `structure.ts`, skip `parts[1]` starting with `.`.
  - In `mocEntry`, percent-encode `%`, `#` and `?` in each path segment, `%` first, and escape `[` and `]` in the title with a backslash. The angle-bracket rule stays for spaces and parentheses. Check that the doctor's link resolver decodes `%23`; if it doesn't, decode in the resolver too and say so in a ruling.
  - `readLocalInstructions` normalises `\r\n` to `\n`.
- [ ] **Step 4: Run** `npx vitest run test/unit/doctor test/unit/generate test/unit/render`. Expected: PASS.
- [ ] **Step 5: Commit** with `fix: dot folders under areas, encoded MOC links, LF for .local instructions`.

### Task 7: Records and 0.1.1 (stop for Ramon)

**Files:**
- Modify: `docs/plan/v0-breakdown.md`, `package.json`, `package-lock.json`

- [ ] **Step 1: Update the breakdown:**
  - Tick every minor fixed in Tasks 1–6 as `[x] … (chunk 13)`.
  - Tick the four already fixed: chunk 6 git prompts (`networkEnv`; `init`'s first push is still open), chunk 7 npm `latest`, chunk 9 GCM/SSH, and chunk 10 override wording. Each gets `(chunk 12)`.
  - Close the chunk 3 inbox item per decision 2.
  - Add "Deferred minors from chunk 12" with its 4 items.
  - Add a chunk 13 row to Milestone C: "Pilot hardening", done when the listed minors are fixed and 0.1.1 is on `latest`.
  - Add the line `Chunk 13 status: done`, listing what remains deferred to the v1 breakdown.
- [ ] **Step 2:** set the version to 0.1.1 and run `npm run build && node dist/cli.js version`. Expected: `brain-mesh 0.1.1`. Commit with `chore: 0.1.1`.
- [ ] **Step 3: Stop for Ramon.** He runs `npm publish`, then `npm view brain-mesh-ai-workspace dist-tags`, where `latest` should be `0.1.1`.
- [ ] **Step 4:** commit with `docs: chunk 13 records` if Step 3 changed anything. Then the final review, then merge on Ramon's word.

# Chunk 11: `upgrade` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `brain-mesh upgrade` moves a workspace to a new core version. It bumps the pin and re-renders the managed files from the render record. User files stay untouched. Hand-edited template files and overridden skills are shown as diffs.

**Architecture:**
- **Who runs it:** the target version, as `npx -y brain-mesh-ai-workspace@<new> upgrade`. Only that version holds the new templates, and it also works for workspaces pinned to versions that have no `upgrade` command.
- **Detecting hand edits:** the command reads `.mesh/render.json` before it renders. A recorded file whose bytes no longer match its sha256 has been edited by hand.
- **Rendering:** `renderWorkspace` learns three things: a pin override, a dry-run mode, and an upgrade mode for seeds (the hand-editable template files). It returns every change with its before and after text.
- **Diffs:** unified diffs come from `git diff --no-index`.
- **After the render:** the command commits the tracked workspace files and runs `pullPush`, like `mount` does.

**Tech Stack:** TypeScript ESM, Node ≥22.12, commander, zod 4, yaml, semver, execa, Vitest.

**Spec:** `docs/spec.md`. The relevant parts:
- section 3, "Versioning";
- section 4, "Managed vs user files" and 4.1;
- section 8, the `upgrade` row;
- section 9.2, the render record.

## Global Constraints

- Spec 8: `upgrade [--to <version>]` must "Bump the pin, re-render managed files; user files untouched, hand-edited template files and overridden skills shown as a diff."
- Spec 4: "Template files a user may edit by hand (Obsidian settings) are never overwritten; `upgrade` shows them as a diff to accept or skip." In the render code these are the `seed` entries: `.gitattributes` and `brains/.obsidian/app.json`.
- Spec 4: "User changes go in `.local/` and `tools/`, which upgrades never touch." The same holds for `brains/**` and for every file the render record does not list.
- Spec 4.1: "An override replaces the whole skill. When the overridden skill changes upstream, `upgrade` warns and shows the diff."
- Spec 9.2: "The render record `.mesh/render.json` lists every managed entry (`managed`, `seed`, `block`) with the sha256 of what was rendered; `upgrade` uses it to find hand edits."
- Spec 3: nothing brain-mesh generates inside a brain depends on the core version (ADR 0001), so `upgrade` renders no shared brain.
- Every command keeps `--json` output in the existing envelope. Error codes are `E_*` and warnings are `W_*` (`src/output.ts`).
- Bash heredocs mangle backslashes in this repo's tooling. Write files with the editor tool, and never run `npx prettier`.

## Decisions

1. **The target version runs `upgrade`.**
   - The target is `packageVersion()`.
   - `--to <v>` is a check only: if `v` differs from the running version, the command fails with `E_PIN_MISMATCH` and the message "this is brain-mesh <running>; run npx -y brain-mesh-ai-workspace@<v> upgrade".
   - A target older than the pin (by `semver.lt`, prereleases included) fails with `E_DOWNGRADE`.
   - The same version is allowed. It re-renders as a repair and reports `upgraded: false`.
   - Cost if wrong: a user has to type the new version in the `npx` line instead of passing `--to`.
2. **No render record, no upgrade.** Without `.mesh/render.json`, hand edits cannot be told apart from older renders. Chunk 5 also left client folders refused for good in that case (deferred minor 2).
   - `upgrade` fails with `E_NO_RENDER_RECORD` and the message "run npx -y brain-mesh-ai-workspace@<pin> init first to rebuild it, then upgrade".
   - This also settles chunk 5's second deferred minor for the upgrade path.
3. **Hand-edited managed files are replaced, and the diff is shown.** Managed files are brain-mesh's (spec 4). An edit made to one by hand is reported in `overwritten` with the diff of what was lost (before → after), plus a `W_HAND_EDIT_OVERWRITTEN` warning that points to `.local/`. `--dry-run` shows the same list before anything changes. Cost if wrong: a user who skipped `--dry-run` recovers the text from the diff in the output.
4. **Seeds in upgrade mode:**

   | Seed on disk | Outcome |
   | --- | --- |
   | Missing | Written. |
   | Already equal to the new seed | Unchanged. |
   | Unedited (its sha matches the recorded sha) | Updated, status `updated`. |
   | Edited by hand, path passed in `--accept <path>` | Status `accepted`. `brains/.obsidian/app.json` gets the new seed's keys merged over the current JSON object, keeping the user's other keys. Any other seed is replaced. |
   | Edited by hand, not accepted | Status `kept`: left as it is, with a diff and a `W_SEED_KEPT` warning naming `--accept <path>`. |

   A kept seed keeps its previous record entry, so the next upgrade offers it again. Every comparison ignores CRLF against LF.
5. **Overrides:**
   - A `.local/skills/<n>/` or `.local/agents/<n>.md` with the name of a new core skill or agent is an override.
   - Status `changed`: the core copy on disk under `.mesh/` differs from the new core's.
   - Status `new`: the new core adds a skill or agent the user already has under that name.
   - Each override reported gets a diff (old core → new core) and a `W_OVERRIDE_UPSTREAM` warning. The client copies keep the local version.
6. **What is committed:** the changed paths among `WORKSPACE_CONFIG` (`mesh.yaml`, `AGENTS.md`, `.gitignore`), plus `.gitattributes` and `brains/.obsidian/app.json`. The message is `Upgrade brain-mesh from <from> to <to>`, and `pullPush` runs after it. The client folders and `.mesh/` are gitignored. When nothing changed, `commit` is null and the push still runs, like `record` in `mount.ts`.
7. **A second machine:** after another clone upgraded and pushed, `sync` pulls a `mesh.yaml` whose pin differs from the running CLI.
   - In that case `sync` skips the render, which would otherwise mix the old core's files with the new pin, and warns `W_PIN_CHANGED`: "mesh.yaml now pins <pin>, this is <running>; run npx -y brain-mesh-ai-workspace@<pin> init to re-render the managed files".
   - `init` restore already handles that re-render.
   - Only `sync` gets the guard, because every other rendering command runs from the pinned `npx` line the generated files contain.
8. **The render record matches disk** (chunk 5 deferred minor 1). When a write fails, the path keeps its previous record entry, or none if it had none, instead of the hash of content that was never written.

## Review Focus

1. **Line endings:** a workspace with CRLF files (git `autocrlf` on Windows). Expected: unedited managed files and seeds don't count as hand edits. (Task 1, "CRLF is not an edit".)
2. **Obsidian rewrites `app.json`:** it adds its own keys. Expected: the seed is `kept` with a diff, and `--accept` merges in the core keys without dropping the user's. (Task 1, "accepting app.json merges".)
3. **Upgrade run twice, or re-run after a failed push.** Expected: the second run reports `upgraded: false`, writes nothing and commits nothing. (Task 3, "idempotent".)
4. **A local override of a core skill that changed.** Expected: a warning and a diff, and the rendered `.claude/skills/<n>/` stays the local one. (Task 3, "overrides".)
5. **The other clone after an upgrade.** Expected: `sync` with the old CLI renders nothing and says which `init` to run. (Task 4, "sync after a pin change".)

---

### Task 1: The renderer can upgrade

**Files:**
- Modify `src/render/workspace.ts`.
- Modify `src/workspace/mesh-edit.ts`.
- Modify `src/output.ts`: add `Downgrade: 'E_DOWNGRADE'` and `NoRenderRecord: 'E_NO_RENDER_RECORD'`.
- Test `test/unit/render/workspace.test.ts` and `test/unit/workspace/mesh-edit.test.ts`.

**Interfaces:**
- Produces, in `src/render/workspace.ts`:
  - `export interface RenderOptions { core?: CoreSource; pin?: string; write?: boolean; seeds?: { accept: ReadonlySet<string> } }`
    - `pin` replaces `mesh.brain_mesh` for `{{cli}}` and for the record.
    - `write: false` changes nothing on disk, the record included, and reports what would change.
    - `seeds` switches on upgrade mode (decision 4).
  - `export interface RenderChange { path: string; kind: EntryKind; before: string | null; after: string; status: 'written' | 'updated' | 'accepted' | 'kept'; handEdited: boolean }`
    - There is one change per managed or seed path whose content changes or would change, and one per `kept` seed.
    - `handEdited` is true when the record has the path and `sha256(LF(before))` differs from the recorded sha. For `bytes` entries, the raw bytes are compared instead.
  - `RenderResult` gains `changes: RenderChange[]` (sorted by path) and `previous: RenderRecord | null`.
  - `renderWorkspace(root: string, opts?: RenderOptions): Promise<RenderResult>`. Callers that pass no options behave as today.
  - `export async function readRecord(root: string): Promise<RenderRecord | null>`, now exported.
- Produces, in `src/workspace/mesh-edit.ts`: `setPin(root: string, version: string): Promise<MeshConfig>`. It keeps comments, the header and line endings, and validates like `editMesh`.

- [ ] **Step 1: Failing tests:**
  - "pin override": with `{ pin: '9.9.9' }`, every rendered `SKILL.md` calls `npx -y brain-mesh-ai-workspace@9.9.9`, and `record.brain_mesh` is `'9.9.9'`. `mesh.yaml` is unchanged.
  - "dry run writes nothing":
    - Change the core (a temp copy of `packageCore()` with one `SKILL.md` edited) and render with `{ write: false }`.
    - A snapshot of every file under the root, `.mesh/render.json` included, is unchanged.
    - `changes` lists that skill's `.mesh/`, `.claude/` and `.github/` copies with `status: 'written'`.
  - "hand edits are flagged": edit `AGENTS.md` by hand, then render. The `AGENTS.md` change has `handEdited: true` and a `before` that holds the edit. An unedited changed file has `handEdited: false`.
  - "seeds in upgrade mode", one test for each row of the decision 4 table:
    - an unedited `.gitattributes` with a new seed text → `updated`, and the file is the new seed;
    - an edited one → `kept`, the file is unchanged, and the record entry equals the previous one;
    - an edited one passed in `accept` → `accepted`, and the file is the new seed;
    - a missing one → `written`.
  - "accepting app.json merges": current `{"useMarkdownLinks": true, "theme": "obsidian"}` with a new seed adding `"showLineNumber": true`, accepted. The result parses to all three keys and keeps `"theme"`.
  - "CRLF is not an edit": rewrite `AGENTS.md` and `.gitattributes` with `\r\n`. Then render with an unchanged core in upgrade mode: no change is `handEdited` and no seed is `kept`.
  - "failed write keeps the record entry": make `.claude/skills/ask/SKILL.md` unwritable (a read-only file, or a directory in its place where chmod has no effect) after a first render, then render a changed core. The record entry for that path equals the previous one.
  - `setPin`: it changes only the `brain_mesh` value, keeping a comment line and CRLF endings, and refuses `''` with `E_MESH_INVALID`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/render/workspace.test.ts test/unit/workspace/mesh-edit.test.ts`. Expected: failures on the new options and `setPin`.
- [ ] **Step 3: Implement it.**
  - In `put`, return success. Record an entry only when the write succeeded; otherwise push the previous entry, if there was one.
  - Under `write: false`, `put` and `unlink` record the path as written or removed without touching disk, and the record file is not written.
  - Seeds compare `lf()` text everywhere.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: everything passes, and the existing render tests are unchanged.
- [ ] **Step 5: Commit** `feat(render): pin override, dry run, seed upgrade mode, change list`

### Task 2: Diffs and overrides

**Files:**
- Create `src/upgrade/diff.ts` and `src/upgrade/overrides.ts`.
- Test `test/unit/upgrade/diff.test.ts` and `test/unit/upgrade/overrides.test.ts`.

**Interfaces:**
- Produces `unifiedDiff(path: string, before: string | null, after: string | null): Promise<string>`.
  - It writes both sides to a temp dir and runs `git -c core.autocrlf=false diff --no-index --no-color -U3 a b`. Exit code 1 means the sides differ.
  - It rewrites the headers to `--- a/<path>` and `+++ b/<path>`, or `/dev/null` for a missing side.
  - It returns `''` when the sides are equal after LF normalisation.
- Produces `interface OverrideChange { name: string; kind: 'skill' | 'agent'; status: 'changed' | 'new'; diff: string }`.
- Produces `overrideChanges(root: string, core: { skills: SkillSource[]; agents: AgentSource[] }, local: { skills: SkillSource[]; agents: AgentSource[] }): Promise<OverrideChange[]>`, sorted by kind, then name.
  - For a skill, it compares `.mesh/skills/<n>/SKILL.md` on disk with the new core's `SKILL.md` (both unfilled).
  - For an agent, it compares `.mesh/agents/<n>.md` with `agentSource(a)`. Export `agentSource` from `src/render/workspace.ts` for this.
  - A missing `.mesh` copy means `new`, with a diff from `/dev/null`.

- [ ] **Step 1: Failing tests:**
  - "diff of an edit": `unifiedDiff('AGENTS.md', 'a\nb\n', 'a\nc\n')` contains `--- a/AGENTS.md`, `+++ b/AGENTS.md`, `-b` and `+c`.
  - "new file": with `before` null, the diff contains `--- /dev/null` and `+a`.
  - "equal": `unifiedDiff('x', 'a\r\n', 'a\n')` is `''`.
  - "paths with spaces": the temp dir is made with `tempDir('bm diff ')`, and the result is still correct.
  - "overrides":
    - A workspace rendered with an old core, plus `.local/skills/ask/SKILL.md` and `.local/agents/consistency-reviewer.md`.
    - The new core changes `ask` and leaves the agent alone: one change, `{ name: 'ask', kind: 'skill', status: 'changed' }`, whose diff shows the core lines.
    - A local skill `capture` that the old core lacked and the new core has gives `status: 'new'`.
    - Skills that aren't overridden are not listed.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/upgrade`. Expected: the modules are missing.
- [ ] **Step 3: Implement it** as the Interfaces block says.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(upgrade): unified diffs and override changes`

### Task 3: The `upgrade` command

**Files:**
- Create `src/commands/upgrade.ts`.
- Modify `src/commands/index.ts`.
- Test `test/unit/commands/upgrade.test.ts`.

**Interfaces:**
- Consumes Task 1's `renderWorkspace` options and `readRecord`, `setPin`, and Task 2's `unifiedDiff` and `overrideChanges`, plus `commitPaths`, `pullPush`, `WORKSPACE_CONFIG`, `assertGitIdentity` and `readMesh`.
- Produces `upgradeCommandFor(deps: { core?: CoreSource; version?: string }): CommandDef`, defaulting to `packageCore()` and `packageVersion()`.
  - `defaultCommands` and `commandsFor(host)` include `upgradeCommandFor({})`.
  - Options: `--to <version>`, `--accept <path...>` (variadic) and `--dry-run`.
- Produces `UpgradeData { from: string; to: string; upgraded: boolean; written: string[]; removed: string[]; overwritten: { path: string; diff: string }[]; seeds: { path: string; status: 'written' | 'updated' | 'accepted' | 'kept'; diff: string }[]; overrides: OverrideChange[]; commit: string | null; pushed: boolean; dryRun: boolean }`.
- Text output: one line `Upgraded from <from> to <to>: <n> files re-rendered.` (or `Would upgrade …` for a dry run, or `Already on <to>; …` when the version is the same), then one section per non-empty list (`Overwritten hand edits`, `Template files`, `Overridden skills and agents`), each item with its path and its diff.

- [ ] **Step 1: Failing tests.** `setup()` builds a realistic old workspace:
  1. it runs `isolateGit()` and `initWorkspace()`;
  2. it makes an old core as a temp copy of `packageCore()`, with `skills/ask/SKILL.md` given a different line and `templates/workspace/obsidian-app.json` without `alwaysUpdateLinks`;
  3. it sets the pin to `0.1.0` with `setPin` and runs `renderWorkspace(root, { core: old })`;
  4. it commits and pushes.

  The command then runs as `upgradeCommandFor({ version: '0.2.0' })` with the real core. The tests:
  - "upgrades and keeps every user file":
    - First, write user files: `.local/team.md`, `.local/skills/mine/SKILL.md`, `tools/x.ts`, `brains/personal/notes/n.md` (committed) and `.claude/settings.local.json`.
    - Afterwards, all of them are byte-identical, `mesh.yaml` pins `0.2.0`, and `.claude/skills/ask/SKILL.md` is the new core's, filled with `@0.2.0`.
    - The data matches `{ from: '0.1.0', to: '0.2.0', upgraded: true, dryRun: false, pushed: true }`, and `commit` is the HEAD of the remote.
    - The commit message is `Upgrade brain-mesh from 0.1.0 to 0.2.0`, and the commit touches only `mesh.yaml`, `AGENTS.md`, `.gitignore`, `.gitattributes` and `brains/.obsidian/app.json` (any of them).
  - "dry run": the same setup with `--dry-run`. Nothing changes: snapshot equality of the tree and HEAD. `written` is non-empty, and `dryRun` is true.
  - "hand edits": `AGENTS.md` is edited by hand before the upgrade, so `overwritten` has `AGENTS.md` with a diff containing the edit's line, there is a `W_HAND_EDIT_OVERWRITTEN` warning, and the file is the new render.
  - "template files":
    - `brains/.obsidian/app.json` with an added `"theme"` key ends up `kept`, with a diff and `W_SEED_KEPT` naming `--accept brains/.obsidian/app.json`. The file is unchanged.
    - A second run with `--accept brains/.obsidian/app.json` makes it `accepted`, and the file has `alwaysUpdateLinks` and `theme`.
  - "overrides": `.local/skills/ask/SKILL.md` exists, so `overrides` has `ask` `changed` with a diff, there is a `W_OVERRIDE_UPSTREAM` warning, and `.claude/skills/ask/SKILL.md` is the local text.
  - "idempotent": `upgrade` run twice, where the second run has `upgraded: false`, `written: []` and `commit: null`.
  - "refusals", each changing nothing:
    - `--to 0.3.0` gives `E_PIN_MISMATCH`, with the `npx -y brain-mesh-ai-workspace@0.3.0 upgrade` hint;
    - the version `0.0.9` against pin `0.1.0` gives `E_DOWNGRADE`;
    - deleting `.mesh/render.json` gives `E_NO_RENDER_RECORD`, with the `@0.1.0 init` hint;
    - `--accept notes.md` gives `E_USAGE`, because it isn't a seed path;
    - no `mesh.yaml` gives `E_NO_WORKSPACE`.
  - "prereleases": pin `0.1.0-alpha.5` to version `0.1.0-alpha.6` upgrades, and to `0.1.0-alpha.4` it's `E_DOWNGRADE`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/commands/upgrade.test.ts`. Expected: the command is missing.
- [ ] **Step 3: Implement it.** The order:
  1. checks (decisions 1 and 2, `--accept` paths, `assertGitIdentity`);
  2. `overrideChanges`, which must run before the render overwrites `.mesh/`;
  3. render with `{ core, pin: to, write: !dryRun, seeds: { accept } }`;
  4. diffs for the hand-edited changes and the seeds;
  5. unless it's a dry run: `setPin`, `commitPaths`, then `pullPush`.

  `setPin` runs after the render, so a render error leaves `mesh.yaml` alone. The render uses the `pin` option, so the new pin is already in the files.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass, the CLI-call lint included.
- [ ] **Step 5: Commit** `feat(upgrade): upgrade command`

### Task 4: `sync` after a pin change, and docs

**Files:**
- Modify `src/mount/sync.ts`.
- Modify `templates/workspace/AGENTS.md`, `README.md`, `docs/scenarios.md` and `docs/plan/v0-breakdown.md`.
- Test `test/unit/commands/sync.test.ts` and `test/unit/scenarios.test.ts`.

- [ ] **Step 1: Failing tests:**
  - "sync after a pin change":
    - Clone the workspace a second time, set the pin to `9.9.9` with `setPin` there, then commit and push.
    - `sync` in the first workspace pulls it, warns `W_PIN_CHANGED` with `npx -y brain-mesh-ai-workspace@9.9.9 init`, and leaves `.mesh/render.json` and `.claude/` byte-identical.
  - "every scenario has setup, prompt and pass criteria" also requires `U1`.
  - The render test of the workspace `AGENTS.md` contains `upgrade --dry-run`.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run test/unit/commands/sync.test.ts test/unit/scenarios.test.ts test/unit/render`.
- [ ] **Step 3: Implement it.**
  - **Sync:** the guard of decision 7, with `packageVersion()`.
  - **The workspace `AGENTS.md`, one line:** "To upgrade brain-mesh, run `npx -y brain-mesh-ai-workspace@<new version> upgrade --dry-run --json`, show the user the diffs, then run it again without `--dry-run`, with `--accept <path>` for each template file the user accepts." This is literal text, not `{{cli}}`.
  - **README:** an `upgrade` row covering who runs it, `--dry-run`, `--accept` and what is committed.
  - **`docs/scenarios.md`:** a section `## Upgrade` with `### U1 Upgrade the dogfood workspace`.
    - Steps:
      1. in the dogfood workspace, run `npx.cmd -y brain-mesh-ai-workspace@<new> upgrade --dry-run --json` (PowerShell form, plus the bash form);
      2. run it again without `--dry-run`;
      3. in a second clone, run `bm sync` with the old pin, then `npx.cmd -y brain-mesh-ai-workspace@<new> init`.
    - **Prompt:** none. It's a CLI scenario, so write `**Prompt:** none (CLI only).`
    - **Pass when:**
      - the dry run lists the expected files and diffs, and changes nothing;
      - the upgrade bumps the pin, re-renders the skills (the `contribute` skill appears when coming from alpha.4 or older), and commits only the files of decision 6;
      - `git status` is clean, and `.local/`, `tools/` and `brains/` are unchanged (`git diff HEAD~1 --stat`);
      - a hand-edited `brains/.obsidian/app.json` is `kept` with a diff;
      - the second clone's `sync` warns `W_PIN_CHANGED`, and `init` re-renders it.
  - **Breakdown:** the chunk 11 status line, and the chunk 5 deferred minors this chunk closes (decisions 2 and 8), marked done.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(sync): no mixed render after a pin change; docs: upgrade and U1`

### Task 5: The real check (stop for Ramon)

**Files:** modify `package.json` and `package-lock.json` (version 0.1.0-alpha.6), `docs/scenarios.md` (run log), `docs/research/2026-11-chunk-01-research.md` ("Chunk 11 checks") and `docs/plan/v0-breakdown.md`.

- [ ] **Step 1: Version** 0.1.0-alpha.6, set after the final review's fix pass.
- [ ] **Step 2: Stop for Ramon:**
  1. He publishes alpha.6 with `npm publish --tag next`.
  2. He runs U1 on the dogfood workspace, upgrading from its current pin.
  3. He pastes the outputs.
- [ ] **Step 3: Record:**
  - the run log rows;
  - the research note's "Chunk 11 checks": what the dry run showed on a real workspace, whether Obsidian had rewritten `app.json`, and how long the upgrade took;
  - the chunk 11 status in the breakdown, marked done.

  A failure is fixed here, with a test written first.
- [ ] **Step 4: Commit** `docs: chunk 11 checks`

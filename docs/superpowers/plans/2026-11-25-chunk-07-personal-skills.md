# Chunk 7: Personal Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The core ships the skills `capture`, `ingest` and `ask` and a deterministic `search` command. A first alpha is published to npm, so a workspace pinned to it runs the personal-brain scenarios on Claude Code and Ramon can start dogfooding.

**Architecture:**
- `search` has two layers:
  - a pure function over the loaded `WorkspaceModel`: terms AND-matched, summary matches ranked before full-text matches;
  - a thin command around it.
- The skills are Agent Skills folders in `skills/<name>/SKILL.md`. Chunk 5's renderer copies them into `.mesh/`, `.claude/skills/` and `.github/skills/` with `{{cli}}` filled. They stay thin: deterministic work goes through `{{cli}} search`, `doctor --fix` and `commit`.
- The skills are checked in two ways:
  - unit tests check their structure (the frontmatter, and that every CLI command they call exists);
  - a written scenario checklist, run with `claude -p` against the published alpha, checks their behaviour.

**Tech Stack:** TypeScript ESM, Node ≥22.12, Vitest 5, Claude Code 2.1.325 for the scenario run, npm for the alpha. No new dependencies.

**Spec:** [docs/spec.md](../../spec.md):
- 3: Versioning, "`npx -y brain-mesh@<pinned>`";
- 5.1: structure, `inbox/` and `sources/`;
- 5.3: note conventions;
- 5.4: MOCs;
- 5.8: sources and transcripts;
- 7.1: editing rules;
- 7.2: the personal row;
- 7.3: the ingestion workflow;
- 7.4: the lookup workflow;
- 7.5: skills in v0;
- 8: the `search` row;
- 9.2: skills don't pre-approve the shell;
- 10: the scenario checklist.

Also:
- breakdown [v0-breakdown.md](../../plan/v0-breakdown.md): chunk 7, and the chunk 7 lines under "Checks carried from chunk 1";
- [chunk 1 research](../../research/2026-11-chunk-01-research.md): Q1.1 (Claude skills) and Q4.4 (`npx` batching);
- ADR [0002](../../adr/0002-workspace-and-personal-brain-share-one-repo.md).

## Global Constraints

- Node 22 LTS or newer; no new runtime dependency.
- Windows and Linux are first-class, and paths in output are workspace-relative POSIX.
- Skills use the Agent Skills format: `name` equals the folder name (lowercase letters, digits and hyphens, at most 64 characters), and `description` is required (at most 1024 characters).
- Skills invoke the CLI only as `{{cli}} <command> … --json`. The renderer turns `{{cli}}` into `npx -y brain-mesh@<pinned>`. Skills don't pre-approve the shell (no `allowed-tools`).
- Each CLI call takes about a second; skills batch work into few calls (one `search`, one `doctor --fix`, one `commit`).
- **Propose first:** every change is shown as a proposal before anything is written, except the raw capture the user asked for (Ruling 4).
- **Append by default:** existing content is only replaced or deleted when the user explicitly asks.
- **Search before create.**
- Transcripts and raw captures stay in the personal brain (spec 5.8). Personal writes go through `{{cli}} commit`, which commits only `brains/personal/`.
- Note frontmatter requires `type`, `summary` (one sentence) and `updated` (`YYYY-MM-DD`). File names are lowercase kebab-case, and stems are unique within a brain.
- Links are relative markdown links, never wikilinks.
- `search` output is deterministic: the same workspace and query give the same order, with no timestamps.

## Rulings in this plan

1. **The dogfood pin is a published alpha** (Ramon's choice, 2026-11-25).
   - `package.json` becomes `0.1.0-alpha.0`, published with `npm publish --tag next --access public`, so `latest` stays empty until chunk 12.
   - **Ramon runs the publish**: npm isn't logged in here and needs his credentials and OTP.
   - A fix found in the scenario run bumps the version to `0.1.0-alpha.<n+1>` and needs another publish by Ramon.
   - No git tags and no GitHub release before chunk 12.
2. **`search` semantics:**
   - **Query:** NFC-normalised and lower-cased, then split into terms on runs of characters that aren't letters or digits (`/[^\p{L}\p{N}]+/u`). No terms → `E_USAGE` "the query has no words".
   - **What is searched:** every `.md` file of a brain except `AGENTS.md` and `CLAUDE.md` at the brain root and anything under a dot folder. `inbox/` and `daily/` are included in the personal brain. Text between `brain-mesh` generated-block markers is removed before matching, so MOC lists don't echo every summary.
   - **Fields:**
     - `title`: the first `# ` heading of the body, else the file stem;
     - `summary`: the frontmatter `summary` when it is a string;
     - `body`: the text after the frontmatter, with the generated blocks removed.
   - **Match:** every term occurs as a substring.
     - If all terms occur in `title + summary`, the note is a `summary` match.
     - If they occur only in `title + summary + body`, it is a `text` match.
   - **Order:**
     1. `summary` before `text`;
     2. more total term occurrences first;
     3. brain order (`personal`, then `mesh.yaml` order);
     4. path in code-unit order.
   - **Snippet:** `line` is the 1-based file line of the first body line containing any term, and `snippet` is that line trimmed and cut to 200 characters. Both are null when no body line matches.
   - **Limit:** `--limit <n>`, default 20; `total` counts every match.
   - **`--brain <ids>`** (comma-separated):
     - an id that is neither a brain nor a known mount gives `E_UNKNOWN_BRAIN`;
     - a mount that isn't cloned gives warning `W_BRAIN_MISSING` and is skipped.

     Without `--brain`, every loaded brain is searched.
3. **The skills target the personal brain only in chunk 7.**
   - `ingest` proposes notes in `brains/personal/` only. When an item clearly belongs in a mounted shared brain, it says so and keeps it as a personal note for now.
   - Chunk 10 extends `ingest` with the `contribute` path.
   - `ask` reads every mounted brain.
4. **`capture` writes without a proposal round.** Asking for a capture *is* the approval: the content is raw and goes only into the personal `inbox/`, where no rules apply (spec 5.1). It then shows what it wrote and commits. A capture never edits an existing file.
5. **Capture format:**
   - **File:** `brains/personal/inbox/<YYYY-MM-DD>-<slug>.md`. The slug is kebab-case from the title, at most 60 characters; `-2`, `-3` and so on are added when the name is taken.
   - **Body:** `# <title>`, a blank line, the raw text verbatim, then `Source: <origin>` when known and `Captured: <YYYY-MM-DD>`.
   - **No frontmatter:** `inbox/` has no rules.
   - **Commit message:** `Capture: <title>`.
5a. **Ingest write order** (spec 7.3 step 5), after approval:
   1. write or extend the notes from `.mesh/templates/notes/<type>.md`, setting `updated` to today;
   2. run `{{cli}} doctor personal --fix --json` and fix what it still reports;
   3. remove the inbox item, or, when the user wants to keep it, move it to `sources/<slug>.md` with `type: source` frontmatter (`summary`, `updated`);
   4. run one `{{cli}} commit -m "<why>" --json`.

   The commit message says why the notes changed.
6. **`ask` routes through the `AGENTS.md` mount table and each `brain.yaml`.**
   - The spec's `mounts --json` arrives in chunk 9; `AGENTS.md` already lists every mount with its mode and description.
   - `ask` never writes. When nothing answers the question, it names the owner of the most relevant area: the area README's `owner`, else the brain's `owner`.
7. **A skills lint test** parses every `{{cli}} <word>` in `skills/**/SKILL.md` and checks that `<word>` is the name of a registered command, so a skill can't call a command that doesn't exist.
8. **The scenario checklist** is `docs/scenarios.md`.
   - Chunk 7 writes the personal scenarios (P1–P6) and their pass criteria; chunk 10 adds the shared ones and chunk 12 finalises it.
   - **Seed notes:** `test/fixtures/scenarios/personal/` holds the notes the scenarios start from.
   - **Workspace:** `npx -y brain-mesh@<alpha> init --remote <local bare repo>`, so no GitHub repo is created. It needs Ramon's existing `gh` login.
   - **Runs:** `claude -p` with the scenario prompt and the `--allowedTools` line written in the checklist. A scenario that needs approval runs twice: the proposal, then `--continue` with "Approved, go ahead".
   - The run log, with date, version and pass/fail per scenario, goes at the end of the checklist.
9. **Release before the final review.** The alpha is a dogfooding snapshot under `next`, not a release. Fixes from the final review go into the next alpha, which Ramon publishes when he merges. The order:
   1. Tasks 1–3;
   2. release prep and Ramon's publish (Task 4);
   3. the scenario run and its fixes (Task 5);
   4. the final review.

## Review Focus

1. **Search queries with punctuation, umlauts or mixed case** (`CI/CD`, `Größe`, `node_modules`) match the same notes a person would expect. Terms split on punctuation, so `node_modules` finds "node modules". *(Task 1 tests `punctuation splits terms`, `umlauts and case`)*
2. **Notes with broken or missing frontmatter, or a non-string `summary`,** are still searched by body and title and never crash `search`. *(Task 1 test `broken frontmatter is still searched`)*
3. **A large personal brain:** `search` loads and scores a brain of 2,000 notes in well under the one-second budget of spec 9.2. *(Task 1 test `2,000 notes in under a second`)*
4. **Skills that drift from the CLI:** a skill that calls a command or flag the CLI doesn't have fails a test, not a scenario run. *(Task 2 test `every CLI call in a skill names a real command`)*
5. **The published package contains the skills and installs with the prerelease pin.** `npx -y brain-mesh@0.1.0-alpha.0 init` renders all three skills for Claude. *(Task 4 e2e test on the packed tarball; Task 5 run against the registry)*

---

## File Structure

```
src/search/search.ts             # searchWorkspace (pure)                        (Task 1)
src/commands/search.ts           # searchCommand                                 (Task 1)
src/commands/index.ts            # + searchCommand                               (Task 1)
skills/capture/SKILL.md, skills/ingest/SKILL.md, skills/ask/SKILL.md            (Task 2)
test/unit/search/search.test.ts, test/unit/commands/search.test.ts              (Task 1)
test/unit/skills/skills.test.ts                                                  (Task 2)
docs/scenarios.md, test/fixtures/scenarios/personal/**                          (Task 3)
package.json (version), test/e2e/setup.ts, version-pinned tests, README.md     (Task 4)
```

---

### Task 1: `search`

**Files:**
- Create: `src/search/search.ts`, `src/commands/search.ts`, `test/unit/search/search.test.ts`, `test/unit/commands/search.test.ts`
- Modify: `src/commands/index.ts`, `src/output.ts` (no new error code; `W_BRAIN_MISSING` is a warning)
- Test: both new test files

**Interfaces:**
- Consumes:
  - `loadWorkspace(root)`, `WorkspaceModel` and `BrainModel.notes` (`NoteModel {path, text, frontmatter}`);
  - `splitFrontmatter` from `src/brain/frontmatter.ts`;
  - `findWorkspaceRoot`.
- Produces:
  ```ts
  export interface SearchHit {
    brain: string;
    /** Workspace-relative POSIX path. */
    path: string;
    title: string;
    type: string | null;
    summary: string | null;
    match: 'summary' | 'text';
    /** Total occurrences of all terms in title, summary and body. */
    hits: number;
    line: number | null;
    snippet: string | null;
  }
  export interface SearchData { query: string; terms: string[]; brains: string[]; hits: SearchHit[]; total: number }
  export function queryTerms(query: string): string[];
  export function searchWorkspace(ws: WorkspaceModel, query: string, o?: { brains?: string[]; limit?: number }): { data: SearchData; warnings: Warning[] };
  export const searchCommand: CommandDef; // `search <query...> [--brain <ids>] [--limit <n>]`; words of the query are joined with spaces
  ```
- **Text output:** one line per hit, `<path>  <summary or title>`, then `search: <shown> of <total> matches in <n> brains`.

- [ ] **Step 1: Write the failing tests.**
  - The library tests use `fullWorkspace()` plus notes added with `writeFiles`.
  - The command tests run the CLI in-process on the same fixture.

```ts
it('terms', () => expect(queryTerms('CI/CD  Runner-Cache!')).toEqual(['ci', 'cd', 'runner', 'cache']));
it('no words', …)                         // command `search "?!"` → E_USAGE, exit 2
it('summary matches rank first', …)       // note A: summary "Runner cache strategy"; note B: body mentions runner and cache 5×
                                          // search "runner cache" → hits[0].path === A (match 'summary'), B later (match 'text')
it('more hits rank higher within a tier', …)
it('ties break by brain order then path', …) // same note text in personal and brain-team-platform → personal first
it('all terms must match', …)             // "runner banana" → hits []
it('generated MOC lists are not searched', …) // index.md lists a summary inside brain-mesh:index markers → index.md not a hit
it('AGENTS.md, CLAUDE.md and dot folders are skipped', …)
it('inbox and daily are searched in the personal brain', …)
it('punctuation splits terms', …)         // body "node_modules caching" ← query "node modules"
it('umlauts and case', …)                 // body "Die Größe zählt" ← query "GRÖßE Zählt" → hit;
                                          // body written in NFD ("Größe") ← NFC query "größe" → hit (both sides NFC-normalised)
it('broken frontmatter is still searched', …) // unterminated frontmatter; summary: 42 → found by body, summary null
it('line and snippet', …)                 // line is the file line (frontmatter counted); snippet ≤ 200 chars, trimmed
it('--brain restricts and validates', …)  // --brain personal → only personal; --brain nope → E_UNKNOWN_BRAIN;
                                          // a mount whose folder is missing → warning W_BRAIN_MISSING, exit 0
it('--limit and total', …)                // 3 matches, --limit 2 → hits.length 2, total 3
it('2,000 notes in under a second', …)    // 2,000 generated notes in brains/personal/notes/; time loadWorkspace+searchWorkspace < 1000 ms (CI: < 3000 ms)
it('human output', …)
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/search test/unit/commands/search.test.ts`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement** `queryTerms`, `searchWorkspace` and `searchCommand` (Ruling 2).
  - Remove generated blocks with a regex over `<!-- brain-mesh:(\w+) -->` … `<!-- /brain-mesh:\1 -->`.
  - Count occurrences with `indexOf` loops on the lower-cased NFC text.

- [ ] **Step 4: Run the tests and the full unit suite.**
Run: `npx vitest run --project unit`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/search src/commands test/unit/search test/unit/commands/search.test.ts
git commit -m "feat: search ranks summary matches before full-text matches across brains"
```

---

### Task 2: Skills `capture`, `ingest`, `ask`

**Files:**
- Create: `skills/capture/SKILL.md`, `skills/ingest/SKILL.md`, `skills/ask/SKILL.md`, `test/unit/skills/skills.test.ts`
- Test: `test/unit/skills/skills.test.ts`

**Interfaces:**
- Consumes:
  - `readSkills(dir, origin)` and `packageCore()` from chunk 5;
  - `defaultCommands` from `src/commands/index.ts`;
  - `renderWorkspace`.
- Produces: the three skills in the core package. They render to `.claude/skills/<n>/SKILL.md` and `.github/skills/<n>/SKILL.md`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('the core ships capture, ingest and ask', …) // readSkills(packageCore().skillsDir,'core') → names ['ask','capture','ingest'], problems []
it('descriptions say when to use the skill', …) // each description ≤ 1024 chars and contains 'Use when'
it('every CLI call in a skill names a real command', …)
  // for each SKILL.md: every match of /\{\{cli\}\} ([a-z-]+)/g → name in defaultCommands.map(c => c.name)
  // and every such call line contains '--json'
it('capture commits, ingest checks and commits, ask searches', …)
  // capture contains '{{cli}} commit'; ingest contains '{{cli}} search', '{{cli}} doctor personal --fix --json', '{{cli}} commit';
  // ask contains '{{cli}} search' and no '{{cli}} commit'
it('rendered for Claude with the pin filled', …)
  // createWorkspace(temp, {user:'octo-user', pin:'0.4.2'}) with packageCore() →
  // .claude/skills/ask/SKILL.md contains 'npx -y brain-mesh@0.4.2 search' and no '{{'
it('no skill pre-approves the shell', …)         // no 'allowed-tools' key in any frontmatter
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/skills`
Expected: FAIL. There is no `skills/` folder yet.

- [ ] **Step 3: Write the three `SKILL.md` files.** Each has frontmatter `name` and `description` (with a "Use when …" sentence), then a short numbered workflow. Each must state:

  - **`capture`** (Rulings 4, 5):
    - the file name and body format;
    - the raw text is kept verbatim (no summarising), and the capture never goes to a shared brain;
    - after writing: show the path, then `{{cli}} commit -m "Capture: <title>" --json`, and report `pushed`.
  - **`ingest`** (spec 7.3, Rulings 3, 5a):
    1. pick an item from `brains/personal/inbox/` (list them when the user names none) or take the current chat;
    2. route it with the `AGENTS.md` mount table and `brains/personal/brain.yaml`;
    3. run one `{{cli}} search "<key terms>" --brain personal --json`, read `index.md` and the relevant area READMEs and maps;
    4. propose items in four groups, each item with a short quote or timestamp from the input:
       - **Decisions**, kept apart from things only discussed;
       - **Updates to existing notes**, as diffs;
       - **New notes**, only for concepts in no mounted brain;
       - **Open questions and contradictions**;
    5. on approval, follow Ruling 5a.

    Also: placement follows spec 5.1 (an existing area, else `notes/`; a new area only when the user agrees, with a `README.md` of type `area`), titles state the claim, there is a *Related* section with a reason per link, and items for shared brains are flagged but kept personal (Ruling 3).
  - **`ask`** (spec 7.4, Ruling 6):
    1. route with the `AGENTS.md` mount table plus `description`, `topics` and `out_of_scope` from candidate `brain.yaml` files;
    2. narrow with `index.md` and area READMEs or maps;
    3. run one `{{cli}} search "<query>" --brain <ids> --json`;
    4. open the top hits and answer with relative links to the notes used, name the brains searched, and say "covered in brain X, which you don't have mounted" for `links_to` targets that aren't mounted;
    5. if there is no answer, name the owner.

    It never writes.

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run --project unit test/unit/skills`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add skills test/unit/skills
git commit -m "feat: capture, ingest and ask skills for the personal brain"
```

---

### Task 3: Personal scenario checklist and seed notes

**Files:**
- Create: `docs/scenarios.md`, `test/fixtures/scenarios/personal/**`
- Test: `test/unit/scenarios.test.ts`. The seed passes `doctor` once copied into a fresh workspace, and every scenario has a prompt and pass criteria.

**Interfaces:**
- Consumes: `createWorkspace` and `runChecks`.
- Produces: the checklist Task 5 runs.

- [ ] **Step 1: Write the failing test.**

```ts
it('seed notes pass doctor in a new workspace', …) // createWorkspace(temp,{user:'octo-user',pin:'0.4.2'}); copy test/fixtures/scenarios/personal → brains/personal (merge);
                                                    // then run(['doctor', '--fix', '--json'], root) → code 0, data.findings []
it('every scenario has setup, prompt and pass criteria', …) // docs/scenarios.md: each '### P<n>' section contains '**Prompt:**' and '**Pass when:**'; P1–P6 present
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run --project unit test/unit/scenarios.test.ts`
Expected: FAIL. The files are missing.

- [ ] **Step 3: Write the seed notes and the checklist.**
  - **Seed notes:**
    - `areas/ci/README.md` (type `area`);
    - two `areas/ci/` notes: runner cache, and the flaky-test policy (a decision);
    - `notes/obsidian-setup.md` (howto);
    - `inbox/2026-11-20-platform-sync-transcript.md`: a raw transcript of about 40 lines, with one decision, one update to the runner-cache note, one new concept, one contradiction with the flaky-test decision, and one passage about a person.
  - **The checklist** has:
    - a **Setup** section:
      1. a bare repo;
      2. `npx -y brain-mesh@<version> init --remote <bare>` in an empty folder;
      3. copy the seed into `brains/personal/`, then `doctor --fix` and `commit`;
    - the `claude -p` invocation with `--allowedTools "Read Write Edit Glob Grep Bash(npx -y brain-mesh@<version>:*)"`;
    - scenarios **P1–P6**, each with Setup, **Prompt:** and **Pass when:**:
      - **P1:** capture a short thought;
      - **P2:** capture a pasted meeting transcript verbatim;
      - **P3:** ingest the seed transcript (the proposal groups items as Ruling 5a's step 4, each with a quote; after "Approved", the notes are written with valid frontmatter, `doctor` is clean, the inbox item is gone, and there is one commit pushed to the bare repo);
      - **P4:** ingest and keep as a source (the item is moved to `sources/` with `type: source`);
      - **P5:** ask a question the seed answers (an answer with links to the notes, naming the brain searched, with no file changed);
      - **P6:** ask a question nothing answers (says so and names the owner `@<login>`, with no file changed);
    - an empty **Run log** table: date, version, scenario, result, notes.

- [ ] **Step 4: Run the test.**
Run: `npx vitest run --project unit test/unit/scenarios.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add docs/scenarios.md test/fixtures/scenarios test/unit/scenarios.test.ts
git commit -m "docs: personal scenario checklist with seed notes"
```

---

### Task 4: Alpha release prep and publish

**Files:**
- Modify:
  - `package.json` (`version: 0.1.0-alpha.0`);
  - `test/e2e/setup.ts` (tarball name from `package.json`);
  - `test/e2e/npx.test.ts`, `test/unit/main.test.ts`, `test/unit/meta.test.ts` (expected version from `package.json`, not a literal);
  - `README.md` (the `init`, `commit` and `search` rows, and a short "Try the alpha" section).
- Test: the e2e project.

- [ ] **Step 1: Bump the version and make the tests version-independent.** Every hard-coded `'0.0.0'` that means "this package's version" reads `package.json` instead. Literals that are only sample `mesh.yaml` values stay.
Run: `npx vitest run`
Expected: PASS (unit and e2e).

- [ ] **Step 2: Extend the packaging e2e test.**
  - After installing the tarball, import `createWorkspace` from `<pkg>/dist/workspace/create.js` and create a workspace in a temp folder with `pin` = the package version.
  - Assert that `.claude/skills/{capture,ingest,ask}/SKILL.md` exist and contain `npx -y brain-mesh@0.1.0-alpha.0`.

Run: `npx vitest run --project e2e`
Expected: PASS.

- [ ] **Step 3: Check the package contents.**
Run: `npm pack --dry-run --json`
Expected: the file list holds `dist/`, `schemas/`, `templates/` (workspace, brain, notes, hooks, tools) and `skills/` (three `SKILL.md`), and nothing from `test/` or `docs/`.

- [ ] **Step 4: Commit and push the branch.**
```bash
git add package.json test README.md && git commit -m "chore: 0.1.0-alpha.0 for dogfooding"
git push
```

- [ ] **Step 5: Hand over the publish to Ramon. This is a stop.** Give him these commands, run in the repo on the pushed commit:
  ```powershell
  npm login
  ```
  ```powershell
  npm publish --tag next --access public
  ```
  Wait for his "published". Then confirm with:
  - `npm view brain-mesh@next version` → `0.1.0-alpha.0`;
  - `npm view brain-mesh dist-tags` → `next` only.

---

### Task 5: Scenario run on Claude Code

**Files:**
- Modify: `docs/scenarios.md` (run log); `skills/**` and `src/**` only for fixes found here.
- Test: the scenarios themselves, plus the unit suite after any fix.

- [ ] **Step 1: Set up the scenario workspace** exactly as the checklist's Setup says, in a temp folder whose path contains a space, against `0.1.0-alpha.0` from the registry.
Expected: `init` exit 0, `doctor` clean after seeding.

- [ ] **Step 2: Run P1–P6** with `claude -p` as the checklist says. After each scenario, check the **Pass when** criteria against the files, `git log` and the bare repo.
Expected: all six pass.

- [ ] **Step 3: Handle any failure.** Find its cause:
  - **a skill's wording:** edit `skills/<n>/SKILL.md`;
  - **a CLI bug:** add a failing unit test first, then the fix.

  Then bump to `0.1.0-alpha.<n+1>`, commit, push, and hand the publish to Ramon again (Task 4 Step 5). Rerun every scenario that failed, plus P3 when `ingest` changed.

- [ ] **Step 4: Record the run log** (date, version, scenario, pass or fail, one-line note), and close the carried checks:
  - In `docs/plan/v0-breakdown.md`, mark the chunk 7 pin line done ("0.1.0-alpha.N on npm under `next`").
  - Mark chunk 7 done.
  - Keep the VS Code and Obsidian-git hook line open with "Ramon checks while dogfooding" until he reports back.

Run: `npm run typecheck && npx vitest run`
Expected: PASS.
```bash
git add docs skills src test package.json && git commit -m "docs: personal scenarios pass on Claude Code with 0.1.0-alpha.N"
```

- [ ] **Step 5: Hand over dogfooding.** Tell Ramon how to create his real workspace:
  1. run `npx -y brain-mesh@next init` in an empty folder next to `brain-mesh/`, per the breakdown's folder layout;
  2. open `brains/` in Obsidian;
  3. while dogfooding, commit once from VS Code and once with Obsidian-git, and report whether the heads-up appeared (the carried hook check).

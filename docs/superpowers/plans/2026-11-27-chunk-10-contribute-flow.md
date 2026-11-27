# Chunk 10: Contribute flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Changes to shared brains reach their repo as pull requests. The `contribute` skill runs `doctor` and the people-policy check first, then the CLI branches, commits, pushes, opens the PR and returns the clone to the default branch. Two reviewer agents ship, `ingest` and `ask` work across shared brains, and the shared-brain scenarios pass on Claude Code against a sandbox shared brain.

**Architecture:**
- **One write command:** `commit [brain]` grows from personal-only to every row of spec 7.2: personal (unchanged), shared unpublished (direct commit), shared published `contribute` (branch → PR → back to default) and `read` (refused). The PR route lives in `src/contribute/pr.ts`; the command stays a thin `CommandDef`.
- **A gate before anything is written:** for a shared brain, `commit` runs the offline `doctor` checks of that brain and refuses on errors. This is the deterministic half of the people-policy check (spec 5.6), and it makes generated MOC lists, `CODEOWNERS` and `links_to` travel inside each PR (ADR 0001).
- **The judgement half** is the `people-policy-reviewer` agent, called by the `contribute` skill on the changed files. The `consistency-reviewer` agent reports contradictions and duplicates. Both are plain agent sources in `agents/`, rendered by the chunk 5 code that already exists.
- **Search across brains needs no CLI change:** `search` already covers every cloned brain (chunk 7). This chunk routes `ask` and `ingest` through `mounts --json` and proves it in scenario S3.

**Tech Stack:** TypeScript ESM, Node ≥ 22.12, commander, zod 4, yaml, execa, Vitest. No new dependencies.

**Spec:** [docs/spec.md](../../spec.md):
- 5.6: people notes and the people-policy check;
- 7.1: editing rules, mount modes from `mounts --json`;
- 7.2: writing to brains;
- 7.3: ingestion (the PR case of step 5);
- 7.4: lookup;
- 7.5: skills and agents in v0;
- 8: `commit`, `doctor`;
- 9.2: agent source format;
- 10: the scenario checklist.

Breakdown: [v0-breakdown.md](../../plan/v0-breakdown.md), chunk 10 and the carried chunk 8 team check. ADRs: [0001](../../adr/0001-generated-moc-lists-travel-in-each-pr.md).

## Global Constraints

- **Writing to a published shared brain (spec 7.2):** "Branch `mesh/<user>/<slug>` from fresh `origin/<default>`, commit, push, open a PR, return the clone to the default branch."
- **Unpublished shared brain:** "Commit directly to the default branch." **`read` mount:** "Nothing is written."
- **Local state:** "The local clone of a shared brain always shows merged state; content of open PRs is not visible locally. There is no separate operations log: the *why* of a change goes into the commit message and PR description."
- **People policy (5.6):** shared brains allow names "only to record responsibilities (who owns what), decisions (who decided what) and outcomes (what happened)"; not allowed: "Any judgement of people: opinions, assessments, performance, behaviour, private life". Person-note keys: `type`, `summary`, `updated`, `name`, `role`, `team`, `responsibilities`, `contact`.
- **The check (5.6):** "Runs in the `contribute` skill on the changed files before a PR is opened." "Flags must be fixed before the PR is opened. A false positive can be overridden only with a reason written into the PR description, which the reviewer sees."
- **Agents (7.5):** consistency-reviewer "Finds contradictions and duplicates in a brain's content; reports, doesn't edit." people-policy-reviewer "Flags passages about people that aren't responsibilities, decisions or outcomes (5.6)."
- **Agent format (9.2):** frontmatter `name` (= file stem), `description`, `tools` from `read | search | edit | execute`; no `model`.
- **Ingest with a PR (7.3):** "Then the inbox item is removed (for a PR: when it is opened; the removing commit names the PR URL)".
- **Contributing:** "requires push rights on the brain repo; no fork-based contributions."
- **`--json`:** exactly one envelope on stdout. Every new error has a stable `E_…` code.
- **No prompts:** network git calls use `{ network: true }` (`GIT_TERMINAL_PROMPT=0`).
- **Tests:** remotes are local bare repos, and tests run on Windows and Linux without the network. github.com URLs reach local bare repos through a git `insteadOf` alias.

## Decisions taken in this plan

1. **`commit <brain>` is the one write command; there is no `contribute` CLI command.** Spec 8 calls `commit` "the personal brain's changes only" because shared brains had no route yet. Its row becomes "Commit a brain's changes by the route of 7.2". The `contribute` skill is what spec 7.5 names. Cost if wrong: an agent reading the old spec 8 row expects `commit` to refuse shared brains.
2. **The shared-brain gate is the offline `doctor` errors of that brain** (`E_DOCTOR_ERRORS`, listing up to five findings as `code path`). It runs before any git change, for both shared routes. Network checks (owners, push rights) are left to `doctor`. Cost if wrong: an owner typo reaches the PR, where CODEOWNERS review catches it.
3. **The PR route in order.** Every check runs before the first git change:
   1. mode `contribute` with a url;
   2. `.git` present and git identity known;
   3. something changed;
   4. the gate passes;
   5. the URL is on github.com;
   6. push rights;
   7. the clone is on the remote default branch, found with `git ls-remote --symref origin HEAD`.

   Then:
   1. `fetch`;
   2. `merge --ff-only origin/<default>`, which carries the uncommitted changes;
   3. `switch -c mesh/<user>/<slug>`, `add -A`, commit;
   4. `push -u origin <branch>`, then `createPullRequest`;
   5. `switch <default>`, `reset --hard origin/<default>` and `branch -D <branch>`.

   Commits that were only on the local default branch go into the PR. That way nothing is stranded and the clone ends equal to `origin/<default>`. Cost if wrong: a local commit the user meant to keep out of the PR is in it, though only until review.
4. **Failure leaves the work where the user can see it:**
   - **The push fails:** reset `--mixed` to the starting commit, switch back and delete the branch. The changes are uncommitted again, exactly as before. The error is `E_GIT`.
   - **The PR call fails after the push:** switch back to the default branch and keep the local branch. The error is `E_PR_CREATE`, naming the pushed branch and the compare URL `https://github.com/<o>/<r>/compare/<default>...<branch>`.
5. **The slug** is the first line of `-m`, NFKD-folded to ASCII, lowercase kebab-case, at most 48 characters, and never empty (`change`). If `mesh/<user>/<slug>` already exists locally or on `origin`, append `-2`, `-3` and so on.
6. **PR text:** the title is the first line of `-m`. The body is `--body <text>` when given, else the rest of `-m`. The commit message is the full `-m`. People-policy overrides go into `--body`, written by the skill.
7. **`commit <brain> --dry-run`** runs every check that needs no network and changes nothing. It returns the route, the files and the planned branch, so the skill can show the proposal and hand the file list to the reviewer.
8. **Agents return a fixed shape** the skills act on:
   - **people-policy-reviewer:** one line per flag, `FLAG <path>:<line> — "<quote>" — <why>`, or `NO FLAGS`.
   - **consistency-reviewer:** `CONTRADICTION <a> <b> — <what>` and `DUPLICATE <a> <b> — <what>` lines, or `NOTHING FOUND`.

   Neither edits.
9. **The chunk 8 team check runs with the sandbox shared brain** in Task 6: `wildfeuer-labs/brain-sandbox` with a team that has write access. If GitHub answers as chunk 8's deferred minors feared (a 200 without `permissions`, or teams invisible to an outside collaborator), the fix is a ruling in Task 6 with its test.

## Review Focus

1. **A clone that is behind `origin`, or has local commits.** Expected: the PR carries the user's changes and those commits, nothing is lost, and the clone ends equal to `origin/<default>`. (Task 2, "behind and ahead".)
2. **A failure between commit and PR** (the push is rejected, the PR API errors). Expected: the changes are never lost, and the message says where they are. (Task 2, "push fails" and "PR fails".)
3. **A message with quotes, umlauts or only punctuation.** Expected: a valid, ASCII, non-empty branch name. (Task 2, "slug".)
4. **A shared brain whose default branch is not `main`.** Expected: the branch starts from that branch, and the PR targets it. (Task 2, "non-main default".)
5. **Deleted and renamed notes.** Expected: they are in the PR commit, as `add -A` stages them, and in `files`. (Task 2, "deletions travel".)

---

### Task 1: `commit` for every brain, the gate and `--dry-run`

**Files:**
- Modify `src/commands/commit.ts`, `src/output.ts` (`ReadOnly: 'E_READ_ONLY'`, `DoctorErrors: 'E_DOCTOR_ERRORS'`) and `test/helpers/host.ts`.
- Create `src/contribute/gate.ts`.
- Test `test/unit/commands/commit-shared.test.ts`. Keep `test/unit/commands/commit.test.ts` green.

**Interfaces:**
- Consumes: `readMesh`, `loadWorkspace`, `runChecks(ws, brain)`, `assertGitIdentity`, `pullPush`.
- Produces:
  - `export type CommitRoute = 'personal' | 'direct' | 'pr'`;
  - `CommitData`, for later tasks: `{ brain: string; route: CommitRoute; committed: boolean; commit: string | null; files: string[]; pushed: boolean; branch: string | null; pr: { number: number; url: string } | null; dryRun: boolean }`. `files` are brain-relative POSIX paths for shared brains and workspace-relative for personal, as today;
  - `export async function brainChanges(dir: string): Promise<string[]>`, the changed paths from `status --porcelain -z --untracked-files=all`, renames as the new path;
  - `export async function assertGate(root: string, id: string): Promise<void>`, which throws `E_DOCTOR_ERRORS`;
  - `fakeHost` gains `prs: PullRequestInput[]` and the option `prError?: CliError`.

- [ ] **Step 1: Failing tests** (workspaces from `initWorkspace`):
  - "personal is unchanged": the existing `commit` tests pass. `data` also has `route: 'personal'`, `branch: null`, `pr: null` and `dryRun: false`.
  - "unpublished brain commits directly":
    - setup: `brain new brain-ideas --description x`, then write `notes/idea.md` with valid frontmatter and run `doctor brain-ideas --fix`;
    - `commit brain-ideas -m "Add idea" --json` gives `{ route: 'direct', committed: true, pushed: false }`, and `files` contains `notes/idea.md` and `notes/README.md` (its generated list changed);
    - the clone's last commit is "Add idea", and `git status` in the clone is clean.
  - "read mount is refused": `commit brain-sre -m x` on a read mount gives `E_READ_ONLY`, with a message that suggests the personal brain. The clone is unchanged.
  - "the gate": a person note in brain-ideas with the key `opinion` gives `E_DOCTOR_ERRORS`, and the message contains `person-key-not-allowed notes/ben.md`. Nothing is committed.
  - "unknown brain": `commit brain-nope -m x` gives `E_UNKNOWN_BRAIN`.
  - "nothing to commit": a clean shared brain gives `committed: false` and makes no host calls.
  - "dry run": on brain-ideas with changes, `--dry-run` gives `{ route: 'direct', dryRun: true, committed: false, files: [...] }`, and `git status` is the same before and after.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/commands/commit-shared.test.ts`. Expected: `E_NOT_SUPPORTED` for shared brains, and the new fields are missing.
- [ ] **Step 3: Implement.**
  - Route by the mesh mount: personal; read → `E_READ_ONLY`; contribute without url → direct; contribute with url → Task 2's `contributePr`. Until Task 2 lands, that last route throws `E_NOT_SUPPORTED`.
  - The checks for both shared routes come first, in the order of decision 3.
  - The direct route is `add -A`, then `commit -m` in the clone; it never pushes.
  - Add the options `--body <text>` and `--dry-run`.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(commit): shared brains: direct commits, read refusal, doctor gate, --dry-run`

### Task 2: The pull-request route

**Files:**
- Create `src/contribute/pr.ts` and `src/contribute/slug.ts`.
- Modify `src/commands/commit.ts` and `test/helpers/remotes.ts`.
- Test `test/unit/contribute/pr.test.ts` and `test/unit/contribute/slug.test.ts`.

**Interfaces:**
- Consumes: Task 1's `brainChanges`, `assertGate` and `CommitData`; `Host` (`repoOf`, `permission`, `createPullRequest`); `checkPushRights`.
- Produces:
  - `export function prSlug(message: string): string`;
  - `export async function contributePr(o: { root: string; id: string; url: string; user: string; message: string; body?: string; host: Host; dryRun: boolean }): Promise<CommitData & { warnings: Warning[] }>`;
  - in the test helpers, `export function githubAlias(base: string, org = 'acme'): string[]`. It returns the `isolateGit({ extra })` lines `[url "<base>/"]` and `insteadOf = https://github.com/<org>/`, with forward slashes, so `https://github.com/acme/<name>.git` resolves to `<base>/<name>.git`.

- [ ] **Step 1: Failing tests.**
  - **Setup:**
    - a base folder, then `isolateGit({ extra: githubAlias(base) })`, `initWorkspace(base)` and `sharedRemote(base, 'brain-sre')`;
    - `mount https://github.com/acme/brain-sre.git --mode contribute`;
    - write `notes/runner-pools.md`, then run `doctor brain-sre --fix`.
  - **"slug":**
    - `prSlug('Add runner note')` gives `'add-runner-note'`;
    - `prSlug('Füge „Runner“-Notiz hinzu!\nmore')` gives `'fuge-runner-notiz-hinzu'`;
    - `prSlug('!!!')` gives `'change'`;
    - a 100-character title gives at most 48 characters, with no trailing `-`.
  - **"opens a PR":**
    - `commit brain-sre -m "Add runner pools" --body "Why: the pools note was missing." --json` returns `route: 'pr'`, `branch: 'mesh/octo-user/add-runner-pools'`, `pr: { number: 1, url: 'https://github.com/acme/brain-sre/pull/1' }` and `pushed: true`, and `files` contains `notes/runner-pools.md`;
    - the bare repo has that branch, with one commit "Add runner pools" on top of `main`;
    - `host.prs` is `[{ repo: { owner: 'acme', name: 'brain-sre' }, head: 'mesh/octo-user/add-runner-pools', base: 'main', title: 'Add runner pools', body: 'Why: the pools note was missing.' }]`;
    - the clone is on `main`, `rev-parse main` equals `origin/main`, `git status` is clean, and no local `mesh/` branch exists.
  - **"branch names don't collide":** a remote branch `mesh/octo-user/add-runner-pools` already exists, so the result's branch is `mesh/octo-user/add-runner-pools-2`.
  - **"behind and ahead":**
    - `pushToRemote` adds `notes/other.md` to `origin/main`, and the clone has one local commit on `main` plus an uncommitted change;
    - the PR branch holds the other note, the local commit and the change;
    - afterwards, local `main` equals `origin/main`.
  - **"deletions travel":** the remote is seeded with `notes/old.md`. Deleting it and running `doctor brain-sre --fix` puts the deletion in the PR commit (`git show --name-status` shows `D notes/old.md`), and `notes/old.md` is in `files`.
  - **"non-main default":** the remote's default branch is `trunk` (`symbolic-ref HEAD refs/heads/trunk` in the bare repo before the mount). The PR has `base: 'trunk'`, and the clone ends on `trunk`.
  - **"refuses before anything changes"** (`git status` of the clone is the same before and after, and the remote has no new branch):
    - a mount with a local path url gives `E_NOT_SUPPORTED`;
    - `fakeHost({ permissions: { 'acme/brain-sre': 'read' } })` gives `E_NO_PUSH_RIGHTS`;
    - a clone on branch `x` gives `E_GIT`, with a message naming `main`.
  - **"push fails":**
    - a `pre-receive` hook in the bare repo exits 1;
    - the result is `E_GIT`;
    - the clone is on `main` with the same uncommitted changes as before, and no `mesh/` branch exists locally.
  - **"PR fails":**
    - `fakeHost({ prError: new CliError('E_PR_CREATE', 'boom') })` gives `E_PR_CREATE`;
    - the message contains `https://github.com/acme/brain-sre/compare/main...mesh/octo-user/add-runner-pools`;
    - the branch is on the remote, and the clone is on `main`.
  - **"dry run, PR route":** the result has `route: 'pr'`, `dryRun: true`, `branch: 'mesh/octo-user/add-runner-pools'` and the files. `host.calls` is empty and nothing changes.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/contribute`. Expected: the modules are missing.
- [ ] **Step 3: Implement** in the order of decisions 3–6. The branch-collision check uses `git ls-remote --heads origin 'mesh/<user>/<slug>*'` once, plus the local branches.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(commit): open a pull request for published shared brains`

### Task 3: The reviewer agents

**Files:**
- Create `agents/people-policy-reviewer.md` and `agents/consistency-reviewer.md`.
- Create `test/helpers/cli-lint.ts`, moving `cliCallError` there from `skills.test.ts`.
- Test `test/unit/agents/agents.test.ts`.

**Interfaces:**
- Consumes: `readAgents`, `packageCore` and the client rendering from chunk 5.
- Produces: the agent names `people-policy-reviewer` and `consistency-reviewer`, and the output shapes of decision 8. Task 4's skills rely on both.

- [ ] **Step 1: Failing tests:**
  - "the core ships both agents": `readAgents(packageCore().agentsDir, 'core')` has no problems. The names are `['consistency-reviewer', 'people-policy-reviewer']`, the tools are `['read', 'search', 'execute']` and `['read', 'search']`, and each description contains "Use when".
  - "people-policy-reviewer states the rule and the output": the body contains `responsibilities`, `decisions`, `outcomes`, `opinions`, `performance`, `private life`, `FLAG `, `NO FLAGS`, "do not edit" and "override".
  - "consistency-reviewer reports only": the body contains `CONTRADICTION `, `DUPLICATE `, `NOTHING FOUND` and "do not edit".
  - "every CLI call in an agent is real": each `{{cli}} …` line parses through `cliCallError` and contains `--json`.
  - "rendered for both clients": `createWorkspace` writes `.claude/agents/people-policy-reviewer.md` with `tools: Read, Grep, Glob` and `.github/agents/people-policy-reviewer.agent.md`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/agents`. Expected: no agents.
- [ ] **Step 3: Write the agents:**
  - **people-policy-reviewer:**
    - input: a brain id and the brain-relative paths to review;
    - it reads every passage that names or describes a person and flags each one that is not a responsibility, decision or outcome;
    - it sees an override reason when the caller passes one;
    - it never edits.
  - **consistency-reviewer:**
    - input: a brain id and, optionally, a topic or paths;
    - it uses `{{cli}} search "<terms>" --brain <id> --json` and the MOCs;
    - it compares `summary` and claims, and reports contradictions (newer `updated` named) and near-duplicates;
    - it never edits.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(agents): people-policy-reviewer and consistency-reviewer`

### Task 4: `contribute`, and `ingest` and `ask` across shared brains

**Files:**
- Create `skills/contribute/SKILL.md`.
- Modify `skills/ingest/SKILL.md`, `skills/ask/SKILL.md` and `templates/workspace/AGENTS.md`.
- Test `test/unit/skills/skills.test.ts`.

**Interfaces:** Consumes Task 1–2's `commit <id> [--dry-run] -m <message> [--body <text>]` and Task 3's agent names and output shapes.

- [ ] **Step 1: Failing tests:**
  - `NAMES` is `['ask', 'capture', 'contribute', 'ingest']`.
  - "contribute follows 5.6 and 7.2":
    - the skill calls `{{cli}} mounts --json`, `{{cli}} doctor <id> --fix --json`, `{{cli}} commit <id> --dry-run -m "<title>" --json` and `{{cli}} commit <id> -m "<title>" --body "<why>" --json`;
    - it names `people-policy-reviewer`;
    - it contains "override" and "read".
  - "ingest can contribute": the skill names the `contribute` skill and `mounts --json`, and contains "PR URL" (the removing commit names it) and "read".
  - "ask routes with mounts": the skill calls `{{cli}} mounts --json`.
  - "skills name only real agents": every `*-reviewer` name in a skill is an agent in `agents/`.
  - The existing lint test passes, which parses `--dry-run` and `--body`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/skills`. Expected: contribute is missing.
- [ ] **Step 3: Write the skills.**
  - **contribute**, after the user has approved the content:
    1. **Mode check:** from `mounts --json`. A `read` mount: offer a personal note instead.
    2. **Generated content:** `doctor <id> --fix` until clean.
    3. **The file list:** `commit --dry-run`.
    4. **Review** the files with people-policy-reviewer, only when the brain's `policies.people` is `accountability`. Fix each flag with the user. A flag the user calls a false positive needs their reason, which goes into `--body` under "People-policy overrides:".
    5. **Proposal:** show the title, body and files, and ask before opening the PR.
    6. **Open it:** `commit <id> -m … --body …`, then report the PR URL.

    An unpublished brain takes the same steps and gets a direct commit.
  - **ingest:**
    - **Route** with `mounts --json`: a `contribute` mount may be the target, and a `read` mount never is.
    - **Search** across candidate brains.
    - **The write order for a shared target:**
      1. write the notes in `brains/<id>/`;
      2. run the `contribute` skill's steps;
      3. remove or move the inbox item;
      4. run `{{cli}} commit -m "Ingest <x>: contributed in <PR URL>" --json` for the personal brain.
  - **ask:** route with `mounts --json`, not the `AGENTS.md` table.
  - **The workspace `AGENTS.md`:** one line saying that shared brains change only through the `contribute` skill and that `read` mounts are never edited.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(skills): contribute; ingest and ask across shared brains`

### Task 5: Shared scenarios and docs

**Files:**
- Create `test/fixtures/scenarios/shared/brain-sandbox/` (seed notes) and `test/fixtures/scenarios/shared/brain-handbook/` (a small read brain).
- Modify `docs/scenarios.md`, `test/unit/scenarios.test.ts`, `README.md`, `docs/spec.md` (8, the `commit` row) and `docs/plan/v0-breakdown.md`.

- [ ] **Step 1: Failing tests:**
  - "shared seed passes doctor":
    - `createWorkspace`, then the shared template for `brain-sandbox` (`brainFiles(sharedManifest(…))`), with the fixture copied over it;
    - `doctor brain-sandbox --fix` reports no findings;
    - `brain-handbook` gets the same.
  - "every scenario has setup, prompt and pass criteria" also requires S1–S5.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/scenarios.test.ts`.
- [ ] **Step 3: Seed and scenarios.**
  - **brain-sandbox:**
    - area `ci` with an owner;
    - a runner-cache note with 14-day retention and a decision note with 7 days, which is the contradiction S5 must find;
    - two near-duplicate notes on flaky tests;
    - a person note using only allowed keys;
    - a `releases` area.
  - **brain-handbook:** a `release-process` howto.
  - **Setup** (bash and PowerShell, with the `npx.cmd` form of `bm`):
    - a workspace on a local bare repo, as for P1–P6;
    - `bm brain new brain-sandbox --description … --owner @wildfeuer-labs/<team>`, then copy the seed and run `bm commit brain-sandbox -m "Seed"` (the direct route);
    - `bm brain publish brain-sandbox https://github.com/wildfeuer-labs/brain-sandbox.git`;
    - `brain-handbook` pushed to a local bare repo and `bm mount`ed read-only;
    - an inbox item `ci-retro` copied into the personal inbox.
  - **S1 Ingest into a shared brain via PR:**
    - the proposal targets brain-sandbox;
    - after approval, a PR is open on `mesh/<login>/…` with the notes and regenerated MOCs;
    - the clone is back on `main`;
    - the inbox item is removed in a personal commit naming the PR URL.
  - **S2 People-policy flag:**
    - the prompt adds a note saying who decided the pool move and judging someone as "careless";
    - the reviewer flags the judgement;
    - no PR contains it unless the user overrides, and an override puts the reason in the PR description.
  - **S3 Cross-brain ask:**
    - the answer uses a brain-sandbox note and a personal note, with links, and names both brains;
    - it says brain-handbook is mounted read-only only when that is relevant.
  - **S4 Read mount respected:** "Fix the release process note in brain-handbook" is declined, and a personal note is offered. Nothing is written in brain-handbook.
  - **S5 Consistency review:**
    - the reviewer reports the 7 vs 14 days contradiction (naming the newer note) and the flaky-test duplicate;
    - no file changes.
  - **The docs:**
    - **README:** the `commit` row covers the routes, plus `--dry-run` and `--body`;
    - **spec 8:** the `commit` row reads "Commit a brain's changes by the route of 7.2 (personal: commit, rebase, push; shared: PR, or a direct commit while unpublished; `read`: refused)";
    - **breakdown:** chunk 10 status.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `docs: shared scenarios S1–S5, commit routes`

### Task 6: The real checks (stop for Ramon)

**Files:** Modify `docs/scenarios.md` (run log), `docs/research/2026-11-chunk-01-research.md` ("Chunk 10 checks"), `docs/plan/v0-breakdown.md` and `package.json`/`package-lock.json` (version 0.1.0-alpha.5).

- [ ] **Step 1: Version** 0.1.0-alpha.5, after the final review's fix pass, so the published alpha holds the fixes.
- [ ] **Step 2: Stop for Ramon:**
  1. He creates `wildfeuer-labs/brain-sandbox` (private and empty) and a team with write access to it.
  2. He publishes alpha.5 with `npm publish --tag next`.
  3. He runs the scenario setup, which publishes brain-sandbox and so gives it a `main` branch.
  4. In the brain-mesh repo, he runs `BRAIN_MESH_SANDBOX_REPO=wildfeuer-labs/brain-sandbox BRAIN_MESH_SANDBOX_TEAM=@wildfeuer-labs/<team> npx vitest run test/e2e/github-sandbox.test.ts`. It opens and closes one PR of its own.
  5. He runs S1–S5.
- [ ] **Step 3: Record:**
  - the run log rows;
  - the research note's "Chunk 10 checks", with the team endpoint's real answer and what an outside collaborator sees;
  - the carried chunk 10 check in the breakdown marked done.

  When the team answer shows a chunk 8 deferred minor is real (a 200 without `permissions`, or invisible teams), the fix is a ruling here with its test, written first.
- [ ] **Step 4: Commit** `docs: chunk 10 checks`

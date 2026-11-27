# Scenario checklist

Spec 10: skills and agents are checked by hand against a fixture workspace before each release, on Claude Code (the reference client); Copilot gets a smoke test. This file holds the scenarios, how to run them and a log of runs.

Chunk 7 adds the personal-brain scenarios (P1–P6), chunk 9 the mount checks (M1–M3) and chunk 10 the shared-brain scenarios (S1–S5). Chunk 12 finalises the list.

## Setup

Use a published version (`<version>`, e.g. `0.1.0-alpha.0`) and an empty folder whose path contains a space. The workspace pushes to a local bare repo, so no GitHub repo is created; `init` still needs a logged-in `gh` for the user name.

```bash
base="$(mktemp -d)/scenario run"; mkdir -p "$base/workspace"
git init --bare -q -b main "$base/remote.git"
cd "$base/workspace"
npx -y brain-mesh-ai-workspace@<version> init --remote "$base/remote.git" --json
cp -r <brain-mesh repo>/test/fixtures/scenarios/personal/. brains/personal/
npx -y brain-mesh-ai-workspace@<version> doctor personal --fix --json      # expect "errors":0
npx -y brain-mesh-ai-workspace@<version> commit -m "Seed scenario notes" --json
```

The seed brain has an area `ci` (runner cache note, flaky-test decision), `notes/obsidian-setup.md`, and the raw transcript `inbox/2026-11-20-platform-sync-transcript.md`.

Run every scenario from the workspace root with Claude Code in print mode:

```bash
claude -p "<prompt>" --allowedTools "Read Write Edit Glob Grep Bash(npx -y brain-mesh-ai-workspace@<version>:*) PowerShell(npx -y brain-mesh-ai-workspace@<version>:*) Bash(rm:*) Bash(mv:*) Bash(mkdir:*) Bash(ls:*) PowerShell(Remove-Item:*) PowerShell(Move-Item:*)"
```

On Windows, Claude Code runs commands through its PowerShell tool, hence the `PowerShell(…)` entries. Keep the workspace out of Claude Code's own temp folder (`…\Temp\claude\…`): Claude Code refuses to delete files there.

A scenario that needs approval runs twice: first the prompt (the proposal), then `claude -p --continue "Approved, go ahead." --allowedTools "…"` with the same tools.

After each scenario, check the result with `git -C "$base/workspace" log --stat -1`, `git -C "$base/remote.git" log --oneline main` and the files named below. Reset between scenarios only where a scenario says so.

## Personal brain

### P1 Capture a thought

**Prompt:** `Capture this: we should try Renovate's grouped updates for the platform repos, Ben mentioned it saves a lot of PR noise.`

**Pass when:**
- exactly one new file `brains/personal/inbox/<today>-<slug>.md` exists, with a `# ` title, the text verbatim, and a `Captured: <today>` line;
- no other file changed;
- the last commit is `Capture: <title>`, touches only that file, and is on the bare repo's `main`.

### P2 Capture a pasted transcript

**Prompt:** `Capture this meeting transcript: ` followed by the first 12 lines of the seed transcript pasted inline.

**Pass when:**
- one new inbox file holds the 12 lines byte for byte (no summary, no reformatting), with a `Source:` line naming a meeting;
- the commit touches only that file and is pushed.

### P3 Ingest the platform sync transcript

**Prompt:** `Ingest inbox/2026-11-20-platform-sync-transcript.md.` Then `--continue` with `Approved, go ahead.`

**Pass when:**
- the first run changes no file and shows a proposal with the four groups:
  - **Decisions:** the layer TTL goes from 7 to 3 days; the merge queue from 1 December with batch size 3;
  - **Updates to existing notes:** a diff for `areas/ci/runner-cache-strategy.md`;
  - **New notes:** at least the merge queue;
  - **Open questions and contradictions:** Carla's "deleted after the first failure" against `flaky-test-policy.md`, and who owns the cache warming job.

  Every item quotes the transcript or gives its timestamp. The search call `search … --brain personal --json` was made once.
- After approval:
  - the runner cache note says 3 days and its `updated` is today;
  - new notes have `type`, `summary` and `updated`, kebab-case names, and a *Related* section;
  - `npx -y brain-mesh-ai-workspace@<version> doctor --json` reports `"errors":0`;
  - the inbox file is gone;
  - there is one commit whose message says why, and it is pushed.
- Nothing outside `brains/personal/` changed.

### P4 Ingest and keep the input as a source

**Setup:** reset the workspace to the commit after Setup (`git reset --hard <seed commit>`, then `git push -f`) so the transcript is back in the inbox.

**Prompt:** `Ingest inbox/2026-11-20-platform-sync-transcript.md and keep the transcript as a source.` Then `--continue` with `Approved, go ahead.`

**Pass when:**
- the transcript is now `brains/personal/sources/<slug>.md`, with frontmatter `type: source`, a one-sentence `summary` and `updated`;
- `inbox/` no longer holds it;
- `doctor` reports `"errors":0`;
- one commit is pushed.

### P5 Ask a question the brain answers

**Prompt:** `How long do runner cache layers live, and why?`

**Pass when:**
- the answer gives the TTL as written in `areas/ci/runner-cache-strategy.md` and links that note with a relative path;
- it names the brain searched (`personal`);
- `search` was called with `--json`;
- `git status` shows no change, and no new commit exists.

### P6 Ask a question nothing answers

**Prompt:** `Who is on call for the payments service this week?`

**Pass when:**
- the answer says the mounted brains don't cover it;
- it names an owner to ask: the brain owner `@<login>`, since no area matches;
- `git status` shows no change, and no new commit exists.

## Mounts

These run by hand against github.com, not in the scenario setup above, in a scratch workspace made by the version under test: restore refuses a workspace pinned to another version. `bm` stands for `npx -y brain-mesh-ai-workspace@<version>`; in PowerShell define it as `function bm { & npx.cmd -y brain-mesh-ai-workspace@<version> @args }` (a function that calls plain `npx` reaches `npx.ps1`, which drops the arguments, and brain-mesh answers "missing command"). Make the workspace with `bm init --name ai-workspace-mounts` in an empty folder whose path contains a space. Afterwards, delete both scratch repos with `gh repo delete <login>/brain-dogfood` and `gh repo delete <login>/ai-workspace-mounts`.

### M1 Mount a real shared brain read-only

**Steps:**
1. `gh repo create brain-dogfood --private`, then in the workspace `bm brain new https://github.com/<login>/brain-dogfood.git --description "Scratch brain for the mount checks."`.
2. `bm unmount brain-dogfood`, then `bm mount https://github.com/<login>/brain-dogfood.git --json`.
3. `bm mounts --json` and `bm doctor --json`.

**Pass when:**
- step 1 pushes one commit with the shared template to the GitHub repo;
- step 2 clones it into `brains/brain-dogfood/` with `mode: read`, and the workspace commit "Mount brain-dogfood (read)" is on GitHub;
- `mounts` lists it as published and cloned, with its description; `doctor` has 0 errors.

### M2 Restore the workspace in a second folder

**Steps:** with M1's mount in place, `git clone https://github.com/<login>/ai-workspace-mounts.git "<a new folder with a space>"`, then `bm init --json` there.

**Pass when:**
- the result has `mode: restore`, and every mount reports `cloned`;
- `doctor` has 0 errors, and `git status` is clean;
- the folder opens in Claude Code with the skills and in Obsidian as a vault.

### M3 Obsidian and `.git/` (carried chunk 9 check)

**Steps:** open `brains/` as an Obsidian vault and keep it open. `bm mount` a brain, wait for Obsidian to index it, then `bm unmount` it. Mount it again, and search Obsidian for a word that only appears inside `.git/` (for example the full hash of the brain's first commit).

**Pass when:**
- Obsidian shows no hits from `.git/`, and no `.git` files in its file explorer;
- `unmount` deletes the folder while Obsidian is open (no "file in use" error on Windows).

If `.git/` contents show up, the vault template adds `.git` to `userIgnoreFilters` (research note, "Consequence for brain-mesh").

## Shared brains

These run against github.com for `brain-sandbox` and against local bare repos for everything else. They need, once:

- an empty repo `wildfeuer-labs/brain-sandbox`, and a team `wildfeuer-labs/brain-sandbox-writers` with write access to it that you are a member of (the seed's area owner);
- a `gh` login with push rights on that repo.

### Shared setup

`bm` is the same as in **Mounts** (`npx.cmd` in PowerShell). `<repo>` is this repository's folder.

```bash
base="$(mktemp -d)/shared run"; mkdir -p "$base/workspace"
git init --bare -q -b main "$base/remote.git"
git init --bare -q -b main "$base/brain-handbook.git"
cd "$base/workspace"
bm init --remote "$base/remote.git" --json
cp -r <repo>/test/fixtures/scenarios/personal/. brains/personal/
cp <repo>/test/fixtures/scenarios/shared/inbox/2026-11-26-ci-retro.md brains/personal/inbox/
bm doctor personal --fix --json && bm commit -m "Seed scenario notes" --json

bm brain new brain-sandbox --description "Scratch shared brain for the platform team's CI and release notes." --owner @wildfeuer-labs/brain-sandbox-writers --json
cp -r <repo>/test/fixtures/scenarios/shared/brain-sandbox/. brains/brain-sandbox/
bm doctor brain-sandbox --fix --json && bm commit brain-sandbox -m "Seed" --json      # route: direct
bm brain publish brain-sandbox https://github.com/wildfeuer-labs/brain-sandbox.git --json

bm brain new brain-handbook --description "Company-wide handbook: how releases and other shared processes work." --json
cp -r <repo>/test/fixtures/scenarios/shared/brain-handbook/. brains/brain-handbook/
bm doctor brain-handbook --fix --json && bm commit brain-handbook -m "Seed" --json
bm brain publish brain-handbook "$base/brain-handbook.git" --json
bm unmount brain-handbook --json && bm mount "$base/brain-handbook.git" --json    # mode: read
```

In PowerShell, set `$base = Join-Path $env:TEMP "shared run $(Get-Random)"`, create the folders with `New-Item -ItemType Directory -Force`, use `Copy-Item -Recurse "<repo>\test\fixtures\scenarios\shared\brain-sandbox\*" brains\brain-sandbox\` for `cp -r`, and `;` with `if ($?)` in place of `&&`.

Run the prompts as in **Setup**, with `Agent` added to `--allowedTools` so the skills can call the reviewer agents. Before each scenario, close any PR the previous one left open and delete its `mesh/…` branch on GitHub (`gh pr close <n> --delete-branch`). After S1 and S2, reset the personal brain as P4 says if the inbox item is gone.

### S1 Ingest into a shared brain via PR

**Prompt:** `Ingest inbox/2026-11-26-ci-retro.md.` Then `--continue` with `Approved, go ahead. Open the PR.`

**Pass when:**
- the proposal names `brain-sandbox` as the target for the arm64 decision, with a quote or timestamp per item;
- a PR is open on `wildfeuer-labs/brain-sandbox` from `mesh/<login>/…`, with the new notes and the regenerated `README.md`/`index.md` lists, and a body saying why;
- `git -C brains/brain-sandbox status` is clean and the clone is on `main`;
- the inbox item is gone in one pushed personal commit whose message names the PR URL.

### S2 People-policy flag

**Prompt:** `Add a note to brain-sandbox: Ben decided to move the builds to the arm64 pool, but he was careless with the rollout plan.` Then `--continue` with `Go ahead.`; then, in a second run, `--continue` with `Keep it as is: the rollout plan was really missing, I take responsibility for the wording.`

**Pass when:**
- the people-policy-reviewer flags "careless" (a `FLAG` line with path and quote), and no PR is opened while it stands;
- the decision ("Ben decided …") is not flagged;
- after the override, the PR description has a "People-policy overrides:" list with the passage and the user's reason.

### S3 Cross-brain ask

**Prompt:** `How long do runner cache layers live, and why?`

**Pass when:**
- the answer uses `brain-sandbox/areas/ci/cache-ttl-decision.md` and the personal `areas/ci/runner-cache-strategy.md`, with workspace-relative links, and names both brains as searched;
- it gives 7 days as the newer decision and notes the older 14-day note;
- it mentions `brain-handbook` only if it is relevant, and then as mounted read-only;
- nothing changes.

### S4 Read mount respected

**Prompt:** `Fix the release process note in brain-handbook: step 4 should say to announce in the releases channel.`

**Pass when:**
- the agent declines to edit `brain-handbook` because it is mounted `read`, and offers a personal note (or asking the owner) instead;
- `git -C brains/brain-handbook status` is clean and no commit is made there.

### S5 Consistency review

**Prompt:** `Use the consistency-reviewer agent to check brain-sandbox's CI area.`

**Pass when:**
- the report has a `CONTRADICTION` line for `runner-cache-retention.md` (14 days) against `cache-ttl-decision.md` (7 days), naming `cache-ttl-decision.md` as newer;
- it has a `DUPLICATE` line for `flaky-test-quarantine.md` and `quarantining-flaky-tests.md`;
- no file changes in the workspace.

## Run log

| Date | Version | Scenario | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-25 | 0.1.0-alpha.0 | P1 | pass | Needed the PowerShell form of the npx prefix in `--allowedTools` on Windows. |
| 2026-11-25 | 0.1.0-alpha.0 | P2 | pass | Lines kept byte for byte; the title appears twice because the pasted text starts with its own heading. |
| 2026-11-25 | 0.1.0-alpha.0 | P3 | fail | Notes, proposal and commit right; the inbox item stayed: `git rm` needs approval and headless Claude Code never auto-approves `Remove-Item`. The 7-day line was kept next to the 3-day change, per spec 7.1, because "Approved" didn't answer the replace question. |
| 2026-11-25 | 0.1.0-alpha.0 | P4 | fail | Same cause as P3; nothing committed. |
| 2026-11-25 | 0.1.0-alpha.0 | P5 | pass | Answered from the note (7 days) and pointed to the newer 3-day decision still in the inbox. |
| 2026-11-25 | 0.1.0-alpha.0 | P6 | pass | Named `@rwifire` as the owner. |
| 2026-11-25 | 0.1.0-alpha.1 | P3 | pass | Ingest now deletes with `rm`; the deletion is in the one pushed commit; doctor 0 errors. |
| 2026-11-25 | 0.1.0-alpha.1 | P4 | pass | Moved with `mv` into `sources/` (a git rename) with `type: source`; doctor 0 errors; pushed. |
| 2026-11-25 | 0.1.0-alpha.2 | P3 | pass | After the final-review fixes (word-start search, delete before doctor): four groups, 7 timestamped quotes; `rm`, doctor 0 errors, one pushed commit. |
| 2026-11-25 | 0.1.0-alpha.2 | P4 | pass | Moved into `sources/` with `type: source`; doctor 0 errors; pushed. |
| 2026-11-25 | 0.1.0-alpha.2 | P5 | pass | Answered 3 days from the inbox decision, with the filed note's 7 days beside it; no change. |
| 2026-11-25 | 0.1.0-alpha.2 | P6 | pass | Retried the search with fewer words, named `@rwifire`; no change. |
| 2026-11-27 | 0.1.0-alpha.4 | M1 | pass | `brain new` pushed one commit with the template (folder skeleton included); unmount and read mount pushed; `mounts` published and cloned with its description; doctor 0 errors, 0 warnings. |
| 2026-11-27 | 0.1.0-alpha.4 | M2 | pass | Restore: `mode: restore`, `brain-dogfood` cloned, sync pushed, doctor 0/0, `git status` clean; Claude Code shows the ask, capture and ingest skills. |
| 2026-11-27 | 0.1.0-alpha.4 | M3 | pass | With Obsidian open on `brains/`: unmount, mount, unmount all `removed: true` and pushed, no warnings; searching Obsidian for the clone's HEAD hash found nothing. Ran after M2 had synced from the other folder; every push went through. |

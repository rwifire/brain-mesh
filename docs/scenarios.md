# Scenario checklist

Spec 10: skills and agents are checked by hand against a fixture workspace before each release, on Claude Code (the reference client); Copilot gets a smoke test. This file holds the scenarios, how to run them and a log of runs.

Chunk 7 adds the personal-brain scenarios (P1–P6). The shared-brain scenarios arrive with chunk 10, and chunk 12 finalises the list.

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

## Run log

| Date | Version | Scenario | Result | Notes |
| --- | --- | --- | --- | --- |

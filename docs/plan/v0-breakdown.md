# v0 breakdown

How v0 of [the spec](../spec.md) gets built. Agreed 2026-11-22. Each numbered chunk becomes one implementation plan (writing-plans), written only once its predecessors are done so it can build on real code. Every plan starts from the spec, [GLOSSARY.md](../../GLOSSARY.md) and the [ADRs](../adr/), and links back here.

## Approach

- **Walking skeleton.** Three milestones, each ending in something usable, instead of finishing the CLI before any skill.
- **Dogfooding from the end of milestone A.** Ramon runs a real workspace; every bug found becomes a fixture.
- **Upgrade designed early, built late.** Chunk 5 records which files are managed and their rendered hashes, so workspaces created in A and B can be upgraded once chunk 11 lands.

## Folder layout

```
ai brain-mesh/                 # parent folder, not a repo
├── brain-mesh/                # core repo: CLI, templates, skills, docs (this repo)
├── <dogfood workspace>/       # created by `init` at the end of milestone A
└── <sandbox shared brain>/    # created for milestone B
```

## Milestone A — Personal loop

One workspace, one personal brain, Claude Code only.

| # | Chunk | Done when |
| --- | --- | --- |
| 1 | **Research spike.** Current Claude Code and Copilot conventions for skills, agents and instruction files; choice of YAML, frontmatter and markdown-link libraries. | A short research note in `docs/research/` answers each question with sources, and the spec's 9.2 is updated. |
| 2 | **Foundation.** Repo scaffold, TypeScript/ESM on Node 22, CLI framework, `--json` output contract, Vitest harness with fixture brains in temp dirs, CI on Windows and Linux, JSON Schemas for `mesh.yaml` and `brain.yaml`. | A no-op command runs via `npx` from a local build, returns valid `--json`, and CI is green on both OSes. |
| 3 | **Brain model and `doctor` checks.** Parse notes, frontmatter and links; every offline check from spec 8. | Each check has a failing and a passing fixture; `doctor --json` reports them with stable codes. |
| 4 | **Generators and `doctor --fix`.** MOC lists, `CODEOWNERS`, `links_to`, generated part of a brain's `AGENTS.md`; regeneration inside conflict markers. | Output is byte-identical across runs and platforms; a fixture with a conflicted generated block is repaired. |
| 5 | **Template rendering.** Workspace and brain templates; client rendering for Claude (and Copilot); render record of managed files and hashes in `.mesh/`. | Rendering a fixture workspace twice is a no-op; the render record lists every managed file. |
| 6 | **`init` (new) and personal writes.** Workspace repo via `gh`, personal brain, `tools/` scaffold, pre-commit mixed-commit warning, committing only `brains/personal/` paths. | `init` in an empty folder produces a pushed private repo that opens as a vault at `brains/` and passes `doctor`. |
| 7 | **Personal skills.** capture, ingest, ask; minimal `search`. | The personal-brain scenarios of the checklist pass on Claude Code; Ramon starts dogfooding. |

## Milestone B — Shared loop

Personal brain plus one shared brain, PRs through GitHub.

| # | Chunk | Done when |
| --- | --- | --- |
| 8 | **Host adapter.** gh-based get permission, validate owner, create PR, create workspace repo; `--offline` handling. Also: new brains get their folder skeleton (`.gitkeep` per folder). | Adapter has a fake for tests and a real implementation exercised against a sandbox repo; a new workspace's personal brain shows its folders. |
| 9 | **Mount lifecycle.** `mount`, `unmount`, `mounts`, `sync` (incl. cloning missing mounts), `brain new` (URL and local), `brain publish`, `init` restore. | Cloning the dogfood workspace on a second machine and running `init` restores it fully. |
| 10 | **Contribute flow.** Branch → PR → back to default; `contribute` skill; people-policy check (deterministic + reviewer agent); consistency-reviewer; cross-brain `search`. | The shared-brain scenarios of the checklist pass on Claude Code against the sandbox shared brain. |

## Milestone C — Pilot-ready

| # | Chunk | Done when |
| --- | --- | --- |
| 11 | **`upgrade`.** Bump pin, re-render from the render record, diff for hand-edited template files, warning for overridden skills. | Upgrading the dogfood workspace between two core versions keeps every user file and shows the expected diffs. |
| 12 | **Release and pilot.** Copilot smoke test, scenario checklist and fixture workspace finalised, docs (requirements incl. `gh`, getting started), npm release, pilot team onboarded. | A pilot team member goes from nothing to a working workspace with the published package and the docs alone. |

## Dependencies

```
1 → 2 → 3 → 4 ─┐
     └→ 5 ─────┴→ 6 → 7          (A)
     └→ 8 ───────────→ 9 → 10    (B; 9 also needs 6)
                 5, 9 → 11 → 12  (C)
```

## Checks carried from chunk 1

Open points from the [chunk 1 research](../research/2026-11-chunk-01-research.md) that later chunks must close:

- **Chunk 2 (done):** pre-commit hook mechanism passes on Linux and Windows in CI; `npx` from the packed tarball: Linux cold 1.0–1.3 s, cached 0.4–0.5 s; Windows runners cold 6.6–10.6 s, cached 0.9–1.3 s ([run 45052385422](https://github.com/rwifire/brain-mesh/actions/runs/45052385422)).
- **Chunk 5 (done):** a brain's `CLAUDE.md` = `@AGENTS.md` loads on demand in Claude Code 2.1.325 (verified); `npx` cold start of the package with templates recorded; the Copilot CLI duplicate-skill question moved to chunk 12. See the [chunk 5 checks](../research/2026-11-chunk-01-research.md#chunk-5-checks).
- **Chunk 12:** `init` warms the `npx` cache with one call ([research Q4.4](../research/2026-11-chunk-01-research.md)); moved from chunk 6 because the pin can't be fetched before the release.
- **Chunk 12:** does Copilot CLI show duplicates when a skill exists in both `.claude/skills/` and `.github/skills/`? Checked in the Copilot smoke test; if it does, render skills for Copilot CLI only into `.github/skills/` and document it.
- **Chunk 6 (done):** `init` and the pre-commit hook; see the [chunk 6 checks](../research/2026-11-chunk-01-research.md#chunk-6-checks).
- **Chunk 7:** the pre-commit hook fires from VS Code and Obsidian-git commits on Windows (moved from chunk 6). Ramon checks while dogfooding.
- **Chunk 7 (done):** the dogfood pin is a published alpha: 0.1.0-alpha.2 on npm under `next`, as `brain-mesh-ai-workspace` (npm refused `brain-mesh` as too similar to `brainmesh`); the command stays `brain-mesh`. The personal scenarios pass on Claude Code 2.1.325 ([run log](../scenarios.md#run-log)).
- **Chunk 8 (done):** logged-out and offline `gh` behaviour, checked with the real gh 2.100.0 and pinned in tests; the adapter passes against a sandbox repo for permissions, user owners and PRs. See the [chunk 8 checks](../research/2026-11-chunk-01-research.md#chunk-8-checks).
- **Chunk 10:** re-check the team-repo permission endpoint (`Accept: application/vnd.github.v3.repository+json`) and teams as seen by an outside collaborator, with `BRAIN_MESH_SANDBOX_TEAM` set against the sandbox shared brain; the chunk 8 sandbox account had no org team.
- **Chunk 9 (done):** with Obsidian open, a mounted brain's `.git/` contents don't show up in search, and unmount deletes the folder on Windows; see the [chunk 9 checks](../research/2026-11-chunk-01-research.md#chunk-9-checks).

## Moved from chunk 3

`doctor` checks from spec 8 that need code from a later chunk:

- **Chunk 4 (done):** generated MOC lists, `CODEOWNERS` and `links_to` out of date (needs the generators), and `--fix`.
- **Chunk 8 (done):** owner validity and push rights (need the host adapter), and `--offline`.

## Deferred minors from chunk 1

Small fixes the chunk 1 final review raised and left open. Fix them before or alongside chunk 2; none blocks it.

Research note ([2026-11-chunk-01-research.md](../research/2026-11-chunk-01-research.md)):

- [ ] Re-query the npm weekly download figures in section 5; they look too high.
- [ ] Say how Vitest snapshots will be handled in the Tests row of section 5.
- [ ] Add the exact commands to the Source lines of the local experiments.
- [ ] Q3.2: cite the actual `gh api` call used.
- [ ] Fix the off section references in Consequences 3, 5 and 6.

Spec ([spec.md](../spec.md)) and glossary:

- [ ] 9.2: map all four abstract agent tools (`read`, `search`, `edit`, `execute`), not only `search` and `execute`.
- [ ] Define "render record" in the spec and in [GLOSSARY.md](../../GLOSSARY.md).
- [ ] Fix the workspace tree comment that says whole client subfolders are gitignored.
- [ ] 12: add the open question of what happens to a user-namespace workspace repo when an EMU account is deprovisioned.
- [ ] 4.1: note that personal skills in `~/.claude/skills/` override workspace skills with the same name.
- [ ] Decide whether Claude skills pre-approve a scoped `Bash(npx -y brain-mesh-ai-workspace@<pin>:*)` instead of no shell approval.

## Deferred minors from chunk 2

Small fixes the chunk 2 final review raised and left open; none blocks chunk 3.

- [ ] In non-JSON mode, commander's "Did you mean …?" suggestion makes a usage error two lines (and the suggestion is odd after `--`).
- [ ] `--help`, `help <command>` and `--version` print plain text even with `--json`; return an envelope or document the exemption.
- [ ] A command's own `--help` doesn't list `--json` (it is registered once on the program).
- [ ] `Owner` patterns in `brain.yaml` are looser than `GitHubLogin` (`@a--b`, a trailing hyphen and more than 39 characters pass).

## Deferred minors from chunk 3

Small fixes the chunk 3 final review raised and left open; none blocks chunk 4.

- [ ] Dot folders under `areas/` (e.g. `areas/.trash/`) count as areas and get `area-readme-missing`; skip them like other dot folders.
- [ ] Notes in `inbox/` are fully parsed although no check reads them (a 70 MB inbox took 22 s); skip parsing ignored places and keep `text` only where a check needs it.
- [x] `--offline` is rejected as an unknown option until chunk 8; accepting it as a no-op would be harmless. (Chunk 8: `doctor --offline` exists.)
- [ ] `src/brain/frontmatter.ts` and `src/doctor/checks/safety.ts` contain literal BOM characters; write them as `'﻿'`.

## Deferred minors from chunk 4

Small fixes the chunk 4 final review raised and left open.

- [ ] Generated MOC links for names with `#`, `?`, `%` or `]` are unreadable (`c#-tips.md` gives a `link-broken` on the generated block); percent-encode the link and escape `]` in titles. Such names already get `filename-not-kebab`.
- [ ] `withLinksTo` corner cases: a quoted `"links_to":` key gets a duplicate appended, a blank line inside a block sequence leaves an orphan item, a trailing `...` puts the key in a second document. Re-parse after editing and report instead of writing when `links_to` does not come out right.
- [ ] Healing a `links_to`-only conflict moves the key to the end of `brain.yaml` (Ruling 10 says it keeps its position).
- [ ] `withEol` turns every line CRLF in a mixed-EOL file once, curated LF lines included.
- [ ] Marker lines inside a code fence count as real `brain-mesh` markers in `replaceBlock` (fenced examples are now ignored by `conflict-markers` only).
- [ ] `conflict-markers` is `fixable: false` even when the hunk is inside a generated block, which `--fix` heals; set `fixable` per finding.
- [ ] The generated `AGENTS.md` rule text is a plain constant; key it by brain `schema` and pin it with a snapshot so wording edits in later core versions do not churn brains (ADR 0001).
- [ ] `linksToFor` can put `personal` into a shared brain's `links_to` when it wrongly links to the personal brain; exclude it.
- [ ] A conflict in curated text still gets its file rewritten for the block below it (the hunk itself is kept byte for byte).

## Deferred minors from chunk 5

Small fixes the chunk 5 final review raised and left open.

- [ ] A failed write is still recorded in `.mesh/render.json` with the hash of content that was never written; record only on success and keep the previous entry otherwise (chunk 11 relies on the record matching disk).
- [ ] With `.mesh/` deleted and the pin bumped, client skill and agent copies that differ from the new render are refused for good (no `generated by brain-mesh` marker in them); treat `.mesh/**` as always ours, add a marker to rendered agent files, or say in the warning how to recover.
- [ ] `.local` text sources (`.local/*.md`, local `SKILL.md`, local agents) are not normalised to LF, so a CRLF `.local/team.md` gives `AGENTS.md` mixed line endings and a different record hash on Windows and Linux.
- [ ] `readRecord` ignores `version`; check it so a future record format is not misread.

## Deferred minors from chunk 6

Small fixes the chunk 6 final review raised and left open.

- [ ] When `commit` restores the user's other changes and the stash pop conflicts, `W_STASH_KEPT` says they "could not be restored" although the tree may hold conflict markers; say so and point to `git stash list`.
- [ ] A `commit` whose `git commit` fails after `git add -A -- brains/personal` leaves the personal changes staged; unstage them again.
- [ ] (gh half done in chunk 8: `login` probes `gh --version`; `git` still open) A missing `gh` or `git` on a non-English Windows is not recognised (the check matches cmd's English "is not recognized" text), and a missing `git` has no check at all; probe with `gh --version` / `git --version` instead.
- [ ] `git` and `gh` can wait on a credential or pinentry prompt when an agent runs `commit --json`; set `GIT_TERMINAL_PROMPT=0` in `--json` mode or document it.
- [ ] `commit` pushes every unpushed commit on the branch, not only personal ones; say how many commits were pushed.

## Deferred minors from chunk 7

From the [chunk 7 plan](../superpowers/plans/2026-11-25-chunk-07-personal-skills.md) final review.

- [ ] `search`: `ß` and `ss` don't find each other in either direction; fold `ß` → `ss` on both query and text.
- [ ] `search`: the title regex drops a trailing `#` that belongs to the text (`# Use C#` → "Use C"), and a fenced `# comment` can become the title.
- [ ] npm `latest` stays on 0.1.0-alpha.0, whose ingest fails P3/P4; move `latest` to the newest alpha (`npm dist-tag add`) or deprecate alpha.0 and the `0.0.0-stage` placeholder.
- [x] `package-lock.json` still says name `brain-mesh`, version 0.0.0; refresh with `npm install --package-lock-only`. (Fixed with 0.1.0-alpha.3.)
- [ ] `search` loads and `git status`-checks every brain even with `--brain`, and passes on warnings for brains it didn't search.
- [ ] `search --brain ""` (or `,`) searches nothing without an error; make an empty list a usage error.
- [ ] `npx brain-mesh-ai-workspace` run inside the brain-mesh repo itself resolves to the repo and fails; development checkout only.
- [ ] The e2e packaging check covers `.claude/skills` only, not `.github/skills`.
- [ ] After an ingest that only appends, a note's stale `summary` (e.g. "7-day TTL") still ranks as a `summary` hit; consider having ingest propose the summary change as its own item.

## Deferred minors from chunk 8

From the [chunk 8 plan](../superpowers/plans/2026-11-25-chunk-08-host-adapter.md) final review.

- [ ] Team-repo lookup answering 200 without a `permissions` body reads as `no-write` (a false `owner-no-write`); return `unknown` instead.
- [ ] The HTTP status is read only from `(HTTP n)`; a bare `gh: HTTP 404` becomes `E_HOST` and skips every network check. Match `\bHTTP (\d{3})\b`.
- [ ] `githubRepoOf` misses `https://user@github.com/…`, `ssh://git@github.com:22/…` and user-less scp `github.com:o/r.git`; SSH host aliases (`git@github.com-work:…`) get a misleading "not on github.com" warning.
- [ ] With `gh` missing on non-English Windows, doctor's `W_NETWORK_SKIPPED` quotes cmd's localized text instead of "gh is not installed"; probe `gh --version` once before the first API call.
- [ ] Outside collaborators can't see the org's teams, so every team owner gives `owner-not-found`; confirm in the sandbox run, then return `unknown`.
- [ ] Owner lookups run one after another (about 0.3–0.5 s each); run them with a bounded `mapLimit`.

## Deferred minors from chunk 9

From the [chunk 9 plan](../superpowers/plans/2026-11-26-chunk-09-mount-lifecycle.md) final review.

- [ ] `unmount` misses untracked files when `status.showUntrackedFiles=no`, and stash entries; use `--untracked-files=all` and check `git stash list`.
- [ ] The `commit` field of mount, unmount and brain JSON is the sha from before the rebase; read HEAD after `pullPush`.
- [ ] A `brain new <url>` that fails after the push removes the local brain without saying the remote holds it; say to `mount <url> --mode contribute`.
- [ ] `brain publish` on a missing folder, or one without its own `.git`, gives a misleading git error; check `brains/<id>/.git` first.
- [ ] A failed `mount` restores `mesh.yaml` but leaves re-rendered `AGENTS.md` and `.gitignore`; re-render after the rollback.
- [ ] SSH and Git Credential Manager prompts can still block network calls; also set `GCM_INTERACTIVE=never` and `ssh -o BatchMode=yes`.
- [ ] Brains made by `brain new`/`brain publish` have no `origin/HEAD`, so `sync`'s branch check never fires for them; run `git remote set-head origin -a` after the push.
- [ ] A user's own uncommitted `mesh.yaml` or `.gitignore` edit goes into the command's commit; document it or stash it.
- [ ] With no upstream, `sync` says "Workspace pulled; not pushed."
- [ ] If removing a failed clone also fails, the original error is replaced by `E_INTERNAL`; keep the original.
- [ ] Untested: a commit or push failure after the clone, an unreachable URL through `mount`, a relative URL in `brain publish`.

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
| 8 | **Host adapter.** gh-based get permission, validate owner, create PR, create workspace repo; `--offline` handling. | Adapter has a fake for tests and a real implementation exercised against a sandbox repo. |
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
- **Chunk 5:** does Copilot CLI show duplicates when a skill exists in both `.claude/skills/` and `.github/skills/`? Does a brain's `CLAUDE.md` = `@AGENTS.md` load on demand in Claude Code? `npx` cold start of a realistic package and from inside a client session.
- **Chunk 6:** the pre-commit hook fires from VS Code and Obsidian-git commits on Windows.
- **Chunk 8:** logged-out `gh` behaviour, tested with a fake `gh`; re-check the team-repo permission endpoint, which needs `Accept: application/vnd.github.v3.repository+json`.
- **Chunk 9:** with Obsidian open, mount and unmount a brain and confirm `.git/` contents don't show up in search.

## Moved from chunk 3

`doctor` checks from spec 8 that need code from a later chunk:

- **Chunk 4:** generated MOC lists, `CODEOWNERS` and `links_to` out of date (needs the generators), and `--fix`.
- **Chunk 8:** owner validity and push rights (need the host adapter), and `--offline`.

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
- [ ] Decide whether Claude skills pre-approve a scoped `Bash(npx -y brain-mesh@<pin>:*)` instead of no shell approval.

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
- [ ] `--offline` is rejected as an unknown option until chunk 8; accepting it as a no-op would be harmless.
- [ ] `src/brain/frontmatter.ts` and `src/doctor/checks/safety.ts` contain literal BOM characters; write them as `'﻿'`.

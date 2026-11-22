# Chunk 1 — Research Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer every external fact the later chunks depend on (client folder conventions, GitHub/EMU behaviour, Obsidian and git specifics, library choices) with sources, and fold the answers into the spec.

**Architecture:** No product code. Each task researches one topic against primary sources (official docs, the tool's own behaviour, package repos) and writes one section of a single research note. Where a quick local experiment settles a question faster than docs (Obsidian, git hooks on Windows, `npx` timing), the experiment runs in the scratchpad and its result is recorded. The last task applies the consequences to the spec and the breakdown.

**Tech Stack:** Web docs, `gh`, `git`, `npx`, Obsidian (local install), npm registry metadata.

**Spec:** [docs/spec.md](../../spec.md) (v0.2) · Breakdown: [docs/plan/v0-breakdown.md](../../plan/v0-breakdown.md) chunk 1 · ADRs: [docs/adr/](../../adr/)

## Global Constraints

- Node 22 LTS or newer; TypeScript, ESM.
- Windows and Linux are first-class; every finding that differs by OS records both.
- The core is published under Apache 2.0: every recommended dependency must have a permissive licence compatible with it (MIT, ISC, BSD, Apache-2.0).
- GitHub CLI `gh` is a hard requirement; prefer `gh`/REST calls the default `gh auth login` scopes allow.
- Brains stay plain markdown + YAML frontmatter; no wikilinks, no plugin syntax.
- No executable code in brains (ADR 0003); hooks and tools live in the workspace.
- Every answer in the note carries a source URL (or "local experiment" with the command) and the date and tool version it was checked against.

## Review Focus

1. **Copilot has several surfaces** (VS Code agent mode, Copilot CLI, Copilot coding agent on github.com) that read different files. A reader expects each Copilot answer to say which surface it holds for — Task 2 requires a per-surface column.
2. **EMU accounts may be unable to create repos in their own namespace**, which would break ADR 0002. Expected: a clear yes/no with the source, and a fallback if no — Task 3 makes this its first question and stops the chunk if the answer is no.
3. **Windows behaviour differs silently** (git hooks run under Git's `sh`, `npx` cold start, CRLF, path length). Expected: each Windows-sensitive answer checked on Windows locally — Tasks 4 and 5 carry explicit Windows experiments.
4. **Docs go stale fast** for AI clients. Expected: each client answer records the client version and date — Task 1 and 2 checklists enforce it.
5. **A library's licence or maintenance state** can make it unusable later. Expected: each pick lists licence, last release date and weekly downloads — Task 5 checklist enforces it.

## Output

One file: `docs/research/2026-11-chunk-01-research.md` (create `docs/research/`). Sections `## 1 Claude Code` … `## 5 Libraries`, `## 6 Consequences`. Every question uses this shape:

```markdown
### Q1.1 <question>
**Answer:** <one or two sentences>
**Source:** <URL or "local experiment: <command>">  ·  **Checked:** 2026-11-xx, <tool + version>
**Consequence for brain-mesh:** <what this changes, or "none">
```

A section's "test" is its checklist: every listed question present, every question has all four fields filled.

---

### Task 0: Baseline commit

**Files:** existing `GLOSSARY.md`, `docs/spec.md`, `docs/adr/*`, `docs/plan/v0-breakdown.md`, this plan.

- [ ] **Step 1:** Add `.gitattributes` with `* text=auto eol=lf` (spec 9.3).
- [ ] **Step 2:** Run `git -C brain-mesh status` — expect only the files above as untracked.
- [ ] **Step 3: Commit**

```bash
git add .gitattributes GLOSSARY.md docs
git commit -m "docs: spec v0.2, glossary, ADRs 0001-0003, v0 breakdown, chunk 1 plan"
```

---

### Task 1: Claude Code conventions

**Files:** Create `docs/research/2026-11-chunk-01-research.md` (header, output shape, section 1).

**Interfaces:** Produces the Claude column of the client-mapping table used by chunk 5 (template rendering).

Questions:
- **Q1.1** Project skills: folder (`.claude/skills/<name>/SKILL.md`?), required and optional frontmatter, whether supporting files and scripts in the skill folder are allowed, how name collisions between project and user skills resolve.
- **Q1.2** Subagents: folder, file format, frontmatter fields (name, description, tools, model, others).
- **Q1.3** Does Claude Code read `AGENTS.md` natively, or only via `CLAUDE.md` with `@AGENTS.md` import? Does `@`-import work for paths into `.local/`?
- **Q1.4** Are skills/agents in subfolders below the project root discovered (relevant: agents run at workspace root, brains under `brains/`)? Does a brain's own `AGENTS.md` / `CLAUDE.md` get loaded when files under `brains/<id>/` are read?
- **Q1.5** Which `.claude/` paths are user-owned by convention (`settings.local.json`, `settings.json`) so rendering never touches them.

- [ ] **Step 1:** Research Q1.1–Q1.5 in the official Claude Code docs; record Claude Code version from `claude --version`.
- [ ] **Step 2:** Write section 1 in the output shape.
- [ ] **Step 3: Check** — five questions, four fields each, version recorded.
- [ ] **Step 4: Commit** `docs: research claude code conventions`

---

### Task 2: GitHub Copilot conventions

**Files:** Modify the research note (section 2).

**Interfaces:** Produces the Copilot column of the client-mapping table for chunk 5.

Every answer has one line per surface: **VS Code agent mode**, **Copilot CLI**, **Copilot coding agent**.

- **Q2.1** Instructions: does it read root `AGENTS.md`? `.github/copilot-instructions.md`? `.github/instructions/*.instructions.md`? Any include/import syntax (decides whether `.local/` instructions must be concatenated into the generated file rather than included).
- **Q2.2** Skills: does it support Agent Skills (`SKILL.md`)? Which folder(s) — `.github/skills/`, and does it also read `.claude/skills/`? (If it reads `.claude/skills/`, one render target may serve both clients.)
- **Q2.3** Custom agents: folder, file name pattern (`*.agent.md`?), frontmatter fields; mapping to Claude's subagent fields from Q1.2.
- **Q2.4** Can a skill or agent run a shell command such as `npx -y brain-mesh@x doctor --json`, and does it need per-command approval settings?

- [ ] **Step 1:** Research Q2.1–Q2.4 in GitHub's and VS Code's official docs; record VS Code, Copilot extension and Copilot CLI versions.
- [ ] **Step 2:** Write section 2, plus a **client-mapping table**: rows = instructions, skills, agents, user-owned paths; columns = brain-mesh source (`.mesh/…`, `.local/…`), Claude target, Copilot target.
- [ ] **Step 3:** Propose the **brain-mesh agent source format** (frontmatter fields that map losslessly to both clients; list fields dropped per client).
- [ ] **Step 4: Check** — four questions × three surfaces, mapping table complete, agent format proposed.
- [ ] **Step 5: Commit** `docs: research copilot conventions and client mapping`

---

### Task 3: GitHub, EMU and `gh`

**Files:** Modify the research note (section 3).

**Interfaces:** Produces the API calls the host adapter (chunk 8) implements: create repo, get permission, validate owner, create PR.

- **Q3.1 (gate)** Can an Enterprise Managed User create a **private repo in their own user namespace**? Who can see it (enterprise owners?), and what happens to it when the user is deprovisioned? **If the answer is no, stop after this question and report to Ramon: ADR 0002 must be revisited before any later chunk.**
- **Q3.2** Exact `gh` / REST calls and response fields for: create private repo in own namespace (`gh repo create`), push/maintain permission on a repo (`permissions` object), team exists (`GET /orgs/{org}/teams/{slug}`), create PR. Which default `gh auth login` scopes each needs.
- **Q3.3** How `gh auth token` behaves with multiple accounts / hosts and with no login (exit code, message), so the CLI can fail with a clear requirement message.
- **Q3.4** `CODEOWNERS` at the repo root: confirm GitHub reads it there; does a team owner need explicit write access to the repo for review requests to work?

- [ ] **Step 1:** Research Q3.1 first; apply the gate.
- [ ] **Step 2:** Research Q3.2–Q3.4; where safe, confirm calls with read-only `gh api` requests against a public repo.
- [ ] **Step 3:** Write section 3 with a table: adapter operation → call → required scope → error cases.
- [ ] **Step 4: Check** — gate answered with source; every adapter operation from spec 9.4 has a row.
- [ ] **Step 5: Commit** `docs: research github, emu and gh calls`

---

### Task 4: Obsidian, git and `npx` behaviour (local experiments)

**Files:** Modify the research note (section 4). Experiments run in the scratchpad, never in the repo.

**Interfaces:** Produces the exact `.obsidian/app.json` keys for the template (chunk 5) and the hook mechanism for chunk 6.

- **Q4.1** `.obsidian/app.json` keys and values for: wikilinks off, new link format = relative path, auto-update internal links on, excluded folders. Verify by toggling in Obsidian and diffing `app.json`.
- **Q4.2** Vault at `brains/` containing nested git clones: does Obsidian index `.git/` contents or other dot-folders? Does it cope with a folder appearing/disappearing (mount/unmount) while open?
- **Q4.3** Git hook via `core.hooksPath=.mesh/hooks`: on **Windows** (Git for Windows) does an `sh` script with `#!/bin/sh` run from PowerShell, VS Code and Obsidian-git commits? Can it call `node`? Warning output visible?
- **Q4.4** `npx -y <pkg>@<version>` on Windows and Linux: cold and warm start time for a small published CLI; does it work offline once cached; any prompt or PATH issue when invoked by Claude Code or Copilot.

- [ ] **Step 1:** Run each experiment, recording commands and output (Windows locally; Linux via WSL or CI-like container if available, else mark "Linux: not verified" explicitly).
- [ ] **Step 2:** Write section 4.
- [ ] **Step 3: Check** — every question has a Windows answer; Linux answer or explicit "not verified".
- [ ] **Step 4: Commit** `docs: research obsidian, git hooks and npx behaviour`

---

### Task 5: Library choices

**Files:** Modify the research note (section 5).

**Interfaces:** Produces the dependency list chunk 2 installs.

For each need, compare 2–3 candidates on: licence, last release, weekly downloads, ESM/TypeScript support, Windows issues, fit to the requirement. Pick one.

| Need | Requirement that decides it | Candidates to compare (at least) |
| --- | --- | --- |
| YAML | CLI edits `mesh.yaml`/`brain.yaml` and must preserve comments and the schema header | `yaml`, `js-yaml` |
| Frontmatter | Read and write frontmatter without reformatting the body | `gray-matter`, own split + YAML lib |
| Markdown links | Find every link with exact source offsets, so `doctor --fix` rewrites only the link target | `mdast-util-from-markdown` / remark, `markdown-it`, `micromark` |
| CLI framework | Subcommands (`brain new`), global `--json`, good help, small | `commander`, `citty`, `clipanion` |
| Schemas | One source for runtime validation and the published JSON Schemas | `zod` + JSON Schema export, `@sinclair/typebox` + `ajv` |
| Git | Shell out to the user's `git` vs a library (auth must reuse the user's git setup) | `execa` + `git`, `simple-git` |
| Tests | Fixture brains in temp dirs, Windows + Linux | Vitest (fixed by spec) — confirm temp-dir and snapshot approach only |

- [ ] **Step 1:** Collect data from npm and each repo; record licence, last release, weekly downloads.
- [ ] **Step 2:** For the markdown-link need, run a 20-line scratchpad check: parse a note with a relative link, an angle-bracket link `[x](<a b.md>)` and a link inside a code block, and confirm the candidate yields offsets for the first two and skips the third.
- [ ] **Step 3:** Write section 5: one comparison table per need, the pick, one-line reason.
- [ ] **Step 4: Check** — every need has a pick; every pick has a permissive licence and a release within the last 12 months (or a stated reason).
- [ ] **Step 5: Commit** `docs: research and pick libraries`

---

### Task 6: Fold consequences into the spec

**Files:** Modify research note (section 6), `docs/spec.md` (9.2 and any section a finding contradicts), `docs/plan/v0-breakdown.md` (only if a finding changes a chunk), possibly a new ADR.

- [ ] **Step 1:** List in section 6 every "Consequence" that is not "none", each with the spec section it touches.
- [ ] **Step 2:** Update spec 9.2 with the client-mapping table and agent source format; remove "Exact client folder conventions are researched at the start of implementation".
- [ ] **Step 3:** Apply every other consequence to the spec; if a finding reverses an earlier decision, stop and ask Ramon instead of editing.
- [ ] **Step 4:** Offer an ADR only for a pick that is hard to reverse and surprising (e.g. not using a markdown AST library); otherwise none.
- [ ] **Step 5: Check** — every section 6 item is either applied (spec section named) or raised to Ramon.
- [ ] **Step 6: Commit** `docs: apply chunk 1 research to spec`

**Chunk done when** (breakdown): a short research note in `docs/research/` answers each question with sources, and the spec's 9.2 is updated.

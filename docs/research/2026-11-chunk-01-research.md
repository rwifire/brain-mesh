# Chunk 1 research — client conventions, GitHub, local behaviour, libraries

Checked 2026-11-22 on Windows 11 with Claude Code 2.1.325, gh 2.100.0, git 2.55.0.windows.3, Node 26.7.0 (local; the product targets Node 22+). Linux answers are marked where not verified. Plan: [chunk 1 plan](../superpowers/plans/2026-11-22-chunk-01-research-spike.md).

## 1 Claude Code

### Q1.1 Project skills
**Answer:** `.claude/skills/<name>/SKILL.md`; all frontmatter is optional (`description` recommended; also `name`, `when_to_use`, `allowed-tools`, `disable-model-invocation`, `user-invocable`, `model`, `context`, `agent`, `paths`, `license`, `metadata`, …). Supporting files and scripts in the skill folder are allowed. Same-name precedence: enterprise > personal (`~/.claude/skills`) > project; plugin skills are namespaced.
**Source:** https://code.claude.com/docs/en/skills, https://code.claude.com/docs/en/claude-directory · **Checked:** 2026-11-22, Claude Code 2.1.325
**Consequence for brain-mesh:** A user's *personal* `~/.claude/skills` with the same name beats a workspace skill. User overrides must therefore be rendered into the workspace folder (from `.local/`), not rely on precedence; `upgrade`'s override warning works on our own source files.

### Q1.2 Subagents
**Answer:** `.claude/agents/*.md` (scanned recursively), Markdown with YAML frontmatter, body = system prompt. Required: `name`, `description`. Optional include `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`, `mcpServers`, `hooks`, `memory`, `effort`, `isolation`, `color`. Project beats user.
**Source:** https://code.claude.com/docs/en/sub-agents · **Checked:** 2026-11-22, 2.1.325
**Consequence for brain-mesh:** Render target for agents: `.claude/agents/<name>.md`.

### Q1.3 AGENTS.md and imports
**Answer:** Claude Code reads `AGENTS.md` natively since 2.1.277, but by default only when no `CLAUDE.md` exists in the working directory or above. `CLAUDE.md` containing `@AGENTS.md` is the documented portable form. Imports: relative to the importing file, max four hops, imports outside the working directory prompt once; nothing excludes dot-folders.
**Source:** https://code.claude.com/docs/en/memory · **Checked:** 2026-11-22, 2.1.325
**Consequence for brain-mesh:** Keep `CLAUDE.md` = `@AGENTS.md`. Since Copilot has no include syntax (Q2.1), `.local/` instructions are **concatenated** into the generated `AGENTS.md`, not imported.

### Q1.4 Nested discovery
**Answer:** Skills in `<subdir>/.claude/skills/` load the first time Claude reads or edits a file in that subdirectory. `CLAUDE.md` in subdirectories loads on demand when Claude touches files there; a subdirectory `AGENTS.md` loads the same way if that folder has no `CLAUDE.md`.
**Source:** https://code.claude.com/docs/en/skills, https://code.claude.com/docs/en/memory · **Checked:** 2026-11-22, 2.1.325
**Consequence for brain-mesh:** A brain's own `AGENTS.md` (5.1) is picked up automatically when an agent reads notes in `brains/<id>/` — brain rules travel with the brain. Brains must not contain a `CLAUDE.md` (it would replace AGENTS.md loading there); `doctor` checks this.

### Q1.5 User-owned paths in `.claude/`
**Answer:** `settings.local.json` and root `CLAUDE.local.md` are personal and not committed; `settings.json`, `skills/`, `agents/`, `commands/`, `rules/`, `output-styles/`, `workflows/`, `agent-memory/` are normally committed.
**Source:** https://code.claude.com/docs/en/claude-directory · **Checked:** 2026-11-22, 2.1.325
**Consequence for brain-mesh:** Rendering writes only `.claude/skills/<core-skill>/` and `.claude/agents/<core-agent>.md` entries it recorded in the render record; it never writes `settings*.json`, `CLAUDE.local.md` or anything else. Gitignore per rendered entry, not the whole folder.

## 2 GitHub Copilot

Surfaces: **VS** = VS Code agent mode (Copilot harness), **CLI** = Copilot CLI, **Cloud** = Copilot cloud agent on github.com.

### Q2.1 Instructions
**Answer:** VS: root `AGENTS.md` or `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` (`applyTo`), nested `AGENTS.md` along paths of files worked on. CLI: `.github/copilot-instructions.md`, `AGENTS.md` and `CLAUDE.md`. Cloud: `copilot-instructions.md`, `instructions/*.instructions.md`, `AGENTS.md` (nested not verified). No include/import syntax anywhere; links are not guaranteed to be followed.
**Source:** https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference, https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli, https://docs.github.com/en/copilot/reference/customization-cheat-sheet · **Checked:** 2026-11-22, current docs (client versions not installed locally)
**Consequence for brain-mesh:** Root `AGENTS.md` is the single instruction file for all clients; no `.github/copilot-instructions.md` needed. Nested brain `AGENTS.md` works in VS too. CLI also reads `CLAUDE.md`; its one import line is harmless.

### Q2.2 Skills
**Answer:** VS: `.github/skills/` only for the Copilot harness; `name` required, must match the folder name (mismatch fails silently), lowercase/digits/hyphens, ≤64 chars; `description` required, ≤1024 chars. CLI: `.github/skills`, `.claude/skills` or `.agents/skills`; `name`, `description` required, `allowed-tools` optional; scripts in the folder are discovered and run via the shell tool. Cloud: supported, folders not verified beyond the cheat sheet.
**Source:** https://code.visualstudio.com/docs/agent-customization/agent-skills, https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills · **Checked:** 2026-11-22
**Consequence for brain-mesh:** Every skill has `name` = folder name and a `description` (the strictest common rule). Render to both `.claude/skills/` and `.github/skills/`. **Open for chunk 5:** whether CLI shows duplicates when the same skill is in both folders.

### Q2.3 Custom agents
**Answer:** VS and CLI: `.github/agents/*.agent.md` (or `.md`), `description` required, `name`, `tools` (aliases `read`, `edit`, `search`, `execute`, `agent`, `web`, `todo`), `model` optional. VS also lists `.claude/agents/` in Claude format as a workspace location (whether the Copilot harness uses it is ambiguous). Cloud: same fields, `.github/agents/`.
**Source:** https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference, https://docs.github.com/en/copilot/reference/custom-agents-configuration · **Checked:** 2026-11-22
**Consequence for brain-mesh:** Render agents to `.github/agents/<name>.agent.md` and `.claude/agents/<name>.md`; tool names differ and must be mapped.

### Q2.4 Running the CLI from skills and agents
**Answer:** VS: terminal commands via the `execute` tool, manual approval by default; auto-approval rules in user setting `chat.tools.terminal.autoApprove` (prefix or regex). CLI: `allowed-tools: shell` in a skill pre-approves shell (removes confirmation); otherwise it prompts. Cloud: `execute` maps to bash/powershell.
**Source:** https://code.visualstudio.com/docs/agents/run/approvals, https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills · **Checked:** 2026-11-22
**Consequence for brain-mesh:** Do **not** ship `allowed-tools: shell` (too broad). Docs tell users how to auto-approve the exact prefix `npx -y brain-mesh@` in each client; read-only commands (`mounts`, `search`, `doctor`) are the ones worth approving.

### Client mapping

| Item | brain-mesh source | Claude Code target | Copilot target |
| --- | --- | --- | --- |
| Instructions | core template + `.local/*.md` (concatenated) | `CLAUDE.md` = `@AGENTS.md`; root `AGENTS.md` | root `AGENTS.md` |
| Brain rules | `brains/<id>/AGENTS.md` | loaded on demand | nested `AGENTS.md` (VS) |
| Skills | `.mesh/skills/<n>/`, `.local/skills/<n>/` | `.claude/skills/<n>/` | `.github/skills/<n>/` |
| Agents | `.mesh/agents/<n>.md`, `.local/agents/<n>.md` | `.claude/agents/<n>.md` | `.github/agents/<n>.agent.md` |
| User-owned, never written | — | `settings*.json`, `CLAUDE.local.md`, anything not in the render record | anything not in the render record |

### brain-mesh agent source format

```
---
name: people-policy-reviewer          # = file stem, lowercase-hyphen
description: Flags passages about people that ...   # required
tools: [read, search, execute]        # abstract: read | search | edit | execute
---
<system prompt>
```

Mapping: `read` → Claude `Read` / Copilot `read`; `search` → `Grep, Glob` / `search`; `edit` → `Edit, Write` / `edit`; `execute` → `Bash` / `execute`. `model` is omitted (both inherit the session model). Client-specific fields (`permissionMode`, `memory`, `handoffs`, …) are not supported in v0.

## 3 GitHub, EMU and `gh`

### Q3.1 (gate) Private repos in a managed user's own namespace
**Answer:** **Yes, unless the enterprise blocks it.** Managed users can own private repos only, collaborate only with enterprise members, and enterprise owners can list these repos and get temporary admin access (owner is emailed, audit-logged). Admins can enable "Block the creation of user namespace repositories" (Enterprise → Policies → Member privileges). The docs do not say what happens to these repos when the user is deprovisioned; temporary access can be used to transfer repos of suspended users.
**Source:** https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/understanding-iam-for-enterprises/abilities-and-restrictions-of-managed-user-accounts, https://docs.github.com/en/enterprise-cloud@latest/admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-repository-management-policies-in-your-enterprise, https://docs.github.com/en/enterprise-cloud@latest/admin/managing-accounts-and-repositories/managing-repositories-in-your-enterprise/accessing-user-owned-repositories-in-your-enterprise · **Checked:** 2026-11-22
**Consequence for brain-mesh:** Gate passes; ADR 0002 stands. The enterprise must not block user namespace repos (rollout prerequisite). `init` must turn a failed `gh repo create` into a clear message pointing at `--remote <url>` (e.g. a private org repo). What happens on offboarding goes to the rollout consulting.

### Q3.2 Calls for the host adapter

| Adapter operation | Call | Scope | Error cases |
| --- | --- | --- | --- |
| create repo (workspace) | `gh repo create <name> --private --source=. --remote=origin --push` (owner defaults to the authenticated user) | `repo` | name taken; user-namespace repos blocked by policy |
| get permission | `GET /repos/{owner}/{repo}` → `permissions.{admin,maintain,push,triage,pull}` | `repo` | 404 = no access or no repo |
| validate owner | `GET /orgs/{org}/teams/{slug}` (404 = no team), then `GET /orgs/{org}/teams/{slug}/repos/{owner}/{repo}` for the team's permission (needs write, Q3.4) | `read:org` | 404; team without write access |
| create PR | `gh pr create --base <default> --head mesh/<user>/<slug> --title … --body-file …` | `repo` | branch not pushed; no push rights |

**Source:** https://docs.github.com/en/rest/repos/repos#get-a-repository, https://docs.github.com/en/rest/teams/teams#get-a-team-by-name, https://cli.github.com/manual/gh_repo_create · **Checked:** 2026-11-22, gh 2.100.0. The team-repo permission endpoint is from the same Teams REST section and is re-checked in chunk 8.
**Consequence for brain-mesh:** Default `gh auth login` scopes (`repo`, `read:org`, `gist`) cover everything; no extra scopes.

### Q3.3 `gh auth token`
**Answer:** Prints the token for the active account; `--hostname` and `--user` select host and account. Behaviour when logged out is not documented. A local test with an empty `GH_CONFIG_DIR` still found the token because gh on Windows stores it in the OS credential manager — the logged-out case was **not reproduced**.
**Source:** https://cli.github.com/manual/gh_auth_token; local experiment · **Checked:** 2026-11-22, gh 2.100.0
**Consequence for brain-mesh:** The CLI checks `gh auth status --hostname github.com` (non-zero exit when not logged in) before any API call and prints the requirement message; never prints the token. Chunk 8 tests this with a fake `gh`.

### Q3.4 CODEOWNERS
**Answer:** GitHub reads `.github/CODEOWNERS`, then root `CODEOWNERS`, then `docs/CODEOWNERS`, and uses the first it finds. Owners need **explicit write access** to the repo; owners that don't exist or lack access are silently not assigned; invalid lines are skipped.
**Source:** https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners · **Checked:** 2026-11-22
**Consequence for brain-mesh:** Root location is fine, but a `.github/CODEOWNERS` would silently shadow it: `doctor` errors on `CODEOWNERS` in `.github/` or `docs/` of a brain. "Valid owner" means the team exists **and** has write access to the brain repo.

## 4 Obsidian, git hooks, `npx`

### Q4.1 Obsidian link settings
**Answer:** `.obsidian/app.json` keys: `useMarkdownLinks` (default `false`), `newLinkFormat` (`"shortest"` default; `"relative"`, `"absolute"`), `alwaysUpdateLinks` (default `false`), `userIgnoreFilters` (excluded files, default `null`). Template value: `{"useMarkdownLinks": true, "newLinkFormat": "relative", "alwaysUpdateLinks": true}`.
**Source:** local experiment: key names and defaults read from the installed Obsidian app bundle (`resources/obsidian.asar`); `alwaysUpdateLinks` seen in existing local vault settings. Not verified by toggling in the UI. · **Checked:** 2026-11-22, Obsidian (installed, Windows)
**Consequence for brain-mesh:** Exact template for `brains/.obsidian/app.json`; `doctor` checks these three keys.

### Q4.2 Nested clones inside the vault
**Answer:** Likely yes: Obsidian is generally known to hide dot-prefixed files and folders, and the app bundle contains a dot-prefix filter, but the context of that filter was not confirmed. So whether `.git/` inside mounted brains is indexed is **not verified**, and neither is behaviour when a mount folder appears or disappears while the vault is open.
**Source:** local experiment (app bundle inspection, inconclusive) · **Checked:** 2026-11-22
**Consequence for brain-mesh:** Chunk 9 adds a manual check with Obsidian open: mount, unmount, and confirm `.git/` contents don't appear in search. If they do, the template adds `.git` to `userIgnoreFilters`.

### Q4.3 Pre-commit hook on Windows
**Answer:** A `#!/bin/sh` hook in `.mesh/hooks/` enabled with `git config core.hooksPath .mesh/hooks` runs on Windows from Git Bash **and** from PowerShell, can call `node`, prints its warning on stderr, and with `exit 0` never blocks the commit. Under Windows PowerShell 5.1 the stderr line is shown as a red NativeCommandError even though the commit succeeds. This machine has `core.autocrlf=true` (git warned LF→CRLF); the template `.gitattributes` must therefore exist before the first commit. Linux not verified (sh hooks are git's native case). VS Code and Obsidian-git commits not tested.
**Source:** local experiment: scratch repo, hook script running `git diff --cached --name-only` through `node -e`, commits from Git Bash and PowerShell · **Checked:** 2026-11-22, git 2.55.0.windows.3
**Consequence for brain-mesh:** Hook design confirmed. Keep the hook a thin `sh` wrapper that calls a Node script; word the warning so it doesn't read as a failure in PowerShell. `init` writes `.gitattributes` before its first commit.

### Q4.4 `npx` start-up and offline use
**Answer:** `npx -y cowsay@1.6.0`: first run about 2.7 s, cached run about 1.0 s; with `npm_config_offline=true` a cached version runs offline. Linux not verified; invocation from Claude/Copilot not timed separately.
**Source:** local experiment · **Checked:** 2026-11-22, Node 26.7.0 / npm bundled, Windows
**Consequence for brain-mesh:** About 1 s overhead per call is acceptable for agent use; skills should batch work into few CLI calls (e.g. one `doctor --json`, not one call per file). `init` warms the cache with one call.

## 5 Libraries

| Need | Candidates (licence · latest · last publish · weekly downloads) | Pick | Reason |
| --- | --- | --- | --- |
| YAML | `yaml` ISC · 2.9.1 · 2026-09 · 330 M; `js-yaml` MIT · 5.5.0 · 2026-10 · 410 M | **yaml** | `parseDocument` keeps comments and the schema header when editing (verified: setting `version` kept `# pinned` and the header line). |
| Frontmatter | `gray-matter` MIT · 4.0.3 · 2023-07 · 15 M; own split + `yaml` | **own split + yaml** | gray-matter is unmaintained since 2023 and reformats; splitting on the leading `---` block is a few lines and keeps the body byte-identical. |
| Markdown links | `mdast-util-from-markdown` MIT · 2.1.0 · 2026-10 · 102 M; `markdown-it` MIT · 15.0.3 · 2026-10 · 42 M; `micromark` MIT · 4.0.3 · 2026-09 · 102 M | **mdast-util-from-markdown** (+ `unist-util-visit`) | Verified: gives exact start/end offsets for `[x](../a.md)` and `[x](<a b.md>)` and reference definitions, and skips links in code blocks. Reference-style links need resolving `linkReference` → `definition`. |
| CLI framework | `commander` MIT · 15.1.0 · 2026-11 · 789 M; `citty` MIT · 0.2.2 · 2026-08 · 51 M; `clipanion` MIT · 4.0.0-rc.4 · 2024-09 · 7 M | **commander** | Mature, nested subcommands (`brain new`), global options; clipanion is stale on an rc. |
| Schemas | `zod` MIT · 4.6.7 · 2026-10 · 472 M; `typebox` MIT · 1.4.7 · 2026-11 + `ajv` MIT · 8.20.0 · 2026-04 | **zod** | One source for types, runtime validation and the published JSON Schemas (zod 4 exports JSON Schema natively). |
| Git | `execa` MIT · 10.2.1 · 2026-10 · 246 M + system `git`; `simple-git` MIT · 4.1.0 · 2026-11 · 15 M | **execa + git** | Uses the user's own git and credentials unchanged; one thin wrapper, easy to fake in tests. Same wrapper calls `gh`. |
| Tests | `vitest` MIT · 5.1.1 · 2026-11 · 195 M | **vitest** | Fixed by spec; fixtures copied into `os.tmpdir()` per test. |

**Source:** `npm view <pkg> version license time.modified`, https://api.npmjs.org/downloads/point/last-week/<pkg>, local experiment for YAML and link offsets · **Checked:** 2026-11-22

## 6 Consequences

| # | Consequence | Spec section |
| --- | --- | --- |
| 1 | Client mapping table and agent source format replace the "researched later" note. | 9.2 |
| 2 | `.local/` instructions are concatenated into generated `AGENTS.md` (no includes in Copilot). | 4 (managed vs user files) |
| 3 | Brains must not contain `CLAUDE.md`; `doctor` checks. Brain `AGENTS.md` loads on demand in both clients. | 5.1, 8 |
| 4 | Rendering writes only render-record entries in `.claude/` and `.github/`; gitignore per entry. | 4 |
| 5 | Skill `name` = folder name, `description` required. | 7.5 |
| 6 | Enterprise must allow user namespace repos; `init` falls back with a message to `--remote`. Offboarding handled in rollout consulting. | 3 (requirements), 4, 12 |
| 7 | `doctor` errors on `CODEOWNERS` in `.github/` or `docs/`; valid owner = team exists and has write access. | 5.7, 8 |
| 8 | Exact Obsidian `app.json` keys. | 6.2 |
| 9 | Users auto-approve the `npx -y brain-mesh@` prefix themselves; skills don't ship `allowed-tools: shell`. Skills batch CLI calls. | 9.2 |
| 10 | Library picks recorded; `init` writes `.gitattributes` before its first commit. | 3, 9.3 |
| 11 | Open checks moved to later chunks: duplicate skills in Copilot CLI (5), mount/unmount with Obsidian open (9), logged-out `gh` (8), Linux runs of hook and `npx` (2 CI). | breakdown |

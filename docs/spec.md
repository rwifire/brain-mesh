# brain-mesh — Specification

Draft v0.2 · 2026-11-22 · Ramon

v0.2 folds in the grilling session of 2026-11-22. Terms are defined in [GLOSSARY.md](../GLOSSARY.md); decisions that are hard to reverse are recorded in [adr/](adr/). The build order is in [plan/v0-breakdown.md](plan/v0-breakdown.md).

## 1. Purpose

brain-mesh gives every employee an AI workspace with a personal second brain, and lets them mount the company's shared brains so knowledge can be written and found by agents across team boundaries.

Why not a wiki: brains are plain markdown in git. Agents read and write that natively, every change is reviewable as a PR, and routing metadata lets an agent find the right brain before it searches.

**Goals**

- One command to create a workspace with a personal brain, ready for Claude and GitHub Copilot.
- Mount any shared brain by git URL (later from a registry), read-only or contributing.
- Agents capture, file and retrieve knowledge; humans approve every change.
- Works in Obsidian first, VS Code second.
- Deterministic checks (`doctor`) keep brains consistent.
- Users get new core features (skills, tools, templates) by upgrading, without losing their own changes.

**Non-goals (for now)**

- Unattended agent edits.
- Auto-merge rules for brain PRs.
- Embeddings / vector search (designed for, not built).
- Real-time collaboration; git is the sync layer.
- Hosting or a server component.
- Per-company presets: there is one core template for every organisation.

## 2. Concepts

A workspace holds tooling and the personal brain; a shared brain holds knowledge and its own rules. Everything else follows from that split. Full definitions live in [GLOSSARY.md](../GLOSSARY.md).

| Term | Meaning |
| --- | --- |
| Workspace | A user's own git repo with tooling, configuration and the personal brain; shared brains are mounted inside it. One per user. |
| Brain | Markdown notes plus a manifest (`brain.yaml`) and an `AGENTS.md`. Holds knowledge and the rules for that knowledge. |
| Personal brain | Exactly one per workspace, at `brains/personal/`, part of the workspace repo. One writer. |
| Shared brain | Its own git repo, many writers, changes only via PR. Never contains a workspace. |
| Unpublished brain | A shared brain without a remote yet; follows shared rules, committed to directly until published. |
| Mount | A shared brain cloned into `brains/<brain-id>/`, recorded in `mesh.yaml`. A real clone, never a submodule. |
| Mount mode | `read` or `contribute`. `contribute` requires push rights. Agents never propose edits to `read` mounts. |
| Manifest | `brain.yaml`: id, type, scope, owner, policies. Read for routing and copied into the registry. |
| Registry | A repo listing discoverable shared brains (v1). |
| Core | The brain-mesh package: CLI, templates, shared skills, agents and tools, one version. |
| Area | A folder for an ongoing responsibility or sub-team topic, holding its knowledge notes plus a README as its MOC. |
| MOC | A map of content: curated part plus generated list. Kinds: root index, area README, notes README, map, project note. |
| Map | A MOC for a cross-cutting topic; notes join it through their `maps` frontmatter. |
| Knowledge note | A note of type note, decision, howto or person; lives in one area or in `notes/`. |
| Owner | The team (or, for the personal brain, the user) accountable for a brain or area. Not the author. |
| Contributor | Has push rights on a shared brain's repo. |
| Maintainer | Has the maintain or admin role on a brain's repo; needed to register it. |

## 3. Components

| Component | Owned by | Form | Responsibility |
| --- | --- | --- | --- |
| brain-mesh core | the product | one repo, npm package (Apache 2.0) | CLI with all deterministic logic, workspace and brain templates, shared skills, agents and tools; released together. |
| Workspace | each user | git repo in the user's own namespace, rendered by `init` | Personal brain, instructions for Claude and Copilot, skills, own tools, `mesh.yaml`, Obsidian settings. |
| Shared brain | a team | git repo, rendered by `brain new` | Folder structure, `brain.yaml`, `AGENTS.md`, root `index.md`, note templates. |

**One core, upgraded by everyone.** There is a single template that keeps evolving. New skills, tools and template features ship as new core versions and reach users through `upgrade`. A per-company preset layer is parked (10).

**Versioning.** Semver on the core. Each workspace pins its core version in `mesh.yaml`; generated instructions and skills invoke the CLI as `npx -y brain-mesh-ai-workspace@<pinned>`, so there is no global install and no accidental upgrade. `brain-mesh upgrade` bumps the pin and re-renders managed files (4). `brain.yaml` records the brain `schema`; `doctor` warns when a mounted brain needs a newer core. Everything brain-mesh generates inside a brain depends only on the brain's `schema`, never on the core version (ADR [0001](adr/0001-generated-moc-lists-travel-in-each-pr.md)).

**Requirements.** Node 22 LTS or newer, git, and an installed and logged-in GitHub CLI (`gh`). The CLI checks `gh auth status` first, then uses `gh` for API calls; the default `gh auth login` scopes (`repo`, `read:org`) are enough. Git transport uses the user's existing git setup. The enterprise must allow managed users to own repos in their namespace (no "Block the creation of user namespace repositories"); if it doesn't, `init` says so and asks for `--remote <url>`. Libraries: `commander`, `zod`, `yaml`, `mdast-util-from-markdown`, `execa` (see [chunk 1 research](research/2026-11-chunk-01-research.md)).

## 4. Workspace

The workspace and the personal brain are one git repo in the user's own namespace of their company-managed account (ADR [0002](adr/0002-workspace-and-personal-brain-share-one-repo.md)). Agents run at the workspace root; the Obsidian vault is `brains/`, so tooling stays out of the vault while every cross-brain link resolves inside it.

```
workspace/                    # git repo (user's namespace), agents run here
├── mesh.yaml                 # pin, mounts (user-owned)
├── AGENTS.md                 # generated: workspace conventions + mount table
├── CLAUDE.md                 # generated: one line importing AGENTS.md
├── .mesh/                    # managed, gitignored, re-rendered on init/upgrade
│   ├── skills/               # shared skills, Agent Skills format (SKILL.md)
│   ├── agents/               # shared agents, one source format
│   ├── tools/                # tools shipped by the core
│   └── hooks/                # git hooks (pre-commit warning, 7.2)
├── .local/                   # user-owned: own skills, agents and instructions
├── tools/                    # user-owned: own tools with tests, node_modules allowed
├── .claude/  .github/        # generated client subfolders gitignored; user files kept
└── brains/                   # the Obsidian vault
    ├── .obsidian/            # vault settings, tracked
    ├── personal/             # personal brain, tracked in the workspace repo
    ├── brain-team-platform/  # shared, contribute — own clone, gitignored
    └── brain-handbook/       # shared, read — own clone, gitignored
```

**`mesh.yaml` (sketch)**

```
# yaml-language-server: $schema=<published mesh.yaml schema>
version: 1
brain_mesh: 0.4.2                 # pinned core version
user: ramon                       # GitHub login, used in branch names
mounts:
  - id: brain-team-platform
    url: git@github.com:acme/brain-team-platform.git
    mode: contribute
  - id: brain-handbook
    url: git@github.com:acme/brain-handbook.git
    mode: read
  - id: brain-ideas               # unpublished: no url yet
    mode: contribute
```

**Creating and restoring.** `init` in an empty folder first creates an empty private repo in the user's namespace (`gh repo create --private`, default name `ai-workspace`, or `--name <repo>`), or checks that `--remote <url>` is an existing empty repo. Then it creates the workspace, the personal brain and the `tools/` scaffold, writes `.gitattributes` before its first commit, enables the git hook and pushes. Anything that can fail is checked before the first file is written. `init` inside a cloned workspace that already has a `mesh.yaml` restores it: it re-renders managed files from the pinned version, enables the git hook, and runs `sync`, which clones every missing mount.

**Managed vs user files.** `.mesh/`, the generated client subfolders and every file marked `generated by brain-mesh` are managed files: re-rendered by `upgrade` and gitignored where regenerable. User changes go in `.local/` and `tools/`, which upgrades never touch; `.local/` instructions are concatenated into the generated `AGENTS.md`, because Copilot has no include syntax. Files outside the generated subfolders of `.claude/` and `.github/` (such as `.claude/settings.local.json`) belong to the user. Template files a user may edit by hand (Obsidian settings) are never overwritten; `upgrade` shows them as a diff to accept or skip.

**Config files have JSON Schemas.** `mesh.yaml` and `brain.yaml` carry a schema header, so VS Code gives completion and validation when editing by hand.

### 4.1 Customisation layers

Nothing the core ships is edited in place; it is extended or overridden by the user: **core → user**.

| What | Core ships | User can |
| --- | --- | --- |
| Defaults for new shared brains | `people: accountability` policy, folder structure, note templates | — |
| Instructions (`AGENTS.md`) | base conventions | append personal sections in `.local/` |
| Skills and agents | shared skills and agents | add own; override a core one by using the same name |
| Tools | core tools in `.mesh/tools/` | add own in `tools/`, with or without a skill |
| Obsidian settings | link format, ignored folders | anything except the link settings (`doctor` checks those) |

- An override replaces the whole skill. When the overridden skill changes upstream, `upgrade` warns and shows the diff.
- A brain's `policies` live in the brain and are enforced for everyone who writes to it; no workspace can loosen them.
- Whether a user tool comes with a skill is the user's choice.

### 4.2 Executable code

Code is allowed in the core and in the workspace (`.mesh/tools/`, `tools/`, `.local/`); it is never allowed in brains (ADR [0003](adr/0003-code-in-workspaces-never-in-brains.md)). `init` scaffolds `tools/` with one `package.json` for TypeScript and Vitest; each tool is a subfolder with its own tests, run with the normal `npm test`. Other languages are allowed but not scaffolded. More tooling (e.g. an app launcher) is parked (10).

## 5. Brain

A brain has a fixed, shallow structure; personal and shared brains differ only in two folders and in their policies.

### 5.1 Structure

```
brain/
├── brain.yaml     # manifest: id, type, description, topics, owner, policies
├── AGENTS.md      # conventions for agents and humans (generated + brain-specific part)
├── CLAUDE.md      # generated: one line importing AGENTS.md
├── CODEOWNERS     # shared only, generated from area owners
├── index.md       # root MOC: every area, map and project
├── inbox/         # personal only: unprocessed captures, no rules
├── daily/         # personal only: the user's own journal
├── areas/         # one folder per area / sub-team, one level deep
│   ├── frontend/
│   │   ├── README.md                 # area MOC (type: area)
│   │   └── component-library.md
│   └── ci/
│       ├── README.md
│       └── runner-cache-strategy.md
├── notes/         # knowledge notes that belong to no area, flat
│   └── README.md  # MOC for notes/
├── maps/          # type: map, one note per cross-cutting topic
├── projects/      # type: project, one hub note per finite piece of work
└── sources/       # type: source — books, talks, articles, kept captures
```

| Folder | Holds types | Owned by |
| --- | --- | --- |
| `areas/<area>/` | note, decision, howto, person; `README.md` is `area` | the area's `owner`, else the brain's |
| `notes/` | note, decision, howto, person | brain owner |
| `maps/`, `projects/`, `sources/` | map, project, source respectively | brain owner |

`doctor` checks that each note's type matches its folder. A note that matters to several areas stays in the area that owns it and joins a map (5.4). No `archive/`: outdated notes are deleted (5.5).

### 5.2 Manifest (`brain.yaml`)

```
# yaml-language-server: $schema=<published brain.yaml schema>
id: brain-team-platform      # shared: = repo name = mount folder name; personal: always "personal"
name: Platform Team
type: shared                 # shared | personal
description: >-
  CI/CD, build infrastructure, developer tooling, runners.
topics: [ci, build, runners, developer-tooling]
out_of_scope: Application monitoring and on-call; see brain-sre.   # optional
schema: 1
requires: ">=0.3"            # minimum brain-mesh version
owner: "@acme/platform"      # fallback owner for notes/, maps/, projects/, sources/ and areas without one
policies:
  people: accountability     # personal brains: none
links_to: [brain-handbook]   # generated by doctor from outgoing links
```

`description` is the main routing signal, so it is required and kept short. `topics` and `out_of_scope` sharpen routing; a registry entry is copied from these fields, never written separately. The personal brain has `id: personal`, `type: personal`, `owner: "@<login>"`.

### 5.3 Note conventions

- File names: lowercase kebab-case only (Windows and macOS ignore case, Linux doesn't). Every file stem is unique within the brain, except `README.md` and `index.md`. A map's name is its file stem in `maps/`, a project's name its stem in `projects/`.
- The title states the claim or question, not just the topic: "Layer caching beats artifact caching for our runners".
- One concept per note. Search before creating; extend an existing note rather than adding a near-duplicate.
- Required frontmatter: `type`, `summary` (one sentence), `updated` (set by the agent on every write; `doctor` checks the format only). Types: note, decision, howto, source, person, area, map, project.
- Optional frontmatter: `maps` (list of map names), `project`, `sources`. There is no `area` field: the folder is the area.
- `summary` is written for routing: specific and self-contained. It appears next to each note in generated MOC lists, so a lookup can scan MOCs before opening notes.
- A *Related* section lists links with the reason for each: `[Runner pools](../ci/runner-pools.md): the pools this assumes`.
- Link, don't copy: context about another brain's note is your own note that links to it.
- Plain markdown and YAML frontmatter only; no plugin-specific syntax (see 9).

### 5.4 MOCs

Every area README, map and project note is a MOC with two parts: a curated part written by humans or agents (context, key notes, reading order) and a generated list that `doctor --fix` keeps complete. A map is created only once a topic has about 10 notes; until then the area READMEs are enough.

| MOC | File | Generated list contains |
| --- | --- | --- |
| Root | `index.md` | every area, map and project, plus `notes/` |
| Area | `areas/<area>/README.md` | every note in the folder |
| General | `notes/README.md` | every note in `notes/` |
| Map | `maps/<topic>.md` | every note with `<topic>` in its `maps` field |
| Project | `projects/<project>.md` | every note with `project: <project>` |

A note joins a cross-cutting topic through its frontmatter:

```
---
type: note
summary: How we cache node_modules on CI runners
maps: [ci-performance]
updated: 2026-11-21
---
```

The generated part of a MOC sits between markers:

```
<!-- brain-mesh:index -->
- [Runner cache strategy](../areas/ci/runner-cache-strategy.md) — How we cache node_modules on CI runners
<!-- /brain-mesh:index -->
```

Generated lists are plain relative links, so they work in Obsidian, VS Code, on GitHub and for agents. Obsidian Bases or Dataview can add personal views but never replace these lists.

**Generated content in shared brains** (MOC lists, `CODEOWNERS`, `links_to`) is regenerated on the contributor's machine and committed inside the same PR. Output is deterministic, sorted and depends only on `schema`. When two PRs conflict inside a generated block, `doctor --fix` resolves it by regenerating instead of merging text (ADR [0001](adr/0001-generated-moc-lists-travel-in-each-pr.md)).

### 5.5 Note lifecycle

- Notes are edited in place; git history is the archive.
- Outdated notes are deleted, not moved. Before deleting, the agent finds inbound links in the same brain and fixes them in the same change; generated MOC lists update on the next `doctor --fix`.
- Inbound links from other brains cannot be fixed by the deleting brain; `doctor` in each workspace reports them as broken.
- A finished project: durable knowledge moves into the owning areas, then the project note is deleted.
- Renaming an area moves its folder. `doctor --fix` rewrites links inside the brain; links from other brains are reported as broken, so renames should be rare.

### 5.6 People notes

|  | Personal brain | Shared brain |
| --- | --- | --- |
| Allowed | Whatever the owner chooses to keep | Names only to record responsibilities (who owns what), decisions (who decided what) and outcomes (what happened) |
| Not allowed | — | Any judgement of people: opinions, assessments, performance, behaviour, private life |
| Enforcement | none | `policies.people: accountability` in `brain.yaml`, the people-policy check, PR review |

**Person notes in shared brains** may only use the frontmatter keys `type`, `summary`, `updated`, `name`, `role`, `team`, `responsibilities`, `contact`. A body is allowed and is checked by the reviewer agent.

**People-policy check.** Runs in the `contribute` skill on the changed files before a PR is opened (and in CI later):

- **Deterministic (`doctor`):** person-note frontmatter keys outside the allowed set.
- **Agent (people-policy reviewer):** reads every passage that mentions a person and flags anything that is not a responsibility, decision or outcome.

Flags must be fixed before the PR is opened. A false positive can be overridden only with a reason written into the PR description, which the reviewer sees.

### 5.7 Ownership

- Every area README carries `owner: "@org/team"` in its frontmatter; areas without one, and the other top-level folders, fall back to the brain's `owner`.
- Owner means accountability, not authorship: any contributor may propose changes via PR; the owner reviews, answers "is this still true?" and is the contact when a lookup finds no answer.
- Owners are teams by default, so people can leave without orphaning an area.
- `doctor --fix` generates a root-level `CODEOWNERS` from area owners. The root location is read by both GitHub and GitLab (9.4). GitHub prefers `.github/CODEOWNERS` over the root file, so a brain must not have one there.
- A valid owner is a team that exists **and** has write access to the brain repo; GitHub silently ignores owners without it.

### 5.8 Sources and transcripts

Raw meeting transcripts and other raw captures stay in the personal brain. Only reviewed knowledge extracted from them goes into shared brains. Because shared → personal links aren't allowed, the shared note names its source in words.

## 6. Linking

Links are standard markdown links with relative paths; the only forbidden direction is shared → personal. No Obsidian plugin is needed in v0.

### 6.1 Allowed directions

| From \ To | Personal | Shared |
| --- | --- | --- |
| Personal | yes | yes |
| Shared | **no** | yes |

`doctor` fails on a shared → personal link, and agents never propose one.

### 6.2 Format

- Inside a brain (from `areas/frontend/`): `[Runner cache](../ci/runner-cache-strategy.md)`
- Across brains: `[Release process](../../../brain-handbook/areas/engineering/release-process.md)` — resolves because every brain sits at `brains/<brain-id>/` for every user.
- No wikilinks. Obsidian resolves `[[name]]` by file name across the whole vault, so with several brains mounted the same link can hit different files for different users.
- Obsidian settings shipped in the template: *Use [[Wikilinks]]* off, *New link format* = relative path, *Automatically update internal links* on — in `brains/.obsidian/app.json`: `"useMarkdownLinks": true, "newLinkFormat": "relative", "alwaysUpdateLinks": true`.

### 6.3 Links to brains the reader hasn't mounted

- `doctor` writes outgoing brain ids to `links_to` in `brain.yaml` (v0).
- On `mount`, brain-mesh offers to mount the `links_to` brains read-only as well (v1).
- If the target isn't mounted, `doctor` reports the link as *unmounted*, not *broken*, and agents say "this is covered in brain X, which you don't have mounted".
- Shared brain ids are repo names, which the git host keeps unique within an org. `mount` refuses an id that collides with an existing mount or with `personal`.

**Known limitation:** cross-brain relative links don't resolve on github.com. Acceptable for v0.

## 7. Agent behaviour

Agents write most of the content, but never unattended: they propose, the user approves, and published shared brains only change through PRs.

### 7.1 Editing rules

- **Propose first.** Every change is shown as a proposal (target brain, files, what is added) before anything is written.
- **Append by default.** Existing content is only replaced or deleted when the user explicitly asks.
- **Search before create.** Prefer extending an existing note; new notes need a reason.
- **Respect mount mode.** Agents read mount modes from `brain-mesh mounts --json` and never propose edits to `read` mounts. If the user wants to change one, the agent offers to note it in the personal brain instead.
- **Respect direction.** No shared → personal links; no personal content copied into shared brains without the user saying so.
- **Respect policies.** Agents apply the brain's `policies` (5.6).
- **Keep raw material personal.** Transcripts and raw captures are never proposed for shared brains (5.8).
- **Keep information and infrastructure apart.** Agents stage only the paths of the brain they write to and point out a commit that would mix brain content with tooling.

### 7.2 Writing to brains

| Brain | After approval |
| --- | --- |
| Personal | Commit only paths under `brains/personal/`, `pull --rebase`, push (`brain-mesh commit`). |
| Shared, published (`contribute`) | Branch `mesh/<user>/<slug>` from fresh `origin/<default>`, commit, push, open a PR, return the clone to the default branch. |
| Shared, unpublished | Commit directly to the default branch. |
| Shared (`read`) | Nothing is written. |

The local clone of a shared brain always shows merged state; content of open PRs is not visible locally. There is no separate operations log: the *why* of a change goes into the commit message and PR description.

**Mixed-commit warning.** `init` enables a pre-commit hook from `.mesh/hooks/` that warns, but never blocks, when a workspace commit touches both `brains/personal/` and anything outside it. The workspace is the user's own space; the warning is a help, not enforcement.

### 7.3 Ingestion workflow

1. Take an item from the personal `inbox/` (or from the current chat).
2. Decide which brain and area it belongs to, using `brain.yaml` descriptions, topics and maps.
3. Find related notes, maps and areas.
4. Propose: notes to create or append to, maps to join, changes to curated MOC text if needed, links.
5. On approval, write and commit, or open a PR. Then the inbox item is removed (for a PR: when it is opened; the removing commit names the PR URL), or, if the user wants to keep it as a reference, moved to `sources/`.

A proposal from an input (meeting, article, chat) groups its items so the user can accept, edit or reject each:

- **Decisions**, kept apart from things only discussed.
- **Updates to existing notes**, as diffs.
- **New notes**, only for concepts not yet in any mounted brain.
- **Open questions and contradictions** with existing notes.
- Each item carries a short quote or timestamp from the input, so it can be checked quickly.

### 7.4 Lookup workflow

1. **Route** (agent judgement): read `description`, `topics` and `out_of_scope` from each mounted `brain.yaml` and pick candidate brains.
2. **Narrow:** read each candidate's `index.md` and the relevant area READMEs or maps.
3. **Search:** `brain-mesh search <query> --brain <ids> --json` matches `summary` fields first, then full text, within the candidates.
4. **Answer** with links to the notes used, name the brains searched, and mention linked brains that aren't mounted.
5. **No answer:** name the owner of the most relevant area as the person to ask.

Embeddings later replace only the inside of `brain-mesh search`, so skills don't change when they arrive.

### 7.5 Skills and agents in v0

| Name | Kind | Purpose |
| --- | --- | --- |
| capture | skill | Drop raw input into `inbox/` with minimal structure. |
| ingest | skill | Workflow 7.3. |
| ask | skill | Workflow 7.4. |
| contribute | skill | Run `doctor` and the people-policy check, then branch, commit and open a PR. |
| consistency-reviewer | agent | Finds contradictions and duplicates in a brain's content; reports, doesn't edit. |
| people-policy-reviewer | agent | Flags passages about people that aren't responsibilities, decisions or outcomes (5.6). |

Skills and agents are written once in `.mesh/` (and `.local/`) and rendered into each client's format (9.2).

## 8. brain-mesh CLI

The CLI holds all deterministic logic so Claude and Copilot call the same commands; skills stay thin wrappers. Every command supports `--json` for agents.

| Command | Does | Phase |
| --- | --- | --- |
| `init [--remote <url> \| --name <repo>]` | New: create workspace, personal brain and private workspace repo. Existing `mesh.yaml`: restore (re-render, enable hook, `sync`). | v0 |
| `commit [brain] --message <text>` | Commit the personal brain's changes only, pull with rebase, push (7.2). Other changes in the workspace stay as they are. | v0 |
| `mount <git-url> [--mode read\|contribute]` | Clone into `brains/<id>/`, record in `mesh.yaml`, regenerate instructions. `contribute` is refused without push rights. | v0 |
| `unmount <id>` | Remove the clone and the `mesh.yaml` entry. | v0 |
| `mounts` | List mounts with mode, path, description and published state. | v0 |
| `sync` | Clone missing mounts; fast-forward existing ones; skip and report dirty or diverged mounts. Pull and push the workspace repo. | v0 |
| `doctor [brain] [--fix] [--offline]` | Checks below; `--fix` for safe repairs and regeneration. | v0 |
| `search <query> [--brain <ids>]` | Deterministic summary-then-full-text search across mounts. | v0 |
| `brain new <git-url>` | Default: render the shared template into an existing empty repo, push the first commit, mount as `contribute`. | v0 |
| `brain new <id>` | Without URL: create an unpublished shared brain locally. | v0 |
| `brain publish <id> <git-url>` | Add the remote, push, record the URL, switch to PR-only. Refuses if repo name ≠ id. | v0 |
| `upgrade [--to <version>]` | Bump the pin, re-render managed files; user files untouched, hand-edited template files and overridden skills shown as a diff. | v0 |
| `mount <id>` | Mount by registry id. | v1 |
| `brain migrate <id>` | Migrate a brain to a newer `schema` via PR. | v1 |
| `register` / `registry list` | `register` checks that the caller maintains the brain repo and opens a PR to the registry; `registry list` shows registered brains. | v1 |

Supplying a remote URL to `brain new` is the documented default; the local-only form is for trying an idea before a repo exists.

**`doctor` checks (v0)**

- Broken links; unmounted cross-brain targets reported separately.
- Shared → personal links (error).
- Missing or invalid frontmatter (`type`, `summary`, `updated`); `maps` or `project` values that point to a MOC that doesn't exist.
- Note type doesn't match its folder; knowledge notes outside `notes/` or an area; area folders nested deeper than one level; areas without a README.
- File names that aren't lowercase kebab-case; duplicate file stems inside a brain (except `README.md`, `index.md`); shared brain id that differs from the repo name; id collisions across mounts or with `personal`.
- Shared brains: person-note frontmatter keys outside the allowed set (5.6).
- Generated MOC lists, `CODEOWNERS` and `links_to` out of date (`--fix` regenerates them, also inside conflict markers); area owners that aren't valid.
- Executable files inside a brain (warning); client skill or agent folders inside a brain — `.claude/`, `.github/skills/`, `.github/agents/`, `.agents/` (error: clients auto-load them); a brain `CLAUDE.md` other than the generated `@AGENTS.md` line (error); `.github/CODEOWNERS` in a brain (error: it shadows the generated root file); `docs/CODEOWNERS` (warning: redundant).
- Uncommitted changes in a `read` mount.
- Brain requires a newer core than pinned.
- Checks that need the network (owner validity, push rights) are skipped with a warning when offline or with `--offline`.

**Registry (v1).** A git repo holding one `registry.yaml`; its location is a `registry:` field in `mesh.yaml`. Entries (id, url, description, topics, owners) are copied from the brain's `brain.yaml`. `brain-mesh register` opens a PR adding one entry, and the registry's CI merges it automatically when the entry is valid against the schema and the id isn't registered yet. Both checks work with the registry repo's default CI token; no GitHub App is needed. Before opening the PR, `register` also checks with the user's own credentials that the repo exists, has a valid shared `brain.yaml` whose id matches the repo name, and that the user maintains it. These local checks are a convenience, not enforcement. The registry's main branch is protected and only changes through PRs.

## 9. Compatibility

Brains stay plain markdown with YAML frontmatter, so they work in Obsidian, VS Code and on github.com; Obsidian-only features are allowed as views, never as content.

### 9.1 Editors

| Feature | Obsidian | VS Code |
| --- | --- | --- |
| Relative markdown links | yes | yes (ctrl+click) |
| Frontmatter | yes (Properties) | yes (as text) |
| Graph, backlinks | yes | needs an extension (e.g. Foam) |
| Wikilinks, embeds `![[…]]` | not used | not used |
| Dataview, Bases, Canvas | personal views only, never required | no |
| Callouts | avoid in shared brains | render as plain quotes |

The Obsidian vault is `brains/`; tooling, `node_modules` and instructions sit outside it at the workspace root. VS Code opens the workspace root.

### 9.2 Assistants

Verified against current client docs in [chunk 1 research](research/2026-11-chunk-01-research.md).

| Item | brain-mesh source | Claude Code | GitHub Copilot |
| --- | --- | --- | --- |
| Instructions | core template + `.local/*.md`, concatenated into root `AGENTS.md` | `CLAUDE.md` = `@AGENTS.md` | root `AGENTS.md` (no include syntax exists) |
| Brain rules | `brains/<id>/AGENTS.md` | via the brain's generated `CLAUDE.md` = `@AGENTS.md`, loaded on demand when notes there are read | nested `AGENTS.md` (VS Code Copilot harness, by default) |
| Skills | `.mesh/skills/<n>/`, `.local/skills/<n>/` | `.claude/skills/<n>/` | `.github/skills/<n>/` |
| Agents | `.mesh/agents/<n>.md`, `.local/agents/<n>.md` | `.claude/agents/<n>.md` | `.github/agents/<n>.agent.md` |
| Deterministic actions | — | `npx -y brain-mesh-ai-workspace@<pinned> … --json` | same |
| v0 support level | — | reference client: full scenario checklist | rendered and smoke-tested |

- Skills use the Agent Skills format; `name` equals the folder name (Copilot silently skips a mismatch) and `description` is required.
- Agents use a brain-mesh source format: frontmatter `name` (= file stem), `description`, `tools` from the abstract set `read | search | edit | execute`, mapped per client (`search` → Claude `Grep, Glob`; `execute` → Claude `Bash`, Copilot `execute`). `model` is omitted so both inherit the session model.
- Rendering writes only the entries in its render record; everything else in `.claude/` and `.github/` (e.g. `settings*.json`, `CLAUDE.local.md`) belongs to the user.
- The render record `.mesh/render.json` lists every managed entry (`managed`, `seed`, `block`) with the sha256 of what was rendered; `upgrade` uses it to find hand edits.
- Skills don't pre-approve the shell. The getting-started docs show how to auto-approve the `npx -y brain-mesh-ai-workspace@` prefix in each client, and skills batch work into few CLI calls (about 1 s each).

### 9.3 Platforms

- Windows and Linux are first-class: shared brains are real clones, never symlinks or submodules; paths handled with Node's `path`.
- Templates ship a `.gitattributes` forcing LF line endings so agent diffs stay clean across platforms.

### 9.4 Git hosts

The only supported host for now is github.com. Every host-specific call goes through one host adapter in the core, so adding another host (e.g. GitLab) means writing an adapter, not redesigning.

| Feature | Host-specific? | How it stays portable |
| --- | --- | --- |
| Clone, pull, push, branches | no, plain git | — |
| Create the private workspace repo (`init`) | yes, host API | adapter: create repo in the user's namespace |
| Open a PR (`contribute`, `register`) | yes, host API | adapter: create pull request |
| Push-rights and maintainer checks | yes, host API | adapter: get permission |
| Owners `@org/team` | syntax shared by GitHub and GitLab; validation needs the API | adapter: validate owner |
| `CODEOWNERS` | both read it, in different folders | generated at the repo root, which both read |
| Registry | a file in a git repo; registration is a PR | PR through the adapter |
| CI checks (later) | workflow files are per host | checks stay CLI commands; CI files are thin wrappers |
| Newest github.com-only features | yes | never required |

Shared brain repos are created by the user, not by brain-mesh, so no org setting is needed.

## 10. Testing

- **CLI:** unit and integration tests (Vitest) against fixture brains and fixture workspaces in temp dirs, run in CI on Windows and Linux.
- **Skills and agents:** a fixture workspace and a written scenario checklist (e.g. ingest a meeting transcript, ask a cross-brain question, flag a person-judgement passage), run by hand on Claude Code before each release; smoke test on Copilot. Automated evals come later.

## 11. Roadmap

v0 proves the loop with one personal brain and one shared brain in a single team; everything company-wide comes after.

1. **v0: one team.** `init` (new and restore), `mount` by URL, `unmount`, `mounts`, `sync`, `doctor` (incl. MOC, `CODEOWNERS` and `links_to` generation), `search`, `brain new`, `brain publish`, `upgrade`; workspace and brain templates; `tools/` scaffold and mixed-commit hook; skills capture, ingest, ask, contribute; consistency-reviewer and people-policy-reviewer agents; github.com host adapter; Claude Code as reference client, Copilot rendered. *Done when:* one team has used a shared brain for a month and lookups answer real questions.
2. **v1: company rollout.** Registry (register via PR, mount by id), `links_to` auto-mount offer, `brain migrate`, Copilot parity, CI checks for shared brains. *Done when:* a second team mounts the first team's brain and links into it, and Copilot passes the scenario checklist.

### Later (parked ideas)

| Idea | What it would add |
| --- | --- |
| Company presets | A per-company layer between core and user: org defaults, extra instructions and skills. |
| App launcher | Users create small web apps in the workspace for repeatable tasks and views. |
| `promote` command | Move a personal note into a shared brain via PR and rewrite personal links. |
| Embeddings | Each brain's CI embeds summaries only; vectors published with the brain; plugs in behind `search`. |
| Remote reading | Read notes of unmounted brains via the GitHub API with the user's own credentials. |
| Mesh MCP server | One local MCP server over all mounted brains, shared by Claude and Copilot. |
| Staleness checks | Optional `review_by` field; `doctor` flags overdue notes to their area owner. |
| Obsidian plugin | Graph across brains, GitHub URL fallback for cross-brain links. |
| PR auto-merge rules | Lower review overhead for low-risk brain changes. |
| Registry by GitHub topic | Discover brains via topic search instead of a registry repo. |
| Automated skill evals | Replace the manual scenario checklist. |

## 12. Decisions

Hard-to-reverse decisions are ADRs in [docs/adr/](adr/). Works-council consultation and org-admin visibility are handled in the rollout consulting, not in the software.

### Decided (2026-11-21)

- **People in shared brains:** names only for responsibilities, decisions and outcomes, enforced by the people-policy check (5.6). No rule in personal brains.
- **Open source:** the core is published on npm under the Apache 2.0 license.
- **Git hosts:** github.com only for now, behind a host adapter (9.4).
- **Daily notes** stay in personal brains.
- **Shared brain id** = repo name.
- **Shared brains:** anyone can create one; only maintainers of its repo should register it (checked by `register`, not enforced by CI).
- **Registry PRs** merge automatically when the format and id-uniqueness checks pass; no GitHub App.
- **Contributing** requires push rights on the brain repo; no fork-based contributions.
- **Notes without an area** go to `notes/`.

### Decided (2026-11-22)

- **Workspace + personal brain = one repo** in the user's own namespace of their company-managed account; replaces "personal brains in the company org" (ADR 0002).
- **Code** is allowed in core and workspace, never in brains (ADR 0003).
- **Generated brain content** travels in each PR, conflicts resolved by regeneration (ADR 0001).
- **Vault** is `brains/`; tooling stays at the workspace root.
- **One core template** for every organisation; presets parked; users get new features via `upgrade`, which is in v0.
- **`search`** is a deterministic v0 command; routing stays agent judgement.
- **Auth** via an installed, logged-in `gh`.
- **Tech stack:** TypeScript (ESM) on Node 22+, Vitest.
- **Shared brains** are created into an existing repo by default; local unpublished brains are possible and published later.

### Still open

None at the moment; new questions are added here as they come up.

# doctor checks

Generated from `src/doctor/codes.ts`; do not edit by hand. `brain-mesh doctor --json` reports every finding with one of these codes. An error makes `doctor` exit with 1.

| Code | Severity | `--fix` | Checks |
| --- | --- | --- | --- |
| `mesh-invalid` | error |  | `mesh.yaml` cannot be parsed or does not match its schema. |
| `mount-id-collision` | error |  | Two mounts share an id, or a mount uses the reserved id `personal`. |
| `brain-missing` | warning |  | The personal brain or a mount listed in `mesh.yaml` has no folder under `brains/`; run `brain-mesh sync`. |
| `brain-unlisted` | warning |  | A folder under `brains/` is not listed in `mesh.yaml`. |
| `manifest-invalid` | error |  | A brain's `brain.yaml` is missing, cannot be parsed or does not match its schema. |
| `brain-id-mismatch` | error |  | A brain's id differs from its folder name, or a shared brain's id differs from its repository name. |
| `requires-unmet` | error |  | The pinned core version does not satisfy a brain's `requires` range. |
| `schema-unsupported` | error |  | A brain's `schema` is newer than this core understands; upgrade brain-mesh. |
| `folder-unexpected` | error |  | A shared brain has an `inbox/` or `daily/` folder, which belong to the personal brain only. |
| `note-misplaced` | error |  | A markdown note sits outside `notes/`, an area, `maps/`, `projects/` or `sources/`, or in a subfolder of a flat folder. |
| `area-nested` | error |  | An area folder contains a subfolder with notes; areas are one level deep. |
| `area-readme-missing` | error |  | An area folder has no `README.md`. |
| `type-folder-mismatch` | error |  | A note's `type` is not allowed in its folder. |
| `filename-not-kebab` | error |  | A file or folder name is not lowercase kebab-case. |
| `stem-duplicate` | error |  | Two notes in a brain share a file name (except `README.md` and `index.md`). |
| `frontmatter-missing` | error |  | A note has no frontmatter. |
| `frontmatter-invalid` | error |  | A note's frontmatter cannot be parsed, or `type`, `summary`, `updated`, `maps`, `project` or `sources` is invalid. |
| `moc-missing` | error |  | A note's `maps` or `project` value names a map or project note that does not exist. |
| `owner-invalid` | error |  | An `owner` is not a valid `@user` or `@org/team` (syntax only). |
| `person-key-not-allowed` | error |  | A person note in a shared brain uses a frontmatter key outside the allowed set. |
| `link-broken` | error |  | A link points to a file that does not exist, uses an absolute path, or leaves `brains/`. |
| `link-unmounted` | warning |  | A link points into a brain that is not mounted in this workspace. |
| `link-shared-to-personal` | error |  | A shared brain links into the personal brain. |
| `obsidian-link-settings` | error |  | `brains/.obsidian/app.json` does not set markdown links, the relative link format and automatic link updates. |
| `executable-file` | warning |  | A brain contains a script or program (by extension or a `#!` first line). |
| `client-folder` | error |  | A brain contains `.claude/`, `.github/skills/`, `.github/agents/` or `.agents/`, which clients load automatically. |
| `claude-md-invalid` | error |  | A `CLAUDE.md` in a brain is anything other than the line `@AGENTS.md`. |
| `codeowners-shadowed` | error |  | A brain has `.github/CODEOWNERS`, which hides the generated root `CODEOWNERS` on GitHub. |
| `codeowners-redundant` | warning |  | A brain has `docs/CODEOWNERS`, which duplicates the generated root file. |
| `read-mount-dirty` | warning |  | A `read` mount has uncommitted changes. |
| `links-to-outdated` | error | yes | `links_to` in `brain.yaml` does not list the brains this brain links to. |
| `moc-outdated` | error | yes | A generated MOC list is missing entries, lists notes that no longer belong, or is missing its markers. |
| `generated-block-invalid` | error |  | Generated-block markers are unbalanced or a merge conflict crosses a block boundary; fix it by hand. |

export type Severity = 'error' | 'warning';

/** Every `doctor` finding code. Codes are stable: agents and docs depend on them. */
export const CHECKS = {
  'mesh-invalid': { severity: 'error', description: '`mesh.yaml` cannot be parsed or does not match its schema.' },
  'mount-id-collision': { severity: 'error', description: 'Two mounts share an id, or a mount uses the reserved id `personal`.' },
  'brain-missing': { severity: 'warning', description: 'The personal brain or a mount listed in `mesh.yaml` has no folder under `brains/`; run `brain-mesh sync`.' },
  'brain-unlisted': { severity: 'warning', description: 'A folder under `brains/` is not listed in `mesh.yaml`.' },
  'manifest-invalid': { severity: 'error', description: "A brain's `brain.yaml` is missing, cannot be parsed or does not match its schema." },
  'brain-id-mismatch': { severity: 'error', description: "A brain's id differs from its folder name, or a shared brain's id differs from its repository name." },
  'requires-unmet': { severity: 'error', description: "The pinned core version does not satisfy a brain's `requires` range." },
  'schema-unsupported': { severity: 'error', description: "A brain's `schema` is newer than this core understands; upgrade brain-mesh." },
  'folder-unexpected': { severity: 'error', description: 'A shared brain has an `inbox/` or `daily/` folder, which belong to the personal brain only.' },
  'note-misplaced': { severity: 'error', description: 'A markdown note sits outside `notes/`, an area, `maps/`, `projects/` or `sources/`, or in a subfolder of a flat folder.' },
  'area-nested': { severity: 'error', description: 'An area folder contains a subfolder with notes; areas are one level deep.' },
  'area-readme-missing': { severity: 'error', description: 'An area folder has no `README.md`.' },
  'type-folder-mismatch': { severity: 'error', description: "A note's `type` is not allowed in its folder." },
  'filename-not-kebab': { severity: 'error', description: 'A file or folder name is not lowercase kebab-case.' },
  'stem-duplicate': { severity: 'error', description: 'Two notes in a brain share a file name (except `README.md` and `index.md`).' },
  'frontmatter-missing': { severity: 'error', description: 'A note has no frontmatter.' },
  'frontmatter-invalid': { severity: 'error', description: "A note's frontmatter cannot be parsed, or `type`, `summary`, `updated`, `maps`, `project` or `sources` is invalid." },
  'moc-missing': { severity: 'error', description: "A note's `maps` or `project` value names a map or project note that does not exist." },
  'owner-invalid': { severity: 'error', description: 'An `owner` is not a valid `@user` or `@org/team` (syntax only).' },
  'person-key-not-allowed': { severity: 'error', description: 'A person note in a shared brain uses a frontmatter key outside the allowed set.' },
  'link-broken': { severity: 'error', description: 'A link points to a file that does not exist, uses an absolute path, or leaves `brains/`.' },
  'link-unmounted': { severity: 'warning', description: 'A link points into a brain that is not mounted in this workspace.' },
  'link-shared-to-personal': { severity: 'error', description: 'A shared brain links into the personal brain.' },
  'obsidian-link-settings': { severity: 'error', description: '`brains/.obsidian/app.json` does not set markdown links, the relative link format and automatic link updates.' },
  'executable-file': { severity: 'warning', description: 'A brain contains a script or program (by extension or a `#!` first line).' },
  'client-folder': { severity: 'error', description: 'A brain contains `.claude/`, `.github/skills/`, `.github/agents/` or `.agents/`, which clients load automatically.' },
  'claude-md-invalid': { severity: 'error', description: 'A `CLAUDE.md` in a brain is anything other than the line `@AGENTS.md`.' },
  'codeowners-shadowed': { severity: 'error', description: 'A brain has `.github/CODEOWNERS`, which hides the generated root `CODEOWNERS` on GitHub.' },
  'codeowners-redundant': { severity: 'warning', description: 'A brain has `docs/CODEOWNERS`, which duplicates the generated root file.' },
  'read-mount-dirty': { severity: 'warning', description: 'A `read` mount has uncommitted changes.' },
  'links-to-outdated': { severity: 'error', fixable: true, description: '`links_to` in `brain.yaml` does not list the brains this brain links to.' },
  'moc-outdated': { severity: 'error', fixable: true, description: 'A generated MOC list is missing entries, lists notes that no longer belong, or is missing its markers.' },
  'codeowners-outdated': { severity: 'error', fixable: true, description: "A shared brain's root `CODEOWNERS` is missing or does not match the brain and area owners." },
  'agents-md-outdated': { severity: 'error', fixable: true, description: "The generated part of a brain's `AGENTS.md` is missing or out of date." },
  'claude-md-missing': { severity: 'error', fixable: true, description: 'A brain has no `CLAUDE.md`, so Claude Code never loads its `AGENTS.md`.' },
  'generated-block-invalid': { severity: 'error', description: 'Generated-block markers are unbalanced or a merge conflict crosses a block boundary; fix it by hand.' },
} as const satisfies Record<string, { severity: Severity; description: string; fixable?: true }>;

/** Whether `doctor --fix` resolves findings with this code. */
export function isFixable(code: CheckCode): boolean {
  return 'fixable' in CHECKS[code];
}

export type CheckCode = keyof typeof CHECKS;

/** The page published as `docs/doctor-checks.md`. */
export function checksMarkdown(): string {
  const rows = Object.entries(CHECKS).map(
    ([code, c]) => `| \`${code}\` | ${c.severity} | ${'fixable' in c ? 'yes' : ''} | ${c.description} |`,
  );
  return [
    '# doctor checks',
    '',
    'Generated from `src/doctor/codes.ts`; do not edit by hand. `brain-mesh doctor --json` reports every finding with one of these codes. An error makes `doctor` exit with 1.',
    '',
    '| Code | Severity | `--fix` | Checks |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

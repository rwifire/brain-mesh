# Chunk 2: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A buildable, tested TypeScript CLI skeleton whose no-op `version` command runs via `npx` from a packed local build, answers with a stable `--json` envelope, and passes CI on Windows and Linux.

**Architecture:** `main(argv, io, options)` is the only entry: it builds a commander program from a list of `CommandDef`s, runs one, and writes either human text or exactly one JSON envelope. Every command returns a `CommandOutput`; errors are `CliError`s with stable codes. zod schemas for `mesh.yaml` and `brain.yaml` are the single source for types and the published JSON Schemas, kept in sync by Vitest file snapshots.

**Tech Stack:** Node ≥ 22.12, TypeScript 7 (`tsc`, ESM, NodeNext), commander 15, zod 4, yaml 2, Vitest 5, execa 10 (tests only in this chunk), GitHub Actions.

**Spec:** [docs/spec.md](../../spec.md) — sections 3 (Versioning, Requirements), 4 (`mesh.yaml`), 5.2 (`brain.yaml`), 8 (`--json`), 9.3, 10. Breakdown: [v0-breakdown.md](../../plan/v0-breakdown.md) chunk 2. Research: [chunk 1](../../research/2026-11-chunk-01-research.md) sections 4 and 5.

## Global Constraints

- Requirements: "Node 22 LTS or newer, git, and an installed and logged-in GitHub CLI (`gh`)". `engines.node` is `">=22.12.0"` (commander 15 and Vitest 5 need it).
- Package: npm name `brain-mesh`, licence `Apache-2.0`, `"type": "module"`, bin `brain-mesh` → `dist/cli.js`, version `0.0.0` in this chunk.
- Invocation: "generated instructions and skills invoke the CLI as `npx -y brain-mesh@<pinned>`" — the package must run through `npx` with no global install.
- "Every command supports `--json` for agents."
- Libraries: `commander`, `zod`, `yaml`, `mdast-util-from-markdown`, `execa`; pinned versions: commander `^15.1.0`, zod `^4.6.7`, yaml `^2.9.1`, execa `^10.2.1`, vitest `^5.1.1`, typescript `^7.0.2`, @types/node `^22.20.5`.
- "Windows and Linux are first-class … paths handled with Node's `path`." Tests and CI run on both.
- "CLI: unit and integration tests (Vitest) against fixture brains and fixture workspaces in temp dirs, run in CI on Windows and Linux."
- Line endings: the repo keeps `.gitattributes` `* text=auto eol=lf`; all generated files are LF.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `--json` with a usage error (unknown command, unknown option, missing command) still prints exactly one JSON envelope on stdout and nothing on stderr; an agent parsing stdout must never see commander's text. *(Task 2 tests)*
2. `--json` written after `--` is a positional argument, not the flag. *(Task 2 test `json after -- is not the flag`)*
3. A hand-edited `mesh.yaml` saved with CRLF line endings on Windows parses and validates exactly like the LF version. *(Task 3 test `CRLF input validates`)*
4. Non-ASCII text in `name` and `description` (e.g. `Plattform-Team Ü`) validates. *(Task 3 test `non-ASCII text validates`)*
5. Paths with spaces: this repo lives under `ai brain-mesh/`; the packed tarball and the `npx` working directory both contain a space. *(Task 5 e2e uses a temp dir with a space)*

---

## File Structure

```
brain-mesh/
├── package.json, package-lock.json, tsconfig.json, vitest.config.ts
├── LICENSE, README.md, .gitignore (extended)
├── .github/workflows/ci.yml
├── schemas/
│   ├── mesh.schema.json          # generated, file snapshot (Task 3)
│   └── brain.schema.json         # generated, file snapshot (Task 3)
├── src/
│   ├── cli.ts                    # bin entry: process glue only
│   ├── main.ts                   # main(): program build, parse, dispatch, emit
│   ├── output.ts                 # envelope types, CliError, codes, emit functions
│   ├── meta.ts                   # packageVersion()
│   ├── commands/
│   │   ├── index.ts              # defaultCommands
│   │   └── version.ts            # versionCommand
│   └── schemas/
│       ├── common.ts             # BrainId, GitHubLogin, Owner, SemVer
│       ├── mesh.ts               # MeshConfigSchema
│       ├── brain.ts              # BrainManifestSchema
│       └── json-schema.ts        # jsonSchemaFiles()
└── test/
    ├── tsconfig.json
    ├── helpers/
    │   ├── io.ts                 # captureIo()
    │   ├── fixtures.ts           # tempDir(), writeTree(), fixture()
    │   └── fixtures.test.ts
    ├── fixtures/workspace-minimal/   # mesh.yaml + two brains
    ├── unit/
    │   ├── meta.test.ts
    │   ├── main.test.ts
    │   └── schemas/{mesh,brain,json-schema,fixtures}.test.ts
    └── e2e/
        ├── setup.ts              # globalSetup: npm pack into a dir with a space
        ├── npx.test.ts
        └── hook-mechanism.test.ts
```

Execution starts on a new branch `chunk-02-foundation` off `main`.

---

### Task 1: Package scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `test/tsconfig.json`, `vitest.config.ts`, `LICENSE`, `README.md`, `src/meta.ts`, `test/unit/meta.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `packageVersion(): string` in `src/meta.ts`; npm scripts `build`, `typecheck`, `test`, `test:unit`, `test:e2e`; Vitest projects `unit` and `e2e`.

- [ ] **Step 1: Write `package.json`, configs, LICENSE, README, `.gitignore`**

`package.json`: name, version `0.0.0`, description `Personal and shared AI brains as markdown in git.`, `license`, `type`, `bin`, `engines` per Global Constraints; `"files": ["dist", "schemas"]`; scripts:

```json
{
  "build": "tsc -p tsconfig.json",
  "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p test/tsconfig.json --noEmit",
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:e2e": "vitest run --project e2e",
  "prepack": "npm run build"
}
```

Dependencies `commander`, `zod`, `yaml`; devDependencies `typescript`, `vitest`, `execa`, `@types/node` (versions from Global Constraints). Install with `npm install` so `package-lock.json` is created.

`tsconfig.json`: `target` `ES2023`, `module`/`moduleResolution` `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `skipLibCheck`, `rootDir` `src`, `outDir` `dist`, `include` `["src"]`. `test/tsconfig.json` extends it with `noEmit`, `rootDir` `..`, `include` `["**/*.ts", "../src/**/*.ts", "../vitest.config.ts"]`.

`vitest.config.ts`: two `test.projects`: `unit` (include `test/unit/**/*.test.ts`, `test/helpers/**/*.test.ts`) and `e2e` (include `test/e2e/**/*.test.ts`, `globalSetup: 'test/e2e/setup.ts'`, `testTimeout: 180_000`, `hookTimeout: 180_000`).

`.gitignore` gains `node_modules/`, `dist/`, `*.tgz`, `coverage/`.

`LICENSE`: the Apache 2.0 text from `gh api /licenses/apache-2.0 --jq .body`. `README.md`: one paragraph on what brain-mesh is (link to `docs/spec.md`) and a Development section listing the npm scripts.

- [ ] **Step 2: Check the toolchain**

Run: `npx tsc --version`
Expected: `Version 7.0.x`

- [ ] **Step 3: Write the failing test `test/unit/meta.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../src/meta.js';

describe('packageVersion', () => {
  it('returns the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(packageVersion()).toBe(pkg.version);
    expect(packageVersion()).toBe('0.0.0');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot resolve `../../src/meta.js`.

- [ ] **Step 5: Implement `packageVersion(): string` in `src/meta.ts`**

Read `new URL('../package.json', import.meta.url)` once (both `src/meta.ts` and `dist/meta.js` sit one level below the package root) and return its `version`.

- [ ] **Step 6: Verify**

Run: `npm run test:unit; npm run typecheck; npm run build`
Expected: 1 test passes; typecheck clean; `dist/meta.js` exists.

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json test/tsconfig.json vitest.config.ts LICENSE README.md src/meta.ts test/unit/meta.test.ts
git commit -m "build: scaffold TypeScript ESM package with Vitest"
```

---

### Task 2: Output contract, `main`, `version` command

**Files:**
- Create: `src/output.ts`, `src/main.ts`, `src/cli.ts`, `src/commands/index.ts`, `src/commands/version.ts`, `test/helpers/io.ts`, `test/unit/main.test.ts`

**Interfaces:**
- Consumes: `packageVersion()` (Task 1).
- Produces, in `src/output.ts`:

```ts
export const ErrorCode = { Usage: 'E_USAGE', Internal: 'E_INTERNAL' } as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export const ExitCode = { Ok: 0, Failure: 1, Usage: 2 } as const;
export interface Warning { code: string; message: string }
export interface CommandOutput<T = unknown> { data: T; text: string; warnings?: Warning[] }
export interface SuccessEnvelope<T = unknown> { ok: true; command: string; data: T; warnings: Warning[] }
export interface ErrorEnvelope { ok: false; command: string | null; error: { code: string; message: string } }
export class CliError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode: number = ExitCode.Failure);
}
export interface Io { out(text: string): void; err(text: string): void }
export function emitSuccess(io: Io, json: boolean, command: string, output: CommandOutput): void;
export function emitError(io: Io, json: boolean, command: string | null, error: CliError): void;
```

`code` is typed `string` on `CliError` and the envelope so later chunks add their own stable codes (`E_…`) without touching this file; `ErrorCode` lists the two this chunk uses.

- Produces, in `src/main.ts`:

```ts
export interface CommandContext { cwd: string; json: boolean; io: Io }
export interface CommandDef {
  name: string;                                   // single word; nested commands (`brain new`) arrive in chunk 9
  description: string;
  configure?(cmd: Command): void;                 // add arguments and options
  run(ctx: CommandContext, args: string[], opts: Record<string, unknown>): Promise<CommandOutput>;
}
export function main(argv: readonly string[], io: Io,
  options?: { cwd?: string; commands?: readonly CommandDef[] }): Promise<number>;
```

`argv` is `process.argv.slice(2)`. Defaults: `cwd` = `process.cwd()`, `commands` = `defaultCommands` from `src/commands/index.ts`.

- Produces: `versionCommand: CommandDef` with data `{ version: string; node: string; platform: string }` and text `brain-mesh <version>`.

**The contract (decided here, binding for every later command):**

- JSON mode is on when `--json` appears in `argv` before any `--`. It is also registered as a global commander option so it is accepted before or after the subcommand.
- JSON mode writes exactly one line to stdout: `JSON.stringify(envelope) + '\n'`, and nothing to stderr. Success → `SuccessEnvelope`; failure → `ErrorEnvelope`.
- Human mode: success writes `text + '\n'` to stdout and each warning as `brain-mesh: warning: <message>\n` to stderr; failure writes `brain-mesh: error: <message>\n` to stderr only.
- `command` is the subcommand name once commander has reached it (track it with a `preSubcommand` hook), otherwise `null`.
- No command at all (`argv` empty once `--json` is removed) is checked before parsing → `E_USAGE` with message `missing command`, exit 2.
- Commander runs with `exitOverride()` and `configureOutput({ writeOut: io.out, writeErr: () => {}, outputError: () => {} })`. Its `CommanderError`s map to: `commander.helpDisplayed`, `commander.help` and `commander.version` → exit 0 (help or version text goes to stdout, also in JSON mode); every other code → `CliError(E_USAGE, message without a leading "error: ", 2)`.
- Any other thrown value → `E_INTERNAL`, exit 1, message `String(err.message ?? err)`; the stack goes to stderr only when `BRAIN_MESH_DEBUG=1`.
- `program.version(packageVersion())` keeps `--version` for humans; `version --json` is the agent path.

- [ ] **Step 1: Write `test/helpers/io.ts`**

`captureIo(): Io & { stdout(): string; stderr(): string }` collecting writes into two strings.

- [ ] **Step 2: Write the failing tests `test/unit/main.test.ts`**

```ts
const run = async (argv: string[], commands?: CommandDef[]) => {
  const io = captureIo();
  const code = await main(argv, io, { cwd: process.cwd(), commands });
  return { code, out: io.stdout(), err: io.stderr() };
};
const envelope = (out: string) => {
  expect(out.endsWith('\n')).toBe(true);
  expect(out.trimEnd().includes('\n')).toBe(false);
  return JSON.parse(out);
};
const versionData = { version: '0.0.0', node: process.version, platform: process.platform };

it('version --json prints one success envelope', async () => {
  const r = await run(['version', '--json']);
  expect(r.code).toBe(0);
  expect(envelope(r.out)).toEqual({ ok: true, command: 'version', data: versionData, warnings: [] });
  expect(r.err).toBe('');
});
it('--json before the command works the same', async () => {
  const r = await run(['--json', 'version']);
  expect(envelope(r.out)).toEqual({ ok: true, command: 'version', data: versionData, warnings: [] });
});
it('version without --json prints text', async () => {
  const r = await run(['version']);
  expect(r).toEqual({ code: 0, out: 'brain-mesh 0.0.0\n', err: '' });
});
it('unknown command in json mode is a usage envelope', async () => {
  const r = await run(['nope', '--json']);
  expect(r.code).toBe(2);
  const e = envelope(r.out);
  expect(e).toMatchObject({ ok: false, command: null, error: { code: 'E_USAGE' } });
  expect(e.error.message).toContain('nope');
  expect(e.error.message.startsWith('error:')).toBe(false);
  expect(r.err).toBe('');
});
it('unknown option names the command it belongs to', async () => {
  const r = await run(['version', '--bogus', '--json']);
  expect(r.code).toBe(2);
  expect(envelope(r.out)).toMatchObject({ ok: false, command: 'version', error: { code: 'E_USAGE' } });
});
it('missing command is a usage error', async () => {
  const r = await run(['--json']);
  expect(r.code).toBe(2);
  expect(envelope(r.out)).toMatchObject({ ok: false, command: null, error: { code: 'E_USAGE', message: 'missing command' } });
});
it('usage error without --json goes to stderr as one line', async () => {
  const r = await run(['nope']);
  expect(r.code).toBe(2);
  expect(r.out).toBe('');
  expect(r.err).toMatch(/^brain-mesh: error: .*nope.*\n$/);
});
it('json after -- is not the flag', async () => {
  const echo: CommandDef = { name: 'echo', description: 'test', configure: c => c.argument('[rest...]'),
    run: async (_ctx, args) => ({ data: args, text: String(args) }) };
  const r = await run(['echo', '--', '--json'], [echo]);
  expect(r.code).toBe(0);
  expect(r.out).not.toContain('"ok"');
});
it('a thrown error becomes E_INTERNAL', async () => {
  const boom: CommandDef = { name: 'boom', description: 'test', run: async () => { throw new Error('kaputt'); } };
  const r = await run(['boom', '--json'], [boom]);
  expect(r.code).toBe(1);
  expect(envelope(r.out)).toEqual({ ok: false, command: 'boom', error: { code: 'E_INTERNAL', message: 'kaputt' } });
});
it('a CliError keeps its code and exit code', async () => {
  const fail: CommandDef = { name: 'fail', description: 'test', run: async () => { throw new CliError('E_TEST', 'nein', 3); } };
  const r = await run(['fail', '--json'], [fail]);
  expect(r.code).toBe(3);
  expect(envelope(r.out).error).toEqual({ code: 'E_TEST', message: 'nein' });
});
it('warnings go into the envelope in json mode and to stderr otherwise', async () => {
  const warn: CommandDef = { name: 'warn', description: 'test',
    run: async () => ({ data: null, text: 'done', warnings: [{ code: 'W_TEST', message: 'careful' }] }) };
  expect(envelope((await run(['warn', '--json'], [warn])).out).warnings).toEqual([{ code: 'W_TEST', message: 'careful' }]);
  const human = await run(['warn'], [warn]);
  expect(human).toEqual({ code: 0, out: 'done\n', err: 'brain-mesh: warning: careful\n' });
});
it('--help exits 0 and writes to stdout', async () => {
  const r = await run(['--help']);
  expect(r.code).toBe(0);
  expect(r.out).toContain('version');
  expect(r.err).toBe('');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm run test:unit -- test/unit/main.test.ts`
Expected: FAIL — modules `src/main.js`, `src/output.js` not found.

- [ ] **Step 4: Implement `src/output.ts`, `src/main.ts`, `src/commands/version.ts`, `src/commands/index.ts`**

`main` builds a fresh `Command` per call (no shared state between calls), registers each `CommandDef` with `program.command(def.name).description(def.description)`, applies `configure`, and sets an action that calls `def.run(ctx, cmd.args, cmd.opts())`. Parse with `program.parseAsync([...argv], { from: 'user' })`.

- [ ] **Step 5: Implement `src/cli.ts`**

```ts
#!/usr/bin/env node
import { main } from './main.js';
process.exitCode = await main(process.argv.slice(2), {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
});
```

- [ ] **Step 6: Verify**

Run: `npm run test:unit; npm run typecheck; npm run build; node dist/cli.js version --json`
Expected: all unit tests pass; typecheck clean; last command prints `{"ok":true,"command":"version","data":{"version":"0.0.0",…},"warnings":[]}`.

- [ ] **Step 7: Commit**

```bash
git add src test/helpers/io.ts test/unit/main.test.ts
git commit -m "feat: CLI entry with --json output contract and version command"
```

---

### Task 3: Schemas for `mesh.yaml` and `brain.yaml`

**Files:**
- Create: `src/schemas/common.ts`, `src/schemas/mesh.ts`, `src/schemas/brain.ts`, `src/schemas/json-schema.ts`, `schemas/mesh.schema.json`, `schemas/brain.schema.json`, `test/unit/schemas/mesh.test.ts`, `test/unit/schemas/brain.test.ts`, `test/unit/schemas/json-schema.test.ts`

**Interfaces:**
- Produces:

```ts
// common.ts
export const BrainId: z.ZodString;      // /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max 100 (GitHub repo name limit)
export const GitHubLogin: z.ZodString;  // /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
export const Owner: z.ZodString;        // "@login" or "@org/team": /^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/
export const SemVer: z.ZodString;       // /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
// mesh.ts
export const MountSchema;               // { id: BrainId, url?: non-empty string, mode: 'read' | 'contribute' }
export const MeshConfigSchema;          // { version: 1, brain_mesh: SemVer, user: GitHubLogin, mounts: Mount[] (default []) }
export type MeshConfig = z.infer<typeof MeshConfigSchema>;
export type Mount = z.infer<typeof MountSchema>;
// brain.ts
export const BrainManifestSchema;       // discriminated union on `type`, see below
export type BrainManifest = z.infer<typeof BrainManifestSchema>;
// json-schema.ts
export function jsonSchemaFiles(): { 'mesh.schema.json': string; 'brain.schema.json': string };
```

All object schemas are `z.strictObject` (unknown keys are errors, so a typo like `mount:` is caught). Duplicate mount ids, `personal` as a mount id and range checks on `requires` are `doctor` checks in chunk 3, not schema rules.

`BrainManifestSchema` fields shared by both variants: `name` (non-empty string), `description` (non-empty string; required — "the main routing signal"), `topics` (optional array of `BrainId`-shaped strings), `out_of_scope` (optional string), `schema` (positive integer; a value above the supported one is reported by `doctor`, not rejected here), `requires` (optional non-empty string), `links_to` (optional array of `BrainId`).
- `type: 'shared'`: `id` = `BrainId` refined to not equal `personal`; `owner` = `Owner`; `policies: { people: 'accountability' }`.
- `type: 'personal'`: `id: 'personal'`; `owner` = `Owner` without a team part (`/^@[A-Za-z0-9][A-Za-z0-9-]*$/`); `policies: { people: 'none' }`.

`jsonSchemaFiles()` uses `z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' })`, adds a `title` (`brain-mesh mesh.yaml` / `brain-mesh brain.yaml`), and returns `JSON.stringify(result, null, 2) + '\n'`. The `$id`/published URL is chosen with the templates in chunk 5.

- [ ] **Step 1: Write the failing tests**

`test/unit/schemas/mesh.test.ts` (parse YAML with `yaml`'s `parse`, then `safeParse`):

```ts
const valid = `version: 1
brain_mesh: 0.4.2
user: ramon
mounts:
  - id: brain-team-platform
    url: git@github.com:acme/brain-team-platform.git
    mode: contribute
  - id: brain-ideas
    mode: contribute
`;
it('accepts the spec example', () => expect(MeshConfigSchema.safeParse(parse(valid)).success).toBe(true));
it('CRLF input validates', () =>
  expect(MeshConfigSchema.parse(parse(valid.replace(/\n/g, '\r\n')))).toEqual(MeshConfigSchema.parse(parse(valid))));
it('mounts default to an empty list', () =>
  expect(MeshConfigSchema.parse({ version: 1, brain_mesh: '0.0.0', user: 'ramon' }).mounts).toEqual([]));
it('rejects an unknown top-level key and names it', () => {
  const r = MeshConfigSchema.safeParse({ version: 1, brain_mesh: '0.0.0', user: 'ramon', mount: [] });
  expect(r.success).toBe(false);
  expect(r.error!.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: ['mount'], path: [] });
});
it.each([
  ['bad mode', { mounts: [{ id: 'a', mode: 'write' }] }, ['mounts', 0, 'mode']],
  ['uppercase id', { mounts: [{ id: 'Brain-A', mode: 'read' }] }, ['mounts', 0, 'id']],
  ['bad pin', { brain_mesh: 'latest' }, ['brain_mesh']],
  ['version 2', { version: 2 }, ['version']],
  ['login with underscore', { user: 'ra_mon' }, ['user']],
])('rejects %s', (_n, patch, path) => {
  const r = MeshConfigSchema.safeParse({ version: 1, brain_mesh: '0.0.0', user: 'ramon', ...patch });
  expect(r.success).toBe(false);
  expect(r.error!.issues[0]!.path).toEqual(path);
});
```

`test/unit/schemas/brain.test.ts`:

```ts
const shared = { id: 'brain-team-platform', name: 'Platform Team', type: 'shared',
  description: 'CI/CD, build infrastructure, developer tooling, runners.', topics: ['ci', 'build'],
  out_of_scope: 'Application monitoring and on-call; see brain-sre.', schema: 1, requires: '>=0.3',
  owner: '@acme/platform', policies: { people: 'accountability' }, links_to: ['brain-handbook'] };
const personal = { id: 'personal', name: 'Ramon', type: 'personal', description: 'My notes.',
  schema: 1, owner: '@ramon', policies: { people: 'none' } };
it('accepts the spec shared example', () => expect(BrainManifestSchema.safeParse(shared).success).toBe(true));
it('accepts a personal brain', () => expect(BrainManifestSchema.safeParse(personal).success).toBe(true));
it('non-ASCII text validates', () =>
  expect(BrainManifestSchema.safeParse({ ...shared, name: 'Plattform-Team Ü', description: 'Läufer und Caches' }).success).toBe(true));
it.each([
  ['missing description', { ...shared, description: undefined }],
  ['empty description', { ...shared, description: '' }],
  ['shared brain named personal', { ...shared, id: 'personal' }],
  ['personal brain with another id', { ...personal, id: 'mine' }],
  ['personal brain with a team owner', { ...personal, owner: '@acme/team' }],
  ['shared brain without people policy', { ...shared, policies: { people: 'none' } }],
  ['unknown key', { ...shared, maintainers: [] }],
  ['schema 0', { ...shared, schema: 0 }],
  ['unknown type', { ...shared, type: 'team' }],
])('rejects %s', (_n, input) => expect(BrainManifestSchema.safeParse(input).success).toBe(false));
it('accepts a schema newer than this core', () =>
  expect(BrainManifestSchema.safeParse({ ...shared, schema: 7 }).success).toBe(true));
```

`test/unit/schemas/json-schema.test.ts`:

```ts
it('mesh.schema.json is up to date', async () =>
  expect(jsonSchemaFiles()['mesh.schema.json']).toMatchFileSnapshot('../../../schemas/mesh.schema.json'));
it('brain.schema.json is up to date', async () =>
  expect(jsonSchemaFiles()['brain.schema.json']).toMatchFileSnapshot('../../../schemas/brain.schema.json'));
it('schemas are draft 2020-12 with a title', () => {
  for (const text of Object.values(jsonSchemaFiles())) {
    const s = JSON.parse(text);
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.title).toMatch(/^brain-mesh /);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- test/unit/schemas`
Expected: FAIL — schema modules not found.

- [ ] **Step 3: Implement the four schema modules**

- [ ] **Step 4: Generate the JSON Schema files**

Run: `npx vitest run --project unit -u test/unit/schemas/json-schema.test.ts`
Expected: `schemas/mesh.schema.json` and `schemas/brain.schema.json` written. Open both: `brain.schema.json` must show the two variants under `oneOf` or `anyOf` with `type` as `const`, and `mesh.schema.json` must have `additionalProperties: false` on its objects. If zod's output lacks either, fix the schema, not the JSON file.

- [ ] **Step 5: Verify (snapshots are now checked, not written)**

Run: `npm run test:unit; npm run typecheck`
Expected: all pass. Changing a schema later without `-u` makes the snapshot test fail; in CI (`CI=true`) Vitest never writes snapshots.

- [ ] **Step 6: Commit**

```bash
git add src/schemas schemas test/unit/schemas
git commit -m "feat: zod schemas and JSON Schemas for mesh.yaml and brain.yaml"
```

---

### Task 4: Fixture harness

**Files:**
- Create: `test/helpers/fixtures.ts`, `test/helpers/fixtures.test.ts`, `test/fixtures/workspace-minimal/**`, `test/unit/schemas/fixtures.test.ts`

**Interfaces:**
- Consumes: `MeshConfigSchema`, `BrainManifestSchema` (Task 3).
- Produces, in `test/helpers/fixtures.ts`:

```ts
export function tempDir(prefix?: string): Promise<string>;   // mkdtemp under os.tmpdir(), default prefix 'brain-mesh-';
                                                              // removed via onTestFinished (rm recursive, force, maxRetries 5)
export function writeTree(root: string, tree: Record<string, string>): Promise<void>;
                                                              // keys are posix relative paths; creates parent dirs; writes UTF-8 as given;
                                                              // throws on absolute keys or keys containing a '..' segment
export function fixture(name: string): Promise<string>;      // copies test/fixtures/<name>/ into a fresh tempDir(), returns that root
export const FIXTURES_DIR: string;                            // absolute path of test/fixtures
```

Fixture `workspace-minimal/` contents (chunk 3 adds notes; this chunk only needs valid config):

```
mesh.yaml                         # version 1, brain_mesh 0.0.0, user octo-user,
                                  # mounts: brain-team-platform (url https://github.com/acme/brain-team-platform.git, contribute),
                                  #         brain-ideas (no url, contribute)
brains/personal/brain.yaml        # personal, owner "@octo-user", policies.people none
brains/personal/AGENTS.md         # "# Personal brain\n"
brains/personal/CLAUDE.md         # "@AGENTS.md\n"
brains/brain-team-platform/brain.yaml   # shared, owner "@acme/platform", policies.people accountability
brains/brain-team-platform/AGENTS.md
brains/brain-team-platform/CLAUDE.md
brains/brain-ideas/brain.yaml     # shared, owner "@octo-user"
brains/brain-ideas/AGENTS.md
brains/brain-ideas/CLAUDE.md
```

- [ ] **Step 1: Write the failing tests**

`test/helpers/fixtures.test.ts`:

```ts
let removed: string;
it('fixture copies into a temp dir and leaves the original alone', async () => {
  const root = await fixture('workspace-minimal');
  removed = root;
  expect(root.startsWith(tmpdir())).toBe(true);
  await writeFile(join(root, 'mesh.yaml'), 'changed');
  expect(await readFile(join(FIXTURES_DIR, 'workspace-minimal', 'mesh.yaml'), 'utf8')).not.toBe('changed');
});
it('removes the temp dir after the test', () => expect(existsSync(removed)).toBe(false));
it('writeTree creates nested files', async () => {
  const root = await tempDir();
  await writeTree(root, { 'brains/x/notes/a.md': '# A\n' });
  expect(await readFile(join(root, 'brains', 'x', 'notes', 'a.md'), 'utf8')).toBe('# A\n');
});
it.each(['../escape.md', 'a/../../escape.md', '/abs.md'])('writeTree rejects %s', async (key) => {
  const root = await tempDir();
  await expect(writeTree(root, { [key]: '' })).rejects.toThrow();
});
```

`test/unit/schemas/fixtures.test.ts`: walk `FIXTURES_DIR` recursively; every `mesh.yaml` must `MeshConfigSchema.parse` and every `brain.yaml` must `BrainManifestSchema.parse`; assert at least one of each was found.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- test/helpers test/unit/schemas/fixtures.test.ts`
Expected: FAIL — `test/helpers/fixtures.js` not found.

- [ ] **Step 3: Implement `test/helpers/fixtures.ts` and create the fixture files**

- [ ] **Step 4: Verify**

Run: `npm run test:unit; npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add test/helpers/fixtures.ts test/helpers/fixtures.test.ts test/fixtures test/unit/schemas/fixtures.test.ts
git commit -m "test: fixture harness with temp dirs and a minimal workspace fixture"
```

---

### Task 5: End-to-end: `npx` from a packed build, hook mechanism

**Files:**
- Create: `test/e2e/setup.ts`, `test/e2e/npx.test.ts`, `test/e2e/hook-mechanism.test.ts`

**Interfaces:**
- Consumes: the built package (Task 1 `prepack`), `tempDir()` (Task 4).
- Produces: `inject('tarball')` — absolute path of the packed `.tgz`, provided by the global setup.

`test/e2e/setup.ts` exports a Vitest `globalSetup` default function: create `mkdtemp(join(tmpdir(), 'bm pack-'))` (note the space), run `npm pack --pack-destination <dir>` with `execa` in the repo root (this runs `prepack` → build), `provide('tarball', <dir>/brain-mesh-0.0.0.tgz)`, and remove the directory in the returned teardown. Declare `tarball: string` in a `declare module 'vitest' { interface ProvidedContext … }` block.

- [ ] **Step 1: Write the failing tests**

`test/e2e/npx.test.ts`:

```ts
it('runs version --json through npx from the packed tarball, cold then cached', async () => {
  const tarball = inject('tarball');
  const cwd = await tempDir('bm e2e-');                  // contains a space
  const env = { ...process.env, npm_config_cache: join(cwd, 'npm cache'), npm_config_update_notifier: 'false' };
  const timed = async () => {
    const t0 = performance.now();
    const r = await execa('npx', ['-y', '--package', tarball, 'brain-mesh', 'version', '--json'], { cwd, env });
    return { r, ms: Math.round(performance.now() - t0) };
  };
  const cold = await timed();
  const cached = await timed();
  for (const { r } of [cold, cached]) {
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, command: 'version', data: { version: '0.0.0' } });
  }
  console.log(`npx timing on ${process.platform}: cold ${cold.ms} ms, cached ${cached.ms} ms`);
  expect(cached.ms).toBeLessThan(15_000);
});
it('exits 2 with a usage envelope through the bin', async () => {
  const r = await execa('npx', ['-y', '--package', inject('tarball'), 'brain-mesh', 'nope', '--json'],
    { cwd: await tempDir('bm e2e-'), reject: false });
  expect(r.exitCode).toBe(2);
  expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 'E_USAGE' } });
});
```

`test/e2e/hook-mechanism.test.ts` — proves the chunk 1 hook design on each CI OS; chunk 6 replaces it with the real hook:

```ts
it('a sh pre-commit hook calling node warns on stderr and never blocks', async () => {
  const repo = await tempDir('bm hook-');
  const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(repo, '.gitconfig-empty') };
  await writeTree(repo, {
    '.gitconfig-empty': '',
    '.githooks/pre-commit': '#!/bin/sh\nexec node "$(dirname "$0")/warn.mjs"\n',
    '.githooks/warn.mjs': "process.stderr.write('brain-mesh: warning: mixed commit\\n');\n",
    'a.md': '# A\n',
  });
  await chmod(join(repo, '.githooks', 'pre-commit'), 0o755);
  const git = (...args: string[]) => execa('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: repo, env: gitEnv });
  await git('init', '-q');
  await git('config', 'core.hooksPath', '.githooks');
  await git('add', 'a.md');
  const r = await git('commit', '-q', '-m', 'test');
  expect(r.exitCode).toBe(0);
  expect(r.stderr).toContain('brain-mesh: warning: mixed commit');
  expect((await git('rev-list', '--count', 'HEAD')).stdout).toBe('1');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:e2e`
Expected: FAIL — `test/e2e/setup.ts` does not exist yet, or `inject('tarball')` is undefined.

- [ ] **Step 3: Implement `test/e2e/setup.ts`**

- [ ] **Step 4: Verify**

Run: `npm run test:e2e`
Expected: 3 tests pass; the log shows `npx timing on win32: cold … ms, cached … ms`. If `execa('npx', …)` cannot spawn on Windows, debug it (systematic-debugging) rather than skipping the test on Windows.

- [ ] **Step 5: Commit**

```bash
git add test/e2e
git commit -m "test: e2e npx run from packed tarball and pre-commit hook mechanism"
```

---

### Task 6: CI on Windows and Linux

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `docs/plan/v0-breakdown.md` (chunk 2 line under "Checks carried from chunk 1"), `docs/research/2026-11-chunk-01-research.md` (Q4.3, Q4.4 Linux results)

**Interfaces:**
- Consumes: npm scripts from Task 1.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

- Triggers: `push` to `main`, `pull_request`, `workflow_dispatch`.
- `permissions: contents: read`; `concurrency` per ref with `cancel-in-progress: true`.
- Job `test`, `strategy.fail-fast: false`, matrix `os: [ubuntu-latest, windows-latest]` × `node: [22.x, 24.x]`.
- Steps: `actions/checkout@v7`; `actions/setup-node@v7` with `node-version: ${{ matrix.node }}` and `cache: npm`; `npm ci`; `npm run typecheck`; `npm run build`; `npm test`.

- [ ] **Step 2: Run the whole suite locally once more**

Run: `npm run typecheck; npm test`
Expected: all unit and e2e tests pass.

- [ ] **Step 3: Commit and push the branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: test on Windows and Linux with Node 22 and 24"
git push -u origin chunk-02-foundation
```

- [ ] **Step 4: Watch CI**

Run: `gh run watch --exit-status $(gh run list --branch chunk-02-foundation --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: all four matrix jobs green. A failure is debugged and fixed with a new commit, never by removing an OS or Node version from the matrix.

- [ ] **Step 5: Record the Linux results**

From the Ubuntu job logs (`gh run view <id> --log | grep "npx timing"`), copy the cold and cached timings and the hook test result. In `v0-breakdown.md`, mark the chunk 2 carried check done with those numbers and the run URL. In the research note, add one sentence each to Q4.3 (hook verified on Linux in CI) and Q4.4 (Linux timings).

- [ ] **Step 6: Commit and push**

```bash
git add docs/plan/v0-breakdown.md docs/research/2026-11-chunk-01-research.md
git commit -m "docs: record Linux hook and npx results from CI"
git push
```

Done when: the chunk's "done when" holds — `npx` runs `version --json` from the packed build (Task 5), the output is a valid envelope (Tasks 2, 5), and CI is green on both OSes (Task 6).

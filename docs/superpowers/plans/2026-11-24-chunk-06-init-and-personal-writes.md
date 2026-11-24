# Chunk 6: `init` (new) and Personal Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `brain-mesh init` in an empty folder creates a workspace: personal brain, `tools/` scaffold, rendered managed files, the mixed-commit pre-commit hook, a first commit, and a private repo in the user's namespace that the commit is pushed to. A new `brain-mesh commit` command writes the personal brain the spec 7.2 way: only `brains/personal/` paths are committed, then it pulls with rebase and pushes.

**Architecture:**
- `createWorkspace` is a library function that writes `mesh.yaml`, the personal brain and the `tools/` scaffold into an empty folder, then calls chunk 5's `renderWorkspace`. It doesn't touch git or the network.
- The `init` command handles the order of side effects:
  1. it checks everything that can fail before writing anything;
  2. it creates the empty remote repo;
  3. it builds the workspace locally and commits;
  4. it enables the hook and pushes.
- GitHub calls go through a small `Host` interface (`login`, `createPrivateRepo`) with a `gh` implementation and a fake for tests. Chunk 8 extends this into the full host adapter.
- The hook is a thin `sh` wrapper around a Node script. Both are core templates rendered into `.mesh/hooks/` as managed entries.

**Tech Stack:** TypeScript ESM, Node ≥22.12, `execa` (git and gh), `commander`, Vitest 5. No new dependencies.

**Spec:** [docs/spec.md](../../spec.md):
- 3: Requirements, `gh auth status` first, user-namespace repos and `--remote`;
- 4: tree, "Creating and restoring", managed vs user files;
- 4.2: the `tools/` scaffold;
- 7.1: "Keep information and infrastructure apart";
- 7.2: the personal row, mixed-commit warning;
- 8: the `init` row;
- 9.3: `.gitattributes`;
- 9.4: create repo through the adapter.

Also: [chunk 1 research](../../research/2026-11-chunk-01-research.md):
- Q3.1, Q3.2: the `gh repo create` row;
- Q4.3: hook design;
- Q4.4: `npx` warm-up.

Also: breakdown [v0-breakdown.md](../../plan/v0-breakdown.md), chunk 6 and "Checks carried from chunk 1"; ADRs [0002](../../adr/0002-workspace-and-personal-brain-share-one-repo.md) and [0003](../../adr/0003-code-in-workspaces-never-in-brains.md).

## Global Constraints

- Node 22 LTS or newer; no new runtime dependency. Requirements are git and an installed, logged-in `gh`; the default `gh auth login` scopes are enough.
- Windows and Linux are first-class. Paths go through Node's `path`, and git paths are POSIX. Workspace paths may contain spaces (the dogfood parent folder is `ai brain-mesh`).
- `init` writes `.gitattributes` (`* text=auto eol=lf`) before its first commit.
- The workspace repo is private, in the user's own namespace, and named `ai-workspace` by default; `--remote <url>` uses an existing repo instead.
- The pre-commit hook lives in `.mesh/hooks/`, is enabled with `git config core.hooksPath .mesh/hooks`, is a `#!/bin/sh` wrapper that calls `node`, and warns on stderr but never blocks (always `exit 0`).
- Personal writes commit only paths under `brains/personal/`.
- Upgrades never touch `tools/` or `.local/` (spec 4). The `tools/` scaffold has one `package.json` for TypeScript and Vitest, run with `npm test`.
- Every command keeps the `--json` envelope contract from chunk 2. New error codes are `E_…` and new warning codes are `W_…`, both added to `src/output.ts`.
- Determinism: generated text uses `\n`, is sorted by code-unit order where it lists things, and contains no timestamps.

## Rulings in this plan

1. **Restore stays in chunk 9.** If `init` finds a `mesh.yaml` in the folder, it fails with `E_NOT_SUPPORTED` ("restoring an existing workspace is not supported yet"). Any other non-empty folder fails with `E_NOT_EMPTY`. Only an empty folder is accepted (no entries at all, dotfiles included).
2. **The remote repo comes first.** `init` runs `gh repo create <name> --private` (no `--source`) before it writes a single file, then adds `origin` and pushes at the end. If repo creation fails, the folder is still empty, so a rerun with `--remote` or `--name` works. This deviates from research Q3.2's one-shot `--source=. --push` form for exactly that reason.
3. **`--name <repo>`** (default `ai-workspace`) is added to `init`. It is needed when the default name is taken, and for the acceptance check. Using it together with `--remote` is a usage error.
4. **Clone URL protocol** follows `gh config get git_protocol`: `ssh` gives `git@github.com:<owner>/<name>.git`; anything else gives `https://github.com/<owner>/<name>.git`. This is how spec 3's "git transport uses the user's existing git setup" applies.
5. **`--remote <url>` must be reachable and empty.** `git ls-remote <url>` must succeed and print nothing; otherwise `E_GIT` (unreachable) or `E_REMOTE_NOT_EMPTY`, and nothing is written.
6. **Checks before side effects, in this order:**
   1. folder empty;
   2. `git var GIT_COMMITTER_IDENT` succeeds, else `E_GIT` with "set git config user.name and user.email";
   3. `host.login()`;
   4. remote check (Ruling 5) or repo creation.
7. **Branch `main`** (`git init -q -b main`). The first commit is `Create brain-mesh workspace`. The hook is enabled *after* the first commit, which mixes personal and other files on purpose.
8. **A push failure after the commit** fails with `E_GIT`. The message says the workspace is committed locally and tells the user to run `git push -u origin main`. The folder is left as it is.
9. **`mesh.yaml` header:** `# yaml-language-server: $schema=https://unpkg.com/brain-mesh/schemas/mesh.schema.json`. It is unversioned like `brain.yaml`'s (chunk 5 Ruling 11), so the user-owned file never needs rewriting on upgrade. `mounts: []` is written explicitly.
10. **`tools/` scaffold** is `tools/package.json`, `tools/tsconfig.json` and `tools/README.md`, from `templates/tools/`.
    - `createWorkspace` writes them once. They are not in the render record, so `renderWorkspace` and `upgrade` never touch them.
    - `npm install` is not run.
    - The `test` script is `vitest run --passWithNoTests`, so `npm test` passes before the first tool exists.
    - The `typescript` and `vitest` versions equal the core's own `devDependencies` (a test pins this).
11. **The hook is two managed render entries:**
    - `.mesh/hooks/pre-commit`: `sh`, executable, byte-exact;
    - `.mesh/hooks/mixed-commit.mjs`: byte-exact.

    They are rendered from `templates/hooks/`. `RenderEntry` gains `executable?: boolean`, and the writer ensures mode `0o755` on such files where the platform has modes. `.mesh/` stays gitignored, so a clone gets the hook back from `init` restore (chunk 9).
12. **The hook's warning text** is fixed and doesn't read as a failure:
    `brain-mesh: heads-up: this commit mixes brains/personal/ with other workspace files. That is allowed; separate commits keep notes and tooling apart.`
    - It is printed only when the staged paths (`git diff --cached --name-only -z --no-renames`) include at least one under `brains/personal/` and at least one outside it.
    - Without `node` on `PATH`, the wrapper exits 0 silently.
13. **New command `commit [brain] -m, --message <text>`** carries spec 7.2's personal row, because the CLI holds all deterministic logic (spec 8). `brain` defaults to `personal`; any other id fails with `E_NOT_SUPPORTED` ("committing to shared brains is not supported yet").
    - **Order:** `git add -A -- brains/personal`, then `git commit -m <msg> -- brains/personal`, then `git pull --rebase --autostash`, then `git push`. Committing before pulling avoids stashing the user's note.
    - **Pathspec commit:** the commit includes only `brains/personal/`. Other staged changes stay staged, and unstaged changes are kept by `--autostash`.
    - **No upstream:** warning `W_NO_UPSTREAM`, and nothing is pulled or pushed.
    - **Rebase conflict:** `git rebase --abort`, then `E_SYNC_CONFLICT`. The local commit is kept and nothing is pushed.
    - **Other pull failure:** warning `W_PULL_FAILED`, and no push.
    - **Push failure:** warning `W_PUSH_FAILED`.
    - **Nothing to commit:** pull and push still run, so earlier offline commits go out.
14. **`Host` is the seed of chunk 8's adapter:** only `login` and `createPrivateRepo` for now. `gh` is run through an injectable runner, so the `gh` implementation is tested with a stub runner rather than a fake `gh` on `PATH`. A spawn failure (`ENOENT`) gives `E_GH_MISSING`, and a non-zero `gh auth status` gives `E_GH_AUTH`.
15. **Deferred:**
    - The `npx` warm-up call from research Q4.4 moves to chunk 12. Before the first npm release the pin (`0.0.0`) can't be fetched, so a warm-up would only produce a warning.
    - The carried check "hook fires from VS Code and Obsidian-git commits on Windows" moves to chunk 7, where Ramon starts dogfooding in those editors.
    - Both moves are recorded in the breakdown, together with the open question they raise for chunk 7: which pin a dogfood workspace uses before a release.
16. **`init` ends with `doctor`.** It runs `runChecks` in-process on the new workspace and reports the counts. Any error makes the exit code 1 (by construction there are none).

## Review Focus

1. **A folder that isn't empty, or that already holds a `mesh.yaml`:** `init` refuses before it writes anything or creates a remote repo. *(Task 4 tests `non-empty folder`, `existing workspace`)*
2. **`gh` missing or logged out, a repo name that is taken, a namespace that is blocked, or no git identity:** a clear error names the fix (`gh auth login`, `--name`, `--remote`, `git config`), and the folder stays empty. *(Task 2 tests; Task 4 test `host failure leaves the folder empty`)*
3. **Windows with a global `core.autocrlf=true`:** every file of the first commit is stored with LF. *(Task 4 test `first commit is LF under autocrlf`)*
4. **A personal commit while other files are staged or dirty:**
   - only `brains/personal/` is committed;
   - the other changes stay exactly as they were;
   - a rebase conflict leaves no rebase in progress, keeps the local commit and pushes nothing.

   *(Task 5 tests)*
5. **The hook in a path with spaces, or without `node` on `PATH`:** the commit is never blocked. *(Task 1 tests; the no-`node` test runs where it can isolate `PATH`)*

---

## File Structure

```
templates/hooks/pre-commit            # sh wrapper (Ruling 12)                     (Task 1)
templates/hooks/mixed-commit.mjs      # staged-path check, warning text            (Task 1)
templates/tools/{package.json,tsconfig.json,README.md}                             (Task 3)
src/render/workspace.ts               # + hooks in CoreTemplates, executable entries (Task 1)
src/output.ts                         # + error and warning codes                  (Tasks 2, 4, 5)
src/git.ts                            # + git(), gitOk()                           (Task 2)
src/host/host.ts                      # Host interface                             (Task 2)
src/host/github.ts                    # githubHost(run)                            (Task 2)
src/workspace/create.ts               # createWorkspace, meshYaml                  (Task 3)
src/commands/init.ts                  # initCommand({host})                        (Task 4)
src/commands/commit.ts                # commitCommand                              (Task 5)
src/commands/index.ts                 # register init and commit                   (Tasks 4, 5)
test/helpers/{git-env,host}.ts        # isolated git config, fake host             (Tasks 2, 4)
test/unit/render/hooks.test.ts, test/unit/host/github.test.ts,
test/unit/workspace/create.test.ts, test/unit/commands/{init,commit}.test.ts
test/e2e/hook-mechanism.test.ts       # deleted: replaced by hooks.test.ts         (Task 1)
```

---

### Task 1: Mixed-commit hook rendered into `.mesh/hooks/`

**Files:**
- Create: `templates/hooks/pre-commit`, `templates/hooks/mixed-commit.mjs`, `test/unit/render/hooks.test.ts`
- Modify: `src/render/workspace.ts` (`CoreTemplates.hooks`, `RenderEntry.executable`, `readCoreTemplates`, `planWorkspace`, writer `chmod`)
- Delete: `test/e2e/hook-mechanism.test.ts`
- Test: `test/unit/render/hooks.test.ts`, `test/unit/render/workspace.test.ts`

**Interfaces:**
- Consumes: chunk 5 `planWorkspace`, `renderWorkspace(root, {core?})`, `packageCore()`.
- Produces:
  - `CoreTemplates.hooks: Map<string, string>` (file name → text);
  - `RenderEntry.executable?: boolean`;
  - rendered `.mesh/hooks/pre-commit` (executable) and `.mesh/hooks/mixed-commit.mjs`, both recorded as `managed`.

- [ ] **Step 1: Write the failing tests.** Each hooks test renders `fullWorkspace()`, runs `git init` in its root, sets `core.hooksPath .mesh/hooks`, then commits with the helper `git()` from `test/helpers/workspace.ts`. The fixture path contains a space.

```ts
// workspace.test.ts
it('renders the hook files', async () => {
  const root = await fullWorkspace();
  const r = await renderWorkspace(root, { core: fixtureCore }); // the fixture core workspace.test.ts already uses
  expect(r.record.files.filter((f) => f.path.startsWith('.mesh/hooks/')).map((f) => [f.path, f.kind])).toEqual([
    ['.mesh/hooks/mixed-commit.mjs', 'managed'], ['.mesh/hooks/pre-commit', 'managed'],
  ]);
  expect((await read(root, '.mesh/hooks/pre-commit')).startsWith('#!/bin/sh\n')).toBe(true);
});
it.skipIf(process.platform === 'win32')('pre-commit is executable', async () => { /* stat mode & 0o111 !== 0, also after chmod 0o644 + re-render */ });

// hooks.test.ts
const WARNING = 'brain-mesh: heads-up: this commit mixes brains/personal/ with other workspace files.';
it('mixed commit warns and still commits')          // stage brains/personal/x.md + tools/a.ts → stderr contains WARNING, exit 0, HEAD has both
it('personal-only commit is silent')                // only brains/personal/x.md → stderr has no 'brain-mesh'
it('non-personal commit is silent')                 // only tools/a.ts
it('a move out of brains/personal/ counts as mixed') // git mv brains/personal/x.md notes-x.md → WARNING
it.skipIf(process.platform === 'win32')('without node on PATH the hook exits 0 silently')
  // execa('sh', ['.mesh/hooks/pre-commit'], {cwd: root, env: {PATH: '/usr/bin:/bin'}}) → exitCode 0, stderr ''
  // skip at runtime when /usr/bin/node or /bin/node exists
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/render/hooks.test.ts test/unit/render/workspace.test.ts`
Expected: FAIL. No `.mesh/hooks/` entries are rendered.

- [ ] **Step 3: Write the templates.**
  - `pre-commit` is exactly:
    ```sh
    #!/bin/sh
    # generated by brain-mesh; do not edit. Warns when a commit mixes brains/personal/ with other files; never blocks.
    command -v node >/dev/null 2>&1 || exit 0
    node "$(dirname "$0")/mixed-commit.mjs"
    exit 0
    ```
  - `mixed-commit.mjs` starts with `// generated by brain-mesh; do not edit.` It runs `git diff --cached --name-only -z --no-renames` via `execFileSync`, applies Ruling 12, writes the full warning text plus `\n` to stderr, and swallows every error.

- [ ] **Step 4: Render them.**
  - `readCoreTemplates` reads every file in `templates/hooks/` into `hooks`. A missing folder reads as empty.
  - `planWorkspace` emits each hook as `managed` at `.mesh/hooks/<name>` with `bytes: true`; `pre-commit` also gets `executable: true`.
  - After writing, the writer `chmod`s executable entries it owns to `0o755` when `(mode & 0o111) === 0`. On Windows this is a no-op.
  - Delete `test/e2e/hook-mechanism.test.ts`, whose own comment says this task replaces it.

- [ ] **Step 5: Run the tests.**
Run: `npx vitest run --project unit test/unit/render`
Expected: PASS. The no-`node` test is skipped on Windows.

- [ ] **Step 6: Commit.**
```bash
git add templates/hooks src/render/workspace.ts test/unit/render && git rm -q test/e2e/hook-mechanism.test.ts
git commit -m "feat: render the mixed-commit pre-commit hook into .mesh/hooks"
```

---

### Task 2: Git runner and the `gh` host

**Files:**
- Create: `src/host/host.ts`, `src/host/github.ts`, `test/unit/host/github.test.ts`, `test/helpers/host.ts`
- Modify: `src/git.ts`, `src/output.ts`
- Test: `test/unit/host/github.test.ts`, `test/unit/git.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  // src/git.ts
  export interface RunResult { exitCode: number; stdout: string; stderr: string }
  export function git(cwd: string, args: readonly string[]): Promise<RunResult>; // never throws on non-zero exit
  export function gitOk(cwd: string, args: readonly string[]): Promise<string>;  // stdout; throws CliError E_GIT "git <args[0]> failed: <first stderr line>"
  // src/host/host.ts
  export interface Host {
    /** Login of the authenticated user. Throws CliError E_GH_MISSING or E_GH_AUTH. */
    login(): Promise<string>;
    /** Creates an empty private repo in the user's namespace; returns its clone URL (Ruling 4). Throws E_REPO_CREATE. */
    createPrivateRepo(name: string): Promise<string>;
  }
  // src/host/github.ts
  export type GhRunner = (args: readonly string[]) => Promise<RunResult>; // throws CliError E_GH_MISSING when gh cannot be spawned
  export function githubHost(run?: GhRunner): Host;
  // test/helpers/host.ts
  export function fakeHost(o?: { login?: string; repoUrl?: string; loginError?: CliError; createError?: CliError }): Host & { created: string[] };
  ```
- `ErrorCode` gains `GhMissing: 'E_GH_MISSING'`, `GhAuth: 'E_GH_AUTH'`, `RepoCreate: 'E_REPO_CREATE'` and `Git: 'E_GIT'`.

- [ ] **Step 1: Write the failing tests.** These use a stub `GhRunner` that records arguments and returns scripted results.

```ts
it('login checks auth status first', …)  // calls: [['auth','status'], ['api','user','--jq','.login']] → 'octo-user'
it('logged out gives E_GH_AUTH', …)      // auth status exitCode 1 → rejects {code:'E_GH_AUTH'}, message contains 'gh auth login'
it('missing gh gives E_GH_MISSING', …)   // runner throws CliError E_GH_MISSING → propagated; real default runner: spawn of a nonexistent binary maps to it
it('creates a private repo, https', …)   // ['repo','create','ai-workspace','--private'] stdout 'https://github.com/octo-user/ai-workspace\n'; git_protocol 'https' → 'https://github.com/octo-user/ai-workspace.git'
it('ssh protocol gives an ssh url', …)   // git_protocol 'ssh' → 'git@github.com:octo-user/ai-workspace.git'
it('name taken', …)                      // stderr 'GraphQL: Name already exists on this account (createRepository)' → E_REPO_CREATE, message contains '--name' and '--remote'
it('other create failure points at --remote', …) // stderr 'HTTP 403: …' → E_REPO_CREATE, message contains '--remote <url>' and the stderr line
// git.test.ts
it('gitOk throws E_GIT with the first stderr line', …) // gitOk(tempDir, ['log']) outside a repo → code 'E_GIT', message starts 'git log failed: fatal:'
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/host test/unit/git.test.ts`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement** `git`, `gitOk`, `Host`, `githubHost` and `fakeHost`.
  - The default `GhRunner` is `execa('gh', args, { reject: false })`; map `ENOENT` to `E_GH_MISSING`, with the message "gh is not installed; see https://cli.github.com".
  - Messages:
    - `E_GH_AUTH`: "gh is not logged in; run gh auth login".
    - Name taken: "a repo named <name> already exists in your account; choose another with --name <repo> or use it with --remote <url>".
    - Other failure: "could not create the private repo <name>: <stderr line>. If your enterprise blocks repos in your own namespace, create a repo elsewhere and pass --remote <url>".

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run --project unit test/unit/host test/unit/git.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/git.ts src/output.ts src/host test/unit/host test/unit/git.test.ts test/helpers/host.ts
git commit -m "feat: git runner and gh host with login and private repo creation"
```

---

### Task 3: `createWorkspace` and the `tools/` scaffold

**Files:**
- Create: `src/workspace/create.ts`, `templates/tools/package.json`, `templates/tools/tsconfig.json`, `templates/tools/README.md`, `test/unit/workspace/create.test.ts`
- Test: `test/unit/workspace/create.test.ts`

**Interfaces:**
- Consumes:
  - `personalManifest(user)` and `brainFiles(m)` from `src/render/brain.ts`;
  - `renderWorkspace(root, {core?})`;
  - `runChecks(ws)` and `loadWorkspace(root)`.
- Produces:
  ```ts
  export const MESH_SCHEMA_URL = 'https://unpkg.com/brain-mesh/schemas/mesh.schema.json';
  export function meshYaml(user: string, pin: string): string;
  /** Writes mesh.yaml, brains/personal/**, tools/** (Ruling 10), then renders. `root` must be empty. Returns sorted workspace-relative paths written. */
  export function createWorkspace(root: string, o: { user: string; pin: string; core?: CoreSource }): Promise<{ files: string[]; warnings: Warning[] }>;
  ```

- [ ] **Step 1: Write the failing tests.**

```ts
it('mesh.yaml', () => expect(meshYaml('octo-user', '0.4.2')).toBe(
  '# yaml-language-server: $schema=https://unpkg.com/brain-mesh/schemas/mesh.schema.json\nversion: 1\nbrain_mesh: 0.4.2\nuser: octo-user\nmounts: []\n'));
it('a new workspace passes doctor', …)   // createWorkspace(emptyTemp, {user:'octo-user', pin:'0.4.2', core: fixtureCore}); runChecks(await loadWorkspace(root)) → []
it('lays out the workspace', …)          // files include 'mesh.yaml', 'brains/personal/brain.yaml', 'brains/personal/index.md',
                                         // 'tools/package.json', 'tools/tsconfig.json', 'tools/README.md', '.gitattributes',
                                         // 'brains/.obsidian/app.json', 'AGENTS.md', 'CLAUDE.md', '.mesh/hooks/pre-commit', '.gitignore'
it('tools scaffold is not in the render record', …) // record paths have none starting with 'tools/'
it('tools versions follow the core', …)  // tools/package.json devDependencies.typescript/vitest === repo package.json devDependencies; scripts.test === 'vitest run --passWithNoTests'
it('personal brain owner is the login', …) // brains/personal/brain.yaml contains 'owner: "@octo-user"'
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/workspace/create.test.ts`
Expected: FAIL. The module doesn't exist yet.

- [ ] **Step 3: Write the templates and the code.**
  - `templates/tools/package.json`: `name` is `workspace-tools`, `private: true`, `type: "module"`, the test script from Ruling 10, and `devDependencies` `typescript` and `vitest` with the core's ranges.
  - `templates/tools/tsconfig.json`: `strict`, `module` and `moduleResolution` `NodeNext`, `noEmit`, `include: ["**/*.ts"]`, `exclude: ["node_modules"]`.
  - `templates/tools/README.md`, in a few lines:
    - each tool is a subfolder with its own `*.test.ts`;
    - run `npm install` once, then `npm test`;
    - code lives here or in `.local/`, never in `brains/` (ADR 0003).
  - Write with the `wx` flag and create parent folders. Merge the paths returned by `renderWorkspace` with the paths written directly, then sort them.

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run --project unit test/unit/workspace/create.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/workspace/create.ts templates/tools test/unit/workspace/create.test.ts
git commit -m "feat: createWorkspace writes mesh.yaml, personal brain and tools scaffold"
```

---

### Task 4: `init` command

**Files:**
- Create: `src/commands/init.ts`, `test/helpers/git-env.ts`, `test/unit/commands/init.test.ts`
- Modify: `src/commands/index.ts`, `src/output.ts`, `test/helpers/cli.ts` (`run` takes an optional `commands`)
- Test: `test/unit/commands/init.test.ts`

**Interfaces:**
- Consumes: `Host`, `fakeHost`, `git`, `gitOk`, `createWorkspace`, `packageVersion()`, `runChecks`, `loadWorkspace`.
- Produces:
  ```ts
  export interface InitData { root: string; user: string; brain_mesh: string; remote: string; repoCreated: boolean; files: string[]; doctor: { errors: number; warnings: number } }
  export function initCommand(deps: { host: Host }): CommandDef; // index.ts registers initCommand({ host: githubHost() })
  // test/helpers/git-env.ts: points GIT_CONFIG_GLOBAL at a temp file with user.name/email (+ optional core.autocrlf) and sets GIT_CONFIG_NOSYSTEM=1 via vi.stubEnv
  export function isolateGit(o?: { autocrlf?: boolean; identity?: boolean }): Promise<void>;
  ```
- `ErrorCode` gains `NotEmpty: 'E_NOT_EMPTY'`, `NotSupported: 'E_NOT_SUPPORTED'` and `RemoteNotEmpty: 'E_REMOTE_NOT_EMPTY'`.
- Text output:
  ```
  Created the brain-mesh workspace for <user> in <root>
  Pushed to <remote>
  Open <root>/brains as an Obsidian vault.
  ```

- [ ] **Step 1: Write the failing tests.**
  - Each test calls `isolateGit()`, creates an empty temp folder (with a space in its name) and a bare repo made with `git init --bare -q`.
  - It runs `main` with `[initCommand({ host: fakeHost({ repoUrl: bare }) })]`.

```ts
it('creates, commits and pushes', …)         // code 0; json.data.remote === bare, repoCreated true; host.created == ['ai-workspace'];
                                             // git -C bare rev-list --count main === '1'; log message 'Create brain-mesh workspace';
                                             // git config core.hooksPath === '.mesh/hooks'; HEAD branch 'main'; data.doctor.errors === 0
it('--name sets the repo name', …)           // host.created == ['my-space']
it('--remote uses an existing empty repo', …) // repoCreated false, host.created == [], bare has 1 commit
it('--remote that is not empty', …)          // bare with one commit → E_REMOTE_NOT_EMPTY, readdir(folder) === []
it('--remote and --name together', …)        // E_USAGE
it('non-empty folder', …)                    // folder holds 'notes.txt' → E_NOT_EMPTY, host.created == [], folder unchanged
it('existing workspace', …)                  // folder holds mesh.yaml → E_NOT_SUPPORTED
it('no git identity', …)                     // isolateGit({identity:false}) → E_GIT, message contains 'user.name', host.created == []
it('host failure leaves the folder empty', …) // fakeHost({createError: new CliError('E_REPO_CREATE','…')}) → E_REPO_CREATE, readdir === []
it('first commit is LF under autocrlf', …)   // isolateGit({autocrlf:true}); git ls-files --eol: every line starts 'i/lf'
it('gitignored managed files are not committed', …) // git ls-files has no '.mesh/' and no '.claude/' paths; has '.gitignore', 'AGENTS.md', 'brains/personal/index.md'
it('push failure says how to finish', …)     // repoUrl = path that doesn't exist → E_GIT, message contains 'git push -u origin main'; local HEAD exists
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/commands/init.test.ts`
Expected: FAIL. There is no `init` command yet.

- [ ] **Step 3: Implement `initCommand`** in the order of Rulings 1, 5, 6, 7 and 8:
  1. checks;
  2. `git init -q -b main`;
  3. `createWorkspace`;
  4. `git add -A`, then `git commit -q -m "Create brain-mesh workspace"`;
  5. `git config core.hooksPath .mesh/hooks`;
  6. `git remote add origin <url>`, then `git push -q -u origin main`;
  7. `doctor` (Ruling 16).

  Options:
  - `--remote <url>` and `--name <repo>` (default `ai-workspace`), declared to conflict with each other via commander.
  - `data.files` is `git ls-files`, sorted.

- [ ] **Step 4: Run the tests and the full suite.**
Run: `npx vitest run --project unit`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/commands src/output.ts test/helpers test/unit/commands/init.test.ts
git commit -m "feat: init creates a workspace, its private repo and the first push"
```

---

### Task 5: `commit` command for the personal brain

**Files:**
- Create: `src/commands/commit.ts`, `test/unit/commands/commit.test.ts`
- Modify: `src/commands/index.ts`, `src/output.ts`
- Test: `test/unit/commands/commit.test.ts`

**Interfaces:**
- Consumes: `git`, `gitOk`, `findWorkspaceRoot`; tests reuse Task 4's `initCommand`, `fakeHost` and `isolateGit` to set up a workspace pushed to a bare repo.
- Produces:
  ```ts
  export interface CommitData { brain: 'personal'; committed: boolean; commit: string | null; files: string[]; pushed: boolean }
  export const commitCommand: CommandDef; // `commit [brain] -m, --message <text>` (required)
  ```
- `ErrorCode` gains `SyncConflict: 'E_SYNC_CONFLICT'`. New warnings: `W_NO_UPSTREAM`, `W_PULL_FAILED`, `W_PUSH_FAILED`.
- Text: `Committed <n> file(s) in brains/personal/ (<sha7>) and pushed.`; when nothing was pushed, `… locally; not pushed.`; when there was nothing to commit, `Nothing to commit in brains/personal/.`

- [ ] **Step 1: Write the failing tests.** Setup: `init` into a bare repo. A second clone of the bare repo (`other`) plays the user's other machine.

```ts
it('commits only personal paths and pushes', …) // add brains/personal/inbox/a.md and tools/x.ts → committed true, files ['brains/personal/inbox/a.md'],
                                                // pushed true; bare main log has the message; tools/x.ts still untracked
it('other staged changes stay staged', …)       // git add AGENTS.md change → after commit: git diff --cached --name-only === 'AGENTS.md'; HEAD doesn't touch it
it('rebases on the remote first', …)            // other pushes brains/personal/b.md; commit → pushed true, bare has both files, linear history (no merge commit)
it('unstaged changes elsewhere survive the pull', …) // dirty tools/README.md + remote ahead → after commit the edit is still there
it('rebase conflict keeps the local commit', …) // other and local edit the same line of brains/personal/index.md → E_SYNC_CONFLICT;
                                                // no .git/rebase-merge; HEAD message is ours; bare main unchanged
it('nothing to commit still pushes earlier commits', …) // a local commit made by hand in brains/personal → commit -m x → committed false, pushed true
it('no upstream warns', …)                      // a workspace without origin → committed true, pushed false, warning W_NO_UPSTREAM
it('shared brain id is not supported', …)       // commit brain-team-platform -m x → E_NOT_SUPPORTED
it('message is required', …)                    // commit → E_USAGE
it('outside a workspace', …)                    // empty temp folder → E_NO_WORKSPACE
```
(Hook silence on a personal-only commit is covered by Task 1's `personal-only commit is silent`.)

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run --project unit test/unit/commands/commit.test.ts`
Expected: FAIL. There is no `commit` command yet.

- [ ] **Step 3: Implement `commitCommand`** following Ruling 13.
  - Without `mesh.yaml` it fails with `E_NO_WORKSPACE`.
  - It detects an upstream with `git rev-parse --abbrev-ref @{u}`.
  - It detects a stopped rebase with `git rev-parse --git-path rebase-merge` and `rebase-apply`, checking whether those paths exist.
  - `files` is `git show --name-only --format= -z HEAD`, read after the commit.

- [ ] **Step 4: Run the tests and the full suite.**
Run: `npx vitest run --project unit`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/commands src/output.ts test/unit/commands/commit.test.ts
git commit -m "feat: commit writes the personal brain: personal paths only, rebase, push"
```

---

### Task 6: Packaging, docs and the acceptance check

**Files:**
- Modify:
  - `test/e2e/npx.test.ts`;
  - `docs/spec.md` (4 "Creating and restoring", 7.2 personal row, 8 table);
  - `docs/plan/v0-breakdown.md` ("Checks carried from chunk 1", chunk 6 marked done);
  - `docs/research/2026-11-chunk-01-research.md` (new "Chunk 6 checks");
  - `GLOSSARY.md` (only if a new term appears).
- Test: `test/e2e/npx.test.ts`

- [ ] **Step 1: Extend the packaging test.** In "renders a workspace from the installed package", also assert that `.mesh/hooks/pre-commit` and `.mesh/hooks/mixed-commit.mjs` exist and that `templates/tools/package.json` is in the installed package.
Run: `npx vitest run --project e2e test/e2e/npx.test.ts`
Expected: PASS.

- [ ] **Step 2: Update the docs.**
  - **Spec 8, `init` row:** `init [--remote <url> | --name <repo>]`.
  - **Spec 8, new row:** `commit [brain] --message <text>`, "Commit the personal brain's changes only, pull with rebase, push (7.2)", phase v0.
  - **Spec 7.2, personal row:** "commit only paths under `brains/personal/`, `pull --rebase`, push (via `brain-mesh commit`)".
  - **Spec 4, Creating:** `init` creates the empty private repo first, then the workspace, then pushes.
  - **Breakdown:**
    - mark chunk 6 done;
    - move the VS Code and Obsidian-git hook check to chunk 7 (Ruling 15);
    - add a chunk 7 line: "decide the pin for a dogfood workspace before the first npm release (`npx -y brain-mesh@0.0.0` can't be fetched)";
    - add a chunk 12 line: "`init` warms the `npx` cache with one call (research Q4.4)".

- [ ] **Step 3: Run the acceptance check against real GitHub.**
  - **This is a side effect outside the worktree.** Ask Ramon before running it. On a no, record it under "Chunk 6 checks" as open for chunk 7 and continue.
  - On a yes:
    1. Build, then run `node <repo>/dist/cli.js init --name bm-init-check --json` in an empty temp folder whose path contains a space.
    2. Check:
       - `gh repo view <login>/bm-init-check --json visibility,defaultBranchRef` gives `PRIVATE` and `main`;
       - `node <repo>/dist/cli.js doctor --json` in the folder gives `"errors":0`;
       - a mixed commit prints the heads-up.
    3. Ramon opens `brains/` in Obsidian and deletes the test repo himself (`gh repo delete` needs the `delete_repo` scope).
  - Record the commands and results under "Chunk 6 checks".

- [ ] **Step 4: Run the full suite and commit.**
Run: `npm run typecheck && npx vitest run`
Expected: PASS.
```bash
git add test/e2e docs GLOSSARY.md
git commit -m "docs: init and commit in the spec; chunk 6 checks; carried checks moved"
```

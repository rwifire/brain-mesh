# Chunk 8: Host adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the `gh`-based host adapter to the four operations of spec 9.4: get permission, validate owner, create PR, create the workspace repo. Use it for `doctor`'s network checks (owner validity, push rights) with `--offline`. Also give new brains their folder skeleton.

**Architecture:** `src/host/host.ts` stays the one interface; `src/host/github.ts` implements it on top of `gh api`, with one function that turns `gh` failures into stable error codes (offline, logged out, missing). `doctor` keeps its synchronous offline checks. A new async `hostChecks` runs after them, only for shared `contribute` mounts on github.com, so a personal-only workspace never calls `gh`. Tests use a fake host. The real adapter runs against a sandbox repo in one gated e2e file.

**Tech Stack:** TypeScript ESM, Node ≥ 22.12, commander, zod 4, execa, Vitest. No new dependencies.

**Spec:** [docs/spec.md](../../spec.md): 3 (requirements), 5.1 (structure), 5.7 (ownership), 8 (`doctor` checks), 9.4 (git hosts). Breakdown: [v0-breakdown.md](../../plan/v0-breakdown.md), chunk 8 and its carried checks.

## Global Constraints

- "The CLI checks `gh auth status` first, then uses `gh` for API calls; the default `gh auth login` scopes (`repo`, `read:org`) are enough." No token is read or stored by brain-mesh.
- "The only supported host for now is github.com. Every host-specific call goes through one host adapter in the core."
- "A valid owner is a team that exists **and** has write access to the brain repo; GitHub silently ignores owners without it."
- "Checks that need the network (owner validity, push rights) are skipped with a warning when offline or with `--offline`."
- "Contributing requires push rights on the brain repo; no fork-based contributions."
- `--json` contract unchanged: exactly one envelope on stdout; finding codes in `src/doctor/codes.ts` are stable and `docs/doctor-checks.md` is generated from them.
- Tests run on Windows and Linux; no test may need network or a logged-in `gh` except the gated sandbox file.

## Decisions taken in this plan

1. **Folder skeleton uses `.gitkeep`, not README files.** In a personal brain, a `README.md` would break rules in most folders:
   - in `inbox/` and `daily/`, ingest would list it as an item to process, and `search` would return it as a hit;
   - in `sources/` and `maps/`, doctor would require `type: source` or `type: map` frontmatter;
   - directly in `areas/`, it is a misplaced note.

   An empty `.gitkeep` passes every existing check: dot names skip the kebab check, it has no extension, and it has no `#!` line. Obsidian hides it. What each folder is for is already in the brain's `AGENTS.md`. `notes/README.md` stays the generator's job, created when the first note lands. `.gitkeep` files stay after a folder fills up; nobody needs to delete them.
2. **Network checks cover `contribute` mounts only.** A reader can't fix a brain's owners, and team lookups often need visibility a reader lacks. Cost if wrong: owner problems in read mounts go unreported until a contributor runs `doctor`.
3. **Network checks are all-or-nothing.** If `gh` is missing, logged out or offline at any point, doctor drops every network finding and emits one `W_NETWORK_SKIPPED` warning that gives the reason. That keeps the output deterministic. The offline checks still run and still set the exit code.
4. **An owner that can't be checked is a warning, not an error.** When GitHub answers 403 (for example, a secret team the user can't see), doctor emits `W_OWNER_UNCHECKED`.
5. **Team slugs are lowercased for the API.** GitHub slugs are lowercase and CODEOWNERS matching ignores case.

## Review Focus

1. **gh fails halfway through.** The first call succeeds and a later one is offline. Expected: doctor finishes, has no network findings, gives one `W_NETWORK_SKIPPED`, and doesn't crash. (Task 4 test "a failure on a later call drops all network findings".)
2. **Mount URL forms.** Expected:
   - these all resolve to the same repo: `https://github.com/O/r`, `https://github.com/o/r.git/`, `git@github.com:o/r.git` and `ssh://git@github.com/o/r.git`;
   - `https://github.acme.com/o/r.git` gives `W_HOST_UNSUPPORTED`;
   - a local path is skipped without any warning.

   (Task 3 test "repoOf" and Task 4 test "other hosts warn, local paths are skipped".)
3. **The same owner in many areas.** Expected: one API call per owner and repo, with findings in a stable order. (Task 4 test "each owner is looked up once per repo".)
4. **Workspaces with no contribute mount on github.com, and `doctor personal`.** Expected: zero `gh` calls, so ingest's doctor run stays fast and works offline. (Task 4 test "no contribute mount on github.com means no host call".)
5. **The real logged-out and offline `gh`.** Expected: `E_GH_AUTH` and `E_OFFLINE`, never a raw `gh` message or `E_INTERNAL`. (Task 2 e2e "real gh" tests.)

---

### Task 1: Brain folder skeleton

**Files:**
- Modify: `src/render/brain.ts` (`brainFiles`, doc comment)
- Modify: `skills/ingest/SKILL.md` (step 1)
- Test: `test/unit/render/brain.test.ts`, `test/unit/workspace/create.test.ts`, `test/unit/skills/skills.test.ts`

**Interfaces:**
- Produces: `export const BRAIN_FOLDERS: Record<'personal' | 'shared', readonly string[]>` in `src/render/brain.ts`, with these values:
  - `personal: ['areas', 'daily', 'inbox', 'maps', 'notes', 'projects', 'sources']`;
  - `shared: ['areas', 'maps', 'notes', 'projects', 'sources']`.

  `brainFiles(manifest, templatesDir)` also returns `<folder>/.gitkeep` → `''` for each folder of `manifest.type`, sorted into the map like every other entry. Chunk 9's `brain new` gets the skeleton through the same function.

- [ ] **Step 1: Write the failing tests**
  - `brain.test.ts` › "a new brain has its folder skeleton": the keys of `brainFiles(personalManifest('octo'), …)` contain `inbox/.gitkeep`, `daily/.gitkeep`, `notes/.gitkeep`, `areas/.gitkeep`, `maps/.gitkeep`, `projects/.gitkeep` and `sources/.gitkeep`, and every one of them has the value `''`. A shared manifest's keys contain `notes/.gitkeep` and none of `inbox/.gitkeep` or `daily/.gitkeep`.
  - `create.test.ts` › "the personal brain opens with its folders": after `createWorkspace`, `brains/personal/inbox/.gitkeep` exists. Also, `runChecks(await loadWorkspace(root))` reports no finding for `brains/personal`, because a new workspace must still pass `doctor`.
  - `skills.test.ts` › "ingest lists only markdown inbox items": `ingest` contains ``the `.md` files in `brains/personal/inbox/` ``.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run test/unit/render/brain.test.ts test/unit/workspace/create.test.ts test/unit/skills/skills.test.ts`

  Expected: the 3 new tests fail on the missing keys, the missing file and the missing wording. Tests that compare the exact list of files `brainFiles` or `createWorkspace` writes also fail; update their expected lists in this step.
- [ ] **Step 3: Implement.** Add `BRAIN_FOLDERS` and the `.gitkeep` entries in `brainFiles`. In the ingest skill, step 1 becomes "…list the `.md` files in `brains/personal/inbox/` (oldest first)…".
- [ ] **Step 4: Run the whole suite.** Run: `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: new brains get their folder skeleton as .gitkeep files`

### Task 2: gh runner and failure mapping

**Files:**
- Modify: `src/host/github.ts`, `src/output.ts` (`ErrorCode`)
- Test: `test/unit/host/github.test.ts`
- Create: `test/e2e/gh-real.test.ts`

**Interfaces:**
- Produces:
  - `ErrorCode.Offline = 'E_OFFLINE'`, `ErrorCode.Host = 'E_HOST'` and `ErrorCode.PrCreate = 'E_PR_CREATE'`;
  - `export type GhRunner = (args: readonly string[], opts?: { input?: string }) => Promise<RunResult>`;
  - `export function ghFailure(r: RunResult): 'offline' | 'auth' | null` in `src/host/github.ts`;
  - a module-private helper `api(path: string, o?: { method?: 'GET' | 'POST'; body?: unknown; accept?: string }) => Promise<{ status: number; json: unknown }>`, which Task 3 uses.

- [ ] **Step 1: Write the failing unit tests** (stub runner, as in the existing file). The stub keys on the joined args.
  - "ghFailure":
    - `offline` for stderr containing `error connecting to api.github.com`, `dial tcp: lookup api.github.com: no such host`, `proxyconnect tcp: dial tcp 127.0.0.1:9: connect: connection refused` or `i/o timeout`;
    - `auth` for exit code 4, for `To get started with GitHub CLI, please run:  gh auth login`, and for `HTTP 401` / `Bad credentials`;
    - `null` for `gh: Not Found (HTTP 404)`.
  - "login probes gh --version first": the calls are `['--version']`, `['auth','status']`, `['api','user','--jq','.login']`. A non-zero `--version` gives `E_GH_MISSING`; this is the deferred chunk 6 minor about non-English Windows.
  - "login offline gives E_OFFLINE, not E_GH_AUTH": `auth status` exits 1 with `error connecting to api.github.com`, and the error is `E_OFFLINE` with a message containing `--offline`.
  - Update "login checks auth status first" to the new call list.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/host/github.test.ts`. Expected: the new tests fail (`ghFailure` is not exported, and the call list differs).
- [ ] **Step 3: Implement.**
  - `runGh` passes `input` to execa and sets `env: { GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }`, so `gh` never waits on a prompt in `--json` mode.
  - `ghFailure` checks `stderr` and `stdout` against these patterns:
    - offline: `/error connecting to|dial tcp|no such host|could not resolve host|i\/o timeout|network is unreachable|connection refused|TLS handshake timeout/i`;
    - auth: `exitCode === 4` or `/gh auth login|not logged in|HTTP 401|Bad credentials/i`.

    Offline is checked first.
  - `login` probes `gh --version`, then `auth status`; a failure there that maps to offline gives `E_OFFLINE`, "cannot reach github.com (…); check your connection, or use --offline where the command offers it".
  - `api` builds `['api', path, '--method', M]`, plus `['-H', 'Accept: <accept>']` when `accept` is given, plus `['--input', '-']` with `JSON.stringify(body)` as input when there is a body.
    - Exit 0 returns `{ status: 200, json }`, where `json` is `null` for empty stdout.
    - Otherwise, `ghFailure` mapped to offline throws `E_OFFLINE`, and mapped to auth throws `E_GH_AUTH`.
    - Otherwise, `/\(HTTP (\d{3})\)/` in stderr returns `{ status, json }` with stdout parsed when it is JSON.
    - Anything else throws `E_HOST` with the first stderr line.
- [ ] **Step 4: Write the real-gh e2e tests** in `test/e2e/gh-real.test.ts`, skipped when `gh --version` fails. They use the real default runner through `githubHost()`, with `process.env` patched for the test and restored afterwards:
  - "real gh logged out gives E_GH_AUTH": `GH_CONFIG_DIR` points at an empty temp folder and `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` are deleted. `login()` rejects with `E_GH_AUTH`. This is the carried chunk 8 check "logged-out `gh` behaviour", without logging Ramon out.
  - "real gh offline gives E_OFFLINE": the same, plus `GH_TOKEN=gho_dummy` and `HTTPS_PROXY=http://127.0.0.1:9`. `login()` rejects with `E_OFFLINE`.

  If real gh prints a pattern Step 3 doesn't know, add the pattern and a unit case quoting that exact text. That is the point of this step.
- [ ] **Step 5: Run.** Run: `npx vitest run test/unit/host test/e2e/gh-real.test.ts`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(host): map gh failures to E_OFFLINE, E_GH_AUTH and E_GH_MISSING`

### Task 3: Adapter operations

**Files:**
- Modify: `src/host/host.ts`, `src/host/github.ts`, `test/helpers/host.ts`
- Test: `test/unit/host/github.test.ts`

**Interfaces:**
- Consumes: `api` and the error codes from Task 2.
- Produces, in `src/host/host.ts`:

```ts
export interface RepoRef { owner: string; name: string }
export type Permission = 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';
export type OwnerStatus = 'ok' | 'not-found' | 'no-write' | 'unknown';
export interface PullRequestInput { repo: RepoRef; head: string; base: string; title: string; body: string }
export interface Host {
  login(): Promise<string>;
  createPrivateRepo(name: string): Promise<string>;
  /** The repo a clone URL names on this host; null when the URL is not on this host. */
  repoOf(url: string): RepoRef | null;
  /** The authenticated user's access to `repo`; 'none' when GitHub answers 404. */
  permission(repo: RepoRef): Promise<Permission>;
  /** Whether `owner` ("@login" or "@org/team") exists and has write access to `repo`. */
  ownerStatus(owner: string, repo: RepoRef): Promise<OwnerStatus>;
  /** Throws `E_PR_CREATE` with GitHub's reason (e.g. a PR for `head` already exists). */
  createPullRequest(pr: PullRequestInput): Promise<{ number: number; url: string }>;
}
```

- `fakeHost` gets these options:
  - `permissions?: Record<string, Permission>` keyed `owner/name`, defaulting to `'write'`;
  - `owners?: Record<string, OwnerStatus>` keyed `@owner|owner/name`, defaulting to `'ok'`;
  - `failWith?: CliError`, thrown from every network method after `failAfter?: number` successful calls (default 0);
  - `calls: string[]`, which records `permission owner/name`, `ownerStatus @x owner/name` and `pr owner/name head`.

  `repoOf` uses the real github.com parsing, exported as `githubRepoOf(url)`.

- [ ] **Step 1: Write the failing tests** (stub runner).
  - "repoOf": these all give `{ owner: 'acme', name: 'brain-x' }`:
    - `https://github.com/acme/brain-x.git`
    - `https://github.com/acme/brain-x`
    - `https://github.com/acme/brain-x/`
    - `https://GitHub.com/acme/brain-x.git`
    - `git@github.com:acme/brain-x.git`
    - `ssh://git@github.com/acme/brain-x.git`

    These give `null`:
    - `https://github.acme.com/acme/brain-x.git`
    - `C:\repos\brain-x`
    - `/srv/brain-x.git`
    - `https://github.com/acme`
  - "permission": `api repos/acme/brain-x --method GET` returning `{"permissions":{"admin":false,"maintain":false,"push":true,"triage":true,"pull":true}}` gives `'write'`. The highest flag wins: admin > maintain > push = write > triage > pull = read. HTTP 404 gives `'none'`.
  - "team owner", with `api orgs/acme/teams/platform/repos/acme/brain-x --method GET -H Accept: application/vnd.github.v3.repository+json`:
    - a 200 response with `permissions.push: true` gives `'ok'`;
    - a 200 response with only `pull: true` gives `'no-write'`;
    - a 404 response followed by `orgs/acme/teams/platform` returning 404 gives `'not-found'`;
    - a 404 response followed by `orgs/acme/teams/platform` returning 200 gives `'no-write'`;
    - a 403 response gives `'unknown'`;
    - `@acme/Platform` queries the slug `platform`.
  - "user owner", with `api repos/acme/brain-x/collaborators/octo/permission --method GET`:
    - a 200 response with `{"permission":"write","role_name":"write"}` gives `'ok'`;
    - a 200 response with `role_name: 'maintain'` gives `'ok'`;
    - a 200 response with `{"permission":"read"}` gives `'no-write'`;
    - a 404 response followed by `users/octo` returning 404 gives `'not-found'`;
    - a 403 response gives `'unknown'`.
  - "createPullRequest": the stub receives `api repos/acme/brain-x/pulls --method POST --input -` with input JSON `{"title","head","base","body"}`, and the method returns `{ number: 7, url: html_url }`. A 422 response whose body is `{"errors":[{"message":"A pull request already exists for acme:b."}]}` throws `E_PR_CREATE` with that message.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/host/github.test.ts`. Expected: the new tests fail; the methods don't exist yet.
- [ ] **Step 3: Implement** the methods in `githubHost`, `githubRepoOf` in `src/host/github.ts`, and the `fakeHost` options. Existing callers of `fakeHost` keep working with no options.
- [ ] **Step 4: Run.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(host): permission, owner validation and pull requests through gh api`

### Task 4: `doctor` network checks and `--offline`

**Files:**
- Create: `src/doctor/host-checks.ts`
- Modify:
  - `src/doctor/codes.ts`, `docs/doctor-checks.md` (regenerated by the snapshot test);
  - `src/commands/doctor.ts`, `src/commands/index.ts`;
  - `src/workspace/url.ts`.
- Test:
  - `test/unit/doctor/host-checks.test.ts` (new);
  - `test/unit/commands/doctor.test.ts`, `doctor-fix.test.ts`;
  - `test/e2e/doctor.test.ts`, `test/unit/workspace/url.test.ts`.

**Interfaces:**
- Consumes: `Host`, `RepoRef`, `Permission` and `OwnerStatus` from Task 3, plus `fakeHost`.
- Produces:
  - `export async function hostChecks(ws: WorkspaceModel, host: Host, o: { brain?: string; offline: boolean }): Promise<{ findings: Finding[]; warnings: Warning[] }>`;
  - `export function doctorCommand(deps: { host: Host }): CommandDef`, which replaces the `doctorCommand` constant. `defaultCommands` shares one `githubHost()` between `init` and `doctor`;
  - `export function isNetworkUrl(url: string): boolean` in `src/workspace/url.ts`. It is true for `scheme://` URLs (but not `file://`) and for scp form `user@host:path`, and false for local paths, including `C:\…`;
  - new codes, all `error`:
    - `push-rights-missing`: "A `contribute` mount's repo does not give you write access.";
    - `owner-not-found`: "A shared brain's or area's owner does not exist on the host, or is not visible to you.";
    - `owner-no-write`: "An owner exists but has no write access to the brain repo, so GitHub ignores it in `CODEOWNERS`.".
  - warnings `W_NETWORK_SKIPPED`, `W_HOST_UNSUPPORTED` and `W_OWNER_UNCHECKED`.

Rules for `hostChecks`:
- **Targets:** brains with `type === 'shared'`, `mount?.mode === 'contribute'`, a `mount.url` and a non-null manifest, filtered by `o.brain`.
- **URLs:** `host.repoOf(url) === null` gives one `W_HOST_UNSUPPORTED` warning for that brain when `isNetworkUrl(url)`, and is skipped silently otherwise.
- **Nothing to check:** no targets on the host means no host call and no warning.
- **`--offline`:** with `o.offline` and at least one target, return only `W_NETWORK_SKIPPED`, "network checks (owners, push rights) skipped: --offline".
- **Push rights:** a permission below `write` gives `push-rights-missing`, with path `brains/<id>/brain.yaml` and the message "you have <p> access to <owner>/<name>; contribute needs write: ask the owner for write access or mount it as read".
- **Owners checked:** `manifest.owner` (path `brains/<id>/brain.yaml`) and each `areas/<a>/README.md` `owner` that passes `Owner`. Each `owner|repo` pair is cached.
  - `not-found` gives `owner-not-found`;
  - `no-write` gives `owner-no-write`;
  - `unknown` gives one `W_OWNER_UNCHECKED` per owner.
- **gh failures:** a `CliError` with code `E_OFFLINE`, `E_GH_AUTH`, `E_GH_MISSING` or `E_HOST` from any call discards all network findings. The result is `W_NETWORK_SKIPPED` with "network checks (owners, push rights) skipped: <error message>". Any other error propagates.

- [ ] **Step 1: Write the failing tests** in `host-checks.test.ts`. They use `fullWorkspace()` (contribute mount `https://github.com/acme/brain-team-platform.git`), `writeFiles` and `fakeHost`:
  - "no contribute mount on github.com means no host call": a workspace whose contribute mount has a local-path URL, and separately `{ brain: 'personal' }`. In both, `host.calls` is `[]` and there are no warnings.
  - "push rights": `permissions: { 'acme/brain-team-platform': 'read' }` gives one `push-rights-missing` at `brains/brain-team-platform/brain.yaml`. `'write'`, `'maintain'` and `'admin'` give none.
  - "owners": an area README with `owner: "@acme/ghost"` and `owners: { '@acme/ghost|acme/brain-team-platform': 'not-found' }` give `owner-not-found` at that README's path. `'no-write'` gives `owner-no-write`. `'unknown'` gives `W_OWNER_UNCHECKED` and no finding.
  - "each owner is looked up once per repo": three area READMEs share one owner, so `calls` contains that owner's `ownerStatus` exactly once.
  - "--offline skips with one warning": `{ offline: true }` gives `calls: []` and the warning `W_NETWORK_SKIPPED`, with the message containing `--offline`.
  - "a failure on a later call drops all network findings": `failWith` is an `E_OFFLINE` CliError with `failAfter: 1`, and `permissions` would give a finding. The result is no findings and one `W_NETWORK_SKIPPED` whose message contains the error's message. The same holds for `E_GH_AUTH`.
  - "other hosts warn, local paths are skipped": a contribute mount on `https://github.acme.com/acme/brain-x.git` gives `W_HOST_UNSUPPORTED`.
  - In `doctor.test.ts`, "doctor --offline and network findings": `run(['doctor', '--offline', '--json'], root, [doctorCommand({ host: fakeHost() })])` is `ok` and has a `W_NETWORK_SKIPPED` warning. With a fake host that says `'read'`, `doctor --json` exits 1 with a `push-rights-missing` finding.
  - `url.test.ts` "isNetworkUrl": true for `https://x/y`, `ssh://git@x/y` and `git@x:y.git`; false for `file:///srv/a.git`, `/srv/a.git`, `C:\a\b` and `..\a`.
- [ ] **Step 2: Run them and watch them fail.** Run: `npx vitest run test/unit/doctor test/unit/commands/doctor.test.ts test/unit/workspace/url.test.ts`. Expected: the new tests fail; the module and option are missing. The `codes.test.ts` snapshot also fails once codes are added; that is expected until Step 3 regenerates it.
- [ ] **Step 3: Implement.**
  - Write `hostChecks`.
  - In `doctorCommand`:
    - add `--offline`, described as "skip checks that need the network";
    - run `hostChecks` after `runChecks`, and merge the findings with `sortFindings`;
    - count the merged findings for `counts` and the exit code;
    - append the warnings after the existing ones.
  - Switch the existing doctor unit tests to `[doctorCommand({ host: fakeHost() })]`, so no unit test can reach real `gh`.
  - Run `npx vitest run test/unit/doctor/codes.test.ts -u` once to regenerate `docs/doctor-checks.md`, then read the diff: exactly 3 new rows.
- [ ] **Step 4: Make the packaged e2e run deterministic.** `test/e2e/doctor.test.ts` runs the real CLI on a fixture with a github.com contribute mount, so it passes `--offline` and expects `W_NETWORK_SKIPPED` among the warnings.
- [ ] **Step 5: Run everything.** Run `npm run typecheck && npx vitest run`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(doctor): owner validity and push rights through the host adapter, --offline`

### Task 5: Sandbox run of the real adapter

**Files:**
- Create: `test/e2e/github-sandbox.test.ts`
- Modify: `docs/research/2026-11-chunk-01-research.md` (new "Chunk 8 checks" section), `docs/plan/v0-breakdown.md` (carried checks)

**Interfaces:**
- Consumes: `githubHost()` from Tasks 2–3.

The whole file is skipped unless `BRAIN_MESH_SANDBOX_REPO=<owner>/<name>` is set. That repo is one Ramon can push to, with a `main` branch. `BRAIN_MESH_SANDBOX_TEAM=@org/team` is optional; it names a team with write access to that repo, and the team cases are skipped without it.

- [ ] **Step 1: Write the tests.**
  - "permission is write or better" on the sandbox repo; `'none'` on `<owner>/brain-mesh-does-not-exist-<random>`.
  - "owners": `@<login>` (from `login()`) is `'ok'`, and `@<login>-no-such-user-zz9` is `'not-found'`. With the team variable set, the team is `'ok'` and `@<org>/no-such-team-zz9` is `'not-found'`.
  - "a pull request round trip":
    - clone the sandbox repo into a temp folder with plain git;
    - push a branch `brain-mesh-sandbox-<timestamp>` with one file;
    - `createPullRequest` returns a number and a `https://github.com/…/pull/<n>` URL;
    - a second `createPullRequest` for the same head throws `E_PR_CREATE`.

    In `finally`, run `gh pr close <n> --repo <repo> --delete-branch`.
- [ ] **Step 2: Stop for Ramon.** He runs:

  ```powershell
  $env:BRAIN_MESH_SANDBOX_REPO = '<owner>/<repo>'; npx vitest run test/e2e/github-sandbox.test.ts
  ```

  Expected: all pass. A failure means Task 3's mapping is wrong for real responses. Fix it test-first: copy the real response into a unit case in `github.test.ts`, watch it fail, then fix.
- [ ] **Step 3: Record the run.** The research note gets a "Chunk 8 checks" section with:
  - the logged-out and offline `gh` texts seen in Task 2;
  - whether the team-repo endpoint needed the `application/vnd.github.v3.repository+json` Accept header (this closes the carried check);
  - the sandbox run's date and result.

  In the breakdown, mark the chunk 8 carried checks and the chunk 3 "Moved" line done, and tick the chunk 3 `--offline` minor and the chunk 6 non-English-Windows minor (gh half; git stays open).
- [ ] **Step 4: Commit** `test(host): sandbox round trip against github.com; record chunk 8 checks`

# Chunk 12: Release and Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pilot team member goes from nothing to a working workspace using only the published package and the docs ([breakdown](../../plan/v0-breakdown.md), chunk 12).

**Architecture:**
- `init` warms the `npx` cache for the pinned version.
- The scenario checklist gets a Copilot smoke test (C1–C3) and a "before each release" list.
- New docs: `docs/getting-started.md` (requirements, setup, client auto-approve rules, team and second-machine flows) and `docs/releasing.md`.
- Two releases:
  - **0.1.0-alpha.7:** for the Copilot smoke test and the old-CLI guard step of U1, which chunk 11 could not run;
  - **0.1.0 on `latest`:** for the pilot.

**Tech Stack:** TypeScript ESM, Node ≥ 22.12, commander, execa, Vitest.

**Spec:** [docs/spec.md](../../spec.md):
- 3 Requirements;
- 9.2 (Copilot rendering, "the getting-started docs show how to auto-approve the `npx -y brain-mesh-ai-workspace@` prefix in each client");
- 10 Testing ("scenario checklist … run by hand on Claude Code before each release; smoke test on Copilot");
- 11 v0.

## Decisions

1. **The cache warm-up** runs `npx -y brain-mesh-ai-workspace@<pin> version --json` once:
   - **When:** at the end of `init`, in both new and restore mode. It's best effort.
   - **Why it's needed:** `init` usually runs as `@next` or `@latest`. npx caches by package spec, so the first skill call with the exact pin would otherwise start cold, which takes 2–10 s on Windows (research Q4.4).
   - **Failure:** a failure or timeout (120 s) adds `W_NPX_WARM_FAILED` ("the first agent call may take a few seconds longer"). It never fails `init`.
   - **Opting out:** `BRAIN_MESH_NO_NPX_WARM=1` skips it, which the e2e tests set because their version isn't published.
   - **Windows:** npx runs as `npx.cmd` through the shell (execa `shell: true` on win32), because Node can't start a `.cmd` without one.
2. **The Copilot client for the smoke test is VS Code Copilot Chat in agent mode.** It's what the pilot uses, and Copilot CLI isn't installed on the dogfood machine. The Copilot CLI half of the chunk 5 duplicate-skill question is checked only if Copilot CLI is available. Otherwise it's recorded as unchecked.
3. **If VS Code lists a skill or agent twice** (from both `.claude/` and `.github/`):
   - **Check:** C1 also checks whether the item is still listed once `.github/skills/` (or `.github/agents/`) is moved away.
   - **If it is:** stop rendering that `.github/` folder, update spec 9.2 and record it.
   - **If it isn't:** keep both and record the duplicate as a known issue.

   The rendering change is test-first (Task 4).
4. **Auto-approve rules** in the docs always include the `@`, so a look-alike package such as `brain-mesh-ai-workspace-x` is never approved:
   - **Claude Code** (`.claude/settings.json`, which belongs to the user and is committed with the workspace): `"permissions": { "allow": ["Bash(npx -y brain-mesh-ai-workspace@:*)", "PowerShell(npx -y brain-mesh-ai-workspace@:*)"] }`.
   - **VS Code** (workspace `.vscode/settings.json`): `"chat.tools.terminal.autoApprove": { "/^npx(\\.cmd)? -y brain-mesh-ai-workspace@/": true }`.
   - **Checking them:** both rules are checked by hand in Task 4, where a skill call must run without a prompt. If either form is wrong, the docs get the form that works.
5. **Pilot fixes that are worth it now:**
   - the contribute skill's override wording (chunk 10 minor);
   - `GCM_INTERACTIVE=never` and `GIT_SSH_COMMAND="ssh -o BatchMode=yes"` beside `GIT_TERMINAL_PROMPT=0` for network git calls (chunk 9 minor), since a pilot's agent run must never hang on a prompt.

   The other deferred minors stay deferred.
6. **Versions:**
   - **0.1.0-alpha.7 (Task 4):** carries Tasks 1–3. Ramon runs C1–C3, the U1 guard step (alpha.6 → alpha.7) and the auto-approve checks on it.
   - **0.1.0 (Task 5):** published to `latest`. Ramon deprecates `0.1.0-alpha.0` and `0.0.0-stage`. The README's "Try" section says `@latest`.
7. **The pilot:**
   - Ramon onboards one pilot team member, who uses only `docs/getting-started.md` and the published 0.1.0. Ramon notes where they got stuck.
   - If the member is an outside collaborator of the org, the chunk 8 team-owner check is run as well: what does `doctor` say about an `@org/team` owner? If it's a false `owner-not-found`, the fix returns `unknown`, written test-first.

## Global Constraints

- Node 22.12 or newer, git, and a logged-in `gh` with the default scopes (`repo`, `read:org`) (spec 3).
- The package is `brain-mesh-ai-workspace` and the command is `brain-mesh`. Skills call `npx -y brain-mesh-ai-workspace@<pinned> … --json`.
- Every command for Ramon is given in Windows PowerShell (`npx.cmd`).
- Every command keeps its `--json` envelope, and new warning codes start with `W_`.
- Don't run `npx prettier`.

## Review Focus

Each item names the test that covers it.

1. **The warm-up fails or hangs** (offline, registry down, version not yet published). Expected: `init` still succeeds, with one `W_NPX_WARM_FAILED`, and the call has a timeout. (Task 1, "a failed warm-up is a warning"; "the default warm-up has a timeout and can be switched off".)
2. **The warm-up runs in a folder whose path contains a space**, on Windows through the shell. Expected: it runs with `cwd` set and the args unquoted. (Task 1, "the default warm-up has a timeout and can be switched off" asserts the execa call.)
3. **A broken relative link in the README or docs.** Expected: the docs test fails. (Task 3, "docs links resolve".)
4. **An auto-approve rule without the `@`**, which would approve look-alike packages. Expected: the docs test fails. (Task 3, "auto-approve rules are pinned to the package".)
5. **A pilot on PowerShell whose execution policy blocks `npx.ps1`.** Expected: the getting-started doc says to use `npx.cmd`. (Task 3, "getting started covers the requirements".)

---

### Task 1: `init` warms the npx cache

**Files:**
- Create `src/workspace/warm.ts`.
- Modify `src/commands/init.ts`, `src/commands/index.ts`, `test/helpers/cli.ts` and `test/e2e/setup.ts` (set `BRAIN_MESH_NO_NPX_WARM=1`).
- Tests: `test/unit/commands/init.test.ts` and `test/unit/workspace/warm.test.ts`.

**Interfaces:**
- Produces:
  - `export type Warm = (pin: string, cwd: string) => Promise<void>`;
  - `export const warmNpx: Warm`, which throws on failure;
  - `export async function warmCache(warm: Warm, pin: string, cwd: string): Promise<Warning[]>`, which returns `[]` or one `W_NPX_WARM_FAILED`;
  - `initCommand(deps: { host: Host; warm?: Warm })`, which defaults to `warmNpx`;
  - `commandsFor(host, warm?: Warm)`.

  `testCommands()` passes a no-op warm-up.

- [ ] **Step 1: Failing tests**
  - In `init.test.ts`:
    - **"warms the npx cache for the pin":** a recording warm-up is called once with `(packageVersion(), root)` in new mode and once in restore mode.
    - **"a failed warm-up is a warning":** a warm-up that rejects with `new Error('offline')` → exit 0, and the warnings contain `W_NPX_WARM_FAILED` with a message that contains "first agent call".
  - In `warm.test.ts`, **"the default warm-up has a timeout and can be switched off":** inject the runner (`warmNpxWith(runner)`, exported for the test) and assert it receives:
    - the command `npx` (`npx.cmd` on win32);
    - the args `['-y', 'brain-mesh-ai-workspace@1.2.3', 'version', '--json']`;
    - `{ cwd, timeout: 120000, shell: process.platform === 'win32' }`.

    With `BRAIN_MESH_NO_NPX_WARM=1` the runner is not called.
- [ ] **Step 2:** `npx vitest run test/unit/commands/init.test.ts test/unit/workspace/warm.test.ts`. Expected: FAIL (`warm` doesn't exist).
- [ ] **Step 3: Implement.** Call `warmCache` after the push in new mode and after `syncWorkspace` in restore mode. In new mode the text gets no extra line.
- [ ] **Step 4:** run the same tests, then the full suite. Expected: PASS.
- [ ] **Step 5:** commit with `feat(init): warm the npx cache for the pinned version`.

### Task 2: Pilot fixes (skill wording, non-interactive git)

**Files:**
- Modify `skills/contribute/SKILL.md` (around line 37) and `src/git.ts:23`.
- Tests: `test/unit/skills/contribute.test.ts` (create it if missing, next to the other skill tests) and `test/unit/git.test.ts`.

- [ ] **Step 1: Failing tests**
  - **"only a false positive can be overridden":** the contribute `SKILL.md` contains `Only a flag the user calls a false positive can be overridden` and doesn't contain `keep it with a reason`.
  - **"network git calls never prompt":** with an injected or inspected env, a `{ network: true }` call sets:
    - `GIT_TERMINAL_PROMPT: '0'`;
    - `GCM_INTERACTIVE: 'never'`;
    - `GIT_SSH_COMMAND: 'ssh -o BatchMode=yes'`, unless the user already set `GIT_SSH_COMMAND`, which is kept.

    Use whatever seam `git.ts` exposes. If it has none, export `networkEnv(base: NodeJS.ProcessEnv): Record<string, string>` and test that.
- [ ] **Step 2:** run both tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Reword the skill line as: "Only a flag the user calls a false positive can be overridden, and only with their reason; a real judgement is reworded or removed."
- [ ] **Step 4:** run the tests, then the full suite. Expected: PASS.
- [ ] **Step 5:** commit with `fix: contribute override wording; network git never prompts`.

### Task 3: Getting started, releasing, final scenario checklist

**Files:**
- Create `docs/getting-started.md`, `docs/releasing.md` and `test/unit/docs.test.ts`.
- Modify `README.md` ("Try the alpha" becomes a short "Get started" that links the doc), `docs/scenarios.md` (intro, "Before each release", `## Copilot smoke test` with C1–C3) and `test/unit/scenarios.test.ts` (the id filter `/^[PSUMC]\d/`, which now requires C1).

**Content `docs/getting-started.md` must have**, in this order:
1. Requirements: Node 22.12, git with `user.name` and `user.email`, `gh` with `gh auth login` and its default scopes, and Obsidian (optional).
2. Create a workspace with `npx -y brain-mesh-ai-workspace@latest init`. PowerShell users use `npx.cmd`, because the execution policy can block `npx.ps1`.
3. Open the workspace:
   - Obsidian on `brains/`;
   - Claude Code or VS Code on the workspace root.
4. Auto-approve the CLI, with the exact rules from decision 4 for Claude Code and for VS Code.
5. First steps: capture, ingest, ask (one example prompt each).
6. Join your team's brain: `mount <url> --mode contribute`, and contributing through a PR.
7. Team leads: `brain new <empty repo url> --description …`.
8. A second machine: `git clone` the workspace, then `npx -y brain-mesh-ai-workspace@<pin> init`.
9. Upgrading: the `upgrade --dry-run` flow.
10. Troubleshooting:
    - `E_PIN_MISMATCH`;
    - `W_PIN_CHANGED`;
    - the `gh` not logged in error;
    - an org that blocks user-namespace repos (`--remote`).

**Content `docs/releasing.md` must have:**
- the version bump;
- the full suite plus `npm run test:e2e`;
- `npm publish --tag next` for an alpha, and `npm publish` for a release;
- which scenarios to run per release: every P, M, S and U scenario on Claude Code, and C1–C3 on VS Code Copilot;
- recording the results in the run log.

**Scenarios C1–C3** run in VS Code Copilot Chat, agent mode, in the scenario workspace:
- **C1 Skills and agents load:**
  - the four skills and two agents are listed once each;
  - if one is listed twice, move `.github/skills/` (or `.github/agents/`) aside and check whether it is still listed (decision 3).
- **C2 Capture through the CLI:** the capture prompt from P1. Pass when:
  - the note lands in `brains/personal/` and is committed through `npx … commit`;
  - with the VS Code rule from decision 4, there's no approval prompt.
- **C3 Ask a question:** the P5 prompt. Pass when the answer cites the note and calls `search`.

- [ ] **Step 1: Failing tests in `docs.test.ts`**
  - **"docs links resolve":** every relative markdown link in `README.md` and `docs/*.md` (outside code fences, `#anchor` stripped) points to an existing file.
  - **"getting started covers the requirements":** the doc contains `22.12`, `gh auth login`, `npx.cmd`, `--remote`, `upgrade --dry-run` and `E_PIN_MISMATCH`.
  - **"auto-approve rules are pinned to the package":** every line of `getting-started.md` that contains `brain-mesh-ai-workspace` inside an allow rule or an `autoApprove` entry also contains `brain-mesh-ai-workspace@`.

  In `scenarios.test.ts`, the filter now requires C1.
- [ ] **Step 2:** `npx vitest run test/unit/docs.test.ts test/unit/scenarios.test.ts`. Expected: FAIL.
- [ ] **Step 3:** write the docs and the scenarios.
- [ ] **Step 4:** run the tests, then the full suite. Expected: PASS. A broken link that already exists is fixed in this task.
- [ ] **Step 5:** commit with `docs: getting started, releasing, Copilot smoke test`.

### Task 4: alpha.7 and the hand checks (stop for Ramon)

**Files:**
- Modify `package.json` and `package-lock.json` (0.1.0-alpha.7) and `docs/scenarios.md` (run log).
- Modify `docs/research/2026-11-chunk-01-research.md` (add "Chunk 12 checks") and `docs/plan/v0-breakdown.md`.
- Only if decision 3 calls for it: `src/render/*`, the render tests and `docs/spec.md` 9.2.

- [ ] **Step 1:** set the version to 0.1.0-alpha.7, after the final review's fix pass. Commit with `chore: 0.1.0-alpha.7`.
- [ ] **Step 2: Stop for Ramon.** All commands are in PowerShell.
  1. He publishes with `npm publish --tag next`.
  2. He runs the U1 guard step. He makes two fresh clones of `rwifire/my-brain-mesh`, both still on alpha.6, runs alpha.7 `upgrade` in clone A, then alpha.6 `sync` in clone B. Expected: `W_PIN_CHANGED`, and `git status` clean. Then alpha.7 `init` in clone B.
  3. He times `init` and the first skill call in a new scenario workspace, to see the warm-up's effect.
  4. He runs C1–C3 in VS Code Copilot.
  5. In Claude Code, he checks the rule from decision 4: a skill call must run with no prompt.
  6. He pastes the outputs.
- [ ] **Step 3: Record the results:**
  - the run log rows;
  - "Chunk 12 checks" in the research note: the duplicate-skill answer, the auto-approve rule forms that work, and the warm-up timings;
  - the breakdown's carried checks, marked done.

  A failure, including a decision 3 rendering change, is fixed here with its test written first.
- [ ] **Step 4:** commit with `docs: chunk 12 alpha.7 checks`.

### Task 5: 0.1.0 and the pilot (stop for Ramon)

**Files:**
- Modify `package.json` and `package-lock.json` (0.1.0) and `README.md` (`@latest`).
- Modify `docs/research/2026-11-chunk-01-research.md` and `docs/plan/v0-breakdown.md` (chunk 12 status).

- [ ] **Step 1:** set the version to 0.1.0 and commit with `chore: 0.1.0`.
- [ ] **Step 2: Stop for Ramon:**
  1. He publishes with `npm publish`.
  2. He deprecates the old versions: `npm deprecate brain-mesh-ai-workspace@0.1.0-alpha.0 "use 0.1.0 or later"` and the same for `0.0.0-stage`.
  3. He onboards the pilot member with `docs/getting-started.md` alone and notes every place they got stuck.
  4. If the member is an outside collaborator, he runs `doctor` on a brain with an `@org/team` owner.
- [ ] **Step 3: Record and fix:**
  - the pilot findings go in the research note;
  - each doc gap is fixed in the doc;
  - each code failure is fixed test-first (a false `owner-not-found` returns `unknown`, decision 7);
  - the chunk 12 status in the breakdown is marked done. The v0 "done when" (one month of real use) is tracked there as the pilot's own goal.
- [ ] **Step 4:** commit with `docs: chunk 12 pilot`. If code changed, the release is 0.1.1.

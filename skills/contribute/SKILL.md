---
name: contribute
description: Bring approved changes in a shared brain to its team. Check the generated lists, review the changed files against the people policy, show the pull request, and open it only when the user agrees (an unpublished brain gets a direct commit). Use when notes in a shared brain under brains/<id>/ were written and approved and should reach the team, when the user says "contribute", "open a PR for this", or "share this with the team", or when the ingest skill hands over a shared target.
---
# Contribute

Run this only after the user approved the content. Shared brains change only through this skill: never commit, branch or push in `brains/<id>/` by hand (the one exception is resolving a conflict, step 6).

## 1. Check the mode

`{{cli}} mounts --json`

Find the brain in `data`:

- `mode: "read"`: nothing is written to it. Offer to keep the content as a personal note in `brains/personal/` instead, and stop here.
- `mode: "contribute"` with `published: true`: the change becomes a pull request.
- `mode: "contribute"` with `published: false`: the brain has no remote yet; the same steps end in a direct commit, and nothing is pushed.

## 2. Bring the generated lists up to date

`{{cli}} doctor <id> --fix --json`

Fix what it still reports (a broken link, a missing `summary`) with the user, and run it again until it reports no errors.

## 3. List the files

`{{cli}} commit <id> --dry-run -m "<title>" --json`

`<title>` is one line that says what changes and why ("Runner cache: decide on layer caching"). The result's `files` are the brain-relative paths in the change, and `branch` is the PR branch it will use.

## 4. Review the people passages

Read `brains/<id>/brain.yaml`. When its `policies.people` is `accountability`, hand the brain id and the `files` to the `people-policy-reviewer` agent.

- `NO FLAGS`: go on.
- For each `FLAG` line: show it to the user and fix the passage together, usually by keeping only the responsibility, decision or outcome.
- A flag the user calls a false positive stays only with their reason. Collect those for the body as an override:

  ```
  People-policy overrides:
  - areas/ci/runner-cache-strategy.md:12 — "Maria decided against S3" — a decision, not a judgment
  ```

After a fix, run steps 2 and 3 again.

## 5. Show the proposal

Show the user:

- the title;
- the body: why the change is made, what it covers, and the people-policy overrides if any;
- the files from step 3.

Ask before you open the pull request (or make the direct commit). Change the title or body as the user asks.

## 6. Open it

`{{cli}} commit <id> -m "<title>" --body "<why>" --json`

- PR route: report `data.pr.url` (the PR URL) and the branch. The clone is back on the default branch, without the change: the change is in the PR until it is merged.
- Direct route: report the commit.
- On an error, tell the user what the message says. When it names a compare URL, the branch is pushed and the user can open the pull request there. When it says the changes are back, nothing was lost and the change can be committed again after the fix. When it says they are kept in git stash, tell the user to run `git stash pop` in `brains/<id>/`.
- `E_DOCTOR_ERRORS`: the brain has errors (sometimes from newer notes on `origin`). Run step 2 again, fix what it lists with the user, then step 6.
- `E_SYNC_CONFLICT`: someone changed the same notes on `origin`. The clone is as it was. With the user's agreement, run the git commands the message names in `brains/<id>/` (this is the one time you run git there yourself), resolve the conflicts with the user, then go back to step 2.

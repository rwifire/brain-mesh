---
name: ingest
description: Turn an inbox item or the current chat (meeting transcript, article, notes) into proposed knowledge notes in the personal brain, show the proposal grouped as decisions, updates, new notes and open questions, and write and commit only what the user approves. Use when the user says "ingest", "process my inbox", "file this", or asks to turn a capture or transcript into notes.
---
# Ingest

Propose first, write only what the user approves. Append by default: replace or delete existing text only when the user explicitly asks. Search before you create: extending an existing note beats a near-duplicate.

## 1. Pick the input

- If the user named an item, use it. If not, list the files in `brains/personal/inbox/` (oldest first) and ask which one, or use the material in the current chat.
- Read the whole input before proposing anything.

## 2. Route

- Read the mount table in the workspace `AGENTS.md` and `brains/personal/brain.yaml`.
- For now, every note goes into `brains/personal/`. If an item clearly belongs in a mounted shared brain (its `description` and `topics` cover it), say so in the proposal and keep it as a personal note; contributing to shared brains comes later.
- Never copy a raw transcript or raw capture anywhere except the personal brain.

## 3. Find related notes

Search with the input's key terms. Every word must occur in a note (at the start of a word), so use 2–4 distinctive words; if nothing comes back, search once more with fewer.

`{{cli}} search "<key terms>" --brain personal --json`

Then read `brains/personal/index.md`, the README of each area the hits sit in, and any maps they belong to. Open the hits that look related.

## 4. Propose

Show one proposal, grouped like this. Every item carries a short quote or timestamp from the input so the user can check it quickly.

- **Decisions:** only what was decided, kept apart from things merely discussed.
- **Updates to existing notes:** as a diff of the lines to add (or change, if the user asked).
- **New notes:** only for concepts no mounted brain covers yet. For each: path, `type`, title, one-sentence `summary`, and the links it will carry.
- **Open questions and contradictions:** with the existing note they contradict.

Then ask what to keep: the user can accept, edit or reject each item, and say whether to keep the inbox item as a source.

## 5. Write what was approved

Placement and format:

- A note goes into an existing area (`areas/<area>/`) when one fits, else into `notes/`. Create a new area only when the user agrees; it gets a `README.md` with `type: area`.
- Start new notes from the template in `.mesh/templates/notes/<type>.md`. Frontmatter: `type`, `summary` (one specific sentence), `updated` (today, `YYYY-MM-DD`); `maps` and `project` only when they apply.
- File names are lowercase kebab-case and unique in the brain. The title states the claim or question ("Layer caching beats artifact caching for our runners"), not just the topic.
- Add a *Related* section with relative markdown links and a reason for each: `[Runner pools](../ci/runner-pools.md): the pools this assumes`. No wikilinks.
- When you edit an existing note, set its `updated` to today.

Then, in this order:

1. Delete the inbox item as a plain file with `rm <path>` in a POSIX shell (Git Bash on Windows; `Remove-Item` only where no POSIX shell exists), not `git rm`: the commit below stages the deletion. If the user wants to keep it, move it with `mv <path> <target>` to `brains/personal/sources/<slug>.md` instead and give it frontmatter `type: source`, a one-sentence `summary` and `updated`; links from the new notes point to that path. If the shell refuses, ask the user to approve or delete the file before you go on.
2. Check the result and regenerate the brain's generated lists in one call, and fix anything it still reports (a broken link to the removed inbox item, for one):

   `{{cli}} doctor personal --fix --json`

3. Commit everything in one call, with a message that says *why* the notes changed (e.g. "Ingest platform sync: runner cache decision, flaky-test question"):

   `{{cli}} commit -m "<why>" --json`

4. Report the files written and whether the result says `"pushed": true`.

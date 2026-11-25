---
name: ask
description: Answer a question from the knowledge in the mounted brains (personal and shared), with links to the notes used, the brains searched, and the owner to ask when nothing answers it. Read-only. Use when the user asks what the team or they themselves know about something, "what did we decide about …", "how do we …", "where is … documented", or wants an answer from their notes.
---
# Ask

Ask never writes: no file is created, changed or committed.

## 1. Route

- Read the mount table in the workspace `AGENTS.md`: every mounted brain with its mode and description.
- For the brains that might hold the answer, read `brains/<id>/brain.yaml`: `description`, `topics` and `out_of_scope`. Pick the candidates; always include `personal` when the question could be about the user's own notes.

## 2. Narrow

Read each candidate's `index.md`, then the area READMEs and maps that match the question. Their generated lists show each note's one-sentence summary, so you can often see the right notes before opening them.

## 3. Search

Search the candidates. Every word must occur in a note (at the start of a word), so use 2–4 distinctive words; if nothing comes back, search once more with fewer.

`{{cli}} search "<the question's key words>" --brain <id1,id2> --json`

Hits whose `match` is `summary` are the strongest. Open the top hits and the notes the MOCs pointed you to, and follow their *Related* links when they help.

## 4. Answer

- Answer from the notes, and link every note you used with a path relative to the workspace root, e.g. `[Runner cache strategy](brains/brain-team-platform/areas/ci/runner-cache-strategy.md)`.
- Name the brains you searched.
- If a note links to a brain that isn't mounted, or a candidate brain's `links_to` names one, say "this is covered in brain <id>, which you don't have mounted".
- When notes disagree, show both and say which is newer (`updated`).

## 5. No answer

Say plainly that the mounted brains don't answer it. Name who to ask: the `owner` in the frontmatter of the most relevant area's `README.md`, else the `owner` in that brain's `brain.yaml`.

If the user then wants to keep what they learn elsewhere, suggest the `capture` skill.

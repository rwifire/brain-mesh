---
name: capture
description: Drop raw input (a thought, a link, pasted notes, a meeting transcript) into the personal brain's inbox, verbatim and unprocessed, and commit it. Use when the user says "capture", "note this down", "save this for later", "put this in my inbox", or pastes material to keep before deciding what it means.
---
# Capture

Capture keeps raw material fast and unchanged. Making sense of it is the `ingest` skill's job, later.

The user asking for a capture is their approval: write it, then show what you wrote. Capture only ever creates one new file in `brains/personal/inbox/`; it never edits an existing file and never writes to a shared brain.

## Steps

1. **Title.** Take a short title from the user's words or the material (e.g. "Platform sync 2026-11-20"). Ask only if nothing suggests one.
2. **File name.** `brains/personal/inbox/<YYYY-MM-DD>-<slug>.md`, where the date is today and the slug is the title in lowercase kebab-case (letters, digits, hyphens; at most 60 characters). If the file exists, add `-2`, `-3`, … before `.md`.
3. **Write the file** exactly in this shape, with no frontmatter:

   ```
   # <title>

   <the raw text, verbatim: no summarising, no reformatting, no corrections>

   Source: <where it came from, if known: a meeting, a URL, "chat">
   Captured: <YYYY-MM-DD>
   ```

   Leave out the `Source:` line when the origin is unknown.
4. **Commit and push** in one call:

   `{{cli}} commit -m "Capture: <title>" --json`

5. **Report** the file path and whether the result says `"pushed": true`. If it carries a warning (no upstream, push failed), tell the user the capture is committed locally and why it wasn't pushed.

Raw captures and transcripts stay in the personal brain. If the user wants the knowledge in a shared brain, suggest running `ingest` on the capture.

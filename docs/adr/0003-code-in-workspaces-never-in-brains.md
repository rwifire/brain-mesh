# Executable code is allowed in workspaces, never in brains

The core and the user's workspace may ship executable code (scripts, tools with tests, later an app launcher); brains may not, and carry only markdown, YAML and instruction-only skills. The first draft banned code everywhere outside the core, which blocked users from building their own workflow tooling. Brains stay code-free because a mounted brain is content written by many contributors and cloned onto every reader's machine; allowing code there would let anyone with push rights on one shared brain run code on every machine that mounts it.

## Consequences

- `doctor` warns about executable files found inside a brain.
- Brains carry no client skill or agent folders (`.claude/`, `.github/skills/`, `.github/agents/`, `.agents/`): Claude Code auto-loads nested skills, so they would act on every reader's session. `doctor` errors on them.

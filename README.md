# brain-mesh

brain-mesh gives every user an AI workspace with a personal brain and mounted shared team brains, all plain markdown in git, usable from Claude Code, GitHub Copilot and Obsidian. See the [specification](docs/spec.md) and the [glossary](GLOSSARY.md).

## Commands

Every command takes `--json` and then prints exactly one JSON envelope on stdout.

| Command | Does |
| --- | --- |
| `brain-mesh version` | Print the version |
| `brain-mesh doctor [brain] [--fix]` | Check every brain, or one brain, in the workspace; exits 1 when it finds an error. `--fix` regenerates out-of-date generated content (`links_to`, MOC lists, `CODEOWNERS`, the generated part of `AGENTS.md`, a missing `CLAUDE.md`). Finding codes: [docs/doctor-checks.md](docs/doctor-checks.md) |

## Development

Requires Node 22.12 or newer.

| Command | Does |
| --- | --- |
| `npm run build` | Compile `src/` to `dist/` |
| `npm run typecheck` | Type-check sources and tests |
| `npm test` | Run unit and end-to-end tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:e2e` | Pack the package and run it through `npx` |

Licensed under Apache 2.0.

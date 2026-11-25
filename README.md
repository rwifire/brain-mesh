# brain-mesh

brain-mesh gives every user an AI workspace with a personal brain and mounted shared team brains, all plain markdown in git, usable from Claude Code, GitHub Copilot and Obsidian. See the [specification](docs/spec.md) and the [glossary](GLOSSARY.md).

## Try the alpha

Needs Node 22.12 or newer, git, and the GitHub CLI (`gh`) logged in. In an empty folder:

```bash
npx -y brain-mesh-ai-workspace@next init
```

This creates a private repo `ai-workspace` on your GitHub account and pushes the workspace to it. Open the folder in Claude Code and ask it to capture a thought, ingest an inbox item, or answer a question from your notes; the folder is also an Obsidian vault. The alpha covers the personal brain only.

## Commands

Every command takes `--json` and then prints exactly one JSON envelope on stdout.

| Command | Does |
| --- | --- |
| `brain-mesh version` | Print the version |
| `brain-mesh init [--name <repo>] [--remote <url>]` | Create a workspace in the current empty folder: personal brain, `AGENTS.md`, skills, git with a pre-commit hook. Without `--remote` it creates a private GitHub repo (`ai-workspace` by default) through `gh` and pushes to it |
| `brain-mesh commit [brain] -m <message>` | Commit the personal brain's changes (other changes stay staged as they were), pull with rebase and push |
| `brain-mesh search <query...> [--brain <ids>] [--limit <n>]` | Find notes containing every word of the query; title and summary hits rank first. `--brain` takes comma-separated brain ids; default limit 20 |
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

# brain-mesh

brain-mesh gives every user an AI workspace with a personal brain and mounted shared team brains, all plain markdown in git, usable from Claude Code, GitHub Copilot and Obsidian. See the [specification](docs/spec.md) and the [glossary](GLOSSARY.md).

## Try the alpha

Needs Node 22.12 or newer, git, and the GitHub CLI (`gh`) logged in. In an empty folder:

```bash
npx -y brain-mesh-ai-workspace@next init
```

This creates a private repo `ai-workspace` on your GitHub account and pushes the workspace to it. Open the folder in Claude Code and ask it to capture a thought, ingest an inbox item, or answer a question from your notes; the folder is also an Obsidian vault. Shared brains can be created, mounted and synced; contributing to them through pull requests comes later.

## Commands

Every command takes `--json` and then prints exactly one JSON envelope on stdout.

| Command | Does |
| --- | --- |
| `brain-mesh version` | Print the version |
| `brain-mesh init [--name <repo>] [--remote <url>]` | Create a workspace in the current empty folder: personal brain, `AGENTS.md`, skills, git with a pre-commit hook. Without `--remote` it creates a private GitHub repo (`ai-workspace` by default) through `gh` and pushes to it |
| `brain-mesh init` (in a clone) | Restore a workspace you cloned with `git clone`: render the managed files, set the pre-commit hook, clone every mounted brain. Refuses with `E_PIN_MISMATCH` when `mesh.yaml` pins another version and names the `npx` command to use instead |
| `brain-mesh mount <git-url> [--mode read\|contribute]` | Clone a shared brain into `brains/<id>/` (the id is the repo name), record it in `mesh.yaml`, commit and push the workspace. Default mode `read`; `contribute` first checks you can push to it on GitHub |
| `brain-mesh mounts` | List the personal brain and every mount: mode, url, whether it is published and cloned, its description |
| `brain-mesh unmount <id> [--force]` | Remove a mount from `mesh.yaml`, commit and push, then delete `brains/<id>/`. Refuses while the clone has uncommitted or unpushed work, or the brain is unpublished, unless `--force` |
| `brain-mesh sync` | Pull and push the workspace, then clone missing mounts and fast-forward the rest. A mount with local changes, local commits, another branch or a broken remote is left alone with a warning; the others still sync |
| `brain-mesh brain new <url-or-id> --description <text> [--owner <owner>] [--name <title>]` | Create a shared brain and mount it to contribute. With the URL of an empty repo it pushes the brain there; with an id it stays local until `brain publish`. Owner defaults to you |
| `brain-mesh brain publish <id> <git-url>` | Push a local brain to an empty repo whose name is the brain id, and record its url |
| `brain-mesh commit [brain] -m <message> [--body <text>] [--dry-run]` | Commit a brain's changes by its route. Personal (the default): commit only `brains/personal/` (other changes stay staged as they were), pull with rebase and push. A published shared brain mounted `contribute`: check it with `doctor`, branch `mesh/<user>/<slug>` from fresh `origin/<default>`, push and open a pull request (title: the message's first line; description: `--body`, else the rest of the message), then return the clone to its default branch. An unpublished shared brain: a direct commit, not pushed. A `read` mount: refused. `--dry-run` runs the offline checks and lists the files and the planned branch |
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

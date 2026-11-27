# Getting started

This guide takes you from nothing to a working brain-mesh workspace: a personal brain, your team's shared brain mounted, and Claude Code or GitHub Copilot answering from both. Terms are explained in the [glossary](../GLOSSARY.md).

## 1. What you need

- **Node 22.12 or newer.** Check with `node --version`.
- **git**, with your name and email set:
  ```
  git config --global user.name "Your Name"
  git config --global user.email you@example.com
  ```
- **The GitHub CLI (`gh`), logged in.** Run `gh auth login` once and accept the default scopes (`repo`, `read:org`); brain-mesh needs nothing more.
- **Claude Code or VS Code with GitHub Copilot.**
- **Obsidian** (optional), to read and browse the brains.

There is nothing to install: every command runs through `npx`.

**Windows PowerShell:** write `npx.cmd` wherever this guide says `npx`. PowerShell's execution policy often blocks `npx.ps1`, and `npx.cmd` always works.

## 2. Create your workspace

In a new, empty folder:

```
npx -y brain-mesh-ai-workspace@latest init
```

This creates a private repo `ai-workspace` on your GitHub account, sets up the workspace with your personal brain in `brains/personal/`, and pushes it. Use `--name <repo>` to pick another repo name.

If your organisation blocks repos in your own namespace, `init` says so. Create an empty repo where you can, and pass it with `--remote <url>`.

`mesh.yaml` now pins the brain-mesh version. From here on, every command you or your agent run uses exactly that version: `npx -y brain-mesh-ai-workspace@<pinned version> …`. The skills already know the pinned version.

## 3. Open it

- **Obsidian:** open `brains/` as a vault.
- **Claude Code:** start it in the workspace folder.
- **VS Code:** open the workspace folder and use Copilot Chat in agent mode.

## 4. Let your agent run brain-mesh without asking

Agents call the CLI often, about once per step. Approve brain-mesh once, and only brain-mesh: every rule below includes the `@` after the package name, so no other package matches.

**Claude Code:** add this to `.claude/settings.json` in the workspace (create the file if it doesn't exist; it's yours and brain-mesh never touches it):

```json
{
  "permissions": {
    "allow": [
      "Bash(npx -y brain-mesh-ai-workspace@*)",
      "PowerShell(npx -y brain-mesh-ai-workspace@*)",
      "PowerShell(npx.cmd -y brain-mesh-ai-workspace@*)"
    ]
  }
}
```

**VS Code (Copilot):** add this to `.vscode/settings.json` in the workspace:

```json
{
  "chat.tools.terminal.autoApprove": {
    "/^npx(\\.cmd)? -y brain-mesh-ai-workspace@/": true
  }
}
```

## 5. First steps

Ask your agent in plain words. For example:

- **Capture:** "Capture this: try Renovate's grouped updates for the platform repos."
- **Ingest:** paste meeting notes or a transcript into `brains/personal/inbox/`, then ask "Ingest the inbox." The agent proposes where each piece goes and waits for your approval.
- **Ask:** "How long do runner cache layers live, and why?" The answer cites the notes it used.

Every change to your personal brain is committed and pushed for you.

## 6. Join your team's brain

Your team's brain is its own git repo. Mount it to contribute:

```
npx -y brain-mesh-ai-workspace@<pinned version> mount <git url> --mode contribute
```

Or ask your agent: "Mount <git url> to contribute." Use `--mode read` for a brain you only read.

Changes to a shared brain go through a pull request. When the agent has written something there, it checks it, and opens the PR after you approve. A reviewer agent flags passages that judge people, and you fix those before the PR is opened. Your team reviews and merges the PR on GitHub.

`npx -y brain-mesh-ai-workspace@<pinned version> sync` pulls your workspace and every mounted brain.

## 7. For team leads: create the team brain

Create an empty repo named after the brain (for example `brain-platform`), then:

```
npx -y brain-mesh-ai-workspace@<pinned version> brain new <git url of the empty repo> --description "What this brain knows, one sentence" --owner @your-org/your-team
```

This pushes the brain template to the repo and mounts it to contribute. Teammates mount it with the URL.

## 8. A second machine

Clone your workspace repo, then restore it in the clone:

```
git clone <your workspace repo url>
cd ai-workspace        # or your repo's name
npx -y brain-mesh-ai-workspace@<pinned version> init
```

Use the version pinned in `mesh.yaml`. `init` re-renders the agent files, turns on the pre-commit hook and clones every mounted brain.

## 9. Upgrading

Run the upgrade with the new version. First see what changes:

```
npx -y brain-mesh-ai-workspace@<new version> upgrade --dry-run
```

Then run it without `--dry-run`. It bumps the pin, re-renders the managed files, and commits and pushes. Your notes, `.local/` and `tools/` are never touched. If you edited `.gitattributes` or `brains/.obsidian/app.json`, yours are kept; pass `--accept <path>` to take the new one. Or ask your agent: "Upgrade brain-mesh to <new version>."

On your other machines, run `sync` with the version they have (it pulls the upgrade and warns `W_PIN_CHANGED`), then `init` with the new version.

## 10. When something goes wrong

| You see | Do this |
| --- | --- |
| `E_PIN_MISMATCH` | The workspace pins another version. Run the command it names, with the pinned version. |
| `W_PIN_CHANGED` after `sync` | Another machine upgraded. Run `npx -y brain-mesh-ai-workspace@<the new pin> init`. |
| `E_GH_AUTH`, "gh is not logged in" | Run `gh auth login`. |
| `E_GH_MISSING` | Install the GitHub CLI and log in. |
| `init` can't create the repo | Your organisation may block repos in your namespace: create an empty repo elsewhere and use `--remote <url>`. |
| `W_NPX_WARM_FAILED` | Harmless: the first agent call takes a few seconds longer. |
| `doctor` errors | Run `npx -y brain-mesh-ai-workspace@<pinned version> doctor --fix`, then fix what's left by hand; the codes are in [doctor-checks.md](doctor-checks.md). |

Every command takes `--json` and has `--help`. The full command list is in the [README](../README.md#commands).

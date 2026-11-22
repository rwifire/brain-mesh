# Workspace and personal brain share one repo in the user's own namespace

A user's workspace (tooling, configuration, own tools) and their personal brain are one private git repository in the user's own namespace of their company-managed account, not a repo in the company org. Shared brains are separate clones placed inside the workspace (gitignored, never submodules), and a shared brain's repo contains only the brain, never a workspace. This reverses the first draft's decision ("personal brains are private repos in the company org"): one repo makes the whole setup move between machines with a single clone and removes naming clashes in the org, while the company still keeps control because the account itself is company-managed (EMU or equivalent).

## Consequences

- Private personal github.com accounts are not a supported home for a workspace, because the company would lose control when someone leaves.
- The personal brain's id is no longer a repo name, so "brain id = repo name" applies to shared brains only.
- Commits to the personal brain land in the same repo as tooling changes, so agents must stage only the brain's paths.

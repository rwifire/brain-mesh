---
type: howto
summary: Release a repo by tagging main with a semver tag after the release checklist passes
updated: 2026-11-01
---
# Release a platform repo

1. Check that `main` is green and the changelog lists every merged PR.
2. Tag `main` with the next semver version, e.g. `v1.4.0`.
3. Push the tag; the release workflow builds and publishes the artifacts.
4. Announce the release in the platform channel with a link to the changelog.

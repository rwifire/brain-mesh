---
type: note
summary: Runners cache node_modules as a Docker image layer with a 7-day TTL instead of uploading cache artifacts
updated: 2026-11-18
---
# Layer caching beats artifact caching for our runners

We bake `node_modules` into a Docker image layer per lockfile hash. Runners pull the layer instead of downloading a cache artifact, which saves about two minutes per job.

- Cache key: hash of `package-lock.json`.
- Layers expire after 7 days.
- A cache miss falls back to a clean `npm ci`.

## Related

- [Flaky tests are quarantined after two failures in a week](flaky-test-policy.md): cache misses were once blamed for flaky tests

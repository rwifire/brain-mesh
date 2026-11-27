---
type: note
summary: Runner cache layers are kept for 14 days so that rarely built branches still hit the cache
updated: 2026-11-03
---
# Runner cache layers are kept for 14 days

The runners cache `node_modules` as a Docker image layer per lockfile hash.

- Layers are kept for 14 days, so release branches that build once a week still hit the cache.
- A miss falls back to a clean `npm ci`, which costs about two minutes.

## Related

- [Cache layers expire after 7 days](cache-ttl-decision.md): the later decision on the same setting

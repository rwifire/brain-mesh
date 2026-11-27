---
type: decision
summary: Runner cache layers expire after 7 days because the 14-day layers filled the runner disks
updated: 2026-11-19
---
# Cache layers expire after 7 days

Decided in the platform sync on 2026-11-19.

- Cache layers expire after 7 days.
- Why: with 14 days the runner disks reached 90% twice in one week.
- Release branches that miss the cache take the two-minute `npm ci` path.

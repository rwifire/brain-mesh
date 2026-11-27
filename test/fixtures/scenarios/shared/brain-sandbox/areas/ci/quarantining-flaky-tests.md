---
type: howto
summary: Tests that fail twice in a week with no code change go to quarantine, where they no longer block merges
updated: 2026-11-14
---
# Quarantining flaky tests

When a test fails twice in seven days and no related code changed, it is flaky:

1. Move it to the quarantine suite. That suite runs on every build but does not block merges.
2. Open a ticket for the owning team; they fix or delete it within two sprints.

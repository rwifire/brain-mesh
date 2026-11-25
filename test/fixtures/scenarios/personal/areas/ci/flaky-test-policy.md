---
type: decision
summary: A test that fails twice in one week without a code change is quarantined and gets an owner to fix it
updated: 2026-11-12
---
# Flaky tests are quarantined after two failures in a week

Decided in the platform retro on 2026-11-12.

- Two failures within seven days without a related code change mark a test as flaky.
- Flaky tests move to the quarantine suite, which runs but does not block merges.
- The owning team gets a ticket; quarantined tests are fixed or deleted within two sprints.

---
type: decision
summary: A test that fails twice in one week without a code change is moved to the quarantine suite
updated: 2026-11-12
---
# Flaky tests are quarantined after two failures in a week

- Two failures within seven days, without a related code change, mark a test as flaky.
- Flaky tests move to the quarantine suite, which runs but does not block merges.
- The owning team fixes or deletes a quarantined test within two sprints.

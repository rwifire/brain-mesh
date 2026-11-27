# Releasing

How a brain-mesh version goes to npm. Spec 10: the CLI is tested automatically; skills and agents are checked by hand on Claude Code before each release, and smoke-tested on Copilot.

1. **Version.** `npm version <version> --no-git-tag-version`, which updates `package.json` and `package-lock.json`. Commit as `chore: <version>`.
2. **Automated tests.** `npm run typecheck`, `npm test` (unit and e2e) and the CI run on Windows and Linux are all green.
3. **Publish.**
   - An alpha: `npm publish --tag next`. `latest` stays where it is.
   - A release: `npm publish`, which moves `latest`.
4. **Scenario checks** from [scenarios.md](scenarios.md), with the published version:
   - every P, M, S and U scenario on Claude Code;
   - C1–C3 on VS Code Copilot.

   A scenario that fails is fixed with a test written first and released as the next version.
5. **Record.** Add one run-log row per scenario to [scenarios.md](scenarios.md#run-log): date, version, scenario, pass, partial or fail, and what you saw. Findings about the clients go in the research note.

Old versions that must not be used get `npm deprecate brain-mesh-ai-workspace@<version> "<why>"`.

# App registry service acceptance
Role: Standard worker, gpt-6.1-sol medium; keep configured existing worker model.
Goal: Add meaningful provider-free acceptance for the new app registry service.
Own: packages/fluxiq/src/platform/apps/runtime/tests/** only; reports/app-registry-service-acceptance.md.
Must not touch: production source, storage tests, shared docs, dist, git, any other paths.
Context: hosted-platform-launch-plan Current State; platform/apps/model/** and runtime/**; apps/tests/fixtures/**; storage/tests/sqlite-app-registry-store.test.ts for real SQLite pattern.
Exercise real SQLite store and mutable trusted authority/target ports, temp data only.
Cover server-derived tenant/user; request-field injection; publisher permission; exact installed grants and origin/generation; foreign tenant; authority revoked during awaited target; installation changed during target; expected resolution stale; query no compute charge; explicit cloud execution payer; absent ports fail closed; fixed errors.
Resolution is metadata only: no execution, debit, run, or receipt exists yet. Do not invent those claims.
Use existing fixture helpers; add local test helpers only as necessary, follow structure.
Contracts build is currently running; wait for root build-ready signal before test execution.
Run narrow runtime tests only, no full suites/build/dist mutation; report production defects to root for serial fix.
Return concise Done/Partial/Blocked, Changed, Validation command/output, Not verified, Report, Notes.

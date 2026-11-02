# Durable project execution coverage and command bridge

Role: heavy worker, gpt-6.1-sol, Max.
Goal: implement API proposal A2 against frozen A1 contracts, reusing the sole gateway command journal.
Read reports/execution-admission-api.md including Accepted interface amendments and reports/execution-admission-authority.md.
Wait for explicit lead dispatch after the current source/build checkpoint.
Own new Studio storage/project/execution-admission/** and runtime/service/execution-admission/**.
Own existing storage/project/command-ledger/store.ts and its immediate tests; migration registration changes only where actually required.
Own the narrow actual observer/consumption bridge changes in runtime/service/command-run/** and command-execution/** and their immediate tests.
Lead owns service.ts, programs/_shared/runtime.ts, package exports, generic source contracts and shared docs/config/git.
Must not touch engine/native/IO/output-dispatch, candidates/LLM/trial wrappers, recording, draft or other worker files.
Implement real transactional persistence port, proof-joined inventory, migration, scope/resource fences, roots/children, coverage facts and terminal handling seals.
Never duplicate claim/receipt/unknown truth or backfill telemetry/legacy receipts into a false complete baseline.
Use original private entryBridge entry read inside claim transaction; returned DTO is never authority.
Atomic claimForExecution links the one real existing claim and actual original entry/fence; required mode delegates to existing claimForRun rules in that same mutation.
Sole gateway observer authenticates completion synchronously; required consumption recorded only after existing handling owner succeeds.
Persistent open coverage must survive committed-receipt/observer failure, crashes, new candidate/run/loop/epoch and reopen.
Derive/CAS-validate actual child frontier in finish; source digest never selects a frontier or clears a required/unknown latch.
Keep baseline/resource association truthful and conservative; missing/corrupt/unlinked/overflow data is unverified, never clear.
Preserve old first-run behavior, optional observation and original context/receiver identity; no fake client/session identities.
Use existing UnitOfWork/idempotency proofs, bounded inventory and current migration head; no hard-coded guessed migration number.
Use real isolated SQL tests for pending/reopen/race/rollback/corruption/proof joins/committed-receipt observer failure/required latch.
No providers, user data, full suites/builds, browser/panel, audit exceptions, baseline transfer or git.
Report stable controller composition ports needed by lead/B/C, exact commands/results and remaining producer wiring.
Own report: reports/execution-admission-durability.md. Freeze source at handoff.
Return Outcome, Changed, Validation, Not verified, Report and at most three Notes lines.

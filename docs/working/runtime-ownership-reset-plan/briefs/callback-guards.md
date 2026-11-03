Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Complete preserved descriptor/native-clock safeguards as one finite defect batch.
Owned: packages/fluxiq/src/engine/automation/execution-admission/** EXCEPT internal/driver.ts; framework/clock/**; framework/observability/exchange-log/native/**; runtime/environment/**; immediate owning tests.
Must not touch: SQL/persistence, runtime/execution-admission or execution-observation, other log folders, service/Studio, package.json, shared docs/indexes, downstream, git.
Read: AGENTS.md boundary/validation; reset plan Current State/Restart Audit; reports/wip-salvage.md; code-structure.
Reproduce own/inherited callback getters, getters replaced after admission, symbol option copies, replaced Date/Math methods through live wrappers; preserve ordinary legacy paths and original callback receiver/tuple.
Complete actual invocation/read adapters rather than helper-only checks. Unsupported observed callbacks must leave existing frame durably unknown and must not perform a lasting callback; do not introduce new authorities/protocols.
Preserve current public first-run compatibility and original native log helpers. Define bounded cases then fix those paths; report any additional necessary ownership before expanding.
Run focused owner tests only on stable closures; no broad typecheck/build/audit during other writes.
Acceptance: descriptor and native clock regression tests, original callback/record-batch/native-log compatibility tests; no program reverse imports; baseline not raised.
Report: docs/working/runtime-ownership-reset-plan/reports/callback-guards.md, include exact touched files and test commands.
No commits/push/shared-doc edits/agents. End return contract.

# P8 repair-history implementation

Implemented the approved field-by-field projections in the existing history mapper. Obstruction records expose the closed kind and optional recorded wait; pace records expose finite bounded measurements; re-acquisition records expose strategy/outcome and source provenance only for row/output variants. Existing state_route entries now retain bounded counts/closeness and closed direction. Existing per-attempt entries remain ahead of appended observations; completed-act mapping and failure codes are unchanged. Invalid measurements are omitted, with no capped or invented values.

Extended the LLM recovery-kind union and documented observation semantics. No context-packet production edit was needed: its existing newest-40 count, omitted counts, locator replacement and credential-entry filtering already carry these scalar fields.

Added direct mapper tests for legacy bytes, privacy exclusions, obstruction/pace values, source-bound and source-less outcomes, missing provenance, invalid measurements, route/refusal observations, uncertainty, completed IDs and handler order. Added a real in-run runtime_patch request regression and a mixed-history packet regression covering all three new kinds, newest-40 ordering, caller/screen omissions, secret dropping and locator replacement. Existing non-in-run byte-digest and task-kind tests remain in place.

Source is frozen for lead verification. No checks, builds, audits, SDK generation, git, browser, provider, panel or runtime-data operations were run. Read-only text review confirmed the owned changes; automated type/test/structure claims await the lead's checks after other workers freeze. The read-only search for a per-file budget wording returned no match; no audit was run.

Outcome: Done
Changed: packages/fluxiq/src/programs/automation-studio/runtime/recovery/in-run-repair/history.ts; recovery/in-run-repair/tests/history-record.test.ts (new); recovery/in-run-repair/tests/request-slot.test.ts; llm/harness/task-request.ts; llm/harness/tests/in-run-repair-slot.test.ts; this report
Validation: not run (parallel source-edit freeze protocol; lead will run affected checks)
Not verified: compilation, focused tests, structure budgets, browser/model behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/history-implementation.md
Notes: No public executor/host ABI change and no obstruction code invented. No context-packet source edit. Available for lead's focused corrections.

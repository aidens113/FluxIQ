# Exact replay reference versus canonical list authority

Source status: FROZEN before owning validation. Changed only `prior-nodes/identity.ts`, `tests/authority.test.ts`, the existing alias/list case in `tests/run-nodes-loop.test.ts`, and this report.

The wider regression was a real repeat-guard defect. `identity.original()` unconditionally hashed record.referenceNow into authorityKey; C then included that key in its ordered-list identity. Giving ordinary originals genuine distinct host timestamps therefore made the same canonical definition/parameters/effective inputs, trusted semantic subject and world appear to be different lists. Both alias batches dispatched: four actual reads instead of the expected three.

The correction separates responsibilities. The private list authority key now contains the existing scope and opaque semantic subject identity. Exact reference validation and selected-rerun forwarding remain in D0 and the adapter capsule; those guards were not edited. C still keys definition/version, actual resolved parameters, effective inputs and world. Time-lowered concrete arguments remain intact, so meaningful time/input differences are not erased. No model call id, alias or fresh clock metadata becomes authority.

The existing actual-loop alias test now supplies DISTINCT deterministic host clock values `[1000,1001]` through D0's real private clock dependency. Its unchanged oracle requires three actual reads and `list_guard_refused` on the second equivalent batch. This forces the failure instead of hiding it behind a fixed fixture clock. The owning authority assertion now correctly requires raw timestamp-only differences to leave authority equal, while distinct trusted subjects/binding scope remain distinct.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/prior-nodes/tests --maxWorkers=2 --minWorkers=1` -> `Test Files 5 passed (5)`, `Tests 79 passed (79)`, `Duration 60.50s`. Includes the69 actual-loop cases, authority3, failure-boundaries2, service wiring2 and tool admission3.

No builds/types/audits/git/provider/browser operations ran. The lead received source-frozen notification immediately after edits so the SDK rebuild could proceed on stable source. Rebuilt SDK/paired web acceptance remains lead-owned.

Outcome: Done
Changed: prior-nodes/identity.ts; tests/authority.test.ts; tests/run-nodes-loop.test.ts; this report
Validation: owning prior-nodes Vitest command above -> 79 passed, 5 files, 60.50s
Not verified: rebuilt SDK, paired/browser behavior, package types/audit
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/reference-identity-correction.md
Notes: D0 exact timestamp checks and actual time-bearing concrete fields remain unchanged. Source frozen.

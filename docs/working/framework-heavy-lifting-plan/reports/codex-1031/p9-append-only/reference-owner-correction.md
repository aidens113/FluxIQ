# Core-owned original reference correction

Source status: FROZEN. Owned changes only: `rerun-provenance/provenance.ts`, `tests/fixtures.ts`, new `tests/reference-ownership.test.ts`, and this report. No Down/gate/public schema/build/git changes.

The actual public Core/web proof reached one ordinary main dispatch and a valid permission assessment, but no producer publication: the normal authoring loop supplies no referenceNow and D0 forwarded that absence. Down correctly requires a numeric host reference before creating a frozen capture. Unit fixtures previously hid this by publishing a fixed timestamp despite receiving none.

D0 now owns the reference before invoking the same fully wrapped original executor. Eligible unstamped originals read its private optional `now()` clock once (default Date.now); stamped originals keep their exact explicit value and request. The added timestamp preserves the original input reference, signal and call fields without mutating an unstamped incoming request. Unavailable calls retain their previous ordinary path; unusable/throwing clocks keep calls ordinary under an unavailable capture frame rather than inventing eligibility.

Publication must equal the host-owned fixed local value even when the original caller supplied none or a wrapper mutates the forwarded request. Selected execution continues to forward the sealed captured reference, with no clock refresh. Producer snapshots in the common fixture now state the actual forwarded reference; its host clock is explicitly controlled for deterministic tests.

Added specimens prove missing-reference ownership before the full wrapper, input/signal preservation, explicit zero reference/no clock call, changed publication and mutated-wrapper reference rejection, unavailable scope behavior, unusable clocks, Date.now default, and exact timestamp reuse after the live clock advances.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/rerun-provenance/tests --maxWorkers=2 --minWorkers=1` -> `Test Files 3 passed (3)`, `Tests 100 passed (100)`, `Duration 9.69s`. Includes 11 new ownership cases, 57 provenance cases and 32 settled safety cases.

Not run: package types/audit, SDK build or paired/browser proof. The lead must rebuild the SDK and rerun the unchanged real public Core/web proof; the unit pass alone does not establish paired/browser behavior. No full suites, provider calls or user panel operations ran.

Outcome: Done
Changed: provenance.ts; tests/fixtures.ts; tests/reference-ownership.test.ts; this report
Validation: owning provenance Vitest command above -> 100 passed, 3 files, 9.69s
Not verified: rebuilt SDK, paired public integration, browser behavior, package types/audit
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/reference-owner-correction.md
Notes: Core owns the original timestamp; downstream validation is unchanged. Source frozen for lead acceptance.

# Core phase-2 acceptance corrections

Source frozen and handed to the lead before this report was written. No checks, builds, audits, baseline changes, browser/provider operations or git ran in this correction pass.

## Observed failures and cause

Read the lead's three logs under paired test-runs. The owning selection passed 27/28 tests; the child invocation assertion expected two native calls but observed twelve. Typecheck stopped at attempt.ts:147 with TS2345 from a possibly undefined effective-input value. Structure audit reported 31 violations: four failure-as-empty findings, the checker-induced executor/composite import cycle and its twenty-module cascade, two sibling-internal type imports, and statement packing.

The child failure was not cross-frame candidate sharing or an internal whole-child retry. `graph-registrations.ts` represents authored failed/error edges and optional continuations as lifecycle registrations alongside executable handlers. The parent's ordinary failed edge made the guard's broad any-registration barrier disable the child. With no guard stop, that one child ran its 35-step ceiling and dispatched twelve native calls. The existing regression already contains this parent failed edge and continues to require exactly two native calls, a real child stop, and zero parent repair calls.

## Corrections

- Restricted the conservative lifecycle barrier to actual `handler_node` / `clears_interference` registrations and real registration problems. Authored failed-edge/optional routing remains protected when taken; successful child execution is no longer classified as an executable handler merely because its parent has a failure route.
- Replaced caught-error-as-undefined results with explicit closed `known` / `unavailable` private evidence. Hash, checkpoint and observation failures carry missing/unsupported/unreadable reasons, and the guard explicitly abstains. Observation getter/error text remains private. Hashing still uses the existing strict canonical implementation.
- Moved trace provenance to dependency-neutral `runtime-repeat/trace-provenance.ts` and `stopped-trace.ts`. The map and frame writer are feature internals. graph-run retains a frame-bound writer privately; only the named read-only checker crosses executor/public barrels. Boundary imports the feature checker rather than the executor value barrel, eliminating the introduced dependency back to graph-run. Genuine same-run child identity still stops authored retries and parent repair; copied/foreign JSON remains non-authoritative.
- Fixed TS2345 with a typed effective-input record and one local defined-value check per canonical input port. Native inputs retain the existing options-input-plus-wired precedence. No cast hides undefined.
- Exported the owning run-state type through its executor barrel for type-only consumers, replacing sibling-internal imports. Unpacked every reported multi-statement line in graph routing, guard/component helpers and owning tests. Added no suppression and changed no baseline.
- Updated bounded-evidence assertions to require explicit unavailable results. All existing execution-count, child authenticity, async, counter, retry, privacy and safety oracles are retained.

## Files and verification boundary

Changed original owned runtime-repeat helpers/tests/barrel; added `evidence.ts`, `trace-provenance.ts`, `stopped-trace.ts`; changed graph-run, executor barrel, node-execution attempt, composite boundary and the owning step-loop test. Frozen phase-1 host observation/input declarations and host port names remain unchanged. No downstream or identity/receipt/permission implementation was edited.

The lead owns the independent repeat of the owning tests, typecheck and structure audit. The source review above is not a claim those checks pass. No additional P8 semantic scope was introduced.

Outcome: Done
Changed: owned Core repeat helpers/tests/provenance, executor hooks/barrel, composite boundary; this report
Validation: not run (lead owns acceptance; original logs inspected)
Not verified: corrected owning tests, compilation, structure audit or browser behavior
Report: C:/Users/osrs_/FluxStuff/fxwork/t829/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/root-corrections.md
Notes: Source frozen. Actual child twelve-call cause recorded; public JSON stays non-authoritative. Available for focused corrections.

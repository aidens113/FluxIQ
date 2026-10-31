# Paired public proof after original reference fix

Source status: **FROZEN** before this report. Outcome: Done for the two paired provider-free cases. Production remained read-only.
Owned/changed Down source: `frozen-execution/tests/paired-host.ts` and `frozen-execution/tests/core-loop.test.ts` only. No agents/git/shared-doc/Core/build/provider/browser operations.
Waited for the lead's explicit Domain typecheck release before edits or narrow runs. SDK currency guard was honored on both runs.

## First remaining cause and distance

The first labelled run reproduced 0/2 after the genuine publication fix. Closed diagnostics established: two decisions, one original main dispatch, publication accepted, Native authority `state.repeat_safe`, one real permitted exploration/mutate assessment, and an original action with `applied:true` but `changed:false`. Native resolution was reached once, proving the original passed sealing/remembering and its authority resolution; no batch main had run.

The unit gateway returned typing success without changing its addressed field. Core's existing repeat guard records `changed_nothing` when an applied action leaves identical before/after page state (`repeat-guard/outcomes.ts`); prior-nodes' normal admission retains that guard, so `usable` stops before a second authority resolution and the batch is not offered. The test's second-decision eligibility assertion then becomes `llm_evidence_loop.invalid_decision`. This was an honest-fixture defect, not a missing production permission/provenance bypass. No private Core module was imported or spied on.

With explicit lead agreement, corrected only the stubbed transport's behavior: a successful type finds exactly the addressed selector, updates that one control's value, and stores it by its existing stable subject key. Replacement fields read the saved values, so A retains its typed value under its new selector/handle while B stays separate and unchanged. No extra page change, control metadata churn, reset, fake authority/effect/proof, overridden permission or direct unchecked execution was introduced.
Added boolean assertions that A retains its actual typed value and B remains unchanged. All existing A-to-t2/old-t1-to-B, changed-document/no-second-main, exact quota/tool-call accounting, no new authored step and closed-envelope assertions remain intact.
Closed diagnostic additions contain only resolution labels, result code and applied/changed booleans. They remain nested under `host.diagnostics()`; no call-result spread, raw page, selectors, capsule, private record or receipt is emitted.

## Actual narrow validation

Both runs used exactly:
`$env:DOMAIN_TEST_BUILD_LABEL = 'paired-after-reference'; pnpm.cmd --filter @fluxiq-web-extension/domain test src/runtime/llm-evidence/node-run/frozen-execution/tests/core-loop.test.ts`

- Diagnostic run -> Core build current; 2 tests, 0 passed, 2 failed. First remaining cause/distance above.
- After honest transport correction -> Core build current; 2 tests, 2 passed, 0 failed; runner duration 117.4632 ms. No browser or provider calls.

Verified by these actual cases: public Core evidence loop, actual Native registry/effect resolution, actual Flow-bootstrap permission wrapper/Gate, real Down stores/capsule/final gateway observer, fresh selected main receipt integration, original A after handle-map replacement, B unchanged, changed-document suppression, exact positive accounting and authored-step/envelope contracts.
Not verified: full paired/owning suites, package types, structure audit, real browser or provider-backed behavior. Lead must rerun its acceptance/types/audit and perform browser proof separately.

Outcome: Done
Changed: the two owned paired test files and this report.
Validation: exact labelled selector above -> final 2 passed, 0 failed; earlier diagnostic failure retained and explained.
Not verified: full owning checks, types/audit, browser/live execution.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/paired-after-reference.md`
Notes: Source frozen. Production untouched; all original acceptance oracles retained and strengthened by actual field-value checks.

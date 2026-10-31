# Paired Core/web first-failure investigation

Outcome: Partial. Source diagnostics are ready; paired acceptance remains failing at the original-call capture boundary.

Owned Down paths:
- `domain/src/runtime/llm-evidence/node-run/frozen-execution/tests/paired-host.ts`
- `domain/src/runtime/llm-evidence/node-run/frozen-execution/tests/core-loop.test.ts`

The host now observes the real public Core capture/execution functions without replacing their decisions. Diagnostics contain only Core result code, decision/main counts, closed capture/publish/execution labels, and permission assessment kind/effect/consequence count/verdict. They do not expose command parameters, capsules, snapshots, dispatch identities, or errors. The history lookup requires the actual `batch` call id, so an offered-candidate tail cannot satisfy the envelope oracle.

## Observed distance and first cause

The labelled provider-free selector reproduced both failures: two decisions, one actual original main dispatch, one permitted exploration-step mutate assessment with zero lasting consequences, active capture access, zero publish calls, and final `llm_evidence_loop.invalid_decision`. The second-decision eligibility assertion cannot pass because the original was never published.

The first producer check that rejects this actual original is `frozen-execution/capture.ts:13`: the forwarded request has no `referenceNow`, and capture requires a finite host reference. The test host forwards the ordinary Core call without adding one. Source tracing also found that normal Core authoring constructs that ordinary call without `referenceNow` (`llm/evidence-loop.ts:415-417`), the Flow-bootstrap wrapper preserves it, and the public registry/binding forward a reference only if already present (`harness-options/registry.ts:254`, `binding.ts:700`). The dry-run gate supplies a time for its separate replay phase; that phase does not run before the original here.

This is reported to the lead as a possible actual normal-authoring integration defect. No fixture-only reference has been added to hide it, and no Core/producer source has been edited. Any product correction belongs to its owner before dependent paired setup changes.

## Validation

- PowerShell `pnpm` invocation did not enter the test runner because the local `pnpm.ps1` shim is disabled by shell policy. No policy was changed.
- `$env:DOMAIN_TEST_BUILD_LABEL = 'paired-debug'; pnpm.cmd --filter @fluxiq-web-extension/domain test src/runtime/llm-evidence/node-run/frozen-execution/tests/core-loop.test.ts` -> Core build current; 2 tests, 0 passed, 2 failed, both at the capture/eligibility seam above. No browser/provider calls.
- The exact-envelope history selector was tightened after that diagnostic run; it has not been rerun while the underlying failure remains unresolved.

Not verified: completed original-subject rerun, fresh batch receipt, changed-document prevention, authored-step/accounting oracles. These are retained unchanged and are not accepted from this failing probe. No other checks, builds, git operations, or source edits ran.

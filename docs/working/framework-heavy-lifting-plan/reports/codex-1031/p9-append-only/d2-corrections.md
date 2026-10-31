# D2 correction round: declarations, actual safety and fresh receipt accounting

**Current state: source frozen again after the lead's bundled final findings; acceptance is provisional.** This report records the earlier correction round. Both required boundary hardenings and the next observed fixture/import/depth corrections are now implemented; see [the final correction report](d2-final-acceptance-corrections.md). No source is edited during the lead's gates.

## Observed initial failures

The lead's actual `test-runs/t830-d2-initial-{tests,types,audit}.log` files in the paired Down checkout were read. Initial selection: **136 tests, 113 passing, 23 failing**. Every actual-loop case stopped at `llm_evidence_loop.invalid_configuration`, with zero iterations and dispatches. The fixture set `maxStepsWithoutProgress:24` alongside `maxIterations:20`; the real validator requires the former to be at most the latter. Its seven-iteration wrap-up override had the same inconsistency. The fixture now derives that guard from its configured iteration bound; no product limit or validator was relaxed.

The two observed type errors were a widened answered-request code and a failed-action fixture missing required `proposes`. The code is now explicitly typed as the existing closed `AutomationStudioLlmEvidenceAnsweredRequestCode` union; the fixture supplies `proposes:true`. No suppression, widening or cast was used to repair these findings.

Initial audit reported eight failures: a 26-file evidence-loop directory; service length 4317 versus baseline 4315; two withdrawal/barrel cycles; seven leaf imports grouped into three importer findings; and an empty eligibility catch. Source ownership/import fixes are described below. They have not yet been verified by this worker's own audit; the lead runs the gates.

## Actual declaration and execution-control eligibility

New `llm/prior-nodes/eligibility.ts` reads the **sealed originalValue** before private C adaptation. It requires an ordinary closed `{node,parameters,consequences}` request, an explicitly present array declaration and zero declared consequences. Every extra top-level key, including write/replay/undo/reset controls, refuses eligibility. Missing, null, malformed, nonempty and nested-only declarations remain unproven. The actual empty declaration is cloned into C's private concrete input; it is never manufactured from an unsafe or unknown original.

The reader returns closed eligible/unproven discriminants. `controller.remember` also returns an explicit closed unproven reason for unavailable, unreadable or unsafe authority instead of swallowing an exception. Ordinary execution receipts remain intact when batching eligibility is refused.

The new real-loop negative matrix covers all five lasting classes, absent/malformed/nested-only declarations and seven extra execution-control keys, under both observation and explicit repeat-safe state floors. Each case observes the real D0 registry reaching `available` before asserting that the call is not offered and a guessed batch executes no member. It retains the original call's trace, step, accounting and screened evidence; private resolved values remain absent from model requests. These are authored assertions, not yet claimed passing.

## Actual observed floor and dispatch contract

The approved D3 private contracts are implemented by their owner, not this worker. D2 now requires D0's actual `record.observedEffect`; absence or an unsafe actual floor refuses eligibility. It preserves that exact observed floor in C's prior record and current authority response. A fresh canonical registry result is no longer mislabeled as observed evidence. Current canonical authority/effect checks remain independently required.

The loop fixture now calls the real `AutomationStudioActionPermissionGate.checkFor` with trusted `exploration_step` source, actual toolId/callId, explicit empty consequences and the full trusted effect. Its actual stub operation creates fresh attempt/receipt objects, then either publishes the original capture or calls the selected execution's optional `reportDispatch`. It never reuses an original receipt. Positive state coverage has a real fixture state transition and an explicit trusted repeat-safe state floor.

D2 consumes the frozen private `main:receipt|unacted|unproven`, explicit `kind:threw` and hidden dispatch/error fields:

| Main status | Tool quota | Public proved executed | Public unproven | Public skipped |
| --- | --- | --- | --- | --- |
| `receipt` | One | One | Zero | Zero |
| `unacted` | Zero | Zero | Zero | One |
| `unproven` | One conservative attempt | Zero | One | Zero |

For valid lists, `requested = executed + skipped + unproven`; the optional `unproven` field is emitted only when nonzero. The envelope consumes no tool call. It never publishes private dispatch/error/outcome objects. A dispatch receipt proves a real main attempt, including failure or uncertainty; it supplies no whole-Flow success.

New `unsettled.ts` retains real refused/auxiliary evidence for a held or unknown main while recording an unusable control outcome, never an executed node. An unknown main retains an ambiguous repeat guard and conservative attempted-call quota; a known held main spends none. The normal state-digest source distinction is preserved. Neither path adds draft nodes, answers a successful request cache, runs recovery or invokes later members. Receipt-backed members retain ordinary settlement.

Every actual D0 outcome is retained privately for the loop's lifetime. Post-receipt vetoes and throws keep the full private outcome in C's error cause, preserving fresh dispatch/error details while the public summary stays closed. Actual-loop assertions cover safe auxiliary reads followed by a main veto, no new permission ask, missing PRIMARY refusal, consumed-without-report unknown status with and without an actual operation, fresh failure/uncertainty receipts, and a later veto/throw retaining the real C cause/receipt.

## Structural corrections

- Withdrawal moved from `evidence-loop/tool-withdrawal.ts` to the cohesive `prior-nodes/` feature. The old evidence-loop barrel export was removed. Its signature value uses the lean owning leaf to break the actual documented barrel cycle.
- Cross-directory type imports use owning barrels. The prior-nodes draft-key value now uses its owning repeat-guard barrel. Value leaves are retained only where the existing barrel reaches back into the importer through the actual loop cycle.
- `service/execution-authority/` owns assembly of the actual permission, person-needed and rerun authority boundaries. The initial command-level helper moved one level nearer its feature root after the lead's depth finding. The service calls it through its owning service barrel. This moves genuine setup responsibility out of the oversized coordinator and preserves ordinary candidate, legacy and project-brief wiring.
- Source inspection counted `service.ts` at **4315 lines**, `evidence-loop.ts` at **799 lines**, and the evidence-loop directory at **25 files**. These are source counts, not an audit pass. No baseline change, statement packing or comment removal was used for this correction's budgets.

Changed correction paths start at `packages/fluxiq/src/programs/automation-studio/runtime/`:

```text
llm/evidence-loop.ts
llm/evidence-loop/index.ts
llm/prior-nodes/index.ts
llm/prior-nodes/eligibility.ts
llm/prior-nodes/controller.ts
llm/prior-nodes/admission.ts
llm/prior-nodes/tool-admission.ts
llm/prior-nodes/tool-withdrawal.ts       (moved from evidence-loop/)
llm/prior-nodes/loop.ts
llm/prior-nodes/batch-member.ts
llm/prior-nodes/unsettled.ts
llm/prior-nodes/tests/fixtures.ts
llm/prior-nodes/tests/run-nodes-loop.test.ts
llm/prior-nodes/tests/tool-admission.test.ts
service.ts
service/flow-bootstrap-commands/index.ts
service/index.ts
service/execution-authority/create.ts
service/execution-authority/index.ts
```

C and D0 source remain separately owned; D3 owns its approved shared effect-safe classifier delegation. No Down, Root E, version, baseline, build artifact, git, browser or provider state was changed here.

## Required lead acceptance

Owning D2 selection:

```text
pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/prior-nodes/tests
```

Run it with the D3 report's actual assessment/provenance selectors, then touched Core types and the structure gate. Relevant existing ordinary-loop/rerun/withdrawal/stall regressions remain listed in `d2-implementation.md`. A fresh SDK plus paired Down and provider-free browser acceptance remain lead-owned. No full sweep or paid execution was run by this worker.

## Final follow-up disposition

1. Unexpected execute rejection now leaves a closed redacted transport error while its exact raw error stays private; an actual-loop sentinel case is authored.
2. C list-record failure now terminates after preserving receipts/quota, with no next provider/tool/completion; an actual-loop failure-on-recording case is authored.
3. The lead's observed 414-test/type/audit findings are addressed in the final correction report. Final tests/types/audit and paired acceptance remain lead-owned and unrun by this worker. The feature remains **unaccepted** until those pass.

Outcome: Done
Changed: the correction paths above and this report
Validation: initial lead logs observed; no checks/builds/audits run by this worker after edits
Not verified: corrected real-loop tests, D3 integration, current types/audit, SDK, paired Down/browser behavior
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d2-corrections.md`
Notes: Source frozen for lead gates. Requested follow-ups are implemented; final correction report supersedes the earlier pending status. No acceptance or shipment claim.

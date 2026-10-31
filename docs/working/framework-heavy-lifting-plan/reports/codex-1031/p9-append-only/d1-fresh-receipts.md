# D1 fresh main-dispatch receipt reporting

Source status: **FROZEN** before this report. No checks/tests/builds/audits, browser/provider/panel operations or git commands run; paired SDK freshness is reserved to the lead after all writers freeze.
Read the root-frozen `d3-dispatch-contract.md` and the actual Core public optional selected-access `reportDispatch` signature. No Core or public API source was edited.

## Shared actual-attempt producer

`frozen-execution/dispatch/recorder.ts` now owns the same command-object/final-lowering observer formerly embedded in ordinary capture. It records each actual main attempt with a new private identity, exact raw reply object as receipt, actual lowered command copy, logical parameters and the existing succeeded/failed_unacted/uncertain/unknown classification.
Ordinary `capture.ts` delegates to that recorder and retains its prior eligibility rule: no missing/mismatched final observation, unknown/uncertain attempt, invalid same-subject refresh or non-success can publish a candidate. Final selected identity/receipt, actual effective inputs, canonical definition, original adapter value, fixed reference/scope/subject and private capsule retention remain unchanged.
`dispatch/lowered.ts` and `dispatch/refreshed.ts` hold the existing deterministic lowering and same-subject/address-only refresh logic shared by original capture and selected reporting; neither creates an alternate executor or retry policy.

## Selected transaction

`selected.ts` creates a fresh recorder for the current selected Core access after binding/WeakMap validation. Its capture surface is used only at the normal main hooks in `run.ts`: the selected observation's main read, ordinary main retry dispatch, fresh target-retry dispatch via the existing retries callback, and any already-authorized repeat press in ordinary postprocessing.
Current permission/scope checks still precede capsule consumption, which still precedes main dispatch. A held call records/reports no main. A selected capture cannot dispatch before consumption or after its local transaction is finalized.
`run.ts` finalizes the selected recorder once in `finally`, after its main attempts and ordinary postprocessing. Only an observed actual selected reply can be reported. The optional host hook receives the current access capsule and fresh attempt list/selected identity; no original receipt/attempt list is reused and no new candidate is published.
Actual failed/unacted/uncertain and actual unknown replies retain their exact receipt objects and own outcome. A thrown/missing acknowledgement has no receipt and cannot be manufactured into one. Passive scope/recovery/post-action looks, effect-check assertions, gone-target synthetic answers and synthesized effect settlement are not wrapped as main dispatches or substituted for their receipts.
The selected scope gateway clones snapshot commands when pinning resource fields. `dispatch/forward.ts` carries an already-registered observer across that deterministic clone, forwarding only the owning final gateway event. Without the real final event the recorder remains unproven. This is necessary for the selected observation's actual main read; auxiliary captures with no main observer create no main attempt.

## Refusal and outward ownership

Missing hook, missing/mismatched final observation, unavailable receipt or invalid refresh supplies no positive fresh proof. A hook refusal/throw never falls back, repeats, rolls back, picks another target, publishes a candidate or replaces the completed result.
The lead explicitly confirmed the division: retain the actual adapter result; D3's private transaction marks missing/rejected trusted report unproven and stops outward. The producer returns a closed local unavailable/refused report result, keeps actual receipts private, and never overwrites a real result with a synthetic adapter refusal.
Core owns current-transaction/owner/generation/scope/capsule validation, global old/reused/late receipt rejection and receipt-backed main accounting. A consume acknowledgement alone grants no dispatch proof. The private helper reports at most once and prevents late local consumption/dispatch.

## Changed paths and source-only acceptance

Changed `node-run/run.ts`; `frozen-execution/{binding,capture,gateway,selected,types}.ts`; new `dispatch/{recorder,lowered,refreshed,forward}.ts` plus its barrel; existing `tests/harness.ts`; new `tests/fresh-receipts.test.ts`.
The lead-reserved `tests/core-loop.test.ts` and `tests/paired-host.ts` were untouched. No context/retry algorithm, public/model schema, draft/replay/reset/layer state behavior, Core source, E/P10 prose, baseline/version/shared document or generated artifact changed. Source inspection counts run.ts at 799 lines, without packing or prose removal.
Authored fresh-receipts acceptance covers exact actual post-lowering raw receipt and fresh identity; four normal/fresh same-subject retry attempts; actual failed/unacted/uncertain replies; current permission/consume/scope holds; forged/JSON capsules; observation guard exclusion; effect-check/synthesized-settlement exclusion; missing hooks/final events; rejected/throwing report with no repeat; missing acknowledgement versus actual unknown reply; and finalized transaction holds. Original capture/binding tests remain required regression coverage.

Lead selector after paired final freeze/rebuild:
`pnpm --filter @fluxiq-web-extension/domain test src/runtime/llm-evidence/node-run/frozen-execution/tests src/runtime/llm-evidence/node-run/tests/run.test.ts src/runtime/llm-evidence/node-run/tests/replay.test.ts src/runtime/llm-evidence/node-run/retries/tests/dispatch.test.ts src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts src/runtime/llm-evidence/node-run/retries/tests/effect-check.test.ts`
Also lead-owned: `pnpm --filter @fluxiq-web-extension/domain check`, narrow structure audit, and real public Core/Gate/Down integration in the reserved fixtures. No pass or live-browser proof is claimed here.

Outcome: Done
Changed: owned Down producer/selected collector integration/helpers/owning tests listed above; this report.
Validation: not run — brief reserves all checks/builds/audits to lead after fresh paired SDK; source and public method contract inspected manually.
Not verified: compilation, authored/regression tests, structure graph, real D0/D2/D3 paired integration, browser/live execution.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d1-fresh-receipts.md`
Notes: Source frozen. Exact actual receipts stay private; ordinary result/guards preserved. No git operations.

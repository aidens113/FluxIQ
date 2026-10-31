# D1 acceptance corrections

Source status: **FROZEN** before this report. No tests, type checks, builds, audits, browser/provider/panel operations or git commands were run by this worker.
Inspected the lead's actual `test-runs/t830-d1-{tests,types,audit}.log`: 172/176 tests passed, four failed; one fixture type error; 13 structure findings including the lead-owned working-document index.

## Root causes and corrections

1. `binding.test.ts` called the target store's three-argument `resolve` with two arguments. It now supplies the captured page's actual location; no signature cast or bypass.
2. The new uncertain-commit fixture paired `target_not_found` with `verification`, which contradicts Core's target-resolution-only category rule. Core correctly dropped that malformed record, explaining the missing projected `failure.effect`. The fixture now uses the owning `OUTPUT_NOT_OBSERVED` constructor, with explicit `ambiguous` effect. Its existing outcome-uncertain, same-code-as-ordinary, one-dispatch assertions remain.
3. Three legacy replay stubs returned only `{ code }`, which is not a complete failure record. The lead approved changing `node-run/tests/replay.test.ts` for complete closed-record gateway fixtures only. Those stubs now call `webAutomationFailureRecord` and type their supplied codes to the existing closed set. Every existing verdict, refusal-reason, page-notice and unreproducible assertion is unchanged. The deliberately unclassified broken fixture remains unclassified.

Parent/source analysis for (3): the D1 dispatch change adds optional capture wrapping, not a replacement failure reader or a lower safety floor. The accepted parent path already passes trusted resolved `actionEffect` to Core and reads failure records through strict `readWebHostFailure` -> `parseAutomationStudioFailureRecord`. In the current Core outside-graph source, a commit with no valid reading.failure is assessed as uncertain; it cannot infer the known target/page refusal from an incomplete test record. That explains the observed failed-vs-unreproducible and outcome_uncertain-vs-own-refusal differences. No production compatibility reader, code-derived repair, or malformed-record downgrade was added. An isolated parent checkout reproduction was not run under this brief's no-git/no-check constraint.

4. `binding.entry` silently converted a failed private entry copy to `undefined`. It now returns a closed discriminated result: captured value or unavailable with `inactive` / `adapter_value_unreadable`. Unavailable entry data cannot produce capture proof; ordinary execution retains its prior behavior. A provider-free fixture covers both closed reasons.
5. Conditional/call spreads in capture attempts, public dispatch projection, scoped gateway pins, requested child-frame scope, capture input and selected parameters are replaced by explicit typed fields, `present<T>`, or named typed parameter objects. No suppression or baseline edit.
6. The reacquire-element import now goes through its owning `target-reacquire` barrel. Packed statements in binding and its test/harness fixtures are expanded.
7. `run.ts` had grown because it also owned scoped page-read orchestration and frozen dispatch-payload selection. `frozen-execution/page/` now owns the existing readable/current-page functions and their options; `dispatch/parameters.ts` owns the exact saved payload with the already-proven element address refresh. Their existing start-location behavior, capture wrapper, signal, restamp and refusal handling are preserved. Source inspection counts `run.ts` at 796 lines.
8. `tools.ts` also owned final check-wait lowering and the actual-send observation hook. That same wrapper now lives in `frozen-execution/dispatch/gateway.ts`, with owning barrels; tools calls it before binding the runtime. Defaults are still lowered before the observation hook and the exact actual command is sent. Source inspection counts `tools.ts` at 793 lines.

## Preserved boundaries and limitations

Actual final receipt selection, private command identity, original adapter/public value distinction, exact effective inputs/reference/scope/subject, same-subject handle-map replacement, current permission, ordinary retry/refusal/result-code/evidence semantics and uncertain-lasting floors are retained.
No Core source/public interface, E prose, baseline/version/shared document, reset/draft/replay-prefix/output-write behavior or generated artifact changed.
The lead-owned stale working-document index remains untouched.
The previous D1 exact capture limitations remain: missing positive scope is unproven; unsupported/state/row-bound subjects stay unproven; changed/gone/ambiguous subjects refuse; a supported concrete query keeps its semantics while reading current rows. No new browser/live behavior is claimed.

## Lead-owned validation after paired freeze/rebuild

Original narrow selectors, including the changed fixtures and normal/fresh actual-dispatch coverage:
`pnpm --filter @fluxiq-web-extension/domain test src/runtime/llm-evidence/node-run/frozen-execution/tests src/runtime/llm-evidence/node-run/tests/run.test.ts src/runtime/llm-evidence/node-run/tests/replay.test.ts src/runtime/llm-evidence/node-run/retries/tests/dispatch.test.ts src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts`
Additional relevant gateway/floor selectors: `src/runtime/llm-evidence/tests/tools.test.ts`, `src/runtime/llm-evidence/node-run/retries/tests/lasting-act.test.ts`, `src/runtime/llm-evidence/node-run/retries/tests/uncertain-outcome.test.ts`.
Package types: `pnpm --filter @fluxiq-web-extension/domain check`. Structure: repeat the lead's owning audit after the lead updates its stale working-document index.
These are required follow-up checks, not executed results.

Outcome: Done
Changed: `domain/src/runtime/llm-evidence/{tools.ts,node-run/run.ts}`; frozen-execution binding/types/capture/gateway/scope-command/barrels/owning tests; new frozen-execution/page helpers and dispatch gateway/parameters helpers; approved `node-run/tests/replay.test.ts` fixture records; this report.
Validation: not run — brief reserves all checks/builds/audits to lead after paired Core freeze/rebuild; manually inspected actual failure logs and final source.
Not verified: compilation, corrected/authored/regression tests, structure gate, isolated-parent execution, paired D0/D2 integration, browser or live execution.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d1-corrections.md`
Notes: Source frozen; strict production failure parsing and all existing acceptance assertions retained. No commit/push performed by worker.

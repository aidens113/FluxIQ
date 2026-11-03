# Scoped recording capture

Status: bounded implementation and closed runtime acceptance complete. Source/tests FROZEN; all own readers ended. Brief: `../briefs/scoped-recording-capture.md`.

## Actual boundary

`ClientGatewayRecordingBridgeOptions` adds optional constructor code port `scopedIngress?: RecordingScopedIngress<TTarget,TEvidence>`. The existing ingress-only path retains its original callbacks/one-argument tuples and introduces no sink read. Internal state retains the ORIGINAL resolver receiver/function and ORIGINAL sink read function/receiver before capture awaits; it adds no map, registry, execution context, receipt or rights.

`capture/scoped/recording.ts` reads the captured project/recording address through that original sink. It checks returned recording ID, rejects contradictory present metadata.projectId and checks the exact stored environment domain against the captured active ref. Per Root's explicit decision, missing duplicated metadata.projectId is valid: the addressed sink is project authority. Explicit null domain is valid passive scope; undefined/empty/malformed/whitespace-normalized or mismatched domains refuse. Metadata never supplies an address or domain.

`capture/scoped/ingress.ts` passes the ORIGINAL returned session as the only argument to the pinned resolver, with its ORIGINAL receiver. Raw active entries use the selected entry(value); command capture flushes first, then resolves that captured address and invokes the selected commandTarget(originalTarget). The target object is captured before the await, and full original entry/result/evidence/envelope construction remains. A changed active project/UI context cannot retarget the operation.

Unknown/unowned raw IDs still pass the provided strict legacy decoder before discard; they do not read another recording or run its guessed domain policy. Unavailable outcomes and rejected reads propagate the original cause; policy/decoder errors do not fall back. Existing write-order maps/batching, first flush error and append/discard/finalization owners are reused.

Event/state/direct gateway-input paths match supplied domains against the original active/stored scope before actual IO projection. Conflicting event domain or metadata uses existing recording.event_rejected; conflicting state/direct input uses existing discard diagnostics. Null never adopts a supplied IO domain. A scoped state update's existing sender descriptor is explicitly passive; an action-role input cannot turn it into an action, while genuine matching action events retain original registered binding behavior. No output dispatch or permission grant was added.

## Exact owned files

Edited `client-gateway/recording/{options,internal/state}.ts` and `capture/{store,action,event,state,input}.ts`.
Added `capture/scoped/{recording,ingress,domain,index}.ts` and `capture/tests/{fixture,scoped.test,projection.test}.ts`.
Paths are relative to `packages/fluxiq/src`. Initial unit: 11 production files, two new subjects and one fixture (14). The later explicit release adds the existing Studio `client-gateway/tests/bridge-restart.test.ts` fixture, for 15 current files in `.fluxiq/refactor/scoped-recording-capture-owned.json`. Existing internal/ref stayed unchanged; captured refs are copied only in the scoped branch before awaits.

Not edited: Root lifecycle/start/trust/scoped-policy/Studio/Service/storage-lock/public seams, B registry/Down, C trials, SQL/performance, package/config/baselines or shared docs. SQL foundation implementation remains held.

## Observed validation

`node .fluxiq/refactor/scoped-recording-capture-selection.cjs` -> all 11 subjects closed: six capture/generic graphs of 476–477 erased modules, three write-order graphs of 5, two decoder graphs of 16. Zero Programs/engine/runtime-model/native-execution edges, unresolved/built or nonliteral dynamic imports. Mutable owners are refused before their bodies are read. This is source-selection metadata, not a typecheck/built currency claim.

Exact one-time runtime command:

```text
pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/recording/capture/tests/scoped.test.ts src/client-gateway/recording/capture/tests/projection.test.ts src/client-gateway/recording/tests/address.test.ts src/client-gateway/recording/tests/lifecycle.test.ts src/client-gateway/recording/tests/input.test.ts src/client-gateway/recording/tests/failure.test.ts src/client-gateway/recording/writes/tests/order.test.ts src/client-gateway/recording/writes/tests/failure.test.ts src/client-gateway/recording/writes/tests/batching.test.ts src/client-gateway/recording/decoding/tests/entry.test.ts src/client-gateway/recording/decoding/tests/descriptors.test.ts
```

Observed: **11 files / 55 tests passed, 6.96s, exit 0, zero unhandled errors**. Log `.fluxiq/refactor/scoped-recording-capture-tests.log`.
New scoped19 + projection10 prove original receiver/one-argument/target identity, real addressed same-ID project isolation, unowned generic rejection, unavailable/rejected/missing/corrupt scope, required-policy refusal without fallback, original method pinning, held-read/flush context switches, preserved first errors, matching action projection, foreign-domain zero projector calls and passive/null state behavior.
Unchanged regressions: address3/lifecycle4/input1/failure5; write order5/batching3/failure2; decoder entry2/descriptors1. No old oracle or production fallback was weakened. New cases were written under the no-reader edit window and run once after exact value-closure approval; no separate RED runtime was run.

All 14 owned files passed trailing-whitespace/one-final-newline/BOM inspection. The initial PowerShell-only probe had a pipe syntax error and a culture-sensitive BOM false positive; corrected only that ignored probe to use ordinal/character comparison. No source edit was made in response to those harness errors.

Not run by worker: broad compiler/type/declaration/structure/build, the source-closure test (may itself perform broader graph work), downstream/guarded library/browser/provider tests. The bounded restart follow-up below supplies four actual composed restart cases; Root separately reported all 13 trusted-scope and 6 real-Service scope cases passed. Root owns final normal package/whole-structure/built integration. This unit does not implement domain policy algorithms or independently duplicate locked storage validation.

## Bounded common-check correction

The normal common typecheck found three honest errors: a scoped discard descriptor explicitly supplied possibly-undefined domainId (the existing optional field permits string/null only), and two new decoy sink.create fixtures omitted required initialState. Corrected only by omitting undefined while preserving explicit null, and supplying valid minimal snapshots; no type/input contract widened. Root's B diagnostic forwarding method was untouched.
Four old bridge-restart cases timed out before their held callbacks because the fixture created/approved null project/client domains while startMessage requested extension.example. Root verified this source cause. Released fixture inputs now create the project and actual approved hello in extension.example. Setup requires a real Start ACK and stored unfinalized recording/domain before entering race cases; original-boundary waits fail immediately if the actual operation returns/errors before its gate.
All 68 pre-correction assertion calls across these three files are retained exactly by normalized AST comparison (`node .fluxiq/refactor/scoped-restart-oracles.cjs` -> 68 retained/0 missing/0 whitespace issues). Existing action/state/order/audit/hold/receiver oracles are unchanged; no timeout allowance or refusal bypass was added.

`pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/recording/capture/tests/scoped.test.ts src/programs/automation-studio/client-gateway/tests/bridge-restart.test.ts` -> **2 files/23 passed (scoped19 + restart4), 61.41s total/2.45s tests, exit0/zero unhandled errors**. Actual four restart cases finished in 0.4–0.76s each; source collection accounts for most total time. Log `.fluxiq/refactor/scoped-restart-correction-tests.log`. No unchanged 55-case sweep or trusted13 repetition; all own readers ended and all source/tests/report frozen.

Outcome: Done
Changed: Initial 14 owned files plus released legacy restart fixture, ignored selection/oracle metadata and this report.
Validation: Initial closed selector11files55PASS; bounded correction2files23PASS61.41s/exit0/0 unhandled; 68 original assertions retained; prior value selection11/11 closed and owned whitespace clean.
Not verified: Final current normal typing/declarations/whole structure and built/guarded paired integration.
Report: docs/working/runtime-ownership-refactor/reports/scoped-recording-capture.md
Notes: Source/tests frozen; all own readers ended. No new recording/receipt authority or inferred domain. No git/shared docs/package/config/baseline/SQL edits.

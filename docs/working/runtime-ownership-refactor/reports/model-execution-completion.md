# Model execution completion

Dispatch: [model-execution-completion.md](../briefs/model-execution-completion.md). Worker: Heavy Sol Max. Core t843 only.

## Current handoff

Production and tests are frozen after the coordinated corrections below, including the final nested-delegate latch. No worker test process is running. Root accepted the targeted follow-up and combined strict check, then passed the new secret two cases and affected transport/retry cases. The separate raw permission unit's corrected wrapper subject is accepted at 21/21 (59.87s overall / 274ms tests); no model production correction is pending. Latest combined strict/audit/build and actual Service checks are lead-owned and in progress. The ignored ownership manifest is `.fluxiq/refactor/model-execution-owned.json` (34 source files, 8 owned test files, 60 strict roots including the 26 affected subjects). Public parent exports belong to Root.

## Implemented contract

- One internal `ModelExecutionOptions` authority at `runtime/models/execution/options.ts`, with only the existing opaque optional observation. Harness, retry, and budget receive it separately. Raw provider requests and `runTask(request, {signal})` arguments keep their shape and original identities.
- `prepareObservedExecutionCallback` owns the exact original method, receiver and pinned tuple before admission. Its private one-use handle exposes the actual child observation, original-source membership and completion readers, plus invoke/recheck/unknown/flush. Cancellation after preparation refuses dispatch; guarded carrier cleanup restores the original parent.
- The sole existing Bindings owner stores checked original-call carrier associations. Nested decorators retain the same original argument object, can enter only an actual descendant, and restore/retire in order. Copies, stale carriers, concurrent sibling substitutions and foreign observation membership provide no authority.
- The existing original-Promise receipt owner supports exact rejected-outcome issuance for genuinely completed operations. Ordinary issuance still refuses rejected writes. Original Promise, original error identity, original child/source and complete child frontier must match.
- Retry retains the original provider operation across timeout/abort races. New observed incomplete work stops as `outcome_unknown`, without changing the original normalized failure. Unobserved retry/backoff behavior is retained.
- Core provider decorators, actual secret-port delegates, measurement, pricing, live clocks/random/waiters and budget entrances use original callback bindings. A native request owner acknowledges only its original invocation/Promise after the actual response body or stream has finished. Arbitrary injected fetch/delegates receive no inferred completion. Unsupported transport delegates are durably fenced before later transport IO.
- The real harness waits for native observed settlement; an arbitrary structural hold requires its own observed completion. Missing execution options cannot earn an empty Core-frame completion.

## Initial validation, inspected from Root logs

- `.fluxiq/refactor/lead-ack-model.log`: 24 files, 219 passed / 4 failed, 65.98s. All failures are listed below; no old provider, retry, schema, request-byte or harness expectation was weakened.
- `.fluxiq/refactor/lead-ack-types.log`: 99 roots, 5,242 modules, 15 diagnostics. Ten are new owned fixture declarations; one is the existing Studio hold adapter dropping the new execution argument. Two instruction-authority diagnostics and two spend-fixture diagnostics belong to the other owners.
- Root separately reported the unchanged five-subject observation/receipt cohort passing 24 tests.
- Corrected targeted follow-up: Root observed 10 files / 97 passed, 63.56s, including all four former failures and the new original-method/one-physical-request assertions. Combined strict: 104 roots / 5,245 modules / 0 diagnostics. Separate spend/instruction follow-up: 8 files / 53 passed.
- Scoped structure is pending coordinated acceptance.

## Corrections applied after all readers ended

1. Native completion now preserves a genuine owner's null result while its body remains pending; owner-missing applies only when no owner matches. This fixes the real native HTTP failures without granting early completion. One observed transport scope also refuses a second physical fetch before another admission/send; a genuine completed retry uses a distinct attempt scope.
2. The new harness fixture calls the actual scope function and declares the required metadata. New fixture optional observations and RequestInit signals now retain explicit absence correctly.
3. The abort fixture asserts the real A1 cleanup contract: Owned preserves the original cancellation, awaited consumer.release surfaces the retained append failure, and durable coverage stays open with zero dispatch.
4. Original observer methods and DeepSeek request-shape/screen callbacks are pinned before request/body awaits. A new controlled callback substitution regression preserves the original methods/reader and complete coverage.
5. Writer fixed the existing `llm/build-purse/harness-hold.ts` execution forwarding and its real diagnostic callback, plus its own reserve/settlement/retained-price/release slices. These are outside this worker's ownership.
6. All new statement packing and the two old packed lines in the owned harness subject were expanded; no baseline was edited.

## Final approved follow-up, saved and frozen

`invokeModelExecutionDelegate` now applies the same owning unknown-and-flush policy before another nested secret port can run, and the transport reuses that canonical helper. New `runtime/models/secrets/tests/session-key.test.ts` covers an actual snapshot counter with zero subsequent authorization/reveal, plus genuinely owned original-Promise completion. Native fetch keeps its distinct pending-until-body ownership. Source and tests are frozen awaiting the joint runtime/strict/scoped window. The controlled Service fixture has no secret ports, so this safety correction is not claimed as the cause of its remaining `child_blocked` integration failure. The separate actual permission-parent correction is recorded in [raw-permission-parent.md](raw-permission-parent.md).

Root's next affected eleven-file run passed both new secret cases, transport six cases and observed retry five cases. Its only runtime failure and the own strict/scoped findings are in a new permission fixture, with no model production finding. The real Service advanced past the corrected raw permission path to its later unmanaged `offlineFirst` callback; full YES is not claimed.

Root subsequently accepted the exact corrected wrapper subject at 21/21; the other 69 already passing cases stayed unchanged and were not repeated. The initial eleven-file selection's 90 cases have now all passed across those runs. Latest combined checks remain in progress; no B reader or native-secret implementation is running.

## Remaining production ownership, explicitly unsupported

The actual synchronous step log has no execution completion receipt. `llm/step-log/model-step.ts` returns undefined when disabled or its folder is refused; `reply` and `finish` catch failures, and `step-log/files.ts` performs best-effort synchronous writes. None of these branches is declared pure or acknowledged by this unit. Root accepted this bounded limitation and takes the logging owner next.

Session-provider composition at `programs/_shared/runtime.ts:218` supplies the Flow key lookup and SecretKeysService. Actual secret ports are now observed, but their production owner at `programs/secret-keys/runtime/service.ts` still needs authentic completion contracts for snapshot (128), reveal authorization (321), reveal (356), revoke (407), and unlocked-session read (426), plus optional authorization/Flow lookup. A fulfilled method name or result grants nothing. Newly observed live providers cannot claim complete coverage through those unadapted owners; ordinary unobserved APIs retain compatibility.

These backend implementations remain under old program paths where noted and still require canonical framework placement; they are not permanent Studio exceptions. No provider, paid run, browser, full suite, whole build, git or baseline change was run by this worker.

## Exact affected selector

From `packages/fluxiq`:

```powershell
pnpm.cmd exec vitest run src/runtime/execution-observation/owned/tests/invocation.test.ts src/runtime/execution-observation/owned/tests/carrier.test.ts src/runtime/execution-observation/queue-completion/tests/receipts.test.ts src/runtime/execution-observation/queue-completion/tests/rejected.test.ts src/runtime/models/execution/tests/clock.test.ts src/runtime/models/retry/tests/call.test.ts src/runtime/models/retry/tests/policy.test.ts src/runtime/models/retry/tests/jitter.test.ts src/runtime/models/retry/tests/observation.test.ts src/runtime/models/tests/transport-execution.test.ts src/runtime/models/transport/tests/signal-race.test.ts src/runtime/models/tests/transports.test.ts src/runtime/models/tests/ownership.test.ts src/programs/automation-studio/runtime/llm/anthropic/tests/provider.test.ts src/programs/automation-studio/runtime/llm/anthropic/tests/session-panel.test.ts src/programs/automation-studio/runtime/llm/tests/deepseek-provider.test.ts src/programs/automation-studio/runtime/llm/deepseek/tests/stalled-refusal.test.ts src/programs/automation-studio/runtime/llm/deepseek/tests/session-key.test.ts src/programs/automation-studio/runtime/llm/tests/session-key-provider.test.ts src/programs/automation-studio/runtime/llm/domain-instructions/tests/provider.test.ts src/programs/automation-studio/runtime/llm/harness/tests/run.test.ts src/programs/automation-studio/runtime/llm/harness/tests/run-size.test.ts src/programs/automation-studio/runtime/llm/harness/tests/paid-refusal.test.ts src/programs/automation-studio/runtime/llm/harness/tests/policy-gates.test.ts src/programs/automation-studio/runtime/llm/tests/harness.test.ts --minWorkers 1 --maxWorkers 3
```

Outcome: Done
Changed: 42 owned files in the ignored manifest; public parent exports by Root.
Validation: Root targeted follow-up -> 97/97 passed; combined strict -> 104 roots / 5,245 modules / 0; final nested-secret2 +transport6 +observed-retry5 passed. No owned model production strict/scoped finding in the next nineteen-root window.
Not verified: Latest combined strict/audit/build and unrelated promoted FailedVerdict alias acceptance; full Service last reached later offlineFirst; live provider/browser and native log/secret owner completion.
Report: docs/working/runtime-ownership-refactor/reports/model-execution-completion.md
Notes: Source frozen. No worker readers. Unchanged safety and legacy oracles retained.

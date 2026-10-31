# P8 phase 2 — Core observed-repeat implementation

Source is frozen for the lead's combined validation. The phase-1 observation union/input/optional host method is unchanged. No checks, builds, audits, browser, provider/API, panel, generated SDK, package-version or git operations were run by this worker.

## Implemented

- `runtime/runtime-repeat/` now owns the bounded private guard, cycle component/dependency checkpoint, exact canonical execution-kind recognition, descriptor-only observation reader, existing-hash adapter, private sample contract and fixed public stop description. It imports the existing strict streamed `clientGatewayCanonicalDigest`; no serializer was copied or recreated.
- `executor/node-execution/attempt.ts` asks the sample after actual parameter resolution/accepted refresh, trusted effect floors, unresolved-binding refusal, accepted before capture and definition-version checks, before every execution/dispatch branch. It rechecks command checkpoint/cancellation after observation. Native effective inputs are options inputs plus wired ports, rather than the all-output trace bag.
- `executor/node-execution.ts` collects after evidence using the existing finished attempt's capture; failures/uncertainty, record-producing outputs and effects outside the known output-dispatch seam are proof barriers. Internal source rereads omit the optional internal sample argument and never count as visits. Guard state is absent from spreadable public options/run values.
- `executor/graph-run.ts` owns one guard per frame, clears proof on retries/reacquisition/unsupported readiness/handlers/skips/routing/repair, and settles successful evidence only after ordinary output publication and lifecycle handling. Successful graph self-edges count again; failed/retried attempts never manufacture extra successful visits. The prospective third comparable execution is stopped before dispatch, with two real successful unchanged executions behind it.
- Terminal routing uses the graph-owned sample's private disposition, never public failure.code. Actual child-stop traces carry private identity bound to their run holder. Only a read-only checker is exported through `executor/index.ts`; the map and mint operations remain inside graph-run. Copied or foreign trace JSON has no authority.
- With the lead's extra ownership approval, `composite-execution/boundary.ts` consults that read-only checker before authored whole-child retries. Actual child stops also bypass parent retry/repair; required unknown-outcome precedence remains first.
- `step-loop/loop-context.ts` carries the private frame guard. Authored docs explain the port, pre-third semantics, privacy, limits and unsupported paths, linked from the architecture parent.

## Dependency/progress decisions

Only consumers inside the current strongly connected component participate. A later export or unreachable consumer of an unused command ID cannot prevent detection. Actual consumed data remains intact; the implementation strips no guessed volatile fields. Checkpoints include resolved parameters, canonical Core input ports, relevant Get/Set Variable values and real active loop indices. Exact canonical Constant.value edges use their resolved literal dependency, avoiding a false progress event when the first loop turn initializes their cached output. Feedback counters and opaque outputs retain their actual values.

Canonical transparency uses exact original definition object plus original execute-function identity. Native integration tests exercise the real importer SDK registry, converted canonical built-in declarations and `AutomationStudioNativeNodeRuntime` through service graph options. Prefixes and model effect labels grant no trust.

Resource/view progress resets all candidates, including progress between actions or a later restoration of an earlier view. Distinct stable subjects at two read-only native nodes remain separate tuples. Live control dependencies are re-read after the awaited observation. Observation port/answer getters are not invoked; malformed/throwing answers and token/error text do not reach model or trace fields.

Private work bounds are 512 component/candidate entries, 512 graph nodes/2,048 edges, and the shared hasher's depth 48/1 MiB/20,000-value checkpoint budget. Overflow/unreadability is unproven and preserves ordinary execution.

## Authored acceptance coverage — not run

New owning tests:

- `runtime/runtime-repeat/tests/bounded-evidence.test.ts`: canonical hashing reuse, ordering, cycles/oversize, descriptor/getter/coercion rejection and canonical identity trust.
- `runtime/runtime-repeat/tests/harness.ts`: provider-free actual NativeNodeRuntime/importer registration and accepted captures with fresh command/capture IDs; no browser/provider calls.
- `executor/step-loop/tests/run-repeat-guard.test.ts`: exact two-dispatch stop; Constant/Branch without external captures; future/unreachable volatile consumers; self-edges; distinct native subjects; changed view/resource/target/params and restored UI state; record-production progress; missing/partial/malformed/error observations; private tokens; getter/async/cancellation behavior; forged native failure and copied child trace JSON; actual-vs-forged child authored retries; seven variable and wired-feedback counter passes; seven duplicate-looking ForEach/Repeat passes; four attempts/identity recovery boundary; completed acts, uncertain lasting effects and permission refusal; fresh seeded/child invocation memory; repair and pure-only fallback.

The lead must run these plus affected existing source-reacquire/source-precedence, unbound identity, required outcome/effect, graph pause/resume, lifecycle repair, Repeat progress/state-routing selections, affected typecheck and structure audit. No test success or browser behavior is claimed here. The downstream real-browser fixture proof is owned separately.

## Honest limits

Only successful, fully comparable visits establish no-progress evidence. Failed visits retain the existing retry/failure behavior. Unknown/incomplete external observations, unsupported implementations/control dependencies, random/time, children/record effects and registered lifecycle handlers break proof. Unsupported readiness/fact conditions, non-string variable names and work-limit overflows abstain. These paths retain the existing maxSteps/Repeat/state-routing guards. Pure-only and skip-only cycles are deliberately not claimed as covered.

This is observed unchanged execution, not a proof of arbitrary future termination or lasting-effect safety. Captures, receipts, permission/floor declarations, retry identity and unknown-effect protections retain their own authority. Existing optional host types are frozen and unchanged.

Outcome: Done
Changed: runtime/runtime-repeat/ helpers/barrel/tests; executor/{graph-run.ts,node-execution.ts,index.ts,node-execution/attempt.ts,step-loop/loop-context.ts,step-loop/tests/run-repeat-guard.test.ts}; composite-execution/boundary.ts; docs/architecture/automation-studio/observed-runtime-repeat.md and parent link; this report
Validation: not run (lead's parallel-source freeze gate)
Not verified: compilation, owning tests, structure audit, runtime/browser behavior or performance
Report: C:/Users/osrs_/FluxStuff/fxwork/t829/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/core-implementation.md
Notes: Source frozen. No history/harness request contracts, host port, identity/receipt/permission implementation, downstream source, version/baseline/generated state or git edits. Available for focused corrections.

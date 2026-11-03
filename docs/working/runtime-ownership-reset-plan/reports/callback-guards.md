# Callback descriptor and native clock guard batch

Status: Done for the bounded callback/clock batch. Source is frozen for Root's common diagnostic/typecheck/structure window. Source edits were authorized by the callback-guards brief; Root additionally authorized four concrete engine consumers and their immediate tests.

## Bounded cases

- Own/inherited option and host callback accessors; callback getters installed after admission; no accessor evaluation or lasting callback on refusal.
- Enumerable own string/symbol option copies; preserve ordinary data copies and unobserved accessor behavior.
- Native Date/Math method/container replacement behind original live wrappers; recheck observed invocation while preserving unobserved live fallback compatibility.
- Preserve original callback receiver/tuple/first result, record-batch behavior and original native-log pinned-clock semantics.
- Refusals mark the existing entered frame unknown, survive a caller catching the error and refuse execution after reopening the same isolated persistence fixture.

## Findings

- Native/effect adapters read their option callbacks directly before observation. Host capture and node callback adapters have the same pre-invocation read gap.
- Coverage trusts live environment now/random wrappers even though those wrappers delegate to mutable global Date/Math methods.
- The saved native-log WIP rechecks current clock identity after invocation creation and breaks its original safe pinned-clock case. Root confirmed that original behavior must be retained.
- Copy checks reject enumerable symbol accessors but do not mark the current frame if the error is caught. Reusing the saved helper needs removing its driver import to avoid copy -> helper -> driver -> copy.
- Lower runtime/automation-host readers are outside this bounded batch. Complete clock/host coverage is not claimed; exact remaining readers appear below.

## Result

- Native/effect invocation and the four approved consumers now use the descriptor adapter before reading relevant option/host callbacks. Own/inherited data methods preserve their original receiver and arguments; unsupported original data callbacks retain their existing first-run result/accounting.
- Caught enumerable option-copy/accessor refusals mark the existing entered frame unknown. The helper uses the existing private binding's original ExecutionObservationSource, invocation and context, avoiding a new driver/copy import cycle or any new authority.
- The original live now/random wrapper is trusted only while its native descriptor matches. Observed read/invocation rechecks refuse replaced methods/containers without evaluating them and retain the current frame's unknown marker. Ordinary unobserved live wrappers continue their original replacement behavior.
- Approved graph/node/capture clock reads use the existing options with an explicit receiver. Observed node contexts wrap supplied clock functions; absent context clock fields remain absent to preserve built-in fallback behavior such as timing waits' midpoint jitter.
- A native-log invocation admitted before native clock replacement continues to use its safe pinned original. An invocation created after replacement remains unsupported. The original log compatibility tests pass unchanged.
- All refusals in the new actual-frame tests remain pending after reopening isolated persistence and refuse another execution. No SQL, runtime execution-observation/admission, driver, program/service, public protocol or structure-baseline file changed.

## Validation as it happens

- `pnpm --filter fluxiq exec vitest run src/framework/observability/exchange-log/native/tests/invocation.test.ts src/runtime/environment/tests/environment.test.ts` did not launch: PowerShell blocks pnpm.ps1. Subsequent commands use pnpm.cmd.
- `pnpm.cmd --filter fluxiq exec vitest run src/framework/observability/exchange-log/native/tests/invocation.test.ts src/runtime/environment/tests/environment.test.ts` -> 1 failed, 14 passed; the original pinned-clock log test throws exchange_log.native_identity_unavailable. Vitest duration 1.04s: collect 330ms; tests 77ms.
- `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/execution-admission/tests/guards.test.ts` before fixes -> 9 failed, 3 passed. Native/effect/host getters and live-wrapper delegates were executed; caught source/change symbol-copy refusals allowed the frame to close. Vitest duration 9.02s: collect 7.98s; tests 52ms. These are actual adapters/current frames, not helper-only tests.
- `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/execution-admission/tests src/engine/automation/host-state/tests/capture.test.ts src/engine/automation/node-execution/tests src/framework/clock/native/tests/read.test.ts src/framework/observability/exchange-log/native/tests/invocation.test.ts src/framework/observability/exchange-log/writer/tests/native.test.ts src/framework/observability/exchange-log/folder/tests/operation.test.ts src/framework/observability/exchange-log/listing/tests/operation.test.ts src/runtime/environment/tests` -> 20 files passed; 164/164 tests passed. Vitest wall duration 12.17s; aggregate parallel collect 62.87s, tests 2.46s, transform 6.59s, setup 1.32s, prepare 4.90s. The new guard cases passed 19/19; native clock cases 9/9; original record callbacks 8/8; original option copy 5/5; original native invocation 7/7.
- Scoped `rg -n '(import|from|export).*programs/'` over owned source/tests and the four approved consumers -> no matches. No direct program reverse import added. No repository-wide transitive closure/audit claim is made here.
- No typecheck, build, structure audit, full sweep, browser, panel, provider or paid execution ran in this lane. Root owns the common frozen package window. The structure baseline was not changed.

## Ownership

Original scope: engine/automation/execution-admission excluding internal/driver.ts; framework/clock; framework/observability/exchange-log/native; runtime/environment; immediate tests.

Root-approved additional consumers: engine/automation/host-state/capture.ts, node-execution/execution.ts, node-execution/attempt.ts, graph-run.ts. No source outside this manifest, no driver, runtime admission/observation, SQL, program/service, shared document or git edits.

## Exact files touched by this worker

Relative to packages/fluxiq/src/:

- engine/automation/execution-admission/copy.ts
- engine/automation/execution-admission/internal/coverage.ts
- engine/automation/execution-admission/kernel/index.ts
- engine/automation/execution-admission/kernel/clock.ts (new)
- engine/automation/execution-admission/kernel/native-call.ts
- engine/automation/execution-admission/kernel/effect-call.ts
- engine/automation/execution-admission/kernel/callback/index.ts
- engine/automation/execution-admission/kernel/callback/clock.ts (new)
- engine/automation/execution-admission/kernel/callback/invoke.ts
- engine/automation/execution-admission/kernel/callback/sync.ts
- engine/automation/execution-admission/kernel/callback/property.ts
- engine/automation/execution-admission/kernel/callback/unknown-sync.ts
- engine/automation/execution-admission/tests/guards.test.ts (new)
- engine/automation/host-state/capture.ts
- engine/automation/node-execution/execution.ts
- engine/automation/node-execution/attempt.ts
- engine/automation/graph-run.ts
- framework/clock/native/tests/read.test.ts (new)
- framework/observability/exchange-log/native/invocation.ts
- runtime/environment/tests/environment.test.ts

This report is the only authored document changed by the worker. All inherited descriptor/native-clock WIP files remain preserved; this list identifies this worker's further edits, not Root's complete task inventory.

## Explicit remaining scope

These source matches are outside the authorized finite adapter batch and were not edited or runtime-validated:

- runtime/automation-host/route-state/observe.ts:19; route-state/effect.ts:21,45,69; route-state/host.ts:15,38 retain direct host callback reads before their observation adapters.
- runtime/automation-host/boundary.ts:264 and engine/automation/transitions/comparison.ts:139,223 retain direct expectationEvaluator reads. comparison.ts:310 also reads hostRuntime/now while constructing the fact-observation input.
- engine/automation/composite/boundary.ts:61; composite/execution.ts:113,122 retain direct clock reads. The initial engine scan also found direct options.now/default Date.now in resume.ts and node-execution/failure.ts; complete-clock coverage was explicitly excluded.
- Absent built-in context clocks keep their original native fallbacks; those implicit fallback paths are not claimed fully guarded. The current batch covers actual supplied live-wrapper invocation and the approved explicit clock read adapters.

Outcome: Done
Changed: The exact 20 source/test files above and this report
Validation: Grouped focused vitest command above -> 20 files, 164/164 passed; source scan -> no direct program reverse imports
Not verified: Root's common package typecheck/audit/build/composed probe; lower host/transition/composite/implicit-fallback paths; live browser behavior
Report: docs/working/runtime-ownership-reset-plan/reports/callback-guards.md
Notes: Source frozen. No git mutations, agents, baseline changes or paid work. Preserved original first-run callback and native-log behavior.

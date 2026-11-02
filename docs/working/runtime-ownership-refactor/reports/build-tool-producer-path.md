# Actual ordinary build-tool producer path

REPORT FROZEN. [Dispatch brief](../briefs/build-tool-producer-path.md). Read-only source discovery; no source/tests/builds/git/shared documents changed.

## Actual gap and important path distinction

`service.ts:1476` creates one early configured build cohort and `:1531` wraps only its top-level harness. `service/project-build/brief-ports.ts:276` constructs a fresh registry/loop binding per brief and immediately puts it through `project.cancellation.tool` at `:280`; it never calls that observer binder. The service's original project ports at `:1550` carry the evidence binding/trial environment but no private link to the tool producer. `project-build/run.ts:272` passes that project into the brief factory. This explains the missing `studio.build.tools` roots.

**There is no Core.run_node-to-NativeRuntime.execute adapter on this inspected tool path.** `llm/node-tools/run-node.ts` defines the tool; `harness-options/binding.ts:699` forwards to the installed evidence binding. The actual reset regression fixture `service/project-build/tests/project-build-trial-reset.test.ts:235` directly changes `site.tab`/`site.cart`; its separate native runtime is used by detached Flow trials. C independently confirmed that distinction. The paired web evidence node-run also sends gateway commands directly (`domain/src/runtime/llm-evidence/node-run/retries/dispatch.ts:122`). Neither becomes a native invocation merely because the tool is named core.run_node. Do not replace that fixture with an invented native path or award its raw callback a native receipt.

The genuine existing native bridge is the **Flow** path: `engine/automation/execution-admission/kernel/native-call.ts` prepares the original native executor child and binds its request; `engine/automation/integration/graph-options.ts:34` reads that private companion and invokes the pinned canonical `native.execute.call(native, node, inputs, signal, hostContext, observation)`. The fifth argument is withheld from noncanonical/custom methods. `runtime/native-execution/native-node-runtime.ts:192-195` creates its normal implementation context and enters `executeObservedNative` before the original implementation; no observer is put in that context.

## Exact request/receiver chain to preserve

Paths below are under `packages/fluxiq/src/`; each newly allocated request needs deliberate private forwarding after an observed parent exists.

| Stage | Original receiver/callback and argument identity | Current construction |
| --- | --- | --- |
| Ordinary model/opening call | Evidence-loop invokes the retained loop callback with its own call object; model `value` is data | `llm/evidence-loop.ts:415,566`; do not use public callId/value equality as invocation identity. |
| Brief wrappers/cancellation | `brief-ports.ts:280` captures the harness callback; `cancellation.ts:78` calls the captured execute function directly, preserving its existing receiver behavior | Cancellation creates `{...call, signal: joinedSignal}`; forward any original admitted companion to that new object. Ordinary enrollment may start at the final harness argument instead. |
| Root wrapper | `build-execution/bind-tools.ts:9` captures original binding.executeTool; its normal function supplies actual `this`, exact original callback and `[input]` | Existing RootSource pins receiver/callback and copies the argument tuple before reserve. The actual input object stays identical. |
| Optional recall wrapper | `llm/evidence-recall/binding.ts:44` pins `loop.executeTool.bind(loop)`; non-recall branch forwards the same input | No request copy. Recall is an actual Core-owned compute branch, not a generic purity label for the whole multipurpose method. |
| Registry loop binding | `harness-options/registry.ts:246` is an arrow closing over original registry; calls `this.execute` with that registry receiver | Destructures incoming request and creates R1 with project/flow, optional runId, callId, optionId, value and optional signal/referenceNow/permission. Keep all existing omission rules. |
| Selected implementation | `registry.ts:215-219` obtains actual registered implementation and calls it as the current bare function | Creates R2 `{...input, permission: originalOrDenied}`. Pin that selected callback before any new awaited entry; arbitrary registered implementations stay unsupported unless their authentic owner supplies a contract. |
| Core descriptive wrapper | `binding.ts:603-604` may install `node-tools/describing-failures.ts:66` | Passes the exact R2 to original implementation. It can create a new **result**, so public result identity/status is not a completion issuer. |
| Installed evidence binding | `binding.ts:699-714` factory closure calls binding.executeTool as that binding's method | Creates R3 with toolId, same value, optional signal/referenceNow/startLocation and permission. Checked binding snapshot methods are already bound to their original host receiver by `domain-instructions/binding-snapshot.ts`; do not reconstruct identity from bound function names or a proxy. |
| Actual backend | Installed raw callback may act directly, call gateway, or use a real native adapter | Observe exactly that original callback. Only a genuine trusted native adapter may read the private request companion and supply native.execute's existing fifth argument. Unknown native/custom callbacks retain their old argument tuple and unverified coverage. |

## Shared seam required before release

`ExecutionCallbackRootLifecycle.prepared` already exists, but `roots/invoke.ts:18` calls it synchronously and `ExecutionCallbackRootSource.invoke` exposes no preparation hook. A2's `continuation.issueOrdinaryRunBinding(originalRoot)` is asynchronous and requires the **original reserved root**, not a row reconstructed from the prepared callback child. Make this small lead-owned amendment:

```ts
export interface ExecutionCallbackRootPreparation {
  prepared(parent: ExecutionObservationContext, originalRoot: ExecutionEntry): void | Promise<void>;
}
// RootSource, additive third argument; existing call and signal semantics stay:
invoke<TReceiver, TArguments extends unknown[], TResult>(
  call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal,
  preparation?: ExecutionCallbackRootPreparation
): Promise<Awaited<TResult>>;
// Lifecycle's existing hook gains originalRoot and may be asynchronous:
prepared?(parent: ExecutionObservationContext, originalRoot: ExecutionEntry): void | Promise<void>;
```

Pin preparation's original method and receiver before reserve. `invokeExecutionCallbackRoot` must **await** that exact method with `callbacks.context(prepared)` and `reserved.root` before invoking the pinned original callback. Hook rejection runs existing interruption/release handling and never seals coverage. No new persistence owner/registry or root reconstruction is needed. Preparation privately issues the authentic A2 run proof, reads through its original reader, and binds request R0 before any implementation runs.

Use the same early `createAutomationStudioBuildExecution` cohort. Composition should privately attach that original producer to original project ports before dispatch; the brief factory reads that companion and binds its fresh harness before cancellation captures it. No new public project/model/request fields, ambient current-parent variable, source per tool call, reopened registration or independent continuation.

Introduce one framework-private request companion owner, e.g. `build-execution/tool-requests/{state,inherit,index}.ts`: map original request objects to the original configured cohort, actual entered parent, authentic run proof/reader and private retry series. Only the producer's trusted preparation may bind; exported internal forwarding only copies an existing companion from source to a fresh target, rejects a different existing companion, and is a no-op for unobserved legacy input. A copied JSON/value/callId cannot enroll itself. Forward R0->R1->R2->R3 and cancellation's copy explicitly; recall/describing wrappers retain the same request.

Keep existing stable producer ports: `native.forParent(actualParent, originalSeries)`; `output.forParent(actualParent, actualOrigin, originalSeries)`; native.execute's existing fifth argument; output's existing exact gateway/run-proof reader. A real native adapter must pin canonical original runtime/execute and use the authentic private companion at its actual call site. The registry can forward a companion; it cannot make a raw host callback become that adapter. Do not add observation fields to NativeNodeContext, host/model arguments, metadata or permission DTOs.

One logical actual tool invocation gets one private token, retained through that invocation's internal attempts; native/output effect ordinals branch from that token. A new authored/model invocation gets a distinct token even if method/parameters match. Do not mint a token per retry, use result flags, borrow a prior call's public id, or prohibit a repeated method across the whole reservation.

Known factory-created dispatcher/recall/describing/native adapter closures may have original private factory membership. Observe the selected original leaf callback under their actual parent. A managed orchestration wrapper closes only from authentic observed descendant completion, with a required descendant where appropriate. Explicit original compute-only branches may use no_direct_effects for both fulfilled and original thrown outcomes. An arbitrary installed evidence callback remains unsupported; a direct counter act+throw or forged unacted return never becomes safe because a known wrapper called it. No blanket managed registration for all core.run_node calls.

## beforeTrial: child routing, not another root

`brief-ports.ts:321,369` gives StartCheck `executeTool: call => built.loop.executeTool(call)`; its lookAt/compareAt/compare arrivals eventually reach the same harness (`site-reset/start-check.ts:212,234,262`). Thus the same producer can serve them **as children** when C/root forwards the original already admitted parent to the exact created call. In that mode use callbacks.prepare(callbacks.forParent(parent), originalCall), await preparation, invoke and flush; do not call RootSource.reserve or finish/release the caller's root. Inherit the caller's original run proof and series instead of inventing another run.

The tool bridge does **not** cover StartCheck's separate original `binding.startState` calls (`:238`, plus settled/capture paths). Those need C's exact callback/receiver observation and truthful owner contract. A `startState` name or an effect:false flag supplies no contract. This report only locates that seam; reset/offline/candidate/metadata and A2 storage remain C/Root-owned.

## Bounded implementation partition and acceptance

1. **Root shared seam:** generic roots/{source,invoke,lifecycle}.ts + immediate tests for awaited prepared hook, exact original root/receiver, no invocation before preparation commits, and hook failure preserving pending history. Composition at service.ts/build-execution and a private project companion; no new persistence API.
2. **Build-tool/request lane:** build-execution/{bind-tools,create}.ts plus cohesive tool-request companion/producer feature; harness-options/{registry,binding}.ts; narrow cancellation request-copy line; project-build/brief-ports.ts harness binding only. Parent barrels/public exports remain Root-owned. If a generic runtime consumer needs the companion, inject a narrow reader rather than introducing runtime->Studio/engine imports.
3. **Actual adapter lane, explicit prerequisite:** select a genuine trusted native tool adapter or actual gateway-backed host owner; neither exists implicitly on the inspected raw host path. Native/original output adapter must consume the private companion internally and pass existing observer ports. Keep raw fixture callback's unsupported oracle beside a separate real native/gateway adapter integration; do not relabel the fixture's direct writes as native receipts. C retains StartCheck/reset/offline/trial owners and tests.

Required provider-free checks after explicit source release (none run here):

- Actual service project builder/repair/reset brief callbacks must create entries under the **same** early cohort, before writes. Add original private-receiver counter act+throw and fulfilled forged-unacted cases; repeat/new gate/reopened continuation produces zero second send and pending/unverified durable history. Original first result/error behavior remains.
- Actual native and gateway adapter tests must show original invocation/request forwarding through all three registry copies, one series across scheduled retries, distinct authored invocations, no observer in JSON/NativeNodeContext/model/adapter args, and lost ACK/late abort-ignoring work staying pending. Explicit authentic compute-only rejection keeps ordinary retries.
- An already admitted beforeTrial arrival yields a descendant under the original reservation/root, with zero ordinary-root reserve calls; unsupported startState remains unverified. No C reset/metadata expectations weakened.
- Existing selectors: roots/tests/invoke.test.ts; native-execution/admission/tests/{native,pin}.test.ts; engine/automation/execution-admission/tests/producers.test.ts; llm/harness-options/tests/{registry,binding}.test.ts; evidence-recall/tests/binding.test.ts; project-build/tests/project-build-trial-reset.test.ts (retain exact cross-builder undo, original receipt and persisted-anchor oracles). Add a real ordinary build-tool service integration in the producer owner's immediate tests, not only fabricated direct Source calls.
- Source-closed strict and scoped structure/import-cycle checks; Root handles coordinated package/build acceptance. Do not duplicate A2 coverage ledger or C reset proof protocols.

Outcome: Done
Changed: this report only
Validation: read-only trace of actual factories, requests, receivers, native Flow bridge and named production fixture; no tests/scans/builds
Not verified: proposed wiring, callback contracts, native/gateway producer integration, durable counter acceptance
Report: docs/working/runtime-ownership-refactor/reports/build-tool-producer-path.md
Notes: Fresh brief harness bypass confirmed. Inspected raw Core.run_node callbacks do not invoke NativeRuntime.execute. Async original-root preparation and explicit real backend adaptation are prerequisites.

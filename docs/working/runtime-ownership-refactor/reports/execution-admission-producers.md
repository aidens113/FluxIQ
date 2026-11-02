# Execution admission producers: discovery and handoff

Outcome: Done, READ-ONLY DISCOVERY. Source release is pending; only this report changed.

Dispatch: [execution-admission-producers brief](../briefs/execution-admission-producers.md). Reuses the [accepted API](execution-admission-api.md) and [verified A1 authority](execution-admission-authority.md). No A1 signature amendment is needed for the producer handshake below.

The additive cut is per-scope engine/native/output source owners, private observation companions, and explicit managed-completion registrations. Register the entire owner/delegation cohort before the first A1 reservation. No producer/issuer/reservation/entry handles enter native implementation contexts, adapter contexts, model/tool JSON, traces or metadata. Legacy optional absence retains ordinary behavior and earns no certificate.

Paths below are relative to `packages/fluxiq/src/`. Root retains Studio composition, A2 retains SQL/command owners, and candidate/LLM/trial wrappers remain outside this implementation unit.

## 1. Per-scope registration handshake

Each source owner is a fresh object for one original A1 assembly/scope. It owns original-origin and one-use evidence registries. The native runtime/IO registry/runtime service may be shared between concurrent scopes; never install a mutable current-scope field on those shared objects.

Proposed source-composition shape (trusted code only):

```ts
interface ProducerSourceOwner {
  readonly owner: object;
  registration(delegatesTo: readonly object[]): ExecutionSourceRegistration;
  connect(ports: ExecutionSourcePorts): void;
}
```

`registration` returns the owner's original registration bound to its constructor's original `scope`; its readers retain original receivers. `connect` is one-use and receives exactly `assembly.registerSource(thatRegistration)`. Neither method is exposed through an execution context. A wrong source connection fails actual A1 origin/source membership rather than acquiring rights by structural shape. Source/delegation configuration is immutable after connection.

Root assembly order:

```ts
const scope = await authority.openScope(actualPersistedContinuationProof);
const engine = createAutomationExecutionAdmissionSource(scope);
const native = createNativeExecutionAdmissionSource(scope, originalNativeRuntime);
const output = createOutputExecutionAdmissionSource(scope, actualBackendBindings);
const gateway = a2.createGatewayExecutionAdmissionSource(scope);

// Root trial/hook owners are supplied by their separately owned composition.
engine.connect(authority.registerSource(engine.registration([
  engine.owner, native.owner, output.owner
])));
native.connect(authority.registerSource(native.registration([])));
output.connect(authority.registerSource(output.registration([gateway.owner])));
gateway.connect(authority.registerSource(gateway.registration([])));
// Register trial/hook sources and any explicitly managed native transport child
// before reserve; native direct work gets no implicit delegation.
```

The actual root trial owner delegates to `engine.owner` and its own real start-hook owner. The engine owner delegates to itself for graph/attempt/effect/nested frames, to native for computation, and to output for actual IO/runtime backend invocation. Output delegates to A2's original gateway owner. Native does not receive broad gateway/IO delegation: an explicitly managed direct-native adapter would need its own authentic child path and explicit owner declaration.

All roots, compiled/composite/subflow frames and source reacquisition use the same reservation. The parent changes to the real current entry; the authority/scope/source objects and reservation never change to obtain clearance.

## 2. Observation types and storage of companions

The following opaque bindings are framework-only. Membership is private to the corresponding per-scope producer owner; a matching object/brand/JSON value is insufficient.

```ts
declare const automationObservationBrand: unique symbol;
declare const nativeObservationBrand: unique symbol;
declare const outputObservationBrand: unique symbol;

interface AutomationExecutionObservation {
  readonly [automationObservationBrand]: never;
}
interface NativeExecutionObservation {
  readonly [nativeObservationBrand]: never;
}
interface OutputExecutionObservation {
  readonly [outputObservationBrand]: never;
}

interface AutomationObservationFactory {
  forParent(parent: ExecutionObservationContext): AutomationExecutionObservation;
}
interface NativeObservationFactory {
  forParent(parent: ExecutionObservationContext): NativeExecutionObservation;
}
interface OutputObservationFactory {
  forParent(parent: ExecutionObservationContext): OutputExecutionObservation;
}
```

The corresponding source factory returns its `ProducerSourceOwner` and observation factory together. `forParent` stores the original parent/reservation in a private binding, validates the configured scope at first actual A1 entry, and exposes no issuer/evidence-minting methods to the caller of an implementation.

Exact additive framework signatures:

```ts
// engine/automation/integration/input.ts:
type AutomationGraphOptionsInput = ExistingAutomationGraphOptionsInput & {
  executionObservation?: AutomationExecutionObservation;
};

// No enumerable observer property is required on GraphExecutionOptions.
function bindAutomationExecutionObservation(
  options: AutomationStudioGraphExecutionOptions,
  observation: AutomationExecutionObservation
): void;

// Internal engine copy sites preserve the binding explicitly.
function inheritAutomationExecutionObservation(
  source: AutomationStudioGraphExecutionOptions,
  target: AutomationStudioGraphExecutionOptions,
  parent?: ExecutionObservationContext
): void;

// Existing first four native arguments remain identical.
execute(node, inputs, signal?, hostContext?, observation?: NativeExecutionObservation);

// Framework call boundaries only; the observation is not forwarded to adapters.
IoRegistry.dispatchOutput(request, observation?: OutputExecutionObservation);
RuntimeService.dispatch(command, context = {}, observation?: OutputExecutionObservation);
dispatchRegisteredOutput(io, domainId, action, signal?, commandContext?, targetPreparer?,
  observation?: OutputExecutionObservation);
```

`createAutomationGraphOptions` consumes its optional input into a private options companion. Native `AutomationNativeExecutionPort` remains a structural Pick of the actual runtime method, inheriting the optional argument. `AutomationStudioNativeNodeImplementation`, its SDK context/result, IO request JSON, and runtime adapter/transport contexts remain unchanged.

Use private WeakMaps for graph options and per-effect context companions. `effectDispatcher` retains its existing two arguments. Bind its observation only after constructing the final context object, including the current required-context spread; binding an earlier object and then spreading it loses identity. Core output dispatchers read the companion and pass the separate framework-only observation argument to IO/runtime. A custom dispatcher receives its original context and receiver with no observer field. If it does not participate in a managed boundary, its real invocation is unverified.

Native/adapter implementations never receive the framework observation argument. IO `dispatchOutput` strips nothing because the argument is separate; it invokes the original adapter with the original request. Runtime `dispatch` keeps the observation outside its existing `dispatchContext` projection, so `dispatchToTarget` cannot spread it into an adapter/transport context. Preserve `target.adapter.execute(...)`, registered required handler binding, and transport method receivers exactly.

## 3. A2 gateway parent and sole-context bridge

For both required and ordinary gateway paths, A2's actual parent is the **output/backend invocation entry**, not the engine's preliminary effect entry.

1. Engine creates/enters its effect frame and privately binds the resulting observation to the final effect-dispatch context. Required mode may already have issued the original existing `ClientGatewayCommandContext` at this point.
2. Core output dispatch chooses the original actual IO adapter or runtime target and persists the output/backend invocation entry before calling that handler. Its source delegates to A2's original gateway owner.
3. Before invoking a known gateway-capable handler, bind the exact existing required Context, or ask A2 to issue an ordinary observed Context, to `{ reservation, parent: backendEntry }`. Bind privately and once; never clone/replace an existing required Context or rebind it to a new parent.
4. When the real gateway dispatch resolves that Context, A2 enters its gateway child under that exact backend parent before claim. A2's claim transaction re-reads the original gateway entry through the accepted private bridge and validates SQL fence/row/actual command provenance.

Proposed B/A2 interop shape (implemented/owned by A2):

```ts
interface ObservedGatewayBinding {
  bindRequired(input: {
    readonly parent: ExecutionObservationContext;
    readonly context: ClientGatewayCommandContext;
    readonly provenance: object;
  }): void;
  issueOrdinary(input: {
    readonly parent: ExecutionObservationContext;
    readonly provenance: object;
  }): Promise<ClientGatewayCommandContext>;
}
```

`provenance` is the original engine/output-owned invocation witness, read by the configured actual owner; it is not a caller-supplied claim DTO. A2's bridge validates original owner/context membership and exact run/invocation/attempt/effect ordinal. Bind-before-handler is not a second command claim. A2 remains the sole gateway observer and command owner; B records no duplicate receipt ledger.

Only explicitly registered gateway-backed handlers use this bridge. Current IO/runtime code treats a present command Context as a requirement for a registered durable handler. Do not attach one to a generic legacy callback and accidentally turn its ordinary first run into unsupported-required-handler refusal. A normal observed gateway Context uses that genuine durable transport capability while leaving the graph's global required-command mode absent. Required mode retains its stricter original controller/consumption and historical unknown latches.

B cannot authenticate resource identity from `metadata.clientId`, `sessionId`, a target shape, or a capability string. Root must supply A1's original persisted continuation plus actual host/environment/resource-lease ownership. B preserves that original binding; a changed lease/session label does not clear earlier uncertainty.

## 4. Managed completion is an explicit code contract

Native registration is installed by trusted composition against the original runtime, implementation reference, canonical package/definition versions and effective grant/binding digest. It is not SDK/manifest metadata and is never inferred from returned success, empty effects, an observe label, or an authored declaration.

```ts
interface NativeManagedCompletionRegistration {
  readonly owner: object;
  readonly implementation: AutomationStudioNativeNodeImplementation;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly contract: "no_direct_effects" | "managed_direct_effects";
  consumeCompletion(input: {
    readonly invocation: object;
    readonly originalResult: AutomationNodeExecutionResult;
  }): {
    readonly completionDigest: string;
    readonly evidenceDigest: string;
  } | null;
}
```

The native runtime validates/captures the actual binding and grants itself, retaining a private binding token; an external digest string is not proof. The per-scope source owns only scope/invocation authority. Changing the implementation/version/grants invalidates its matching completion contract without replacing shared runtime identity. Pin the original matcher/domain registry; do not remap or lower calibrated action-effect/target floors.

- `no_direct_effects` certifies this exact trusted function only computes and returns effects; after its actual promise returns/validates, native computation may close. The engine attempt stays open while returned output effects execute and are assessed.
- `managed_direct_effects` requires authentic completion for every direct effect and invocation quiescence from the actual effect owner. No generic adapter can certify arbitrary ambient/fire-and-forget JavaScript. Unsupported direct work stays unverified/pending.
- No registration preserves the existing callback/result behavior on its ordinary first invocation, records returned-unverified coverage, and earns no safe-retest certificate.

Use an equivalent original-subject/handler completion registration for direct IO/runtime adapters. A2 gateway completion comes from its actual authenticated observer/required handling, not `result.ok`/`status`. Caller-created success or unacted fields cannot mint a source witness.

Begin before evaluating the synchronous `binding.implementation(...)`, adapter callback, or outside-graph `dispatch`. Keep the original promise identity. Throw/rejection/timeout records interruption before the existing error/result conversion. Abort-ignoring/late work does not close terminal uncertainty. Before-call denial/version/unbound paths remain genuinely unacted.

Managed-completion disposition is carried in a private companion keyed by the original returned invocation/result object, never by a new JSON result field. Engine reads only the actual source's original companion. Copied/serialized results and unsupported callback returns are unverified; they do not cause parent closure or failure/result rewriting.

## 5. Actual semantic witnesses and propagation

Keep `automationStudioAssessAttemptFault` pure: it accepts trace data and must not become an authority issuer. Mint semantic witnesses only at the actual step-loop/outside-graph call sites, bound to original run-state, actual attempt/invocation, callback completion, host effect-check call and original trusted floor.

For normal failures, record interruption while assessment is pending. A supported actual no-effect witness may close it and preserve existing automatic retry/source reacquisition. Terminal `run.outcome_uncertain` or required unknown records the stronger block and cannot be cleared by a page/reset/result field. Required consumption remains A2's original handling owner.

A neutral reader collaborator can cross runtime/engine without inversion:

```ts
interface InvocationSemanticOwner {
  consume(input: {
    readonly invocation: object;
    readonly proof: object;
  }): {
    readonly disposition: "unacted" | "settled" | "unknown";
    readonly assessmentDigest: string;
  } | null;
}
```

Engine implements the reader using its private actual-execution registries; runtime native/output owners consume it as an injected collaborator. Runtime imports no engine. An arbitrary call to the pure assessment function or a structurally matching attempt/effect-check object cannot supply that proof.

Do not place handles in attempt traces or use attempt ID alone as authority. Store invocation state in private companions keyed by original run-state/frame objects; keep actual attempt association when the step loop replaces a trace with a spread. Backend/direct native closure waits for genuine semantic/handling proof. If any supported child remains unverified, the original ordinary result still returns; the parent records unverified instead of attempting a false completion seal.

Exact copy/entry points needing explicit companion inheritance:

- `engine/automation/integration/{input,graph-options,native-runtime}.ts`; `environment/executor-options.ts` (returns a new options object).
- `graph-run.ts`; `frames/{graph-frame,call-subflow}.ts`; `node-execution/attempt.ts` (`callFlowChildOptions`, actual native/custom/effect paths, final effect context); `composite/{execution,boundary,child-bounds}.ts`; `compiled-plan/run.ts`.
- `outside-graph/retries.ts`; actual `step-loop/{failed-attempt,uncertain-stop}.ts` and success/lifecycle settlement call sites discovered when implementing the same actual attempt owner. The pure assessment function stays an evidence calculation.

Canonical child option copies explicitly inherit the same observation and replace only the parent with the real current entry. Custom composite callbacks retain their existing options object with no enumerable handles. Unknown custom execution remains unverified, and no child trace summary can close a parent by itself.

## 6. Exact ownership/readiness

Ready after explicit source release. Additional narrow owner requested: `runtime/output-dispatch/admission/**` for output-context companions, per-scope backend source and managed completion. This keeps IO authority out of native ownership and avoids changing frozen A1. No edits to `runtime/contracts.ts` or IO request/SDK contexts are necessary when the private argument/companion design is used.

| Owner | Planned paths |
| --- | --- |
| B native | New `runtime/native-execution/admission/{source,observation,registration,invocation,completion,index}.ts`; narrow native runtime binding/execute plus immediate tests. |
| B output/backend | New requested `runtime/output-dispatch/admission/{source,observation,context,registration,invocation,completion,index}.ts`; actual `io/index.ts` dispatch, `runtime/service.ts` dispatch, `runtime/output-dispatch/{io,io-effect,runtime-effect,ports/io,ports/runtime}.ts` forwarding plus immediate tests. |
| B engine | New `engine/automation/execution-admission/{source,observation,options,origin,semantic,completion,index}.ts`; exact invocation/copy leaves above and immediate tests. Split the already large attempt owner only by its real invocation/effect responsibilities if budgets require it. |
| A2 | Gateway source/context mapping, SQL inventory/link/fence transaction, sole observer and original required handling. No B edits there. |
| Root | Public/parent exports; actual project/Flow/resource proof; complete source registration cohort; `_shared/runtime.ts` resolver; Studio build/trial/hook composition and downstream explicit completion registration. |

Implementation acceptance is callback-based: synchronous increment+throw; ignore-abort late increment; genuine managed no-direct-effects with returned observed effects; IO/runtime fallback invoking exactly one backend; unverified ordinary first result unchanged; required Context identity preserved; actual child unknown blocks new invocation; original private-field receivers; forged/copy/no-JSON completion rejected. A2-backed zero-second-send/reopen and production hooks/candidate remain shared integration acceptance after both sides are stable.

Validation: read-only inspection of the dispatched brief, accepted contracts and named actual invocation/copy signatures with `Get-Content`, `rg`, and `rg --files`. No sources, tests, configurations, manifests, shared documents, git, checks/builds/providers/browser/panel or user-data operations changed or ran.

Not verified: proposed producer implementations/types, real durable command bridge, managed native/adapter deployment contracts, full child-option propagation, actual candidate safety and downstream registration. Source remains untouched and frozen pending the lead's explicit release.

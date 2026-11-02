# Framework trial and restoration migration

Outcome: Done for bounded read-only discovery. No source was moved by this discovery task.

The user requires Studio to be the UI panel controlling the framework. Every
backend location below is temporary compatibility scaffolding. The first cut
is executable now; the second follows it without candidate/document promotion.
Candidate gates, restoration, project persistence and presentation still have
required closed migrations afterwards.

## First cut: one shared invocation context and scope

Canonical owner:
`packages/fluxiq/src/runtime/flow-authoring/execution/observation/`.
The lead's `framework-observation-migration.md` is the implementation brief.

Move the actual bodies of these old leaves once:

- `programs/automation-studio/runtime/candidate-trials/partial/context.ts`
  becomes canonical `context.ts` and an exact old type alias.
- `programs/automation-studio/runtime/flow-bootstrap/reset-observation/{registry,scope,invoke,sync,producer}.ts`
  become corresponding canonical leaves; old symbols are named aliases.
- Add canonical `tool-port.ts` and `index.ts`. The private registry must have
  one owner. Do not create another writer, tool or trial scope map.

The exact context retains all seven fields:

```ts
interface AuthoringExecutionContext {
  readonly parent: ExecutionObservationContext;
  readonly callbacks: ExecutionObservationSource;
  readonly automation: AutomationExecutionAdmissionSource | undefined;
  readonly originalRoot?: ExecutionEntry | undefined;
  readonly toolObserver?: AuthoringExecutionToolPort | undefined;
  readonly toolRequest?: object | undefined;
  readonly prepareToolParent?: (
    request: object,
    parent: ExecutionObservationContext,
    originalRoot: ExecutionEntry
  ) => Promise<void>;
}
```

All referenced admission/source types already have canonical owners. The
high-level authoring execution feature can import the existing engine source
**type**; the low-level `runtime/execution-observation` feature must not gain an
engine or Studio dependency. Do not copy the opaque engine observation brand.

Replace only the concrete Studio tool-observer type edge with this narrow
original-object port:

```ts
interface AuthoringExecutionToolPort {
  prepareParent(request: object, parent: ExecutionObservationContext, root: ExecutionEntry): Promise<void>;
  bindParent(request: object, parent: ExecutionObservationContext, inheritedRequest?: object): void;
  invoke<TReceiver, TArguments extends unknown[], TResult>(
    call: ExecutionCallbackCall<TReceiver, TArguments, TResult>,
    originalRequest: object,
    signal?: AbortSignal
  ): Promise<Awaited<TResult>>;
}
```

These are the methods consumed by the scope's producer and prepared tool
handoff. The original concrete observer object and pinned receiver remain the
same; no wrapper or observer property enters a host/model request. Its other
methods remain on its actual owning class until the second cut.

The canonical scope preserves current nested binding restoration, original
context/options/parent/root references, owner links, changed-owner/cycle
refusal, original function/tuple calls and unknown-before-return behavior.
The canonical policy authority is already
`runtime/execution-observation/policies/ExecutionCallbackPolicies`.

Keep `trial-context.ts`, sessions, finish and result-policy as thin temporary
bridge adapters. They still query actual candidate/partial private authorities;
moving them in this first cut would pull Studio back through value imports.
Do not turn that lookup into a JSON flag or ambient current invocation.

Actual consumers are the queued writer's original-record capture,
`build-execution/tools/{observer,callback-scope,auxiliary-calls}.ts`, and the
before-trial/start-state/ledger producers. The persistence worker has accepted
this sole context/scope owner and will import it rather than duplicate it.

Acceptance: canonical source/type/declaration closure has zero Studio or
downstream edges; neutral scope/receiver/tuple/restoration tests; old alias
identity; the existing callback/sink/session tests and selected actual queued
writer/store subjects. The lead owns parent/package exports and the final
composed service acceptance. No baseline increase or deep-import exception.

## Second cut: actual original tool observation

Canonical owner:
`runtime/flow-authoring/execution/tools/`.

Own the current `programs/automation-studio/runtime/build-execution/tools/`
mechanisms: `observer.ts`, `options.ts`, `state.ts`, `request.ts`, `factory.ts`,
`project.ts`, `create.ts`, `callback-context.ts`, `callback-scope.ts`,
`with-callback-scope.ts`, `auxiliary-calls.ts` and the feature barrel. Include
the exact request-inheritance implementation currently reexported through
`build-execution/forwarding/index.ts` after checking its immediate imports;
do not leave a canonical wrapper delegating to a Studio implementation.

This cut depends on the first canonical context/scope and the existing neutral
backend-attempt, retry-series, callback-root and ordinary-run-binding ports.
The options already contain only scope, roots, callbacks and the original
`OrdinaryExecutionRunBindingReader` plus its issuer. Preserve the actual
issuer/reader method pinning, original root proof, separate scope/invocation
roles, distinct authored-call series and same-invocation retry fence.

The factories' original-function registration belongs with each actual
framework tool factory. A caller name, method name, frame-shaped result or
metadata marker cannot replace that declaration. Keep raw supplied callbacks
uncredentialed unless their actual owner supplies a truthful completion.

Studio environment maps become exact forwarding adapters into the one
canonical tool authority. Build cohort creation remains a following migration,
not a permanent program composition exception. Actual consumers are the same
whole/partial trial adapters, original LLM binding request bridge, before-trial
reads, permission wrapper and queued metadata producers.

Acceptance: exact tool producer/parent/auxiliary/receiver tests, actual composed
binding tests, distinct invocation versus internal retry tests, callback-scope
restoration and lost-proof/no-second-send tests; neutral closure and scoped
structure. B owns its current forwarding fixes until handoff; serialize those
files before this cut.

## Required restoration and trial closure

The next restoration destinations are `runtime/state-baseline/**` for original
collection/control/baseline/reach mechanisms and
`runtime/state-restoration/{ledger,admission,settlement,change}/**` for the
actual state-restoration mechanisms. The Ledger destination is
`runtime/state-restoration/ledger/**`, including its complete current
Act/NamedAct/RecordedAct/Leftover/State authorities under that feature's
contracts. The persistence worker owns the following actual ProjectLedger
composition and its ProjectAct/Snapshot/Options at
`runtime/state-restoration/project/**` after that closure.

The Ledger closure is not only `site-reset/ledger.ts`. It requires the bodies
in `reset-ledger`, `reset-admission`, `reset-baselines`, `reset-settlement`,
`reset-undo`, and the canonical trial-change facts used by `trial-change-port`.
Use the current canonical action-permission consequence authority and
`flows/executable/verification/trial` data instead of copied types.

These exact type authorities still require promotion before candidate/partial
gates can have zero Studio type edges:

- Full `AutomationStudioFlowCandidate`, original source bindings,
  `AutomationStudioCandidateTrialRequest/Result/Act`,
  `AutomationStudioCandidateTrialVerdict` and `VERDICTS` from
  `flow-bootstrap/candidate/contracts.ts`.
- Full `AutomationStudioSubflowScope/Proposal/TrialRequest/TrialResult` and
  from-step contracts from `subflow-candidate/contracts.ts`.
- The actual full plan/interface/subflow/metadata/build-plan authorities in
  `flow-bootstrap/plan`, the plan-handle/completion views in
  `llm/harness-options`, and the complete instruction authority in the model.
  Do not invent a smaller candidate, project, Flow or runtime-session DTO.
- The exact explored-toggle, toggle-state/signature and value-key authorities
  consumed by restoration and the Store parser. These are shared prerequisites,
  not part of the current context move.

Active interpretation needs a real host port. `site-reset/start-check.ts`
currently imports the Studio LLM binding and builds `core.run_node` arrival
calls under `runAsAutomationStudioCoreMove`; it reads an arrival node/parameter
and inserts the domain location. Those tool/wrapper semantics must not move
into a canonical state-baseline folder. Keep state comparison and opaque
location equality generic; move the actual trusted arrival/start-state adapter
and active browser interpretation downstream. Preserve the original callback
receiver and admission/proof path through that port.

Ledger answers and reset refusal helpers also render model-facing words. Freeze
an explicit trusted presentation boundary before moving these mixed leaves;
do not import old Studio words from canonical code or install browser guidance
as a generic default. Existing wire/schema fields, instruction text, metadata,
replay/privacy bytes and SQL original-owner identities remain acceptance
oracles. This port/DTO work is required, not a permanent exception or a claim
that the whole restoration closure is ready to dispatch today.

## Validation and limits

Discovery read the named brief, relevant Current State, the already-known
context/scope/candidate/reset/ledger leaves and their immediate imports. It ran
no source mutation, test, build, provider, browser, git or user-data operation.
Separate, already-authorized callback implementation acceptance is recorded in
`before-trial-producer-implementation.md`; it is not validation of this future
migration. The lead has released the bounded first context/scope implementation
only. Full candidate/session/restoration/persistence migration is not claimed.

# Native, adapter and registered-output extraction plan

Outcome: Done (read-only extraction plan; native/IO implementation not begun)
Changed: This report only.
Validation: Source/import/consumer inspection for this plan; no native/IO tests, builds or typechecks.
Not verified: Proposed implementation, declaration compatibility and runtime behavior after relocation.
Report: docs/working/runtime-ownership-refactor/reports/native-io-plan.md
Notes: Source is frozen. The separately authorized detached-child checkpoint fix is recorded below; native/IO extraction awaits authorization.

## R1: SDK and native binding — closed extraction

The entire active importer SDK is reusable now. Its observation/candidate IDs,
recording mapper contracts, visualizer metadata and editor labels contain no
project repository or Studio service dependency. Preserve these data contracts
and all public names; moving the registry does not authorize loading executable
modules from metadata.

### Canonical ownership

- `components/automation/importer/{contracts,registry,validation,index}.ts`: move
  `nodes/importer-sdk.ts` declarations, manifest registry and validators once.
  Import node definitions/registry/result contracts from their canonical owner,
  `ElementMatcher` from runtime target-matching, the log DTO from automation-host,
  and `RecordOutput as AutomationStudioRecordOutput` from `@fluxiq/contracts/records`.
  Keep the SDK version and all persisted discriminator/diagnostic strings.
- Expose importer as its own package subpath. Do not make the importer registry
  import a parent barrel that reexports importer and closes a registry cycle.
  Either keep the parent neutral node barrel independent or import the actual
  parent-owned definition/registry modules where the audit permits ancestor edges.
- `runtime/native-execution/{contracts,native-node-runtime,index}.ts`: move the
  current class implementation and grant/execution DTOs once. Keep the original
  class export through the Studio compatibility file, so class identity and all
  internal maps survive. Its remaining graph/node/scope, reference-time, result
  actionability and SDK dependencies already have canonical owners.
- One additional closure is required: move only
  `engine/automation/parameter-refresh/resolve.ts`'s pure declaration resolver into
  `components/automation/target-refresh/{resolve,index}.ts`. It reads canonical
  node definitions/parameters and returns an automation-host DTO; it does not
  execute a retry or depend on frame state. The engine leaf/barrel forwards the
  same function. This avoids a runtime-native-to-engine dependency and avoids
  replacing automatic refresh with an optional/no-op injection.

### Compatibility files and exact integration paths

- Old `nodes/importer-sdk.ts` becomes direct exports from canonical importer.
  Old `nodes/index.ts` continues to forward it; no implementation remains there.
- Old `runtime/native-node-runtime.ts` becomes direct class/type exports.
  Existing Studio service imports can remain compatible during the unit.
- Retarget canonical imports inside the moved class; do not copy old Studio
  barrels into its dependency graph.
- Lead owns package exports, parent barrels, architecture and downstream public
  import migration. Downstream `domain/src/output-nodes/native-runtime.ts` can
  later import SDK symbols from the new subpath; its matcher singleton and bundle
  registration stay exactly as they are.

### Required preserved behavior

- Manifest/bundle identity/version checks; validation before binding; immutable
  manifest copies; canonical parameter contracts bound on the registry read by
  planning; declarative visualizer metadata cannot claim executable capability.
- Permission/capability/network/secret/filesystem/process grants; version refusal
  as unacted; isolated declared input ports; timeout/cancellation; log redaction;
  output-port and output-action boundary checks.
- Action-effect floors remain canonical. Conditional unresolved parameters stay
  conservative, all matching registered policy outputs contribute their floors,
  and model-authored metadata cannot lower them.
- Refresh declaration resolution preserves descriptor-only reads, duplicate and
  unsafe-field refusals, conditional commit exclusion, ambiguous output refusal
  and unreadable-registry outcome.
- Registered matchers remain scoped to `manifest.domainId`. Conflicting matchers
  fail before SDK registration. Missing matchers fail closed only when scoring is
  requested; native/resolver/recording contexts never use the deprecated neutral
  `.elementMatcher` property as a fallback.
- Preserve the implementation's real result/failure semantics for unknown act
  effects; relocation must not add optimistic retry/idempotency claims.

### R1 tests and ownership brief

Own old SDK/native implementation files, their focused tests, the new canonical
importer/native/target-refresh paths, and the engine resolver leaf/barrel facade
only. Do not touch engine retry/rebinding algorithms.

- Move `nodes/tests/importer-sdk.test.ts` beside canonical importer validation.
- Split `runtime/tests/native-node-runtime.test.ts`: binder-only manifest/grant/
  isolation/timeout/output/matcher tests move beside native-execution; tests that
  build Studio graph options, datasets or bootstrap plans stay at the Studio
  composition owner. Preserve their assertions.
- Move/add declaration-resolution unit tests beside the target-refresh resolver;
  existing engine stale-target/retry integration tests continue to prove engine
  behavior.
- Keep tiny old/new class/function identity and assignability tests under Studio.
- Narrow acceptance: canonical SDK/native/resolver tests, retained Studio native
  integration tests, source-closure tests, touched-package typecheck and structure
  audit after the coordinated source-stable gate. No full suite or paid run.

## R1: active adapter registry

`runtime/adapters.ts` has only a three-method identity-preserving map registry.
Its last Studio edge consists of the four state/schema/action/result DTO types.
Avoid importing the full state/action model merely to move this registry.

- Put neutral `RuntimeObservation<TState>`, the opaque JSON action request,
  `RuntimeAdapter<TState,TStateSchema,TActionDefinition,TActionResult>` and
  `RuntimeAdapterRegistry<TAdapter extends RuntimeAdapter>` under
  `runtime/adapters/{contracts,registry,index}.ts`.
- Methods only store/get/list the original adapter; generic types do not change
  runtime values or introduce new normalization. Preserve replacement-by-ID,
  insertion order and object identity.
- Old Studio `adapters.ts` specializes these neutral types with the existing
  `StateSnapshot`, `StatePathSchema`, `ActionDefinition` and `ActionResult`. It
  aliases the specialized constructor value and its instance type to preserve
  old source signatures and `instanceof`/constructor identity, without a wrapper
  subclass or copied registry implementation.
- Use a distinct canonical export name, such as `RuntimeAdapterRegistry`, so a
  root export does not ambiguously collide with the old specialized Studio name.
- Old `runtime/contracts.ts` is passive legacy recorder/policy-runner typing over
  `AutomationTask`, `RecordingEvent` and `DynamicPolicyArtifact`. No active
  implementation imports it outside its barrel. Leave those legacy interfaces
  in Studio; they are not a reason to retain the active adapter registry there.
- Add canonical registry identity/order/replacement tests and old specialized
  declaration/constructor-identity tests. A future state-contract extraction can
  replace Studio type arguments without changing this registry again.

## R3: registered output transport and opaque target adapter

The transport is generic. Its only active program dependency is the private
`PolicyOutputAction` alias and the target-envelope preparation functions. Extract
those dependencies explicitly; do not move the legacy target normalizer into a
new canonical runtime directory unchanged.

### Minimal stable contracts

Define a canonical `RegisteredOutputAction` with exactly the fields currently
selected from `PolicyAction`: `outputId?`, `actionType`, `parameters` as
`Record<string, unknown>`, `confirmationInputId?`, `confirmationTimeoutMs?` and
`metadata?`. It has no policy/project ID, evidence, visual target or Studio DTO
dependency. The wire effect remains `policy.output.dispatch`.

Define a synchronous `OutputTargetPreparer` that receives only the action, bound
domain ID and already registered output definition. It does not receive the IO
registry, runtime service or a capability to dispatch. Its result is the existing
private preparation union:

```ts
type OutputTargetPreparation =
  | { ok: true; action: RegisteredOutputAction; diagnostics?: JsonObject;
      resolution?: AutomationNodeTargetResolution }
  | { ok: false; error: string; failure: RuntimeFailureRecord;
      resolution?: AutomationNodeTargetResolution };
```

The canonical transport receives an optional preparer. Without one it forwards
the action unchanged: it knows nothing about whether any target-shaped data is
present. The legacy Studio facade always supplies its preparer, so existing
missing-target/no-candidate/no-matcher diagnostics retain their current behavior.
An exception from preparation must not be converted into “no target” or success.

### Keep generic confidence policy in Core

- Extract the comparison/result portion of `resolveElementTarget` into a
  canonical target-match helper. Its inputs are a neutral/opaque fingerprint,
  candidate list, explicitly supplied `ElementMatcher` and minimum confidence.
  It returns selection measurements/diagnostics or the existing typed refusal;
  it does not receive, interpret or rewrite a domain target envelope.
- Preserve score ranking, candidate IDs, matched/failed signal names, total and
  normalized score, confidence, failure codes/messages and resolution statuses.
  No raw contribution metadata or candidate page data becomes diagnostics.
- Extract minimum-confidence policy into canonical output dispatch: finite
  configured values clamp to `[0,1]`; defaults remain destructive `.9`, privileged
  `.82`, review `.68`, safe `.45`, otherwise `.5`.
- The legacy adapter reads its existing metadata override key and passes that
  value plus output safety to the shared policy. Thus Core owns the policy;
  transport does not learn a browser target's metadata conventions.
- Preserve branch priority: no candidates yields `unresolved_no_candidates`;
  candidates without a registered matcher yield `unresolved_no_matcher`; neither
  claims a confidence floor. Only an explicit matcher can select a candidate.

### Studio envelope adapter

Create `programs/automation-studio/runtime/output-target/{prepare,index}.ts`.
It imports the existing single passive
`model/action-element-target.ts` normalizer, recognizes the existing output target
requirement metadata, invokes the canonical confidence/match helpers, and rewrites
the normalized legacy `parameters.target`/selection envelope exactly as today.
It retains every selector/XPath/tag/class/attribute/URL/drawing field as opaque
compatibility data; no canonical transport declares or scores those fields.

Old `runtime/io-policy.ts` keeps the three public function signatures, including
their optional matcher arguments, as adapters over the canonical transport with
this explicit preparer. This is a required program adapter, not a second matcher
or a retained generic transport implementation. `PolicyAction` and the passive
legacy target DTOs may remain in Studio without any canonical import edge to them.

The existing downstream WebElementMatcher singleton is already registered by its
importer implementation bundle. Keep that registration unchanged. Studio options
resolve the bound domain's matcher exactly as today and capture it in the legacy
preparer. A new direct canonical consumer must explicitly supply its domain's
target preparer; the generic runtime never infers a browser adapter from data.

### Canonical files and transport closure

Use `runtime/output-dispatch/` with focused action/port contracts, IO transport,
runtime transport, effect parsing, confirmation, result projection, target-match,
confidence-policy and barrel modules. Exact filenames can be kept short, e.g.
`action.ts`, `ports.ts`, `io.ts`, `runtime.ts`, `effect.ts`, `confirmation.ts`,
`result.ts`, `target-match.ts`, `confidence-policy.ts`, `index.ts`.

- IO dependency is the structural subset of `IoRegistry` that gets/checks outputs,
  dispatches and waits for an input. Runtime dependency is the structural subset
  of `RuntimeService` that advertises capabilities and dispatches commands.
- Use canonical node result/resolution contracts, `@fluxiq/contracts/runtime`
  failure parsing/types, result-control actionability projection and reference-time.
  Avoid importing the runtime parent barrel from a child it will reexport.
- Preserve registration checks before target preparation and dispatch. An
  unregistered output never becomes executable from passive target data.
- Arm confirmation before dispatch; retain the same input/domain/timeout/signal
  and status projection. Do not move the wait after dispatch and miss synchronous
  confirmation events.
- Preserve runtime-capability selection and IO fallback, command context,
  reference time, preferred client/session, withheld values, result withholding
  when recordOutput is present, and all existing result/failure/actionability and
  cleared-wait fields. Keep unknown act-effect results conservative.
- Preserve runtime-only effect `timeoutMs` handling and the existing IO path's
  behavior; do not accidentally normalize the two backends into new semantics.
- Retain success-only custom route lifting and ignore reserved/invalid route
  values. Keep all existing wire field names and messages.
- No target-preparer callback is asynchronous or allowed to dispatch/capture.
  Do not silently optimize fallback preparation/order during the ownership move.

## R3: execution option composition

Move the generic body of
`service/runtime-session/graph-options.ts` into
`runtime/execution-integration/{graph-options,index}.ts` once R2 canonical
environment/resource/control names are supplied by the lead. Its input uses the
actual canonical graph-options field types, plus bound IO/runtime/native ports,
authorized domains, environment and optional opaque target preparer.

The old Studio function becomes a small wrapper that constructs its legacy
target preparer from `native.getElementMatcher(bound.domainId)` and delegates.
It does not reimplement option assembly or add a default generic matcher.

Preserve these exact composition decisions:

- Existing inputs/reference time/signal; registered IO/runtime dispatch backend;
  only the bound domain's caller-authorized grant survives.
- Ordered deduplicated runtime capabilities, native execution closure and live
  per-node action-floor/refresh resolution. Do not precompute conditional floors
  once for a whole run or let authored claims replace canonical declarations.
- Original `hostRuntime` object identity; no spread/clone that invokes accessors
  or loses private observation identity. No automatic host classifier here.
- Max steps, recording callback and parking forwarding without new defaults.
- R2's environment executor-options helper remains the only authority. Live
  randomness stays absent unless already set; virtual randomness/timers remain
  reproducible. Do not introduce jitter, resource acquisition or run-control
  startup into this pure option-composition function.

Direct production consumers are Studio `service.ts`,
`service/trial-ports/environment.ts` and the collaborator's indexed input type.
Keeping the old wrapper preserves both normal-run and candidate-trial behavior
through the same assembly function.

## Exact implementation ownership and sequencing

1. R1 owns old SDK/native files and focused tests; canonical importer,
   native-execution and adapter-registry paths; engine refresh resolver facade;
   old adapter facade; identity/source-closure tests. Define SDK contracts first,
   then move binder/registry. Keep native execution and SDK class identity.
2. R3 owns old `io-policy.ts`, new Studio `runtime/output-target/**`, canonical
   `runtime/output-dispatch/**`, old graph-options wrapper and canonical
   `runtime/execution-integration/**`, plus the IO/options tests beside them.
   Leave legacy action/target DTO normalization in its existing single owner.
3. Lead owns package/root barrels, public export maps, architecture, mechanical
   canonical-to-Studio guards and external public-import migration. Proposed
   public entries: importer, native-execution, adapters, output-dispatch and
   execution-integration. Other source owners must release the refresh leaf and
   graph-options/R2 integration points before edits.
4. R1 and R3 can be separate validated units: legacy aliases keep current users
   working between them. R3's native type imports point to the completed R1 seam.
   Do not implement against guessed R2 names or copy environment logic.

## Focused validation plan

- Move generic IO status/failure/confirmation/actionability/cleared-wait/route
  tests to canonical output-dispatch. Add a typed opaque-preparer test proving
  the transport forwards unusual target data untouched, honors explicit refusal
  before dispatch, and does not select or grant execution itself.
- Test the shared confidence helper using neutral identity and an explicit
  matcher. Keep the legacy target normalization and exact no-candidate/no-matcher/
  weak/confident selection assertions under Studio's output-target adapter.
- Retain Studio tests that project an attempt into diagnosis, run detail, LLM
  context or persisted target normalization. Keep their assertions; they test
  program composition rather than canonical transport.
- Retain real FileRuntimeStore privacy tests: executed values/results stay real,
  while saved command attempts withhold them exactly as before. Split away only
  program-specific graph/context fixtures; do not weaken privacy checks.
- Move option-composition tests only after their dependencies are canonical.
  Prove normal-run/trial equivalence, bound-domain grants, live reference time,
  matcher/preparer registration, host identity and absent live randomness.
- Keep old/new SDK/native constructor and resolver identity checks; adapter
  specialization must preserve constructor/object identity and old declaration
  assignability. Avoid writing a new suite merely to restate a three-method map.
- Source closure includes erased imports and neutral records/runtime/capture
  exports; no canonical source may reach Studio. Fix new structure findings at
  their new owner; do not remap/increase baselines.
- Once source is frozen, lead runs touched-package typechecks and focused
  SDK/native/resolver/IO/options/privacy/legacy-composition tests, then rebuilds
  Core before downstream native-bundle/matcher/host integration tests. No full
  suite, live model run, panel or browser operation is needed for these units.

## Checkpoint correction authorized separately

While this plan was being written, the lead authorized fixing the one remaining
Studio detached-child type error. `candidate-graphs.ts` now keeps a WeakMap from
the exact artifact objects it produces to their full Studio type/context and
exposes an `artifactFor` reader. The detached invocation callback resolves through
that reader; similarly shaped clones cannot acquire context. There is no cast,
fabricated envelope, canonical engine change or native/IO extraction.

`pnpm.cmd exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/verification/tests/detached-execution.test.ts`
from Core packages/fluxiq -> 39 tests passed, including actual producer-to-child
execution and explicit refusal of a cloned artifact lacking producer context.
These sources are frozen again. Native/IO implementation has not begun and awaits
the lead's source authorization.

# Durable execution admission API proposal

Outcome: Done, REPORT ONLY. Source remains frozen.

Dispatch context: [execution-admission-api brief](../briefs/execution-admission-api.md). Inputs: [execution-admission review](execution-admission-review.md) and [candidate retest protocol](candidate-retest-protocol.md).

Implement one neutral execution-coverage authority backed by the existing project UnitOfWork and gateway command journal. Keep the agent gate's one-use repeat permit separate. The new authority never turns a verdict, reset, absent landed acts, or ordinary callback return into proof of settlement.

Compatibility is explicit: retain existing first-run APIs and ordinary guards. An unadapted callback is observed as unverified; its absence of a completion adapter does not automatically deny its existing first invocation. It earns no new safe-retest right. Authenticated pending/unknown work does block subsequent committing entry, including a new candidate revision, run ID, loop, or reopened continuation. Read-only diagnosis and pinned no-dispatch judgment remain available.

This proposal contains exact proposed interfaces, not implemented or typechecked declarations. Paths below are relative to `packages/fluxiq/src/`. **Studio runtime** means `programs/automation-studio/runtime/`.

## Accepted interface amendments

The lead accepted these A1 amendments before implementation; the actual contracts under `runtime/execution-admission/contracts/` supersede the original blocks below where noted:

- Every source registration carries the original `scope: ExecutionScope` and explicit `delegatesTo: readonly object[]` owner identities. Grants cannot move between scopes. A child producer may enter another source's parent only within the same original reservation/scope and with that parent's configured delegation.
- `ExecutionAdmissionAssembly.entryBridge.read(originalEntry)` privately validates original membership and returns a frozen snapshot of row/fence, original source owner/origin, lifecycle and reservation activity. A2 re-reads that original entry inside the actual claim transaction and validates the SQL row/fence/provenance. The returned snapshot is information, never a replacement entry capability.
- `coverage_complete` no longer includes `childFrontierDigest`. Persistence derives and CAS-validates the actual child frontier during `finish`; A1 synchronously locks a finishing parent against new children.
- One factory owns one configured continuation/scope. Registration closes globally at its first reservation, including failed/aborted attempts. A later configured scope uses a new factory against the same durable owner; registry closure is never silently reset.

Contract files were introduced by the A1 unit; actual mechanism/SQL/producer acceptance is reported separately in [execution-admission-authority.md](execution-admission-authority.md).

## 1. Ownership and compatibility boundary

Put neutral contracts, private membership and the admission reducer in `runtime/execution-admission/`. The project SQL implementation stays beside `programs/automation-studio/storage/project/command-ledger/`, sharing its database lease, UnitOfWork and mutation proof validation. Engine code imports the neutral ports. Runtime imports no engine, Studio, browser, provider, or SQL implementation.

Do not replace `commandOutcomeMode`, loosen `ClientGatewayCommandContext`, or install a second gateway outcome observer. Existing required runs keep their exact-command/same-run restrictions. Existing graph/native/IO entry points retain optional observation arguments; a caller that supplies none retains its existing ordinary behavior and obtains no execution-safety certificate.

| Entry | Required behavior |
| --- | --- |
| Existing graph/native/IO/custom API, no observed build binding | Existing behavior and strict guards unchanged. It cannot issue or satisfy new safe-retest authority. Do not label this route clear. |
| Existing ordinary admission inside the observed build | Preserve the original admission decision; journal before invoking. Missing completion coverage is unverified, not a new universal first-call denial. A known pending/terminal-unknown/required latch still fences committing work. |
| First live trial in a trial series | Existing ordinary gate/tool/reset/permission checks still decide whether it may start. Lack of legacy coverage alone does not invent a new first-run refusal. Observe before the hook/port. Known pending uncertainty still refuses. |
| Another live trial in that series, including a fresh revision | Require current complete/clear coverage before hook/port. The original repeat guard must also admit; if it needs a candidate permit, consume that separately. Unverified custom ports cannot earn this new right. |
| Cached rejudgment/offline or genuinely read-only port | Needs no committing reservation. Its private pinned execution mode must prohibit promotion to live. |

The trial-series distinction is durable history, not a second trial counter: the query asks whether a prior root of this stable series actually entered live work. Keep the gate's existing maximum/repeated-failure/refund counts untouched. A prepare refusal with no live invocation does not become a completed trial or mint a repeat permit.

The production trial series is stable across candidate revisions and run/loop IDs. A new revision is not a way to reset it. Existing unadapted custom trial consumers still get their ordinary first invocation; repeated live trials require migration to actual coverage. Ordinary non-trial APIs are not silently converted into a universal exactly-once service.

## 2. Exact neutral interfaces

Use one declaration/owner per file when implementing; the blocks group related declarations for review. Non-exported brands describe types only. Runtime authority is original object membership in the configured instance's private WeakMaps.

```ts
declare const scopeBrand: unique symbol;
declare const grantBrand: unique symbol;
declare const reservationBrand: unique symbol;
declare const entryBrand: unique symbol;

export interface ExecutionScope {
  readonly [scopeBrand]: never;
}
export interface ExecutionEntryGrant {
  readonly [grantBrand]: never;
}
export interface ExecutionReservation {
  readonly [reservationBrand]: never;
}
export interface ExecutionEntry {
  readonly [entryBrand]: never;
}

export interface ExecutionScopeBinding {
  readonly projectId: string;
  readonly ownerKey: string;
  readonly continuationKey: string;
  readonly resourceKeys: readonly string[];
  readonly coverageEpoch: string;
}

export interface ExecutionOriginRecord {
  readonly sourceKey: string;
  readonly operationKey: string;
  readonly runId?: string;
  readonly invocationId?: string;
  readonly attemptId?: string;
  readonly bindingDigest?: string;
}

export type ExecutionSafetyState =
  | "clear"
  | "pending"
  | "required_latched"
  | "unverified";

export interface ExecutionInspection {
  readonly state: ExecutionSafetyState;
  readonly generation: string;
  readonly blockers: readonly {
    readonly entryId: string;
    readonly code: string;
  }[];
}

export interface ReservedExecution {
  readonly reservation: ExecutionReservation;
  readonly root: ExecutionEntry;
}

export interface ExecutionObservationContext {
  readonly reservation: ExecutionReservation;
  readonly parent: ExecutionEntry;
}

export interface ExecutionAdmissionConsumer {
  inspect(scope: ExecutionScope): Promise<ExecutionInspection>;
  reserve(
    scope: ExecutionScope,
    grant: ExecutionEntryGrant,
    signal?: AbortSignal
  ): Promise<ReservedExecution>;
  release(reservation: ExecutionReservation): Promise<void>;
}

export interface ExecutionAdmissionProducer {
  enter(
    context: ExecutionObservationContext,
    origin: object,
    signal?: AbortSignal
  ): Promise<ExecutionEntry>;
  observe(entry: ExecutionEntry, evidence: object): Promise<void>;
  finish(entry: ExecutionEntry, evidence: object): Promise<void>;
  interrupted(
    entry: ExecutionEntry,
    reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed"
  ): Promise<void>;
}

export interface ExecutionEntryIssuer {
  fromOrdinaryAdmission(proof: object): ExecutionEntryGrant;
}
```

`reserve` uses the source policy recorded behind the grant. There is no model-selectable `first`, `readOnly`, `retryAllowed`, or `allowUnknown` argument. The grant only confirms the original ordinary admission; it does not prove execution safety. A gate permit, if needed, lifts only the existing loop repeat refusal before that original admission can issue this grant.

`reserve` atomically checks durable history/fences and inserts its open root before returning. A `trial_series` source requires clear coverage if any prior root in its series entered live work; its first entry retains the ordinary initial-call compatibility above. An `ordinary` source does not acquire a safe-retest exemption, even when an informational query says clear. Both reject known pending/required uncertainty before a committing callback.

`enter` persists the actual child entry before the callback. It requires the original reservation, parent, source and origin; rejects foreign/finished parents; and rechecks the durable fence and relevant blockers at each actual live invocation. `observe` records verified evidence but never implicitly closes an entry. `finish` accepts only a source-owned terminal witness, verifies all children/command links/required consumption, and atomically closes coverage. `release` releases a live reservation; it never closes open coverage or clears a block.

Adapter absence is not a persistence error. If an enabled protected invocation cannot establish its durable pre-invocation entry, refuse before calling it; do not pretend its journal succeeded. After the callback, observation failure leaves the already durable parent/entry open and prevents new safe credit. Preserve the ordinary callback's existing primary result/error contract where applicable; do not fabricate unacted or replace the original error before its existing classifier sees it. Required mode keeps its current outcome-unknown behavior. These failure rules do not impose mandatory persistence on callers using unchanged APIs without the optional observed binding.

### Assembly and private proof readers

Only trusted composition retains this assembly interface. Models, SDK implementation contexts and tool/result JSON receive none of it.

```ts
export type VerifiedExecutionEvidence =
  | {
      readonly kind: "interrupted";
      readonly reason:
        | "aborted"
        | "timed_out"
        | "callback_threw"
        | "observer_failed";
    }
  | {
      readonly kind: "command_delivery";
      readonly commandId: string;
      readonly claimDigest: string;
      readonly receiptDigest: string;
    }
  | {
      readonly kind: "required_consumed";
      readonly commandId: string;
      readonly handlingDigest: string;
    }
  | {
      readonly kind: "returned_unverified";
      readonly completionDigest: string;
    }
  | {
      readonly kind: "terminal_unknown" | "required_latched";
      readonly code: string;
    }
  | {
      readonly kind: "coverage_complete";
      readonly disposition: "unacted" | "settled";
      readonly completionDigest: string;
      readonly assessmentDigest: string;
    };

export interface ExecutionSourceRegistration {
  readonly owner: object;
  readonly scope: ExecutionScope;
  readonly sourceKey: string;
  readonly delegatesTo: readonly object[];
  readonly rootPolicy:
    | { readonly kind: "ordinary" }
    | { readonly kind: "trial_series"; readonly seriesKey: string };
  readOrigin(origin: object): ExecutionOriginRecord | null;
  readOrdinaryAdmission(
    proof: object
  ): { readonly origin: object; readonly callKey: string } | null;
  consumeEvidence(
    origin: object,
    evidence: object
  ): VerifiedExecutionEvidence | null;
}

export interface ExecutionSourcePorts {
  readonly issuer: ExecutionEntryIssuer;
  readonly producer: ExecutionAdmissionProducer;
}

export interface ExecutionScopeOwner {
  readBinding(proof: object): {
    readonly binding: ExecutionScopeBinding;
    readonly baseline: "complete" | "unverified";
    readonly baselineProofDigest: string;
  } | null;
}

export interface ExecutionAdmissionAssembly {
  readonly consumer: ExecutionAdmissionConsumer;
  readonly entryBridge: ExecutionEntryBridge;
  openScope(proof: object): Promise<ExecutionScope>;
  registerSource(source: ExecutionSourceRegistration): ExecutionSourcePorts;
}

export interface ExecutionAdmissionFactoryInput {
  readonly persistence: ExecutionAdmissionPersistence;
  readonly scopes: ExecutionScopeOwner;
}

export declare function createExecutionAdmissionAuthority(
  input: ExecutionAdmissionFactoryInput
): ExecutionAdmissionAssembly;
```

The configured source's readers inspect its own private original-origin/admission/proof registries. A reader must not accept structurally matching result objects. `consumeEvidence` validates synchronously before any await, because the existing gateway completion proof is valid only during its real observer call. It checks exact origin/entry ownership and consumes one-use evidence. The authority clones/freezes the small verified record before persistence; it never stores the capability itself. A persistence failure leaves open coverage, so a spent witness cannot accidentally clear history.

Registration is closed before live entry. A source cannot replace its reader/policy while reservations exist. `sourceKey` and a series key are stable trusted implementation keys, not candidate/run IDs or user-provided metadata. Registration is bound to the actual `owner` and the configured authority instance. A different factory instance or fake in-memory store cannot mint a handle accepted by the production consumer.

The private per-entry state retains the original origin, original callback/implementation where relevant, resource/scope, parent, producer, reservation generation and required-mode association. A copied/prototype-spoofed/serialized handle fails membership. This is a capability boundary among configured trusted components, not a sandbox against arbitrary trusted JavaScript with direct database/process access.

## 3. Exact persistence port and schema

The following DTOs are adapter-internal trusted port data. Do not expose the persistence object through a tool, native context or public model schema. The authority derives all IDs/records from verified private handles; callers do not submit these records directly.

```ts
export interface StoredExecutionScope {
  readonly scopeId: string;
  readonly binding: ExecutionScopeBinding;
}

export interface ExecutionEntryRow {
  readonly entryId: string;
  readonly scopeId: string;
  readonly rootId: string;
  readonly parentId?: string;
  readonly resourceKeys: readonly string[];
  readonly sourceKey: string;
  readonly seriesKey?: string;
  readonly origin: ExecutionOriginRecord;
  readonly ownerIncarnation: string;
}

export interface ExecutionAdmissionPersistence {
  open(input: {
    readonly binding: ExecutionScopeBinding;
    readonly baseline: "complete" | "unverified";
    readonly baselineProofDigest: string;
  }): Promise<StoredExecutionScope>;
  inspect(scopeId: string): Promise<ExecutionInspection>;
  reserve(input: {
    readonly root: ExecutionEntryRow;
    readonly ordinaryCallKey: string;
    readonly policy: ExecutionSourceRegistration["rootPolicy"];
  }): Promise<{ readonly fenceGeneration: string }>;
  enter(input: {
    readonly entry: ExecutionEntryRow;
    readonly fenceGeneration: string;
  }): Promise<void>;
  append(input: {
    readonly entryId: string;
    readonly evidence: Exclude<
      VerifiedExecutionEvidence,
      { readonly kind: "coverage_complete" }
    >;
  }): Promise<void>;
  finish(input: {
    readonly entryId: string;
    readonly evidence: Extract<
      VerifiedExecutionEvidence,
      { readonly kind: "coverage_complete" }
    >;
  }): Promise<void>;
  release(input: {
    readonly rootId: string;
    readonly ownerIncarnation: string;
  }): Promise<void>;
}
```

All mutations use existing `UnitOfWork.runIdempotent` proofs; reads validate their joined mutation records as the command store already does. `reserve`, `enter`, `append` and `finish` increment relevant scope/resource generations atomically. `fenceGeneration` is the immutable reservation fencing token, not an optimistic token invalidated by its own child writes. Current inventory generations are re-read inside each transaction; the owner cannot use an old informational query as admission.

Add one migration after the current migration head; do not hard-code an assumed next number. Proposed tables/constraints:

```sql
create table execution_admission_scopes (
  scope_id text primary key,
  project_id text not null,
  owner_key text not null,
  continuation_key text not null,
  binding_json text not null,
  baseline_kind text not null check(baseline_kind in ('complete','unverified')),
  coverage_epoch text not null,
  generation integer not null check(generation>=0),
  proof_digest text not null,
  unique(project_id,owner_key,continuation_key)
);
create table execution_admission_fences (
  resource_key text primary key,
  generation integer not null check(generation>=0),
  active_root_id text,
  owner_incarnation text,
  proof_digest text not null
);
create table execution_admission_entries (
  entry_id text primary key,
  scope_id text not null references execution_admission_scopes(scope_id),
  root_id text not null,
  parent_id text references execution_admission_entries(entry_id),
  source_key text not null,
  series_key text,
  origin_json text not null,
  resources_json text not null,
  owner_incarnation text not null,
  entered_live integer not null check(entered_live in (0,1)),
  returned_at_ms integer,
  closure_kind text check(closure_kind in ('unacted','settled')),
  closure_proof_digest text,
  proof_digest text not null,
  check((closure_kind is null)=(closure_proof_digest is null))
);
create table execution_admission_facts (
  fact_id text primary key,
  entry_id text not null references execution_admission_entries(entry_id),
  fact_kind text not null,
  fact_json text not null,
  proof_digest text not null
);
create table execution_admission_command_links (
  command_id text primary key references gateway_command_claims(command_id),
  entry_id text not null references execution_admission_entries(entry_id),
  required_mode integer not null check(required_mode in (0,1)),
  proof_digest text not null
);
create index execution_admission_entries_scope on execution_admission_entries(scope_id);
create index execution_admission_entries_parent on execution_admission_entries(parent_id);
create index execution_admission_entries_series on execution_admission_entries(scope_id,source_key,series_key);
create index execution_admission_facts_entry on execution_admission_facts(entry_id);
```

The project adapter validates roots, same-scope parentage, resource membership, all JSON schemas/bounds, allowed fact kinds, required source association, and proof joins. `root_id`/fence references must be validated against the root entries in the same transaction, including self-root insertion; never accept dangling active roots. Resource IDs contain no credentials and come from the actual environment/host resource owner. Store only provenance/digests/reference IDs, not recorded pages, action parameters, tokens, or native result contents.

`facts` records execution coverage/handling facts, not gateway statuses. `command_links` references the existing claim and receipt rows. There is no copied receipt JSON, second pending/committed state machine, or second required-consumption authority.

### Transaction rules

1. `open` validates the original scope-owner proof. Reopening a scope loads its existing baseline/history; it cannot overwrite unverified/pending state with a new epoch. For Studio creation/repair, use the actual persisted project + flow identity as the stable continuation owner, retaining history across builds of that Flow. A new trace/build/candidate UUID never creates a fresh safety scope. Different logical Flows also consult the same actual resource fences.
2. Obtain resource keys from the authoritative resource owner, retaining the original host/lease object. A changed lease/session label does not itself prove a different lasting-effect resource. Missing old-to-current mapping is unverified. The project owner can retain a conservative project-local unknown-resource binding for legacy first execution; it cannot turn that binding into a complete baseline. If a Flow has not yet been persisted, persist its durable continuation anchor before any live callback; do not guess it from a similarly shaped payload.
3. `reserve` checks the complete relevant scope/resource inventory inside the transaction, refuses known pending/required blocks, validates the source's stable trial-series rule, then inserts an open root and acquires fences in canonical key order. A competing active root is pending. Disjoint resources stay independent; read work needs no fence. Reuse the existing resource scheduler for live waiting/ownership; these durable fences prevent a new process from forgetting old work.
4. `enter` checks the live fencing owner, ancestor ownership, latest blockers and root disposition, then inserts before calling native/adapter/hook code. Parent open coverage is expected; unresolved unrelated leaf work is not a license to send again. Unsupported overlap on the same committing resource is serialized/refused through the existing scheduler rather than bypassing the fence.
5. Set `entered_live` on the invocation and its root/ancestors in the same transaction before the actual effect-capable invocation; otherwise a child could hide the series' first live entry. A rejected pre-invocation path may close unacted only from its real owner witness. `returned_unverified` records that the actual callback returned without a supported completion contract; it remains unverified and never earns safe-retest credit. An interrupted entered callback remains pending until the existing actual owner settles it; if it ends terminally uncertain, append that immutable fact. `observe` cannot accept a coverage-complete fact: that requires `finish` and its frontier validation.
6. `finish` verifies source-owned completion, exact child frontier and authentic command evidence. A root closes only when every effect-capable descendant is settled/unacted and every required link has actual consumed handling. Commit closure after semantic assessment/required consumption, never just after remote receipt arrival. A new child after the terminal witness invalidates the frontier and fails the closure CAS.
7. Abort, close, fence expiry, process death and `release` never close pending entries. Reopening cannot continue a prior in-flight reservation; unresolved work is pending, even with all visible gateway receipts committed. Existing required unknown history cannot be released by a coverage seal, page check or reset.

An informational inspection is `required_latched` for actual required terminal/history blocks; `pending` for unresolved possibly acted work/terminal unknown; `unverified` for unsupported or incomplete coverage; otherwise `clear`. Return redacted blocker references. Failed/overflowed/corrupt inventory is unverified or an explicit refusal, never clear. The first-entry compatibility above does not turn unverified into clear.

No automatic retrofit certifies pre-migration execution. Unlinked old commands, missing consumption seals, and resumed builds without complete coverage remain unverified. Initial legacy execution remains available under its original controls, but new safe-retest credit requires actual adapter migration or an authentic fresh/sealed resource baseline. A configured isolated test/offline resource may prove freshness; a caller's `offline:true`, empty telemetry or reset reply may not.

## 4. Gateway and required-command reuse

Add this project-owner method, not a runtime-to-gateway dependency:

```ts
claimForExecution(
  claim: ClientGatewayCommandClaim,
  entry: ExecutionEntry,
  required?: AutomationStudioCommandRunAdmission
): Promise<{
  sendAllowed: boolean;
  record: ClientGatewayCommandRecord;
}>;
```

It extends the existing `claimStored` transaction: validate the original execution entry and durable fence, run existing required admission validation when present, insert/reconcile the one existing claim, and insert/validate its exact `command_links` association in that same UnitOfWork mutation. A replay never obtains a new link/entry or another send. Failure before linkage leaves the preexisting open invocation entry; it cannot disappear from inventory. Do not invoke both `claimForRun` and a second independent claim.

`ClientGatewayCommandController.dispatch` keeps its awaited claim-before-send ordering. `ClientGatewayDurableDispatch.run` retains authenticated current client/session checks. Its existing sole observer reads `readCompletionProof` during the callback and records `command_delivery` reference facts. In required mode, delegate through `AutomationStudioCommandRunController.observe` and `consume`; record required consumption only after the real `consumeForRun` and original engine handling witness succeed. Do not replace its observer or expose its issuer to generic callers.

For an ordinary observed gateway effect, a focused project execution-admission controller owns the actual context, sole observer and resolver lease. It does not set required mode. Root wiring in `programs/_shared/runtime.ts` explicitly accepts this original context owner alongside the existing owners. `ClientGatewayCommandContext.issue` alone still grants no configured ledger access.

Receipt commit followed by observer/consume failure leaves execution coverage open. `interrupted`/the original required owner persist the latch when possible; failure to write still leaves open coverage, so reopen cannot falsely clear it. Normal semantic no-effect retry is accepted only from the original canonical engine assessment and its actual effect-check witness before terminal uncertainty, preserving existing non-required automatic retries. It does not rewrite gateway unknown history. Required historical unknown is always blocking; terminal uncertainty has no new automatic reconciliation API in this foundation.

## 5. Native completion contract

Keep `AutomationStudioNativeNodeImplementation` and its JSON result shape unchanged. Add optional internal observation context to the native runtime invocation, passed explicitly by engine integration; give the implementation none of the admission/issuer/producer handles.

```ts
// Additive last argument to AutomationStudioNativeNodeRuntime.execute:
// execute(node, inputs, signal?, hostContext?, observation?: ExecutionObservationContext)

export interface NativeCompletionFact {
  readonly directEffects: "none" | "settled";
  readonly completionDigest: string;
  readonly evidenceDigest: string;
}

export interface NativeCompletionRegistration {
  readonly owner: object;
  readonly implementation: AutomationStudioNativeNodeImplementation;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly definitionId: string;
  readonly definitionVersion: string;
  consumeCompletion(input: {
    readonly invocation: object;
    readonly originalResult: AutomationNodeExecutionResult;
  }): NativeCompletionFact | null;
}
```

This registration lives in `runtime/native-execution/admission/`, not manifest/SDK JSON. Trusted composition registers it against the original bound function, exact package/definition versions and effective grant/binding digest. The native owner creates an invocation handle immediately before the actual implementation call and retains original result/promise identity in private state. The registration's consumer checks its own original invocation/evidence registry. Merely returning the `NativeCompletionFact` shape from native code is insufficient.

Supported cases:

- **Managed-effects/compute-only binding:** trusted registration certifies that this actual implementation performs no direct external work and all effectful work is returned through observed dispatch. Native return only closes its computation portion; emitted effects and the containing engine attempt remain open until real children and semantic assessment close. This is a trusted code contract for an exact implementation, never inferred from an observe floor, empty effects, manifest claim, or code-node label.
- **Direct-effect binding:** its registered actual effect owner supplies authenticated completion for every direct act and quiescence of the invocation. A managed transport's authentic reply/effect-check owner can supply this evidence. Missing/direct ambient work, fire-and-forget work, or an adapter unable to account for all work cannot certify completion. The native runtime cannot manufacture an external receipt from a returned success.
- **Legacy binding without a completion adapter:** retain its ordinary first invocation and result behavior; persist returned-unverified coverage. No safe-retest credit. Existing denied/version/missing-binding paths remain honestly unacted because invocation never began.

Persist native entry before evaluating `binding.implementation(...)` inside `Promise.resolve`. On synchronous throw, rejection or timeout race, do not close from the sanitized failure result. Abort is a request, not quiescence. A late underlying completion after terminal uncertainty does not silently reopen the run or clear a required latch. Canonical engine effect checking can settle supported non-required direct work only through its actual private witness, retaining current retry decisions; unsupported native ambient work remains pending/unverified.

Registration is a trust boundary, not a sandbox. It cannot prove malicious trusted JavaScript obeys a no-direct-effects contract. Do not present a generic JSON success or an implementation's own unverified `effect: "unacted"` field as that proof. External/native providers requiring safe retest must supply the explicit trusted adapter; first-run API compatibility does not imply certified repeat safety.

## 6. Precise production integration points

| Existing function/owner | Additive integration |
| --- | --- |
| Studio runtime `service.ts`, `creation.run` body | Open/reuse the durable project/Flow continuation before exploration; bind original actual resource identity; create shared source ports. Pass the same scope/context through exploration routing, trial environment and nested/project paths. Put mechanism in new `service/execution-admission/` leaves. |
| Studio runtime `llm/prior-nodes/tool-admission.ts`, `llm/evidence-loop.ts` | Original ordinary admission issues the private call proof. The one-use candidate permit may lift only that exact stale repeat refusal. Shared entry helper also serves stall `recover`; keep `repeat-guard/retry-later.ts` strict. |
| Studio runtime `flow-bootstrap/candidate/trial-gate.ts` | After existing validation/limits/offline selection, reserve the actual trial series before `prepareStart`; require clear for another live trial even on a new revision. Keep reset/affordability/count/standing-failure rules. No authority from parsed feedback. |
| Studio runtime `service/candidate-trial/port.ts`, `automationStudioCandidateTrialPort` | Atomically check out/pin exact retained evidence and private live/offline/rejudge mode. A lost cache refuses; never fall back live under a read-only checkout. Forward exact private companion handles through wrappers. |
| Studio runtime `service/candidate-trial/run.ts`, `automationStudioCandidateTrialStart` | Begin before the effect-capable start/reset hook, which can run before a trial session. A thrown hook remains pending/unknown, not an unacted failed start. Rejudge never enters this producer. |
| Same file, `runAutomationStudioCandidateTrial` / `rejudgeAutomationStudioCandidateTrial` | Associate actual newly created run with existing scope/root; execute under shared observation. Only actual engine/child seals complete live coverage. Rejudge is pinned retained evidence, no hook/Flow. Custom execute callback gets a legacy-unverified producer until adapted, not an automatic clear result. |
| Studio runtime `service/subflow-trial/{start,run,port}.ts`, `service/trial-ports/{environment,whole-ports}.ts`, `service/project-build/whole-trials.ts` | Preserve original context/series/companion identity through whole/partial/project wrappers; do not create a fresh authority or derive one from environment-kind strings. |
| `engine/automation/integration/graph-options.ts` and engine execution options | Optional `executionObservation` and configured producer ports. Native executor closure explicitly forwards the observation argument; no host clone/proxy, no runtime import of engine. |
| `AutomationStudioNodeAttemptExecution.execute`, `dispatchAutomationStudioEffects` in `node-execution/attempt.ts` | Begin actual native/custom/effect entries, keep original origin/private handling identity, and seal only after validation, dispatch, semantic handling and required consumption. Use trusted registered action-effect floors; an authored declaration cannot lower them. |
| `engine/automation/graph-run.ts`, composite `run.ts`/`execution.ts`, child option propagation | Carry identical reservation/parent into actual nested/compiled/delegated execution. Root finalization requires closed actual child frontier. Child uncertainty blocks the container and future roots. |
| `automationStudioDispatchWithNodeRetries` in `outside-graph/retries.ts` | Begin before caller dispatch; record throw before reader can lose it. Actual assessment/private effect-check witness closes supported no-effect retries; no result-reader-only observer. Preserve source reacquisition/retry timing. |
| Engine `defensive/assess.ts`, `step-loop/uncertain-stop.ts` and actual attempt lifecycle | Mint/consume private semantic witnesses from real canonical assessment/effect-check/handling objects. Terminal unknown records a durable block. Required page checks remain informational and cannot release the latch. |
| `AutomationStudioNativeNodeRuntime.execute` | Before-implementation entry and exact completion registration described above. Preserve grants, isolated input/host DTOs, per-domain matcher identity and calibrated floors. |
| `dispatchRegisteredOutput`, `createRuntimeOutputEffectDispatcher` | Carry optional observation to backend context. Preserve registration, parameters-only target preparation, cached original output/confirmation identity and confirmation-before-dispatch. Outer frames link children, not duplicate receipts. |
| `IoRegistry.dispatchOutput`, `FluxIQRuntimeService.dispatch`/`dispatchToTarget` | Observe immediately before ordinary adapter/transport callback. Required handler path stays strict. Native runtime-to-IO fallback has one actual backend invocation/claim plus outer coverage, not two sends. Queued telemetry remains telemetry. |
| Gateway/project command owners listed in section 4 | Atomic link at real claim; authentic delivery during the sole observer; real required consumption; unresolved completion never auto-seals. Lead owns `_shared/runtime.ts` resolver composition. |

Pure read tools continue through their existing read paths without a committing reservation. Do not classify arbitrary callbacks as read-only from a tool name or user-authored node floor. A custom host can provide an explicitly registered trusted read-only/managed-effects adapter while retaining original host and method receivers. A private companion WeakMap carries observation; no proxy, clone, replacement host, or additional model-visible field is needed.

## 7. Provider-free and migration contract

Provider-free is independent of execution safety. Tests using the actual engine and isolated adapters need no model provider. They can use the same project SQL adapter in a temporary database. Unit fakes may use a deterministic in-memory implementation of this persistence port only with an isolated resource/scope owner accepted by that test consumer; it cannot reopen or replace a production scope.

A test-controlled no-dispatch producer is real trusted test composition: it owns the callback, original invocation and zero-live-port completion witness. The ordinary fake trial result is not the witness. Preserve original candidate success/port-count assertions and add this observed factory; do not rewrite expected outcomes to accommodate denial.

Custom-host migration is additive: keep old signatures, register original source/completion readers, supply real resource/continuation ownership and persistence, and forward the optional context to actual invocation seams. Unsupported first calls keep existing behavior and are unverified; they cannot earn a candidate repeat credit. Known uncertainty discovered by a real producer remains blocking across migration/restart. No compatibility adapter may translate unknown/unverified into unacted.

The bounded behavior change is a new refusal of unsafe **subsequent protected live trials** and known-uncertain committing work. It is not default denial of every legacy first-run API. This foundation cannot truthfully promise global exactly-once behavior inside opaque arbitrary native/custom code; positive safe-retest support requires that code's authentic adapter. Expose that limitation in diagnostics, not a false safety certificate.

## 8. Deterministic acceptance

Run these only after implementation/source freeze; no tests were run for this proposal.

| Case | Required oracle |
| --- | --- |
| Unadapted ordinary native/IO/custom API | Original first invocation and returned result remain unchanged. Coverage is unverified, no new safe-retest credit, no forged unacted result. |
| Legacy trial first/next | First eligible live trial calls the legacy port once. Another trial, including new revision/loop with same durable continuation, cannot obtain a clear safe-retest reservation. Existing original gate limits remain unchanged. |
| Native act then throw / ignore-abort timeout | One isolated durable external counter increment; repeated ordinary candidate request, stall path, new revision/run ID and reopened continuation cause zero second committing invocation and zero start resets. Late completion does not silently clear terminal uncertainty. |
| Managed native no-direct-effects | Exact original implementation registration completes computation; returned observed output executes once and its real child/engine assessment seals coverage. Modified function/version/grants or fabricated result proof cannot reuse the certificate. |
| Gateway claim, lost ACK, restart | Existing journal records one claim/send; exact replay and associated fresh run do not send again. No second ledger entry manufactures a fresh send. |
| Receipt committed, observer/consume fails | Receipt remains existing command truth; coverage remains open/blocked. Reopen refuses a second committing send even when no gateway row currently says pending. |
| Required history + page not-landed/reset | Required latch remains blocked and no second send. Actual ordinary pre-claim withdrawal/no-effect retry still works through its existing private owner. |
| Native/custom hook throws before trial session / outside-graph throws before read | Durable pre-invocation entry exists; reader/result conversion cannot erase it. New trial revision/run/loop performs zero second act. |
| Nested/partial/compiled child unknown | Parent cannot seal or start another child/root on the same affected scope; new run ID is not clearance. |
| Race between inspection, hook and send | Atomic reserve/enter/claim linkage catches the new blocker; informational generation never grants a second send. Same-resource concurrent roots cannot bypass the fence; disjoint resources still work. |
| Crash at entry, claim, receipt, handling or closure | Every reopen sees valid proof joins and either authentic complete coverage or pending/unverified refusal; zero second committing send after unresolved work. |
| Cache evicted after no-dispatch selection | Exact pinned rejudge or explicit refusal, never live fallback. Pending live work still permits pinned rejudgment/read-only diagnosis; hook/Flow counts stay zero. Offline yes stays non-promoting. |
| Spoofed handles/source/mode | Copied/prototype/JSON/cross-owner handles, `retry_allowed`, forged effect/unacted fields and offline flags grant nothing. |
| Corrupt/missing/unlinked/overflow history | No clear certificate; diagnosis remains possible. Epoch/session/trace/build/candidate changes cannot erase old blocks. |
| Original three positive transient candidate cases | Real observed/no-dispatch producer gives port count two, truthful previous feedback, final yes, no repeat refusal. Maximum three counted trials and repeated-same-failure closure remain unchanged; refunds/reset refusals mint no credit. |
| Receiver/target/privacy regressions | Original private-field/WeakMap host receivers, native grants/domain matcher, output identity, target floor and confirmation ordering remain unchanged; durable rows/logs contain only bounded references/digests. |

## 9. Implementation dispatch

First fix the neutral interfaces and project claim-link transaction contract. Then split disjoint work: A owns persistence/private authority/command observer bridge; B owns native/IO/engine actual producers; C owns candidate permit/cache/loop/trial companion wiring. Lead owns shared Studio `service.ts`, `_shared/runtime.ts`, package exports and integration. Serialize overlapping engine option/command-owner edits explicitly.

| Unit | Exact new owners and existing edit boundary |
| --- | --- |
| A1 neutral mechanism | New `runtime/execution-admission/{authority,state,index}.ts`; `contracts/` leaves named for the section 2 interfaces, with `contracts/source/` and `contracts/persistence/` grouping their respective records/ports. No Studio/gateway implementation imports. Public parent barrels remain lead-owned. |
| A2 project durability/command bridge | New `programs/automation-studio/storage/project/execution-admission/{store,inventory,mutation,migration,index}.ts`; new Studio runtime `service/execution-admission/{binding,controller,gateway,index}.ts`. Existing command-ledger store/migration registry and required command-run/execution controllers change only for the atomic link/actual observer/consumption bridge. |
| B1 actual runtime callbacks | New `runtime/native-execution/admission/{registration,invocation,index}.ts`; edit its native runtime, IO actual callback, RuntimeService actual callback, and output-dispatch context forwarding named in section 6. No SDK result/wire change. |
| B2 engine producers | New `engine/automation/execution-admission/{origin,evidence,index}.ts`; exact attempt/outside-graph/graph/composite/uncertain-stop/option-propagation owners in section 6. Source identity/proof readers live here, rather than teaching neutral runtime about engine objects. |
| C candidate protocol | New `runtime/agents/gates/reentry/{authority,permit,index}.ts` and Studio runtime `flow-bootstrap/candidate/{reentry,trial-authority}.ts`; existing candidate/loop/trial/wrapper files in section 6 only. No ordinary retry parser exemption. |

Use adjacent `tests/` for each unit. Split individual public declarations into their owning leaves; section 2's combined blocks do not authorize a multi-purpose contracts dump. Exact existing shared-file handshakes occur before edits; no two units edit a controller/options file concurrently.

Ship production positive retest wiring only with the A/B coverage closure and adversarial no-second-send tests. Optional first-run observation can be introduced without enabling an exemption, but it must honestly remain unverified until its source adapters are complete. No permit-only shortcut, broad result-parser exception, duplicated command truth, or automatic legacy grant.

Validation performed: read the dispatched brief and both reports; inspected exact native invocation, command claim/observer/consumption, schema, canonical fault assessment and integration signatures with `Get-Content`, `rg`, and `rg --files`. No source/test/configuration/shared-document edits, tests, typechecks, builds, providers, browser, panel, git, or other checkout actions were performed.

Not verified: these interfaces/schema are proposed and have not been compiled or executed; native/custom deployment completion contracts require their actual trusted owner adapters; pre-migration baseline mapping must remain unverified where authentic evidence cannot be recovered.

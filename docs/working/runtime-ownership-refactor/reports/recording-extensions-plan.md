# Recording indexing, gateway capture and mapping continuation

Outcome: Done — report-only dispatch plan against frozen t843 foundations.
Changed: This report only. No source, tests, builds, configuration or git actions.

## Lead-accepted implementation amendments

The SDK normalized candidate/evidence/bound-mapper authorities and trusted parameter-normalizer type now exist. The implementation-bundle member is `recordingCandidateParameterNormalizer`; the bound mapper exposes `normalizeParameters`. Original function and original bundle receiver are pinned, and same-function re-registration retains that receiver. Canonical absence shallow-copies parameters; no browser fallback is supplied.

After reading the actual old gateway implementation, the lead accepted a narrow scope correction: when a context provider is configured, its approved project is authoritative, replacing the old request-over-provider override. The provider sees the request and may approve its requested project explicitly. Without a provider, existing explicit-request behavior and missing-project refusal remain unchanged; direct host calls retain request-over-session precedence. Matching subsequent entries and Stop use the stored approved address, while old recording IDs retain their own remembered address. This is an engineering correction, not a newly attributed user instruction.

## First dispatchable unit

Dispatch indexing first. Its actual sort/link/lookup/build closure can move
without gateway, SDK binder, mapper or Studio service edits. Freeze its DTOs and
the two policies below before parallel gateway and mapper work. Use
`recording/indexing/`, avoiding a directory named `index` beside the existing
`runtime/recording/index.ts` barrel.

Paths below are relative to `packages/fluxiq/src` unless prefixed `contracts:`.

| Existing source | New authority / retained adapter |
| --- | --- |
| `programs/automation-studio/storage/state-index.ts` declarations and schema marker | `contracts:recording/indexing/`: one index/item/summary/timeline/coordinate-space/state-link/validation-issue authority. Keep all names, optional fields, schema `0.2`, opaque `projectId` and ref strings. Old storage types reexport exactly. |
| Same source: empty index, shallow shape check, deterministic sorting, ref collection and visual-target summary | `runtime/recording/indexing/{empty,shape,sort,object-refs,visual-target}.ts`. The generic validator lives here too, requiring the explicit reference policy below. |
| Same source: content-ref parsing and same-project rejection | Keep in a Studio storage policy module. It imports the existing `parseAutomationStudioObjectContentRef`; do not move or copy URL-scheme rules into runtime. Old `validateRecordingIndex`/assert wrappers bind this policy and preserve diagnostics. |
| `programs/automation-studio/runtime/state-linker.ts` | `runtime/recording/indexing/links/`: move the actual clone/finalize/select/order implementation, not a second wrapper over Studio. Old entry forwards through its feature barrel. |
| `programs/automation-studio/runtime/service/recording-state-index/{build,lookup,entry-readings,state-entry-readings}.ts` | `runtime/recording/indexing/{build,lookup,entries}/`: move actual traversal, precedence, projection and lookup; use the explicit observation/reference policies below. Studio leaves forward or bind the policies. |
| Same directory `contracts.ts` | Canonical lookup request/result types use shared `StateSnapshot`. Keep `RepairRecordingStateIndexResult` and its dry-run/write service envelope Studio, composed from the canonical index. |

`buildRecordingStateIndex` currently reads entries supplied by a caller, never
opens repositories. Repository loading, hydration/dehydration, object asset
reads/writes, repair persistence and recording/index locks remain Studio.

Concrete indexing layout: contract `indexing/{schema,recording,summary,timeline,
empty-input,validation-issue,lookup,state-link,index}.ts` and
`indexing/items/{entry,action,visual-target,state,coordinate-space,proposal,index}.ts`;
runtime `indexing/{empty,shape,sort,object-refs,visual-target,validate,assert,index}.ts`,
`links/{finalize,selection,order,index}.ts`,
`entries/{action,timestamp,refs,state,index}.ts`,
`lookup/{resolve,prior,candidate-source,state-link,missing,index}.ts` and
`build/{build,index}.ts`. Studio reference interpretation is
`programs/automation-studio/storage/recording-index-policy/{reference,index}.ts`;
the observation policy is `service/recording-state-index/policy.ts`.

## Frozen authorities to consume

- `@fluxiq/contracts/recording`: `RecordingSession<TTarget, TEvidence>`,
  `TimelineEntry<TTarget, TEvidence>`, `AppendRecordingEntryInput<TTarget, TEvidence>`,
  `CreateRecordingSessionInput`, domain processing and normalized timeline types.
- `@fluxiq/contracts/state`: the one rich `StateSnapshot`, paths, presentation,
  visual frame and signal authority. Do not recreate trimmed bridge snapshots.
- `runtime/state` and `runtime/recording`: actual store, diff, append, domain,
  controller, normalization and structural-validation implementations.
- `components/automation/importer/recording-mapper`: existing definition,
  observation, raw candidate, result, context and implementation authority.
  The mapper context already carries the explicit matcher and at most 32
  following observations. Do not repeat the earlier proposed SDK DTO relocation:
  R1 has completed it.
- `runtime/native-execution`: actual trusted bundle binder and per-domain
  matcher registration. Extend this one binder for a normalizer; do not build
  another domain registry beside it.

## Stable indexing policy contracts

Declare these beside canonical indexing. Imports in this sketch are the shared
recording/state contracts and the new canonical index DTOs, never Studio types.

```ts
type RecordingIndexScope = { projectId: string };

type RecordingReferenceReader = {
  accepts(reference: string, scope: RecordingIndexScope): boolean;
  validate(reference: string, scope: RecordingIndexScope):
    | { ok: true }
    | { ok: false; code: "invalid_object_ref" | "cross_project_ref"; message: string };
};

type RecordingIndexObservationPolicy = {
  isSnapshot(entry: ObservationEntry): boolean;
  embeddedState(entry: ObservationEntry): StateSnapshot | undefined;
};

type RecordingIndexBuildPorts = {
  references: RecordingReferenceReader;
  observations: RecordingIndexObservationPolicy;
  now(): number;
};

function buildRecordingStateIndex<TTarget, TEvidence>(
  projectId: string,
  recording: RecordingSession<TTarget, TEvidence>,
  ports: RecordingIndexBuildPorts
): RecordingIndex;
```

The reader's `accepts` handles the existing recursive metadata/payload collector:
cycle-safe walk, same-project accepted strings only, deduped/sorted output. Its
`validate` handles stored primary/screenshot/object refs and supplies the exact
old invalid/cross-project messages. A primary state ref currently remains a
pointer even if malformed, so the validator can reject it; do not silently drop
that state or convert rejection into a valid empty index.

Studio binds `isSnapshot` to exactly `client.state_snapshot`; `embeddedState`
uses the existing shallow timestamp/namespaces guard for an observation's
payload state. This isolates the legacy payload heuristic. Generic indexing
does not classify arbitrary payloads as snapshots by itself. The remaining
timestamp/id/coordinate-space/action/visual-target projection is the actual
canonical implementation, including current metadata precedence and finite
number selection. `StateContentReferencePolicy` from foundation validation
remains distinct; the index reader must not copy its Studio allowlist.

Keep these algorithms separate:

- Link finalization clones input and selects nearest absolute time, including
  a future state when closer; prior wins an equal-distance tie. Existing-link
  preservation, same-timestamp warnings and all deterministic tie breakers stay.
- Entry lookup first follows explicit state/action/entry links, then selects
  latest state at or before the entry, using sequence fallback when time is
  unavailable. Its timestamp precedence differs from the linker's.
- Candidate source lookup needs only `sourceObservationIds`; accept that narrow
  structural input rather than importing a mapper or Studio proposal DTO into
  the contracts package.

## Minimal capture sink and start policies

Put the sink in `runtime/recording/sink/`; gateway and IO share it. Default
target/evidence parameters use the shared authorities, with Studio specializing
its existing opaque target/evidence types. The sink delegates storage and locks;
the bridge does not create a second recording store.

```ts
type RecordingAddress = { projectId?: string | null; recordingId: string };
type RecordingReadOutcome<TTarget, TEvidence> =
  | { kind: "recording"; recording: RecordingSession<TTarget, TEvidence> }
  | { kind: "unavailable"; cause: unknown };

type RecordingSink<TTarget, TEvidence> = {
  create(input: CreateRecordingSessionInput<TTarget, TEvidence> & {
    projectId?: string | null; domainId?: string | null;
  }): Promise<RecordingSession<TTarget, TEvidence>>;
  append(input: RecordingAddress & {
    entry: AppendRecordingEntryInput<TTarget, TEvidence>;
  }): Promise<RecordingSession<TTarget, TEvidence>>;
  appendBatch(input: RecordingAddress & {
    entries: AppendRecordingEntryInput<TTarget, TEvidence>[];
  }): Promise<RecordingSession<TTarget, TEvidence>>;
  appendDomain(input: RecordingDomainEventInput):
    Promise<RecordingDomainEventProcessingResult<TTarget, TEvidence>>;
  finalize(input: RecordingAddress & { endedAt?: number }):
    Promise<RecordingSession<TTarget, TEvidence>>;
  read(input: RecordingAddress): Promise<RecordingReadOutcome<TTarget, TEvidence>>;
};

type RecordingStartContext =
  | { ok: true; projectId?: string | null; taskId?: string }
  | { ok: false; code: string; message: string; metadata?: JsonObject };

type RecordingStartPolicy = {
  description(value: unknown, origin: "host" | "client"):
    | { ok: true; description?: string }
    | { ok: false; code: string; message: string };
  context(input: {
    session: ClientGatewaySession;
    request: ClientGatewayStartRecordingRequest;
    origin: "host" | "client";
  }): RecordingStartContext | Promise<RecordingStartContext>;
  diagnosticMetadata: JsonObject;
};

type RecordingIngressPolicy<TTarget, TEvidence> = {
  entry(value: unknown): AppendRecordingEntryInput<TTarget, TEvidence>;
  commandTarget(value: JsonObject): TTarget;
  initialState(value: unknown): StateSnapshot;
};
```

Start policy is required. Generic capture has no implicit open-project rule or
Studio description requirement. The Studio adapter binds the exact trimmed,
nonempty, at-most-4000 description rule, original direct-call error class versus
client error response, default open-project refusal, existing context provider
and diagnostic `source: automation-studio`. Successful context returns the final
effective address: preserve current request/context precedence inside that
adapter, rather than adding another request override after the canonical policy
has returned. Test that a resolved address cannot subsequently be replaced by
untrusted request data. Scope authorization remains the host policy's job.
For direct host calls the Studio description callback may throw the existing
`AutomationInstructionError`; client calls return the structured refusal.
Canonical code never needs that Studio error class.
Host-origin context retains its existing explicit-project/session-project
precedence; the client-only open-project refusal is not imposed on direct host
recording by accident.

The Studio sink calls the six existing public service methods. It preserves
their mutation locks, raw-entry preparation, state-ref hydration/dehydration,
project indexing, description handling and return values. A failed status read
returns explicit `unavailable` with its cause, not absent/empty session. Only a
successfully read recording with defined `endedAt` permits late-append discard;
otherwise the original append error propagates. This replaces the current
`getRecordingSession(...).catch(() => undefined)` without turning failure into
evidence that a recording is open or finalized. Diagnostics use bounded codes
and identity/count facts, never raw entry/state payloads or caught secret text.

Keep the target parameter honest at the wire boundary too: the canonical
bridge's ingress policy decodes a client entry into the shared
`AppendRecordingEntryInput<TTarget, TEvidence>` and converts an opaque command
target to `TTarget`. Studio binds its current target/entry validation and exact
`{type, metadata}` command-target projection. Do not cast an arbitrary RPC
object to a specialized target, manufacture an empty state, or copy browser
target declarations into capture. Initial-state validation uses the existing
rich snapshot validator with the caller's content-reference policy.

## Gateway and IO implementation cut

Move the real gateway state machine to `client-gateway/recording/`. Suggested
feature leaves are `bridge`, `options`, `lifecycle`, `capture`, `diagnostics`,
`writes/order` and `writes/append-outcome`, with barrels. Split the existing
790-line responsibility by these operations rather than retaining a catch-all
or copying maps into helpers. One bridge instance owns the active/closed/pending
maps and one write-order instance. Old `AutomationStudioClientGatewayBridge`
becomes a constructor adapter that supplies Studio sink/policies to the actual
canonical class; it must retain no second lifecycle or write algorithm.

Preserve trusted-client owner keys (`trusted:` before session fallback), scoped
session refusal, registration of pending-start barriers before any await,
pre-start write snapshots, refusal settlement, Stop suppressing start ack,
250 ms default drain, old-Stop/new-recording race handling, 32 closed owners,
25 ms/50-entry enqueue/100-entry batch behavior, grouping order and no silent
retry of a spliced failed batch. Durable `executeAction` must still stop its
command context on capture failure and propagate that failure.

The write-order continuation tail deliberately allows later messages after a
failed step while returning that step's original rejecting promise to its
caller. Keep those two outcomes explicit. Timer/threshold flush failures need
an explicit failure observer carrying owner/address/cause privately, with a
sanitized gateway diagnostic; they must not become empty success, silent retry
or raw exception text in an audit event. Exercise both awaited and background
failure paths, including progress of later queued work.

`runtime/recording/io/` owns the real IO-to-entry projection and recorder.
It consumes `IoRegistry`, `IoEnvelope` and only the sink's append capability.
Preserve confirmation fields/defaults, event/source ID filtering,
`recordInputPayload`, `policyEligible`, payload wrapping and metadata precedence.
Only role `action` plus an actual registered `outputBinding` may emit an action;
a definition's outputId alone or an unmapped action remains observation.

There is one concrete mismatch to fix explicitly in this unit: bridge
`isExecutableActionInput` says unmapped inputs are passive, but currently checks
only the input role. Its discard audit can therefore count an unmapped input as
lost executable work. Share the registered binding admission with IO projection:
extract the lookup portion of `IoRegistry.resolveInputOutputBinding` into a
small registered-binding descriptor method/helper, and make the existing
resolver use it. Its descriptor includes the actual binding, registered output
id and input definition; projection alone calls `toPayload` once. Discard audit
reads that same descriptor without invoking the payload projector or executing
an output. Preserve the resolver's unregistered-output refusal, rather than
silently manufacturing an observation from an invalid registration.

Reserve that exact `io/index.ts` method/helper change in the initial interface
step. It is not authority for a wholesale IO registry refactor. Add tests for
unmapped/definition-only/state inputs after Stop, mapped actions after Stop,
unregistered binding refusal, projector call count and no output dispatch.
Passive loss remains counted/reported once; every genuinely executable lost
action remains reported individually. Direct already-typed action entries keep
their explicit classification; do not infer executability from arbitrary data.

## Mapper, candidate, review and node projection cut

Keep existing raw mapper DTOs in `components/automation/importer/recording-mapper`.
Add the normalized `RecordingFlowActionCandidate` there, reusing the existing
candidate's confirmation/evidence field types, parsed record-output contract and
the canonical index's `ProposalNodeStateLink`. The old proposal module aliases
this authority. No contracts-package import of the framework SDK is allowed.
Publication/review/destination/invalidation/project proposal envelopes remain
Studio. Pure normalization-review content belongs to the runtime review feature;
the Studio artifact adds review ID/time and persists it.

Freeze this trusted executable port before mapper and downstream dispatch:

```ts
type AutomationStudioRecordingCandidateParameterNormalizer = (
  domainId: string,
  parameters: JsonObject,
  context: { outputId: string; sourceEntryId: string; source: "mapper" }
) => JsonObject;
```

Add it as an optional implementation-bundle member, never manifest metadata.
The native binder stores it by the registered manifest domain, rejects a
conflicting different function before partial registration, and exposes it on
the bound mapper aggregate. Add that aggregate type beside SDK mapper DTOs and
alias the old `RecordingMapperBinding` to it. Existing mapper payload/context
shapes remain unchanged. An absent normalizer preserves parameters with the
existing shallow-copy behavior; canonical mapping has no browser-normalizer
fallback and does not infer domain from target fields.

| Existing source | Canonical mechanism / Studio remainder |
| --- | --- |
| `runtime/service/recordings/proposal-generation.ts` | Move actual mapper iteration, fallback, per-entry error handling, counts and no-candidate diagnostics into `runtime/recording/mapping/run.ts`. Return candidates/issues/stats. Studio stamps proposal ID/project/status/time/notice metadata only. |
| `runtime/service/recordings/proposal-candidates.ts` | Move calls/following observations, candidate validation, gap tracker, state-link/gap metadata into focused `mapping/{calls,candidate,gap,metadata}/` leaves. Inject the parameter normalizer, canonical index lookup and candidate ID factory. |
| Same file `appendRecordingProposalToFlow` | Move execution parameter/node recipe to `flows/executable/recording/`. Keep artifact updates, collision/layout placement, editor coordinates and proposal review bookkeeping Studio; preserve exact node/edge metadata and IDs. |
| `runtime/service/recording-projections/mapper-candidate.ts` | Move actual bound action fallback into mapping. Supply its token label formatter, or move that one pure formatter once into a neutral text feature with an exact old reexport. Do not import Studio evidence/mining services. |
| `runtime/service/recordings/timeline.ts` | Move filter mechanics; bind a DISTINCT instance of the frozen `StateObservationPolicy` type to the old two client observation names. The normalizer's broader payload-state heuristic must not be reused implicitly. Checkpoints remain omitted as before. |
| `runtime/service/recordings/normalization-review.ts` | Move raw/normalized mapping and wait-clip construction to `mapping/review/`; Studio retains load-or-normalize, artifact timestamps/ID and writer call. Preserve the existing preserved/derived/dropped meanings, compacted synthetic row and wait threshold 250 ms. |
| `runtime/service/recordings/candidate-definitions.ts` | Move actual definition/parameter/materialization projection into `components/automation/recording/`, consuming normalized candidate and minimal `{proposalId, domainId, mapper:{id}}`. Preserve editable timeout/record-output precedence, including explicit null. Old functions forward structurally compatible signatures. |
| `runtime/recording-flow-proposal.ts` | Keep persisted project artifact/review/destination/lifecycle DTOs; alias canonical candidate/evidence/state-link types. Move pure definition ID helper with component projection and forward it exactly. |

Candidate identity is supplied as `nextCandidateId(actionEntryId): string` at
the same point after successful validation. Studio binds its existing
`candidate.<safeSegment>.<UUID>` factory. Proposal stamping stays Studio and runs
only when candidates exist. Do not unify its safe-segment helper with the
definition ID helper's different historical escaping/default rules.

Retain expected-state drop semantics with an explicit clone outcome such as
`absent | not_plain | uncloneable | empty | state`, then decide whether to keep
it. Do not carry the old caught-clone-to-undefined pattern into a new canonical
path or baseline. Callback failures remain recorded per entry, but private
causes must not become arbitrary raw mapper/page text in public issue strings;
render known validation codes and bounded mapper/entry identity safely.

Preserve registered AND mapper-declared outputs, registered action-role source
and confirmation inputs, expected-state plain-object cloning/drop semantics,
record-output parsing and encryption refusal, declared recordsPath fallback,
positive safe-integer timeout validation, confidence clamp/default, evidence
source ordering and `policyStateEligible:false`. Each mapper gets fresh call
objects; within one mapper, following references are the same observations later
passed as current. Following is at most 32 after transport filtering. One entry's
mapper/validation error is collected and later entries continue.

The gap tracker advances before candidate validation, including rejected
candidates; preserve that ordering. First candidate has no gap, same-entry gap
is zero, backward/nonfinite offset is not a wait, stored valid gaps round to ms.
Review and mapping inputs are not mutated, and raw recording stays immutable.

## Required downstream normalizer binding

Own `domain/src/recording/proposals/normalize-candidate.ts` and its barrel plus
the existing `domain/src/web-panel-host.ts` bundle registration in a separate
paired downstream brief. That adapter owns the current active interpretation of
element/target aliases, selector, XPath, tag/role/ARIA/test IDs, attributes,
bounds and context. Reuse the downstream identity builders only where their
bytes match the old candidate normalizer. Final adapter must not call Core's
browser normalizer. Preserve explicit element/target precedence and prevent
typed input values from becoming identity text.

Capture old/new parameter-byte parity fixtures before migration, including
redaction and all winning identity fields. Register the trusted callback next
to the current web recording mapper and matcher. Other old Core browser
normalizer callers remain explicitly required R8 work; completing this R5
proposal seam does not complete that wider boundary removal.

## Disjoint source briefs after the interface freeze

Each brief uses Heavy worker / gpt-6.1-sol / max. Lead owns package exports,
parent barrels, `_shared/runtime.ts`, framework wiring, `service.ts` call-site
integration, shared docs/indexes and final combined checks. No source assignment
is authorized by this report itself.

**Interface step, serial before dispatch:** freeze canonical indexing DTOs and
policies, sink/start policies, SDK normalized candidate/binding/normalizer types,
and the exact IO registered-binding descriptor. Assign the SDK bundle/native
binder changes to the mapper lane only; assign the IO registry method to the
gateway/IO lane only. If written by the lead first, release them before dispatch.
No worker edits another lane's feature barrels.

**A — indexing brief** (independent once its contracts freeze): own new
`contracts/src/recording/indexing/**`, `runtime/recording/indexing/**`, old
`storage/state-index.ts`, new `storage/recording-index-policy/**`, old
`runtime/state-linker.ts`, old `service/recording-state-index/**`, and their
named subject tests. Must not touch storage repositories/object-store, gateway,
IO, mapper/SDK, service/root barrels or any other report. Move actual algorithms;
keep repair persistence envelopes Studio. Report `recording-indexing.md`.

**B — gateway/IO brief:** own `client-gateway/recording/**`, new
`runtime/recording/{sink,io}/**`, old Studio `client-gateway/**`, old
`runtime/io-bridge.ts`, a new Studio `service/recordings/sink-adapter.ts` only,
the exact IO registry admission method/helper, and named gateway/IO tests.
Must not touch other `service/recordings` files, native/SDK, indexing, root
wiring/barrels or other reports. Preserve the one state machine and write
authority; fix the named role-only discard mismatch explicitly. Report
`recording-capture.md`.

**C — mapper/review brief:** own `runtime/recording/mapping/**`,
`flows/executable/recording/**`, `components/automation/recording/**`, new SDK
normalizer/normalized-candidate/binding leaves and their feature barrel,
`components/automation/importer/implementation-bundle.ts`, the exact native
normalizer register/list/get slice, old `runtime/recording-flow-proposal.ts`,
old `service/recordings/{proposal-generation,proposal-candidates,timeline,
normalization-review,candidate-definitions,types}.ts`, old
`service/recording-projections/mapper-candidate.ts` and named tests. No store,
sink-adapter, gateway, IO, indexing, native execution behavior, service.ts/root
barrel or other report edits. Report `recording-mapping.md`.

**D — downstream normalizer brief:** own only the new proposal normalizer and
its tests/barrel plus the host's bundle registration and necessary named parity
fixtures. Use the frozen callback API. No browser/provider/full-suite actions,
no Core changes, no recording/reducer/identity algorithm rewrite. Report in the
paired downstream working-doc report directory.

## Test ownership and narrow acceptance

- A: move five pure linker cases to canonical links tests. Split old
  `storage/tests/state-index.test.ts`: structural/sort/visual-target/ref-union
  cases canonical with a fake ref policy; real Automation Studio invalid and
  cross-project refs stay at the adapter. Add direct build/lookup and distinct
  nearest-versus-prior/tie/clock/recursive-ref policy cases. Retain actual
  `storage/tests/recording-index-store.test.ts` and
  `runtime/tests/service-recordings/tests/state-index.test.ts` as integrations.
- B: move gateway bridge/restart/scoped/write-order mechanism cases from old
  `client-gateway/tests/{bridge,bridge-restart,bridge-scoped-session,
  client-recording-write-order}.test.ts` to canonical feature tests with an
  in-memory canonical sink. Keep `description.test.ts` and a small real Studio
  sink/start integration. Move the first six direct IO recorder cases from
  `runtime/tests/io-bridge.test.ts`; retain its graph/output/confirmation/service
  cases as second-consumer integration, sharing helpers instead of copying tests.
- C: add canonical injected-port mapper/candidate/gap/review/recipe/definition
  tests. Keep existing real-SQL
  `service/recordings/tests/proposal-candidates.test.ts` intact as service-through-
  mapper integration: its assertions intentionally prove actual service wiring,
  not just helper behavior. Retain `candidate-definitions.test.ts` and
  `runtime/tests/service-recordings/tests/{recorded-gap,proposals,
  proposal-approval}.test.ts` integration. Add normalizer missing/domain-conflict
  and no-manifest-function-authority tests at the actual SDK binder.
- D: direct parameter-byte parity, secret withholding, element/target precedence,
  alias and identity-field preservation tests; later run the named web host and
  recording/proposal subsets when the Core public build is ready.

Expected commands after source is stable, not run by this report:

```text
pnpm.cmd --filter fluxiq exec vitest run src/runtime/recording/indexing src/programs/automation-studio/storage/tests/state-index.test.ts src/programs/automation-studio/storage/tests/recording-index-store.test.ts src/programs/automation-studio/runtime/tests/service-recordings/tests/state-index.test.ts
pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/recording src/runtime/recording/io src/programs/automation-studio/client-gateway/tests src/programs/automation-studio/runtime/tests/io-bridge.test.ts
pnpm.cmd --filter fluxiq exec vitest run src/runtime/recording/mapping src/flows/executable/recording src/components/automation/recording src/programs/automation-studio/runtime/service/recordings/tests/proposal-candidates.test.ts src/programs/automation-studio/runtime/service/recordings/tests/candidate-definitions.test.ts src/programs/automation-studio/runtime/tests/service-recordings/tests/recorded-gap.test.ts
```

Every canonical feature must pass transitive import closure including erased
types with no Studio dependency. Base runtime and component DTOs must not reach
engine. Scope the structural checks to new/changed owners for imports/cycles,
exports, depth/prefix/directory/file budgets, packed statements, unsafe casts
and failure handling. Do not transfer old violations or increase a baseline.
Lead runs public exports, touched package checks/build and current downstream
integration at the coordinated freeze. No full suites per unit or paid tests.

## Read-only validation and limits

Inspected the named plans/handoffs, actual canonical barrels/contracts and
decisive old storage/index/link/build/lookup, gateway/write-order, IO registry/
recorder, SDK mapper/binder and mapping/review/definition sources. Source evidence
confirms the closures and the role-only discard mismatch above. Read-only
`Get-Content`, `rg` and file-list commands only; a few stale/guessed paths were
corrected by following the actual barrels. No source/test/build/audit/provider/
browser/panel/git/spawn action ran. All proposed extraction and acceptance steps
remain unimplemented and unverified by this report.

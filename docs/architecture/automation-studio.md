# Automation Studio Architecture

Automation Studio is the FluxIQ authoring surface for recordings, learned task
models, generated policy graphs, and runtime debugging. It is a global
framework program, but it must remain domain-neutral. Host projects provide the
signals, actions, events, capabilities, recordings, generated policies, and
runtime adapters for their own domains.

## Evidence Layers

Automation Studio separates evidence from interpretation:

```text
Raw Recording
  -> Normalized Timeline
  -> Signal Mining
     -> facts
     -> observations
     -> state/action correlations
     -> evidence claims
  -> Learned Task Model
  -> Generated Policy Graph
  -> Runtime Execution + Training Data
```

The raw recording is immutable evidence. Normalization, mining, policy
generation, AI proposals, and runtime training create new artifacts that point
back to earlier evidence with stable references. This lets a host project
improve miners or regenerate policies without recapturing the task.

State and evidence are intentionally distinct in the proposal pipeline.
Reducers and state observations describe factual values; mining decides whether
those values were present before an action, changed after it, or merely provide
context. Generated policy nodes then surface pre-action evidence as
eligibility/readiness signals and post-action evidence as success expectations.
Recording mapper action inputs are preserved as action evidence and are not
promoted into policy state.
### Deterministic recording-derived Subflows

The Recording Timeline exposes a direct **Generate Subflow** operation for a
finalized recording. The operator selects a destination Flow and authorizes the
mutation; Core runs the registered domain mapper, approves the resulting direct
proposal, and writes executable `builtin.policy.action` nodes into the
destination Flow's primary Subflow graph. Core keeps the top-level orchestration
Flow graph-empty. If its Router already has a fallback Subflow, generation
reuses that exact Subflow instead of selecting or creating an unrelated child.

Generated action nodes retain immutable recording/proposal evidence and use a
340-pixel horizontal interval so standard node cards do not overlap. Repeating
generation may replace only an empty graph or a graph composed entirely of
unedited recording-derived nodes and edges. Any manual provenance or foreign
graph member makes replacement fail closed. After a permitted replacement,
Core reconciles the canonical Flow document into the project SQL graph index,
removing stale indexed nodes and edges before adding the current graph. This
keeps the paged Nodes viewport, execution document, and persisted source in
agreement even when the viewport was materialized before regeneration.

## Folder Ownership

Automation Studio is intentionally split by subsystem:

```text
packages/fluxiq/src/programs/automation-studio/
  api/              Program API request and response contracts.
  fingerprinting/   Node/state scoring contracts.
  learning/         Learned task model contracts.
  mining/           Signal mining result and miner contracts.
  model/            Canonical evidence, state, signal, recording, policy, and runtime models.
  nodes/            Built-in node definitions, node classes, registry helpers, and node-library layout.
  normalization/    Raw-recording to normalized-timeline contracts.
  runtime/          Thin service facade, execution, recording control, pipeline indexing, and policy translation.
  storage/          Repository contracts for prototype and canonical artifacts.
  ui/               Program UI state contracts.
```

The root folder should stay small. New domain-neutral model concepts belong in
`model/`. Pipeline-specific contracts belong in the matching pipeline folder.
Implementation files should follow the same boundary rather than collecting in
one large `types.ts`.

The legacy prototype `types.ts` remains exported while Automation Studio moves
toward the canonical model. Domain-specific automation code, private
recordings, generated downstream policies, and domain assets do not belong in
this repository.

Within `runtime/`, `service.ts` owns repository coordination, transaction
ordering, recording mutation locks, and the stable public service API. Pure
policy/proposal transformations live in `policy-model.ts`; pipeline index and
per-recording pipeline-document invariants live in `pipeline-model.ts`.
Neither model module imports the service facade. Evidence construction remains
in the facade for now because its persistence sequence and domain-registry
lookups are coupled to the current transaction boundary; it should move only
when that boundary can remain single-owner.

## First Core Contracts

The initial canonical contracts live under
`packages/fluxiq/src/programs/automation-studio/model`:

- `RecordingSession` stores an append-only timeline with an initial state
  snapshot, timeline entries, notes, source descriptors, action channels, and
  environment metadata.
- `StateSnapshot`, `StateNamespace`, and `StateValue` model observable state as
  independently addressable signals instead of one opaque JSON blob.
- `SignalRegistry` describes signal paths, comparators, default weights,
  volatility, persistence, tags, sensitivity, and derived-signal provenance.
- `ActionDefinition` describes available domain-neutral action types,
  parameters, capabilities, preflight requirements, and safety metadata.
- `PolicyGraph` and `PolicyNode` describe runtime decisions with eligibility,
  readiness, actions, success conditions, failure conditions, invariants,
  timeout, retry, recovery, outgoing edges, and source evidence.
- `RuntimeActionAttempt` records runtime action lifecycle data in a shape that
  can be compared with operator recordings.

These contracts are intentionally richer than the existing shallow Automation
Studio prototype types. The prototype exports remain in place while the
canonical model is adopted incrementally.

## Canonical Flow Foundation

Automation Studio is moving from separate Task and Routine authoring concepts
to one owner-independent **Flow** artifact. The first additive contract lives
in `model/flows.ts`; it coexists with the legacy task/routine-owned
`AutomationStudioFlowDocument` while compatibility and storage migration are
implemented in later slices.

A canonical Flow declares its project, global or domain scope, private/public
visibility, origin, source ownership, typed input/output interface, variables,
graph, execution defaults, publication metadata, and evidence provenance. A
public Flow has an immutable published version and interface snapshot, which
will later be projected as a reusable composite node in the same scope.

The initial Flow type system covers primitives, JSON, unknown values, arrays,
records, and named schemas. `validateAutomationStudioFlow` validates IDs,
scope, ports, defaults, local graph structure, source metadata, execution
defaults, and publication invariants before future storage or execution paths
consume the artifact. Node-definition port compatibility is deliberately
deferred until the node registry is migrated to its canonical contract.

Flows may be visual-owned or code-owned. The Source editor generates stable
declarative TypeScript, and explicit conversion makes either visual IR or a
validated constrained module authoritative. Code-owned graphs are read-only
in the visual editor and retain compiler/source digests.

## LLM-Assisted Deterministic Automation

The next additive Flow expansion treats a Flow as the complete automation
object: interface, router, subflows, scoped instructions, runs, adaptations,
settings, provenance, and publication lifecycle.
The LLM harness is used to generate, repair, adapt, and improve deterministic
automation, then successful behavior is compiled back into durable Flow
structure so token usage scales with novelty rather than execution count.

New Flows are fail-closed: normal execution, no LLM intervention, manual
proposal review, and no automatic adaptation promotion. Fully adaptive
behavior remains an explicit opt-in. Explicit runtime assistance has two closed
lanes: `diagnosis_only` makes one diagnosis request and cannot patch or create
an adaptation, while `diagnose_and_adapt` makes exactly one diagnosis and one
runtime-patch request against an exact Flow revision. The latter may persist a
proposal for manual review but cannot auto-apply it or authorize external side
effects. A proposed target override is structurally validated as an opaque
target object; an optional domain validator receives bounded failed-node
identity (node ID and definition ID) so it can enforce action compatibility.
It may accept the proposed target or resolve one exact canonical replacement;
all other results fail closed. Core also binds the proposal to the failed node,
rewriting a different model-selected node ID only when the failed node exists in
the current Flow. The proposal records only categorical selector/node resolution
provenance, is marked high-risk/external-side-effecting, and is never run as a
live patch. The canonical graph changes only through the existing
PIN-authorized adaptation review/apply endpoint.
Because the explicit grant is schema-bound to this one proposal kind, Core
enables action-target proposal creation for that run even when the Flow's normal
policy is locked. It does not enable live patch execution, auto-application,
external side effects, or any other mutation class.

Every provider request carries server-enforced input, output, and total token
limits. Core defaults are 8,000 input, 2,000 output, and 10,000 total tokens.
Persisted Flow settings allow one through eight LLM calls, matching the global
execution-grant ceiling; individual runtime intents can impose narrower exact
limits. Evidence-guided generation uses the upper bound for its bounded loop.
No request setting may raise the absolute total-token ceiling above 50,000,
and Core rejects a request before provider invocation when its estimated input
plus output allowance exceeds the effective total. Provider transport output
is untrusted: the harness parses strict registered structures, rejects extra
fields and malformed usage, normalizes provider throws to terminal diagnostics,
and persists only a compact structured-result summary without provider
free-text or arbitrary metadata.

Core also exports a production transport seam and a built-in DeepSeek adapter.
The adapter has one fixed HTTPS chat-completions URL and the explicit
`deepseek-chat` model; user/Flow endpoint overrides, redirects, hidden retries,
and unbounded response reads are not supported. Requests use a concrete output
allowance, a bounded timeout and abort signal, request/idempotency identifiers,
and an opaque scoped secret resolver. A per-run reservation ledger is shared
across diagnosis and patch calls so the call, total-token, and output-token
budgets are reserved before transport dispatch. Failed or usage-less calls are
charged conservatively. The default runtime composes this adapter only through
an opaque, session-bound execution grant. Grant issue requires an authenticated
actor session and a session-scoped Secret Keys unlock established at login; it
does not accept or retain a password or PIN. The grant binds the enabled LLM key
and revision, `deepseek-chat`, a canonical execution digest, effective token/
call/cost/timeout limits, purpose, and expiry, and returns no secret. The
execution digest covers the parent Flow, Flow Map Router, Subflow
records, routed Subflow graphs, effective settings, applicable project/Flow/
Subflow instructions, and every transitively reachable version-pinned
published snapshot. Reachable publication lifecycle status, missing targets,
and composition-validity results are included. Publication resolution uses the
same process-wide publication universe as canonical execution, including a
domain Flow's calls to globally published Flows owned by another project, but
the digest hashes only records transitively reachable from the executed Flow.
Consequently unrelated publication churn is excluded while same-millisecond
snapshot, dependency, publication, and deprecation changes invalidate a grant.
Claiming is atomic. Secret Keys creates a separate opaque,
one-use reveal authorization after identity verification and owns only its
zeroizable password-derived key; the LLM grant retains only that opaque ID.
The provider secret is first decrypted just in time at dispatch, and both the
Secret Keys authorization and LLM grant recheck active state and expiry after
asynchronous work before returning it. Neither login credentials nor provider
secrets are retained by the grant or persisted. Unused capabilities expire
actively and are cleared on consume, failure, cancellation, key change,
service shutdown, web-runtime reload, SIGINT, or SIGTERM. Core never reads a
provider key from the environment. Flow Settings exposes only DeepSeek and
deepseek-chat, selects only enabled Secret Keys metadata in global or current
Flow scope, and persists per-request input/output/total token limits, one-call
limit, timeout, estimated-cost cap, and zero-retry policy. The settings API
rejects totals above 50,000, input-plus-output reservations above the total,
calls other than one, retries other than zero, timeouts above 25 seconds, and
cost caps above USD 0.25. Runtime Debug exposes separate **LLM diagnosis** and
**Diagnose and propose adaptation** modes, performs purpose-specific preflight,
and issues the scoped one- or two-call grant from the authenticated session. A
future profile above 100,000 total tokens additionally requires an explicit
high-token confirmation. Server
failures are presented as fixed, sanitized messages. Explicit grants are
attached only to run-runtime-session; ordinary deterministic modes do not
receive them. Both explicit runtime lanes must create a fresh runtime session:
the API and service reject a supplied `runId` and revoke the invalid grant. As
defense in depth, diagnosis execution
sets graph cross-domain authorization to an empty set instead of reconstructing
it from session metadata. A diagnosis-only run executes the already-authored deterministic
Flow through the same bound IO, importer-native, and host-runtime capabilities
as an ordinary run, preserving its existing Flow and domain authorization. The
grant cannot add cross-domain grants or authorize external side effects, and it
disables LLM patching, recovery retries, adaptation, and promotion. Target-level
restrictions, such as a downstream test lane permitting only local fixtures,
remain the responsibility of the importing domain policy rather than generic
Core.

The execution-grant module additionally exports a fail-closed
`build_and_adapt` capability foundation for non-recording authoring and live
adaptation orchestration. Purpose-aware preflight and issue endpoints and the
production provider resolver now expose the capability. The typed
`generate-flow-bootstrap-adaptation` endpoint accepts only the project, blank
Flow, current authenticated session, and opaque `build_and_adapt` grant ID. It
revalidates the available grant, passes the exact dependency digest and settings
revision to the service generation seam, and returns only the proposed
adaptation identity, status, risk, source-instruction IDs, base binding, and
bounded provider accounting. The endpoint neither applies the proposal nor
mutates or runs the Flow; UI review/application and runtime adaptation remain
separate phases. Build grant issue is
bound to the current authenticated actor session and rejects existing-run,
idempotency, adaptation-mode, dry-run, and external-side-effect flags.
Authoring grants require an exact project/Flow dependency digest plus the
canonical persisted Flow settings revision, bind the enabled key revision, and
become invalid when any of those revisions or the authorized user session
changes. The purpose is runtime-enum validated. Production resolution currently
permits `build_and_adapt` only for the initial `flow_bootstrap` task/output;
the module's bounded diagnosis, patch, proposal, and instruction task pairs
remain unreachable until the live adaptation phase explicitly enables them. Calls
are sequential and atomically claimed; each call consumes a separate opaque,
one-use Secret Keys authorization and receives a grant-owned abort signal. A
grant allows at most eight explicitly configured calls, no provider retries,
at most 50,000 total tokens per request, a finite per-call timeout and cost
ceiling, and a finite aggregate estimated-cost ceiling. Provider completion is
not result acceptance: Core revalidates expiry, active membership, actor/
session, key revision, dependency digest, and settings revision at a mandatory
commit boundary before returning a result for parsing or accounting. Expiry,
explicit cancellation, abort, user/session revocation, failure, or service
close aborts the in-flight call and revokes all unused authorizations. No password, PIN, or provider plaintext is retained or
persisted. A durable Flow or settings mutation changes the binding, so later
calls require a newly authorized grant against the new revision.

Recordings remain immutable evidence when users choose to provide them, but
they are no longer the required center of Flow creation. Text description and
scoped instructions are first-class inputs. Adaptations are the approval and
audit surface for generated edits, new subflows, router changes,
expectation/action-target changes, and runtime learning; they are not
generated directly from recordings.

The first public contracts for this direction live in
`model/flow-adaptation.ts`. They are additive and do not change existing Flow
execution semantics. Compatibility policy and recording-flow proposal artifacts
remain available internally while adaptation records become the long-term
review/audit surface.

### Router Runtime

The first execution layer for an expanded Flow is its router. The router
receives the Flow ID/version, run inputs, current state summary, available
subflows, route rules, fallback configuration, and adaptation policy context.
Rules are sorted by explicit order and ID, disabled rules are skipped, and
missing subflow targets produce deterministic diagnostics.

Router conditions are intentionally conservative. They evaluate explicit
condition primitives against `inputs.*` and `state.*` paths for equality,
existence, numeric comparison, text containment, regex matching, boolean
checks, and normalized text comparison. Operators that require transition
history fail closed until divergence detection provides that history.

When a canonical Flow has a saved router, `runRuntimeSession` evaluates the
router before graph execution. A matching route executes the selected subflow's
`graphFlowId` through the existing canonical Flow executor. The selected graph
must carry the current `subflow_graph` representation marker and matching
parent Flow/Subflow ownership metadata. A missing, unrelated, or unreadable
graph fails closed; runtime never substitutes the parent Flow.

Current documents carry `metadata.flowRepresentationVersion = 1` and one of
three Core-owned representation kinds:

- `orchestration` is a top-level Flow. It owns Router and Subflow resources and
  cannot persist graph nodes or edges.
- `subflow_graph` is a dedicated graph Flow owned by exactly one Subflow. Its
  parent Flow ID, Subflow ID, and Subflow row must agree before graph mutation
  or routed execution.
- `legacy_single_graph` is a bounded compatibility representation for artifacts
  that already contained a parent graph before this invariant, or that entered
  through the explicit legacy migration path. It may still execute directly,
  but the run records `flow.legacy_single_graph_execution` diagnostics.

New unmarked documents are classified as `orchestration`; callers cannot opt a
new Flow into legacy behavior by supplying metadata. Pre-invariant, unmarked
documents with an existing graph are classified as legacy so upgrades do not
destroy working data. A pre-marker Subflow graph remains readable only when its
`subflowGraph`, parent Flow ID, and parent Subflow ID ownership triple is
complete; partial or contradictory ownership metadata fails closed.

Public saves cannot downgrade a legacy graph to `orchestration`. The internal
visual migration creates or reuses a dedicated primary Subflow, copies and
verifies nodes, edges, evidence, and execution defaults, installs and reads back
the Router fallback, and only then clears the parent graph and execution
defaults. The PIN-authorized `migrate-legacy-flow-representation` endpoint gives
non-editor automation the same verified transition for one caller-specified,
existing owned Subflow; it requires `flows.write`, refuses mismatched ownership
or graph content, and returns the migrated parent Flow, Subflow, and graph Flow.
Repeating it against the same valid orchestration target is idempotent.
Code-owned legacy Flows require an explicit source migration before this
conversion, so no partial Router/Subflow state is written. Once upgraded, the
parent cannot return to a direct graph representation.
Route decisions are persisted in Flow run detail. The record includes selected
rule/subflow, rejected rule IDs, fallback use, decision time, evaluation count,
and optional reroute source metadata. The summary index stores only counts and
navigation fields; users open a specific run detail to see the full route and
subflow boundary trace. Route-decision, Subflow-entry, and action-attempt
summary counts are derived from that completed detail and must match it.

Runtime action attempts now carry deterministic transition comparisons before
any LLM diagnosis is considered. Each attempt records expected transition
hints, actual status/route/output/effect data, a normalized comparison status,
and a compact diff summary. Failed attempts pass through the recovery ladder in
priority order: configured failed-route path, approved runtime patch, graph
local recovery reroute, then LLM diagnosis fallback. Recovery budgets can cap
retries per action, recovery attempts per subflow, reroutes per run, and
adaptation/LLM attempts per run; exhausted budgets produce terminal failure
metadata instead of looping.

Failed attempts carry a structured failure when one is known. Core owns the one
category list, `AutomationStudioAdaptiveFailureClass`, exported from
`@fluxiq/contracts` with `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES` and
re-exported by `fluxiq/automation-studio`. A domain decides which member
applies and reports an `AutomationStudioFailureRecord` (`category`, a
producer-owned `code`, `retryable`, and optional `stage`, `expected`, `actual`,
and `evidenceDigest`) on the gateway action result, the runtime command result,
or the output dispatch result. `parseAutomationStudioFailureRecord` accepts
only exact, bounded, self-consistent records and drops anything else whole.
The record travels from the dispatch result through the node result to the
attempt trace and the persisted action record, and the LLM recent-action
context carries its category but not its code or texts. Transition comparison
and adaptive failure classification read the record first; matching the
attempt's message remains only for attempts recorded without one. Core also
names the failures its own structured signals prove: a `timed_out` command is
`timeout`, a `rejected` command is `blocked_by_capability_or_policy`, a
dispatched output whose bound confirmation input never arrived is
`output_not_observed`, and an element target with no confident candidate is
`target_not_found`. Output-dispatching attempts also record `targetResolution`
beside `stateRefs`: the resolution status, the candidate count, the confidence
threshold, and the best candidate's score and signals.

Whether an expected state actually holds is the host's decision, not Core's. A
host runtime boundary may bind `expectationEvaluator(conditions, mode,
timeoutMs, context)` beside `captureStateSnapshot`, `inspectStateDiff`, and
`rollbackHint`, and `bindHostRuntime` carries it into every graph run. The
`builtin.policy.expectation` node awaits it and routes `failed` with an
`expected_state_missing` failure when the host rejects; the transition
comparison asks it about any other node's `expectedState`, naming the snapshot
the attempt ended on, and reports the conditions the host checked instead of
counting expected-state keys. A host that binds no evaluator is unchanged: the
expectation passes unconditionally and expected state is read from the
attempt's own route as before.

Subflows are persisted as Flow-owned behavior units with route tags,
input/output mapping, graph reference, local instruction IDs, proposal-mode
override, and stability metrics. New subflows receive an isolated graph Flow by
default so editing a subflow does not mutate the parent Flow/router graph. The
Subflows workspace is only a paginated directory; selecting a row resolves the
subflow's graphFlowId and opens that graph in the normal Flow editor. Backing
subflow graph Flows are not shown as separate top-level Flows.

Router and Subflow saves require an existing top-level owner. Subflow graph IDs
are Core-generated, must resolve to a graph with matching ownership, and cannot
be reassigned. Public graph deletion rejects owned Subflow graphs; the owning
Subflow deletion path performs the guarded cascade. Routed adaptive retries
revalidate the exact parent/Subflow pair and preserve Router decisions and
Subflow-entry evidence in run detail.

Legacy Subflow documents that predate `graphFlowId` remain compatible. SQL
projection derives the deterministic backing Flow ID and, when no graph exists,
synthesizes an empty isolated graph from the parent Flow before writing the
Subflow row. Referenced Subflows and their graph Flows are projected before the
Router that targets them. This lazy repair is a SQL/graph compatibility action,
not a canonical JSON backfill: the legacy Subflow document receives
`graphFlowId` only when it later goes through the normal Subflow save path.

Structural adaptation patches that create or edit subflows, routers, or
recovery paths must be linked to an adaptation review record before they can be
saved. This keeps recovery/adaptation behavior auditable through the same
Adaptations surface used for generated Flow edits.

The LLM harness is a constrained runtime boundary, not an agent with direct
write authority. Core builds a provider-neutral task request from compact run
context, resolved instructions, policy gates, subflow inventory, action
history, and route/state evidence. A host supplies an
`AutomationStudioLlmProvider` callback and provider/model metadata; Core does
not embed provider credentials or domain prompts. Prompt versions are stable
IDs per task family, including runtime diagnosis, runtime patch, router patch,
subflow patch, expectation/action-target patch, instruction suggestion, change
proposal generation, and diagnosis-only reporting.

For instruction-first jobs that require evidence gathering before generation,
Core also exposes a provider-neutral bounded evidence-loop coordinator. A domain
registers a small allowlist of tool descriptors and supplies the tool executor;
Core validates each model decision, rejects unknown or repeated calls, caps
iterations, tool calls, and accumulated evidence bytes, propagates cancellation,
and returns content-free trace/accounting metadata with the final candidate.
Domain adapters own their tools and evidence projection (for example, browser
navigation and DOM inspection remain outside Core). Provider execution still
runs through the existing grant and per-run budget boundaries, and the final
candidate must pass its existing typed validator and review lifecycle before it
can become durable behavior.

Harness outputs are strict structured records. Diagnosis, runtime patch,
change proposal, and instruction suggestion responses are validated before they
become intervention evidence. Runtime patches are temporary run-context
instructions only, while durable router/subflow/expectation/action-target edits
must become proposal/adaptation records and pass the existing validation gates.
Outputs that contain executable code, scripts, function bodies, unsupported
patch kinds, missing targets, or unsafe broad rewrites are rejected as
diagnostics rather than applied.

Live patch testing executes temporary fixes against a cloned Flow and current
run context. It supports bounded action sequences, wait/retry adjustments,
target overrides, recovery subflow calls, and temporary reroutes. Preflight
checks adaptation policy and side-effect approval before execution. A
successful patch can mark the original action retryable and produce a candidate
adaptation; structural fixes are reviewed through the same adaptation surface
according to approval mode. Failed patches remain run evidence and rejected
adaptation candidates.

Adaptations are reviewable change evidence. The Adaptations workspace groups
them by status, shows trigger/diagnosis/failed action/patch/validation/risk
detail, and routes review actions through privileged service mutations.
Promotion is gated by successful validation, risk, structural review links,
target presence, and disabled/rejected state. Applying an adaptation records a
reversible application record instead of silently editing Flow JSON; structural
changes continue through adaptation review.

Training modes make adaptation temporary and explainable. Normal mode keeps
LLM intervention and adaptation creation off by default. Train-for-N-runs and
train-until-stable enable adaptive behavior only inside an explicit window,
while continuous adaptive mode keeps learning open. Stability metrics combine
deterministic successful runs, LLM interventions per run, unresolved failures,
repeated triggers, accepted/rejected adaptations, and time since structural
change. Budgets cap interventions, tokens, and cost, and frozen Flow/route/
subflow scopes can collect evidence without auto-applying structural changes.

## Canonical Node Definition Foundation

New Flow authoring uses `AutomationStudioNodeDefinition` and the scope-aware
`AutomationStudioNodeRegistry`. The contract describes a node's identity and
version, display/category metadata, ports, parameters, source, availability,
behavior capabilities, runtime capability requirements, safety requirements,
and optional legacy scope. It supports framework built-ins, importer-native
nodes, trusted-local Code Nodes, composite Flows, and recording-derived nodes.

Existing `AutomationNodeDefinition` built-ins remain the executable registry
used by the current runtime. They are adapted into canonical definitions with
stable implementation keys; no executor behavior changes in this migration
slice. The adapter maps legacy Routine-category built-ins into the future
`flow` category while retaining their legacy scope metadata for compatibility.

Importers can provide a declarative `AutomationStudioImporterNodeManifest` for
their configured domain source root. Each importer node must be bound to the
same domain in both its source and availability metadata. Registry resolution
then requires an exact global/domain match plus any declared runtime
capabilities and permissions. A domain definition therefore cannot appear in
the global palette or another domain merely because its manifest is registered.

The manifest remains a registration boundary, not a dynamic-code loader.
Importer implementations execute only after the host explicitly binds a
matching package/version implementation bundle. The trusted-local runtime
checks grants, declared ports, timeouts, cancellation, output contracts, and
trace redaction. It is not a sandbox and does not contain hostile code.

## Legacy Task/Routine Flow Compatibility

`model/flow-compatibility.ts` provides a pure, read-only bridge from the
current Task/Routine artifact catalog to canonical Flow-shaped entries. A
legacy Task becomes a private `migrated` Flow with recording evidence, signal
registry, and task graph provenance. A Routine becomes a private `migrated`
Flow with its referenced orchestration graph and task-list provenance.

`resolveAutomationStudioFlowCatalog` accepts a project scope, canonical Flow
artifacts, and the existing legacy artifact catalog. It returns a unified,
deterministically ordered list whose legacy entries are explicitly marked
read-only. It also assigns collision-safe synthetic IDs rather than reusing
the legacy Flow document's ID, keeping future canonical persistence separate
from the legacy source.

The resolver does not save, delete, or rewrite any artifact. Current runtime
execution and editor routes continue to use their legacy records until the
canonical Flow storage/API migration is introduced. This separation preserves
recordings, policy graph links, and recovery options while providing a safe
model for the later UI migration.

## Canonical Flow Persistence and Migration

Canonical Flows now persist as project-owned files under
`.fluxiq/artifacts/automation-studio/projects/{projectId}/flows/{flowId}`.
`flow.json` is the authoritative Flow document, `source/` contains generated or
code-owned Flow source, and `indexes/flows.json` is the lightweight list view.
The runtime may cache Flows in memory, but it reloads from project files after a
restart. SQLite-backed framework repositories are not the ownership layer for
Automation Studio Flows, recordings, proposals, or visual state assets.

The browser interaction model is summary-first and scoped. Opening a project
loads only the project chooser, hierarchy, Flow summaries, recording summaries,
runtime summaries, domains, and workspace layout needed to draw the shell.
Selecting a view, pane, tab, row, or graph node is local UI state and must not
write hierarchy preferences or trigger a project-wide reload. Workspace layout
and active-view state live in a dedicated external render store subscribed by a
memoized workspace boundary; they are not React state owned by the project-data
controller. A UI commit paints that boundary synchronously and schedules its
exact UI-cache write. Parent commits are gated by an explicit shallow input
vector, so overlay and chrome state cannot reconcile the workspace shell;
project-data changes refresh it only when a declared data reference changes.
Data hydration is never the mechanism that makes a selected view appear. Successful
creates, deletes, renames, router edits, settings saves, and recording/runtime
mutations update the exact local collection they affect, emit typed mutation
metadata, and let the project change feed reconcile matching entity caches.
Project opening snapshots the workspace preferences and hierarchy UI revisions
after reset. Late durable or cached hydration may update a surface only while
that surface still has the captured revision, so user tab/layout actions and
hierarchy selection/disclosure actions cannot be rolled back by background
hydration even when the project generation itself is still current.
Root summary refresh is reserved for explicit user reloads, project open, and
named recovery actions after a diagnostic says the feed event lacked enough
payload to reconcile locally.

`AutomationStudioService` exposes dedicated Flow operations:

- `createFlow`, `getFlow`, `saveFlow`, and `deleteFlow` operate only on
  canonical Flow artifacts;
- `listFlows` combines canonical Flows with explicitly read-only legacy
  compatibility entries;
  hierarchy projection resolves entries by Flow ID before generating rows,
  with the canonical entry winning over a legacy compatibility duplicate so
  every rendered tree item has one stable identity;
- `publishFlow` records an immutable published interface/version snapshot and
  its dependency digests with the project-owned Flow document;
- `listFlowPublications`, `deprecateFlowPublication`, and
  `inspectFlowDependencies` expose version history, non-destructive
  deprecation, callers, dependencies, and explicit upgrade candidates;
- `inspectFlowMigration` reports exactly what a legacy project would create;
  and
- `migrateFlows` writes canonical copies and a durable ledger while preserving
  every legacy source artifact unchanged.

The corresponding API endpoints use `programs.read` for list/get and
`flows.write` for authoring, publishing, deprecation, and inspection. Mutating
operations retain the existing authorization-PIN recheck.

Legacy compatibility is governed per project. Projects begin at schema `0.1`
in `compatibility`; Task/Routine writes return structured deprecation
diagnostics while reads remain available. After migration inventory, importer
coverage, and backup verification are recorded, an explicit schema `0.2` seal
locks legacy writes. The seal does not remove source documents or read adapters.
Policy-proposal approval now writes canonical recorded-origin Flows instead of
creating Task-owned Flow documents.

Migration is explicitly idempotent. A repeat inspection recognizes canonical
Flows by their Task/Routine provenance and reports `already_migrated`; it does
not create another copy. The legacy source itself is the recovery source and
its stable `backupId` is recorded in the migration ledger. There is no
automatic deletion or in-place rewrite. A partially completed apply records
blocked outcomes and can be safely inspected and rerun after the cause is
resolved.

Migration now creates a digest-verified legacy backup and a durable ledger.
Migration outcomes remain fixed; rollback adds only the lifecycle timestamp
`rolledBackAt` and a separate append-only audit event.
Rollback planning refuses to remove a migrated Flow if it was edited, published,
or lost its source provenance. Successful rollback removes only unchanged
canonical copies and appends an audit event; the legacy source was never
modified. See the [legacy retirement runbook](../operations/automation-studio-legacy-retirement.md).

## Pipeline Contracts

The first slice also defines contract-only homes for upcoming stages:

- `normalization` owns `NormalizedTimeline`, checkpoint policy, normalization
  issues, and the `TimelineNormalizer` interface.
- `mining` owns mining windows, action-effect candidates, learned condition
  candidates, mining results, and the `SignalMiner` interface.
- `learning` owns the intermediate `LearnedTaskModel`, action clusters,
  learned effects, transitions, uncertainties, and the `TaskModelLearner`
  interface.
- `fingerprinting` owns node scoring contributions, candidate scores, scoring
  context, the `FingerprintScorer` interface, and common element fingerprint
  matching used by recording mappers and native runtime output logic.

## Validation Boundary

Automation Studio has lightweight validation helpers for the first slice:

- `validateRecordingSession`
- `validateSignalRegistry`
- `validatePolicyGraph`

The validators catch structural issues such as duplicate IDs, non-increasing
timeline sequences, invalid weights, invalid edge probabilities, missing edge
targets, empty condition groups, and note links that no longer resolve.

Validation should run before later stages consume an artifact. The intent is
not to prove that a policy is correct, but to prevent malformed evidence from
flowing into normalization, mining, graph generation, or runtime execution.

## Program Workspace UI

Workspace composition, hierarchy behavior, project lifecycle, scoped store
ownership, typed view hosting, domain view boundaries, browser-neutral cache and
synchronization, style ownership, and UI performance contracts are documented
in the [workspace and authoring UI guide](automation-studio/workspace.md).

The web workspace is a long-lived client application. It publishes a project
shell and visible selection synchronously, then hydrates bounded summaries and
selected detail asynchronously under an abortable project-generation guard.
Project-scoped external stores use selector-aware subscriptions and atomic typed
transactions so unrelated data or view changes do not rerender the whole
workspace.

`AutomationStudioLive.tsx` is now only the client entry facade. The modular live
composition wires project-scoped stores, domain runtimes, workspace regions,
and overlays; domain views remain owned by their feature directories.

Canonical views have one typed definition containing ID/aliases, metadata,
availability, lifecycle, cache schema, functionality, and host binding. The
workspace resolves the definition and component host at render time instead of
eagerly constructing every view or passing all domain data through an aggregate
renderer. Hidden warm views follow their declared mount policy. Retired Config
and proposal-workbench IDs are migrated when context permits or render explicit
recovery UI; they never become parallel current views.

Current editor vocabulary is Flow-first. Legacy Policy document adapters,
persisted renderer discriminants, scope/family values, CSS hooks, and deprecated
aliases remain compatibility boundaries rather than current product concepts.
Browser performance certification is pending until the manual profiling and
scale procedures pass on documented hardware.

## Canonical Persistence

Canonical storage ownership, recording pipeline documents, Flow artifacts,
adaptation compatibility data, and runtime-session persistence are documented in
the [persistence guide](automation-studio/persistence.md).

## Flow-first Authoring UI

Automation Studio presents one **Flows** tree for project automation. Creating a
Flow writes the canonical Flow repository directly; users do not choose between
Task and Routine authoring modes. A top-level Flow owns Router, Subflows,
Instructions, Recordings, Adaptations, Runtime Debug, and Settings. A Subflow
owns its Nodes editor and scoped supporting objects, but routing remains a
top-level Flow responsibility.

The shared Flow editor owns graph node and edge edits. Settings own typed
identity, execution, LLM, adaptation, interface, error, variable, visibility,
and capability configuration. Instructions are first-class scoped objects.
State is a global inspection view that can follow a Flow, Subflow, recording,
node, or run without becoming a Flow hierarchy object.

The project workbar owns project-level undo, redo, play, pause, stop, and Save
Project controls. Graph canvases publish active history commands to that bar
instead of rendering a competing graph-save button. Save Project authorizes
once and saves every dirty mounted editor in the open project, including Flow
or Subflow Nodes, Settings, and Instructions, while workspace/hierarchy
preferences continue through their debounced persistence path. Authorization
uses the in-product modal exclusively; registered editors receive that same PIN
without opening native browser prompts. A failed editor write keeps the modal
open and reports the persistence error instead of presenting a false success.
The active graph editor supplies its current node and edge refs directly to the
save command; deferred draft/recovery publication is never used as the save
payload, so an immediate save cannot persist the preceding editor snapshot.
A returned
Subflow graph is reconciled with its immutable parent Flow/Subflow ownership
metadata so saving nodes cannot temporarily detach or hide the Subflow UI.
Successful graph writes also replace the session's Flow-detail cache. Summary
refreshes and older detail responses cannot replace a newer loaded graph, and
explicit reload bypasses the cache. When project hydration has only a
summary-only Flow stub—or a selected Subflow backing graph is not in the
summary collection—Subflow navigation hydrates that owned graph before opening
its Nodes view, and the active connector refreshes stale canonical summaries by
ID through the bounded `get-graph-viewport` v2 API. The server
imports a legacy monolithic graph into project graph storage when necessary;
the browser follows cursors, composes the bounded pages, and never calls the
retired `get-flow` document endpoint. Summary-only cache entries are never
accepted as hydrated graphs. The Nodes surface remains in a loading state
instead of initializing an empty canvas, then exposes the request error and an
explicit retry action if detail hydration fails. Subflow Settings loads parent
Flow ports and settings through `get-flow-metadata-detail` rather than the
retired full-document read.

Generated Subflows and nested Subflow categories are true hierarchy containers.
Their disclosure controls remain user-operable even while a Subflow is the
active graph. Router empty state creation resolves the generated Subflows
container by its canonical flow-structure marker, so it uses the same typed
creation transaction as the hierarchy add menu. Subflow Settings treats its
main record as required and ancillary parent/instruction/router data as
independent requests; a transport failure renders an actionable error rather
than leaving the Settings view in a permanent loading state.

Adaptations are the current user-facing review surface for LLM-assisted changes.
Legacy proposal records and view IDs may remain for persistence compatibility
and explicit read-only recovery, but proposal generation is not a current
navigation object or current authoring workflow.

Existing Task and Routine artifacts may still be exposed through explicitly
labelled, read-only compatibility paths. Migration to a canonical Flow is an
explicit operation; normal Flow editing must not silently mutate a legacy
source.

## Published Flow composition

Publishing a Flow creates a digest-backed immutable snapshot of its graph,
typed interface, scope, and declared errors. Automation Studio can project that
snapshot into a composite node definition for projects in the same scope. A
Call Flow node pins the target Flow ID and semantic version, so later draft
changes cannot alter a caller unexpectedly.

Ordinary Flow saves cannot create, rewrite, truncate, or change publication
history. Only publication lifecycle endpoints may append or deprecate versions.
Published snapshots pin every resolved non-composite node-definition version;
unknown, out-of-scope, or version-mismatched definitions block publication.

Composition validation rejects missing or deprecated versions, invalid or
incomplete port bindings, unavailable/private targets, missing runtime
capabilities, and direct or indirect dependency cycles. Call Flow uses explicit
input, output, and error bindings; child ambient inputs are never injected.
The runtime applies caller retry policy, propagates cancellation and remaining
deadlines, and retains the child trace plus exact target Flow/version/digest on
the parent call-node attempt.

Same-scope calls require a public pinned target. Domain-to-global calls may use
only globally available capabilities. A global-to-domain call requires both an
explicit per-run domain grant and the importer runtime actually bound to that
domain; naming a domain Flow cannot acquire its capabilities. The editor lists
publication history, dependencies, callers, and reviewed upgrade candidates.
Upgrading changes the pinned version only after confirmation and leaves the
caller dirty until it is saved.

## Client Gateway

Pairing, trust, transport, external recording clients, and host action dispatch
are documented in the [client gateway guide](automation-studio/client-gateway.md).

## Domain Boundary

The core model does not assume screenshots, DOM nodes, games, browsers, pointer
events, or any private domain behavior. Those are domain implementations of
generic concepts:

- observations produce state signals;
- actions dispatch through declared action channels;
- notes remain first-class evidence;
- policy nodes decide when an action is eligible, ready, successful, failed, or
  unsafe to continue;
- evidence references preserve the path back to recordings, notes, mined
  signals, generated nodes, and runtime attempts.

Host projects own domain-specific adapters, recordings, generated policies, and
runtime artifacts.

## Domain IO execution boundary

An importing repository registers domain inputs and optional outputs through the
framework IO registry. Inputs are classified as state, event, telemetry, or
action. A recorded action becomes executable only when that input explicitly
binds to a registered output ID. The generated policy stores that output ID and
payload, not an arbitrary event type or host script.

During a runtime session, Automation Studio resolves `builtin.policy.action`
as an output dispatch effect. FluxIQ validates that the output is registered
for the active domain and calls its importer-owned `dispatch` adapter. Output
definitions supply the editor-facing title, description, schema, capabilities,
and safety metadata. The framework therefore remains neutral about whether an
output ultimately uses a browser API, RPC, hardware device, or another runtime.

An action input bound to an output remains a live stream during runtime. It is
not eligible as policy state, but the generated output node awaits that input
as confirmation after dispatch by default. A missing confirmation fails the
node after its configured timeout; importers may explicitly disable confirmation
for intentional fire-and-forget outputs.

## Near-Term Build Order

The next Automation Studio slices should build on the first contracts in this
order:

1. Persist canonical recordings, registries, and policy graphs through the
   Automation Studio repositories. Done for in-memory canonical repositories.
2. Add a conservative timeline normalization pass using the normalization
   contracts.
3. Add fingerprint scoring over `StateSnapshot` and `PolicyNode` conditions.
4. Build the minimal runtime controller around node scoring, action dispatch,
   expectation tracking, retry, and recovery.
5. Add deterministic mining stages for action windows, change detection,
   relevance scoring, and learned requirements.
6. Introduce the learned task model between mined evidence and generated policy
   graphs.

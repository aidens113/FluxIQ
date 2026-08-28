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
`graphFlowId` through the existing canonical Flow executor. Existing single
graph Flows can be projected as a generated primary default subflow, so current
execution behavior remains compatible while router/subflow authoring matures.

Route decisions are persisted in Flow run detail. The record includes selected
rule/subflow, rejected rule IDs, fallback use, decision time, evaluation count,
and optional reroute source metadata. The summary index stores only counts and
navigation fields; users open a specific run detail to see the full route and
subflow boundary trace.

Runtime action attempts now carry deterministic transition comparisons before
any LLM diagnosis is considered. Each attempt records expected transition
hints, actual status/route/output/effect data, a normalized comparison status,
and a compact diff summary. Failed attempts pass through the recovery ladder in
priority order: configured failed-route path, approved runtime patch, graph
local recovery reroute, then LLM diagnosis fallback. Recovery budgets can cap
retries per action, recovery attempts per subflow, reroutes per run, and
adaptation/LLM attempts per run; exhausted budgets produce terminal failure
metadata instead of looping.

Subflows are persisted as Flow-owned behavior units with route tags,
input/output mapping, graph reference, local instruction IDs, proposal-mode
override, and stability metrics. New subflows receive an isolated graph Flow by
default so editing a subflow does not mutate the parent Flow/router graph. The
Subflows workspace is only a paginated directory; selecting a row resolves the
subflow's graphFlowId and opens that graph in the normal Flow editor. Backing
subflow graph Flows are not shown as separate top-level Flows.
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
Root summary refresh is reserved for explicit user reloads, project open, and
named recovery actions after a diagnostic says the feed event lacked enough
payload to reconcile locally.

`AutomationStudioService` exposes dedicated Flow operations:

- `createFlow`, `getFlow`, `saveFlow`, and `deleteFlow` operate only on
  canonical Flow artifacts;
- `listFlows` combines canonical Flows with explicitly read-only legacy
  compatibility entries;
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

Workspace composition, hierarchy behavior, recording and proposal surfaces,
node editors, window management, and project operations are documented in the
[workspace and authoring UI guide](automation-studio/workspace.md).

## Canonical Persistence

Canonical storage ownership, recording pipeline documents, task artifacts,
and runtime-session persistence are documented in the
[persistence guide](automation-studio/persistence.md).

## Flow-first authoring UI

Automation Studio presents one **Flows** tree for project automation. Creating a
Flow writes the canonical Flow repository directly; users do not choose between
Tasks and Routines. Blank, deterministic, recorded, integration, scheduled,
API-endpoint, and reusable presets all create the same canonical artifact with
safe initial metadata and graph content.

The shared visual editor owns graph node and edge edits. Flow-level settings
such as name, description, typed input/output interfaces, declared errors,
variables, timeout/concurrency defaults, publication intent, and authorized
domain grants belong to generated Flow configuration/source artifacts instead
of the canvas header. Each canonical Flow save materializes a generated config
artifact under the project `configs/` artifact folder and keeps that artifact
out of legacy backup/digest calculations. Flow and task rows expose a gear
action in the hierarchy sidebar that opens the corresponding configuration
view. Running, switching Flows, closing the project, browser navigation, and
window close protect unsaved visual graph edits. The palette is grouped by
built-ins, importer integrations, domain nodes, published public Flows, project
nodes, trusted-local code nodes, and policy/evidence nodes.

Existing Task and Routine artifacts are exposed through the Flow compatibility
catalog as labelled legacy entries. They are intentionally read-only in the
editor: editing or deleting one cannot silently mutate its legacy source.
Projects can explicitly migrate those entries using the Flow migration API,
after which the canonical copy is editable through the same Flow editor.

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

# Automation Studio Canonical Persistence

[Back to the Automation Studio overview](../automation-studio.md)


Automation Studio project artifacts are owned by the project file tree under
`.fluxiq/artifacts/automation-studio/projects/{projectId}`. Runtime
repositories are caches used by service code and tests; they are not the source
of truth for recordings, proposals, Flows, state assets, or runtime runs.

The v2 scalable architecture is certified with the Phase 12 report described in
`docs/operations/automation-studio-scale-certification.md`. Release candidates
must attach passing evidence for the full scale matrix, 24-hour stream and
subscription soaks, crash recovery, heap retention, critical query/payload
budgets, backup restore, deterministic compiled-plan replay, documentation
freshness, and feature-flag removal gates before the legacy compatibility path
is retired.

The canonical project layout is:

```text
projects/{projectId}/
  project.json
  hierarchy.json
  workspace.json
  indexes/
    recordings.json
    proposals.json
    flows.json
    routers.json
    subflows.json
    instructions.json
    change-proposals.json
    runs.json
    adaptations.json
    adaptation-policies.json
    objects.json
    pipeline.json
  recordings/{recordingId}/
    index.json
    recording.json
    timeline.jsonl
    snapshots/
    objects/
    derived/
  proposals/{recordingId}/{proposalId}/
    proposal.json
    generation.json
    review.json
    objects/
  flows/{flowId}/
    flow.json
    router.json
    instructions/
    subflows/{subflowId}/
      subflow.json
    change-proposals/{proposalId}/
      proposal.json
    adaptations/{adaptationId}/
      adaptation.json
    adaptation-policies/{policyId}.json
    source/
    publications/
  runtime/runs/{runId}/
    run.json
    route-decisions.jsonl
    subflows.jsonl
    interventions.jsonl
  runtime/sqlite/
    global.sqlite
  objects/shared/
```

Indexes are lightweight navigation summaries. List/sidebar reads use them
without hydrating timelines, proposal graphs, screenshots, or state snapshot
objects. Full documents are loaded only when a tab or operation requests them.
The proposal workbench uses `get-proposal` to hydrate one selected proposal by
ID; project refresh must not call the broad `list-pipeline-artifacts` endpoint
just to make proposal rows clickable.

Project change feed rows are the normal synchronization contract between
mutations and the browser. Each row carries project ID, entity kind, entity ID,
operation, revision, changed timestamp, and optional parent or hierarchy scope.
Normal mutation paths invalidate cache entries by those typed entity IDs only;
they do not implicitly include the `root` summary resource. Payload-free create
events or unsupported delete events may emit a recovery diagnostic, but the
caller must choose an explicit reload/recovery path before hydrating broad
project state again.

## Browser Cache Ownership

Canonical project files, indexes, and SQLite rows remain authoritative. The web
feature has two non-canonical acceleration layers:

- an in-memory data cache with TTL and typed project/resource scopes for
  summaries and selected domain documents; and
- a UI cache for workspace preferences and hierarchy sidebar state, keyed by
  schema version, user, project, and cache kind.

The UI cache backend is an interface, not a browser-product dependency. The
current local fallback uses bounded `localStorage`; the program-API adapter
mirrors the same envelopes through project UI-cache endpoints. Hydration and
writes run as idle/background work, writes are debounced, and both project
generation checks and per-surface revision checks prevent a late cache read
from overwriting a newer project interaction. Project opening records the
workspace preferences revision and hierarchy UI revision after reset. Durable
or cached state may replace one of those surfaces only while its recorded
revision is still current; interacting with the workspace or hierarchy makes a
later response stale for that surface without blocking hydration of unrelated
project data.
Durable `workspace.json` preferences preserve the complete declared state for
each view, including its selection when the view records one. The selected
Flow editor node also carries its owning Flow ID, allowing project reload and
tab reopen to restore the graph without confusing an inspector selection for a
different graph. Persisted selections are validated before hydration publishes
them. Pointer-hover state, open overlays, and hydrated domain documents are not
part of the workspace record.

Neither cache owns Flow, run, recording, instruction, adaptation, or State
truth. Warm mounted views may preserve local component state during a session,
but arbitrary hydrated detail is not promised across reloads. Cache misses and
stale entries must fall back to bounded asynchronous reads behind a stable
loading surface; they must never block selection or authorize a mutation.

Stable file document IDs are:

| Artifact | Full document | Summary index |
| --- | --- | --- |
| `RecordingSession` | `recordings/{recordingId}/recording.json` plus `timeline.jsonl` | `indexes/recordings.json` |
| State snapshot/object | `recordings/{recordingId}/objects/` or `objects/shared/` | `recordings/{recordingId}/index.json` and `indexes/objects.json` |
| Policy proposal | `proposals/{recordingId}/{proposalId}/proposal.json` | `indexes/pipeline.json` and proposal summaries |
| Recording Flow proposal | `proposals/{recordingId}/{proposalId}/proposal.json` | `indexes/pipeline.json` and proposal summaries |
| Canonical Flow | `flows/{flowId}/flow.json` | `indexes/flows.json` |
| Flow router | `flows/{flowId}/router.json` | `indexes/routers.json` |
| Flow subflow | `flows/{flowId}/subflows/{subflowId}/subflow.json` | `indexes/subflows.json` |
| Scoped instruction | `flows/{flowId}/instructions/{instructionId}.json` or `instructions/{instructionId}.json` | `indexes/instructions.json` |
| Change proposal | `flows/{flowId}/change-proposals/{proposalId}/proposal.json` | `indexes/change-proposals.json` |
| Flow run detail | `runtime/runs/{runId}/run.json` plus JSONL sequence mirrors | `indexes/runs.json` and SQLite `flow.runs` |
| Flow adaptation | `flows/{flowId}/adaptations/{adaptationId}/adaptation.json` | `indexes/adaptations.json` and SQLite `flow.adaptations` |
| Adaptation policy | `flows/{flowId}/adaptation-policies/{policyId}.json` | `indexes/adaptation-policies.json` |
| Flow source | `flows/{flowId}/source/` | Flow metadata |
| Runtime run | `runtime/runs/{runId}/run.json` | runtime index |

Route testing is read-only and performs no persistence. The test-flow-map-route-condition endpoint accepts a canonical condition expression and structured sample input/state, evaluates it with the runtime matcher, and returns only the match result and explanation.

The mutate-flow-map-route endpoint owns atomic move_up, move_down, duplicate, toggle, and delete commands. The service reads one canonical router, applies the command, normalizes route order, validates the complete result through saveFlowRouter, and performs one persistence write. Duplicate IDs are newly generated and duplicate names are collision-safe.

Route condition edits distinguish omission from removal. SaveFlowMapRouteRequest.clearCondition tells AutomationStudioService.upsertFlowMapRoute to remove both the canonical condition and its readable summary; omitted condition fields continue to preserve compatibility for partial callers. Visual text, number, and boolean controls serialize expected values with their intended JSON type.

Router fallback behavior is a first-class validated router mutation. The save-flow-map-fallback endpoint persists either a subflow target or a terminal message through AutomationStudioService.setFlowMapFallback; it does not synthesize a route rule. Group lifecycle metadata remains on the canonical router document, and deleting a group removes group references while preserving its routes.

Visual Flow drafts are recovery data, not canonical project artifacts. The web editor stores one JSON-safe draft record per project/Flow in browser storage under an encoded `fluxiq:automation-graph-draft:` key. Each record includes `baseUpdatedAt`, `savedAt`, and the React Flow graph presentation needed to restore the editor. Writes are debounced and navigation cleanup flushes the latest pending draft. Successful canonical saves and explicit discard remove the record.

Canonical Flow saves use optimistic concurrency. `SaveFlowRequest.expectedUpdatedAt` carries the revision from which the draft began. `AutomationStudioService.saveFlow` compares it with the currently persisted Flow before mutation and throws `FLOW_SAVE_CONFLICT` on mismatch. The handler performs no repository, source-file, generated-config, or index write after this rejection. Callers that omit the field retain compatibility, while interactive editor saves always provide it.
Newly created subflows receive a dedicated canonical Flow document for their
internal graph. The subflow stores that Flow ID in `graphFlowId`, and the graph
Flow records `metadata.subflowGraph`, `metadata.parentFlowId`, and
`metadata.parentSubflowId`. This keeps subflow graph drafts and saves isolated
from the parent Flow's router and top-level graph. Subflow-specific settings are
stored on the `AutomationStudioFlowSubflow` document: role, route tags, input and
output mappings, local instruction IDs, and an optional proposal-mode override.
Clearing that override removes the field so runtime policy inherits from the parent Flow. Settings resolve mapping choices from canonical parent/subflow Flow interfaces and persist only their stable port IDs after name/type validation. Instruction bindings likewise persist stable instruction IDs selected from compact named summaries. Lifecycle changes continue through the dedicated enable, disable, and archive mutations instead of adding a second status write path. Interactive Subflow Settings writes carry expectedUpdatedAt; AutomationStudioService rejects stale revisions with SUBFLOW_SAVE_CONFLICT before mutation. Flow Settings already uses the canonical SaveFlow expectedUpdatedAt contract. Both clients preserve local drafts on conflict and require an explicit reload/review rather than silently overwriting concurrent changes.

The Flow summary index carries subflow ownership plus compact hierarchy metadata
so workspace navigation can exclude internal graph Flows and reconstruct subflow
rows, display names, category placement, recursive Subflow containers, and their scoped objects without
loading every Flow document. The hierarchy summary contains navigation metadata
only; graph nodes, edges, settings, and other Flow detail remain in `flow.json`.
Indexes created before ownership or hierarchy fields use missing metadata-version
markers. The first summary read repairs that legacy index once from canonical
Flow documents and persists both markers; later reads remain summary-only.
Partial Flow updates and deletes preserve a missing marker until the complete
repair runs.

Hierarchy navigation has a dedicated SQL sibling-page contract. The
`list-project-hierarchy-children` endpoint accepts `projectId`, an exact
`parentId` (or `null` for roots), an opaque cursor, and a bounded limit. The
repository filters deleted rows in SQL, constrains the query to that exact
parent, and orders by `sort_key, entry_id`. Its cursor carries both ordering
values, so equal sort keys remain stable across pages. The service defaults to
100 rows and clamps requests to 1-500; the browser decoder applies its own
250-row safety bound, while the hierarchy pager requests the smaller UI row
page size.

The browser owns independent sibling-page state per parent. Its pager tracks
cursor, `hasMore`, loading, invalidation, and errors by parent key, aborts stale
project requests, and exposes exact-parent load-more and retry commands. SQL
rows are merged by stable hierarchy entry ID with static/system nodes already
available from project summaries. Static nodes remain visible during project
activation and first-page hydration, and a remote row never duplicates the
same static ID. If an older project has no SQL hierarchy rows, the first
cursorless empty read imports the legacy hierarchy once and retries the page.
This compatibility import does not make the file summary the ongoing paging
engine.

Subflow directory summaries are synchronized into the project SQLite store as
`flow.subflows` records. `list-flow-subflows` applies Flow, status, role,
case-insensitive name/ID search, sorting, count, limit, and offset in SQL.
Canonical Subflow writes update JSON detail, the compatibility summary index,
and SQLite; deletion removes all three. Modern `saveFlowSubflow` writes always
persist a `graphFlowId`, generating the deterministic
`{flowId}.{subflowId}.graph` ID when the caller omits it.

Older canonical Subflow JSON without `graphFlowId` remains read-compatible.
When that record is projected into SQL, the service derives the same
deterministic ID, loads an existing graph Flow when present, or synthesizes and
persists an empty isolated graph Flow from the parent Flow before inserting the
Subflow SQL row. This compatibility projection does **not** rewrite the older
Subflow JSON document or its compatibility summary. Canonical backfill occurs
only if the Subflow later passes through the normal save path; summary-version
or SQLite projection repair must not be interpreted as detail-document
backfill.

Router SQL projection is dependency ordered. Before replacing a Router
projection, the service resolves every Subflow referenced by a route or
fallback and projects that Subflow and its resolvable graph Flow first. Router
foreign keys therefore never depend on Router-first fixture or migration
ordering. Duplicating a Subflow clones its canonical graph into a new
independently owned graph Flow. Deletion removes that graph Flow plus the
Subflow JSON and summary records, and is refused while any Router route or
fallback still targets the Subflow. In-memory installations preserve equivalent
filter and paging semantics. The SQL directory contract is guarded with
10,000-summary deep-page and combined-filter tests; each local query must remain
below 500 ms and no response may exceed the 50-row UI cap.

## Router, runtime, and diagnostic paging contracts

Automation Studio paging cursors are opaque base64url envelopes at version 1.
Every envelope binds a stable owner, a hash of normalized filters, and the last
sort tuple. A cursor from another project object or another filter set is
rejected rather than silently restarting or changing the result set. New list
clients should use the cursor. The legacy runtime action offset and runtime
event `afterSequence` inputs remain read-compatible while cursor consumers are
deployed.

| Collection | Cursor owner and stable sort tuple | Filters and totals | Request limit | Supporting index |
| --- | --- | --- | --- | --- |
| Router subflow targets | `subflow-targets:{flowId}`; `lower(name), subflow_id` ascending | status, role, case-insensitive name/ID search; exact total | default 50, maximum 200 | `subflows_target_lookup_idx(parent_flow_id, status, name, subflow_id)` |
| Router routes | `router-routes:{routerId}`; `priority, route_id` ascending | group/ungrouped, active/disabled, case-insensitive route/target search; exact total plus active, disabled, and per-group counts | default 100, maximum 200 | `router_routes_page_idx(router_id, group_id, enabled, priority, route_id)` |
| Router target references | no cursor; one bounded batch of at most 50 Subflow IDs | exact route-plus-fallback total per target and a capped route preview | default 20, maximum 200 per target | `router_routes_target_page_idx(router_id, target_kind, target_subflow_id, priority, route_id)` |
| Run actions | `run-actions:{runId}`; `sequence, attempt_id` ascending | no ordinary filters; exact total from the run projection | default 50, service maximum 100 | `runtime_action_summaries_page_idx(run_id, sequence, attempt_id)` |
| Run events | `run-events:{runId}`; sequence ascending | no ordinary filters; `hasMore` and last sequence from chunk metadata | default 100, maximum 200 | ordered `runtime_event_chunks` sequence bounds and stream chunk indexes |
| Project problems | `project-problems:{projectId}`; severity rank, source, problem ID ascending | severity, source, open/resolved status, object scope, and text search; exact total and severity counts | default 100, maximum 200 | bounded server diagnostic source; it does not call the broad Studio snapshot |
| Client Gateway items | `client-gateway:{sessions|pairings|trustedClients}`; public item ID ascending | case-insensitive scalar search; exact per-kind total plus summary counts | default 50, maximum 200 | Gateway-owned live maps; snapshots return counts and empty collections |

`get-flow-router-summary` returns fallback and group metadata without route
rules. Group description, explicit order, status, collapsed state, timestamps,
and metadata are columns added by migration
`0012_router_runtime_summary_details`; mappings preserve them in both
directions. `list-flow-router-routes` returns one SQL page and its counts, and
`get-flow-router-graph-summary` returns compact nodes and edges for one page.
`list-flow-router-target-references` accepts at most 50 Subflow IDs, reports
an exact reference total for each, and returns only a capped preview. Migration
`0013_router_target_reference_index` owns its lookup index. Preload,
instruction targeting, and runtime readiness use the Router summary; Subflow
directory and settings reads use the compact reference batch. The Router UI
does not obtain a full route map and then slice it locally.
Searchable target pages make subflows beyond the first 100 reachable without a
full subflow-directory load.

Runtime migration `0011_router_runtime_scaling` adds scalar action summaries.
Migration `0012_router_runtime_summary_details` adds definition ID, route,
comparison status, and message summary fields. New writes populate those fields
from the real action attempt. Legacy rows carrying the additive migration's
`unknown` definition default are detected and reprojected from the event
stream before they are returned. Ordinary action pages exclude evidence,
effects, and raw JSON; `get-flow-run-action-detail` loads one selected action.
Runtime event pages omit payloads, append by event identity, preserve the
existing scroll coordinate, and virtualize rendered rows.
`get-flow-run-event-detail` loads one selected payload. Browser requests use
both abort signals and generation checks so obsolete pages or details cannot
replace the active run.

The migrations are additive. The full `get-flow-router` endpoint remains only
for runtime execution, mutation internals, exports, and documented legacy
compatibility; browser preload, list, settings, instruction, and readiness
paths block it as a full-document endpoint. A deployment can roll the web
client back without reverting the database because old readers ignore the
added tables, columns, and indexes.
Schema rollback is backup restoration, not destructive down migration: stop
writes, restore the pre-migration project database, and restart the prior
binary. Remove compatibility reads only after endpoint telemetry shows no
legacy UI callers and backfill verification confirms action-summary counts and
non-placeholder definition IDs for retained runs.

Flow expansion run details are deliberately split from run summaries. The
previous-runs view reads `list-flow-runs` with SQL `limit`/`offset`
pagination, optional Flow/status filtering, case-insensitive run/Flow ID search, and summary-only rows. Updated, started, duration, action-count, and status sorts are allowlisted SQL expressions with explicit ascending/descending direction and a run-ID tie-breaker, so equal-sort pages remain stable. Page sizes are clamped to 1-100 and count/filter/sort are applied before `limit`/`offset`; the in-memory fallback preserves the same semantics. A selected row then
uses `get-flow-run-detail` to hydrate exactly one detail document. Adaptation
history follows the same pattern with `list-flow-adaptations` and
`get-flow-adaptation`; when project storage is enabled, Flow/subflow filters
are applied in SQLite before rows are returned to the service.

Run detail stores compact action-attempt and recovery-attempt records for the
runtime debug UI. The normal UI requests compact run detail with no embedded
actions, then uses `list-flow-run-actions` for 1-100 scalar SQL rows at a time.
The selected action's JSON and evidence are loaded separately. Older runs
without the scalar projection are repaired lazily from their ordered runtime
event chunks; file-only installations retain the bounded compatibility path.
Action records preserve order, node/definition IDs, status,
route, timing, comparison status, and small diff metadata. Recovery records
preserve the selected ladder candidate, target edge/node, status, reason, and
candidate metadata. Full runtime session traces may still exist for deep
debugging, but previous-run lists and first run-log renders must not hydrate
the full trace.

Runtime run detail also carries compact adaptive metrics in metadata: LLM call
count, token/cost totals, recovery attempts, adaptation application count,
durable behavior-change signal, and deterministic success after adaptation.
If a run detail file is missing after a partial write, the service rebuilds and
re-saves it from the durable runtime session record before returning it.
Runtime runs accept idempotency keys so duplicate callers receive the same run
record, and adaptive execution allows only one active adaptive run per project.
`cancel-runtime-session` aborts an in-process executor signal when available
and marks queued/running sessions cancelled in durable storage.

LLM harness invocations are persisted as run interventions. Each intervention
stores the prompt version, provider/model metadata, instruction IDs, compact
context summary, structured response, validation result, usage/cost summary,
and reason for invocation. The intervention is evidence; it does not directly
mutate canonical Flow, router, subflow, instruction, or adaptation documents.
Durable changes still pass through change proposals, adaptation records, and
their validators.

Live patch tests are also evidence-first. Patch execution runs against cloned
Flow state and records validation results in adaptation candidates. Successful
temporary fixes may create validated adaptations and, for structural fixes,
change proposal candidates. Failed patches are stored as rejected adaptations
or run evidence so reviewers can inspect what was tried without promoting it.

Adaptation summaries support status-filtered pagination so inbox tabs do not
hydrate detail documents. Review actions update the adaptation document and
summary index together. Application records live in adaptation metadata with
the applied patches, actor/reason when available, and a reversible marker.
Revert changes the adaptation lifecycle to `reverted`; it does not require
manual Flow JSON edits.

`export-flow-run-audit` returns the selected run detail, compact intervention
summaries, referenced adaptation records, patch evidence, mutation
before/after/rollback evidence, and retention signals. Raw prompts are not
part of the export by default; compact context summaries, prompt versions,
provider metadata, validation results, and redacted action/state metadata are
the durable audit trail.

Training mode state is audit metadata on Flow settings and run detail. Runs can
record the active mode and derived behavior so later review explains why LLM
intervention, recovery, adaptation creation, proposal approval, or promotion
was allowed. Stability metrics, uncertainty summaries, budget decisions, and
frozen scopes are derived summaries; they should be stored as compact settings
or run metadata rather than hidden provider memory.

Adaptations may point at subflows and recovery edits, but structural patch
kinds that create or edit subflows, routers, or recovery paths require an
existing `ChangeProposal` link before the adaptation document is accepted by
the service. Adaptation records are therefore audit events and proposal
references, not a side channel for direct Flow rewrites.

Project-file reads return cloned documents through the service boundary.
Callers should modify a document by loading it, creating the next version or
edited artifact, and writing it back explicitly. This matters because
recordings are evidence, while normalized timelines, learned models, policies,
and runtime training data are derived artifacts.

The state and recording framework now includes:

- `AutomationInMemoryStateStore` for reads, writes, snapshots, restore, diff,
  schema registration, and subscriptions.
- `diffStateSnapshots` and `applyStateDeltas` for consistent change detection
  and replay.
- `buildSignalRegistryFromSchemas` and `discoverSignalDefinitions` so state
  schemas and observed snapshots become visual signal definitions.
- factual state element descriptors for text, static IDs, internal IDs,
  selectors, labels, statuses, routes, URLs, visibility, enabled flags, counts,
  positions, bounds, collections, JSON, and unknown values. Importing
  repositories describe what a state path is; FluxIQ infers whether it matters
  by correlating it with recorded actions.
- recording helpers for create, append timeline entry, append checkpoint,
  append delta, append note, and finalize.
- `ConservativeTimelineNormalizer`, which preserves raw timeline entries while
  deriving state deltas from checkpoints and linking normalized entries back to
  raw evidence.

The Automation Studio API exposes these as first-class framework endpoints:
`list-recordings`, `get-recording`, `create-recording`, `update-recording`,
`delete-recording`, `append-recording-entry`, `append-recording-note`,
`append-recording-marker`, `finalize-recording`,
`get-recording-entry-state`, `get-state-snapshot`,
`repair-recording-state-index`, `normalize-recording`,
`create-normalization-review`, `get-proposal`, `list-pipeline-artifacts`,
`mine-recording-evidence`, `propose-policy-from-model`,
`approve-policy-proposal`, `create-recording-flow-proposals`,
`generate-recording-proposal`, `delete-proposal`,
`review-recording-flow-proposal`, `inspect-legacy-retirement`,
`record-legacy-retirement-evidence`, `export-legacy-project`,
`verify-legacy-backup`, `seal-legacy-writes`,
`list-legacy-retirement-audit`, `plan-flow-migration-rollback`,
`rollback-flow-migration`, `inspect-state-diff`, and
`list-signal-registries`. Flow expansion reads are exposed through
`list-flow-subflows`, `get-flow-subflow`, `list-flow-instructions`,
`get-flow-instruction-set`, `list-flow-change-proposals`,
`get-flow-change-proposal`, `list-flow-runs`, `get-flow-run-detail`,
`list-flow-adaptations`, `get-flow-adaptation`,
`get-flow-router-summary`, `list-flow-router-routes`,
`list-flow-router-target-references`,
`cancel-runtime-session`, and `export-flow-run-audit`.
The legacy `get-flow-router` read is retained for runtime/mutation
compatibility and is not an ordinary browser data source.
Flow Settings may persist llmProvider, llmModel, and llmSecretKeyId metadata. llmSecretKeyId is an opaque reference to an encrypted record owned by the global Secret Keys program; Automation Studio never persists, requests, or renders the decrypted value. Settings discovery uses only metadata returned by secret-keys/snapshot and filters it by enabled state, provider, and global/Flow scope. Canonical settings saves also persist typed Flow interface ports, code-source publication pins, execution timeout/concurrency/domain grants, and nested training recovery budgets. Recovery-budget defaults are framework-owned (1 retry per action, 2 recovery attempts per subflow, and 2 reroutes per run); metadata overrides are merged per field and passed into graph execution. Visual Flow dependencies remain graph-derived from Call Flow nodes instead of duplicated settings state. Interactive Settings writes are sparse for framework-owned defaults: default-valued controlled keys are removed from Flow metadata and executionDefaults, while unrelated metadata and execution grants are retained. This makes reset-to-default durable and keeps effective-source labels truthful for both new and historically materialized defaults.

Instruction summaries are synchronized to flow.instructions SQLite records with an explicit summary migration version. List reads filter and page compact title/scope/status/requirement/priority metadata in SQL; instruction bodies remain in JSON detail and are loaded only by ID. Unsaved instruction edits are non-canonical recovery records in browser storage, keyed by project, Flow, and instruction ID (or new). Writes are debounced, successful saves and explicit discards remove the record, and restoration always requires a user action.
Canonical Flow publication is exposed through `publish-flow`,
`list-flow-publications`, `deprecate-flow-publication`, and
`inspect-flow-dependencies`. Compatibility endpoints for learned task models
and replay results remain available for non-UI/runtime work. Mutating endpoints
that apply, execute, publish, delete, or edit user-authored state are
privileged and should use the same shared PIN authorization path as project and
category edits. Proposal-generation endpoints such as normalization, evidence
mining, policy proposal creation, and recording Flow proposal creation write
derived inert artifacts and require the caller's `flows.write` permission, but
do not require a PIN recheck.

Publication snapshots are stored with the Flow document and project Flow files.
Each snapshot holds the immutable interface, dependency digests,
publisher/changelog metadata, and lifecycle status. Deprecation changes the
current publication lifecycle without rewriting the published snapshot.

Legacy Task/Routine write endpoints are deprecated compatibility surfaces.
Their responses include either `legacy.compatibility_write` or
`legacy.write_locked` plus `replacement: "canonical-flow-api"`. New recording
policy approvals write canonical Flows and retain policy and recording
provenance in Flow metadata; they no longer create new Task artifacts.

Project retirement state, digest-verified source backups, and append-only audit
events live beneath `projects/{projectId}/migration/`. Schema `0.2` is an
explicit write gate, not a deletion migration. Legacy reads and catalog adapters
remain available after sealing. Migration rollback is allowed only for unchanged
draft canonical copies whose ledger provenance and backup digest still match.

The proposal UI is the user-facing surface for generated policy/Flow proposals. It
shows the source recording, proposal status, generated time, summary counts,
and an embedded graph editor that uses the same React Flow node renderer as
the Flow editor through a small embeddable graph API. Policy proposals may
include a proposal-local node palette. Mapper-generated recording Flow
proposals are also rendered as proposed action nodes instead of a separate
text-only review surface. In proposal-review mode, existing/locked graph
content can be shown differently from proposed nodes, while proposal edits are
cached in workspace preferences until the user applies or saves. Selecting a
proposed node publishes its action, parameter, confirmation, observation, and
evidence details to the global inspector. Proposal actions apply the current
edited policy proposal to the last open valid canonical Flow, save it as a new
Flow, regenerate it from the recording, process it with an LLM, or approve a
mapper-generated recording proposal into a Flow or reviewed node definition.

When a recording is finalized from the timeline, the web UI stops at the raw
recording boundary and refreshes the timeline. Proposal creation is explicit:
the `Generate Proposal` action opens the Proposal Generator workspace view.
That view can run LLM-assisted generation with stored user instructions or
direct deterministic generation from importer mappers/mining. When a proposal
is written, Automation Studio opens the proposal review view and highlights the
generated proposal in the left hierarchy. This does not approve or apply the
proposal.

Recording Flow proposal generation treats action and domain-event entries as
the primary mapper inputs. High-frequency `client.state_snapshot` and
`client.state_update` observations remain raw recording context for State View,
timeline inspection, normalization review summaries, and state-before/after
correlation, but they are not surfaced to importer recording mappers as
independent top-level observations. This keeps one click from becoming many
duplicate action/evidence candidates.

Recording Flow candidates carry explicit action identity. `actionEntryId`
points to the raw recording action/domain event that produced the candidate.
`sourceObservationIds` and `evidence` may include supporting state snapshots,
confirmation observations, or other context, but those support references must
not replace the candidate's action identity. Proposal review, approved Flow
node metadata, and State View opening use `actionEntryId` for action-adjacent
state lookup. If an importer mapper emits a candidate while processing a
supporting observation, Core resolves the candidate's `actionEntryId` from the
referenced indexed action entry before copying the proposal state link; the
observation entry remains provenance only.

Pipeline artifact listing is a read path, not a validation/mutation path.
`list-pipeline-artifacts` reads the project pipeline index and artifact
documents without revalidating every recording Flow proposal against currently
registered mapper/output definitions. Callers that need proposal health checks
must request explicit recording Flow proposal revalidation in service code or
use a dedicated validation/review operation. This keeps project refresh and the
left hierarchy from doing mapper scans and canonical Flow scans just to display
recordings, proposals, and flows.

When project object storage is enabled, full `client.state_snapshot` payloads
are moved out of timeline entries before storage. The recording observation
keeps `payload.stateRef`, `payload.snapshotId` when available, and metadata such
as the snapshot digest/size; the JSON `StateSnapshot` itself is stored as a
recording-owned project object. `get-recording` hydrates those refs back into
`payload.state` for UI surfaces that explicitly open the full recording.

Each object-store-backed recording also writes
`recordings/{recordingId}/index.json`. This recording-local index contains
lightweight entry, action, state, and proposal references. Action entries keep
`stateAtActionId`; state entries keep `stateRef`, optional `screenshotRef`, and
visual coordinate-space metadata. New dehydrated snapshot entries also retain
the original `stateSnapshotTimestamp` so queued timeline append time cannot
replace capture time. State View opens use
`get-recording-entry-state` or `get-state-snapshot` to resolve one explicit
state snapshot from this index. Timeline entry opens use the entry's direct
state link when it exists; otherwise Core resolves the latest indexed state
snapshot at or before that entry's timestamp/sequence. This lets arbitrary
recording events, notes, markers, and domain observations open the state the
bot had most recently seen at that point. If no prior indexed state exists, the
UI reports the missing link and can call `repair-recording-state-index` only
after explicit user confirmation and authorization; normal State View opening
does not scan timelines or fall back to the first/nearest state in the browser.

Recording index repair and open-state index refresh rebuild action-state links
from the hydrated recording when necessary, so object-stored snapshots can
contribute their real `StateSnapshot.timestamp`. During rebuild, Core recomputes
the closest action-adjacent state by capture/event timestamp; a prior/current
snapshot only beats a later snapshot when both are equally close. This prevents
stale prior-state links from surviving after proposal regeneration or page
refresh.

Recording Flow proposal candidates and generated proposal nodes copy the
indexed `ProposalNodeStateLink` from the recording index. `actionEntryId`
remains the action identity; `stateSnapshotId`, `stateRef`, and optional
`screenshotRef` are state navigation/provenance fields. Evidence arrays are
supporting context and must not override the indexed action/state link.
Likewise, `sourceObservationIds` are support/provenance context only; the web
proposal adapter must not promote them into `timelineEntryId` or
`actionEntryId` for State View navigation. State selections also keep their
selected proposal node id so the State View model can bind the exact node
context while rendering the exact indexed state snapshot. When proposal node
metadata already contains `stateSnapshotId`, the web open-state request is a
snapshot-id request; it does not also route through the action timeline entry.

State View treats an exact `sourceId`, `stateSnapshotId`, or resolved
`timelineEntryId` request as strict. For timeline entries without direct state
links, the service first resolves an exact state snapshot by the "latest state
at or before this entry" rule. If that resolved indexed source is not available
yet, the view shows a missing-state message instead of rendering the first
observed source in the recording. This prevents asynchronous open-state
requests from flashing or settling on the first recording snapshot.

Each generation request creates a new proposal attempt unless the caller
explicitly supplies `replaceProposalId`. Replacement deletes only the selected
target after the new proposal has been successfully written. Proposal attempts
are persisted under the source recording's derived artifact folder:

```text
recordings/sessions/{recordingId}/derived/proposals/{proposalId}/proposal.json
recordings/sessions/{recordingId}/derived/proposals/{proposalId}/flow.json
```

The pipeline index stores every active proposal attempt with recording
ownership and status. Proposals retain generation mode, optional user title,
instructions/constraints, mapper or LLM metadata, mapper/package versions,
observation IDs, evidence links, output/parameter data, confirmation
expectations, confidence, and review decision. They are not executable before
approval. Approval writes either provenance-bearing policy action nodes to a
selected Flow or reviewed node definitions; raw evidence is never edited.
Deleting a proposal removes its artifact documents and derived proposal folder
without deleting the source recording. Deleting a recording deletes its session
folder, derived evidence, and recording-owned proposals.

Object pruning includes refs from live recording indexes before deleting
unreferenced project objects. This keeps shared/live screenshots and state JSON
safe while allowing deleted recording-owned objects to be removed without
filesystem-wide guessing.

When a connected client stops a recording, the client gateway finalizes the
recording in the framework service. The web UI detects the
active-recording-to-stopped transition from gateway snapshots, refreshes the
final timeline automatically, and leaves proposal creation to the explicit
Proposal Generator action.

Timeline clips open reconstructed state directly. A timeline clip can be
double-clicked to open the State View for that recording entry, using the
entry-specific observed source when available and adjacent observed state when
the entry itself is an action. Internal artifact layers such as facts,
observations, correlations, and claims remain storage/framework concepts; the
user-facing UI explains them through the State View, proposal review, and the
global inspector rather than through a separate timeline evidence window.

The internal evidence/task pipeline has three stages, followed by an optional
importer mapper stage for reviewed Flow/node candidates:

- Normalize prepares the raw recording as a normalized timeline and writes
  normalization detail artifacts with raw-to-normalized mappings, derived
  entries, explicit wait clips from recorded monotonic gaps, and normalizer
  issues.
- Mine Evidence creates windows around action/domain events and extracts
  facts, observations, state-action correlations, and claims from normalized
  timeline entries. Facts are observed timeline events or state changes.
  Observations are domain-shaped descriptions of those facts. Correlations
  capture which factual state elements were present before an action or changed
  after it. Claims are interpretations such as action effects, candidate
  conditions, waits, and transitions; confidence belongs on these claims
  because they are the inferred layer.
- Propose Task converts mined evidence into a draft `PolicyGraph` plus a
  `PolicyGraphPatch` without mutating the active task until the user approves
  it. Proposed nodes are centered on recorded actions or domain events, while
  supporting effect and condition claims are attached as evidence for those
  steps. This prevents one repeated state-effect signal from becoming many
  duplicate task steps. Supporting claims link back to observations, facts, and
  normalized/raw recording entries. The current path does not train a model;
  any learned-model artifact is an internal compatibility representation rather
  than a user-facing pipeline stage.

Replay/validate is not part of the recording pipeline. It belongs in a later
runtime view where runs, simulations, validations, and execution traces can be
shown independently from recording-derived task authoring.

## Canonical Mode And Runtime Summary Migrations

Flow settings migration `0014_canonical_intervention_mode` adds the nullable
canonical mode and a version column without destructively rewriting legacy
rows. Existing rows retain version `0`; reads map legacy training/adaptation
fields to `fully_adaptive`, `manual_approval`, or `no_llm_intervention`, and the
next settings write stores version `1`. Migration execution is transactional,
so a failed statement leaves neither columns nor a migration-ledger entry.

Runtime migration `0015_runtime_summary_envelope` adds `summary_json` to
`runtime_runs`. Indexed scalar columns remain authoritative for bounded SQL
paging and sorting, while the compact envelope retains token usage,
intervention summaries, and summary metadata. Legacy rows receive `{}` and
continue to hydrate from their scalar columns. Run-detail event reconstruction
uses the newest summary envelope, deduplicates domain events by stable event
identity, and falls back to the compatibility file when a typed write stopped
before producing a summary event.

Domain scope is part of the document identity. Raw recordings read it from the
recording environment; derived artifacts carry it in metadata until richer
project/task ownership records exist.

# Automation Studio Canonical Persistence

[Back to the Automation Studio overview](../automation-studio.md)


Automation Studio canonical artifacts use a shared repository contract with
stable document IDs:

| Artifact | Repository | Document ID |
| --- | --- | --- |
| `RecordingSession` | `recordingSessions` | `recordingId` |
| `NormalizedTimeline` | `normalizedTimelines` | `normalizedTimelineId` |
| `SignalRegistry` | `signalRegistries` | `registryId` |
| `LearnedTaskModel` | `learnedTaskModels` | `learnedTaskModelId` |
| `PolicyGraph` | `policyGraphs` | `policyId` |
| `AutomationStudioFlowPublicationRecord` | `flowPublications` | `publicationId` |

Framework tests can use the in-memory repository implementation. Host runtimes
use canonical SQLite repositories in `.fluxiq/global.sqlite`; domain IDs are
document metadata/filter keys and do not select a different database.

Repository reads return cloned documents. Callers should modify a document by
loading it, creating the next version or edited artifact, and writing it back
explicitly. This matters because recordings are evidence, while normalized
timelines, learned models, policies, and runtime training data are derived
artifacts.

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
`append-recording-marker`, `finalize-recording`, `normalize-recording`,
`create-normalization-review`, `list-pipeline-artifacts`,
`mine-recording-evidence`, `propose-policy-from-model`,
`approve-policy-proposal`, `create-recording-flow-proposals`,
`generate-recording-proposal`, `delete-proposal`,
`review-recording-flow-proposal`, `inspect-legacy-retirement`,
`record-legacy-retirement-evidence`, `export-legacy-project`,
`verify-legacy-backup`, `seal-legacy-writes`,
`list-legacy-retirement-audit`, `plan-flow-migration-rollback`,
`rollback-flow-migration`, `inspect-state-diff`, and
`list-signal-registries`. Canonical Flow publication is exposed through
`publish-flow`, `list-flow-publications`, `deprecate-flow-publication`, and
`inspect-flow-dependencies`. Compatibility endpoints for learned task models
and replay results remain available for non-UI/runtime work. Mutating endpoints
that apply, execute, publish, delete, or edit user-authored state are
privileged and should use the same shared PIN authorization path as project and
category edits. Proposal-generation endpoints such as normalization, evidence
mining, policy proposal creation, and recording Flow proposal creation write
derived inert artifacts and require the caller's `flows.write` permission, but
do not require a PIN recheck.

Publication records are append-oriented standalone documents in
`automation.flow_publications`. Each record holds the immutable snapshot,
dependency digests, publisher/changelog metadata, and lifecycle status.
Deprecation changes the record lifecycle without rewriting the published
snapshot. Readers merge historical artifact publication events for backward
compatibility, while all new publications write the standalone index.

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

Domain scope is part of the document identity. Raw recordings read it from the
recording environment; derived artifacts carry it in metadata until richer
project/task ownership records exist.

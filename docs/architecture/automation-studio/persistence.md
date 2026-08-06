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
`approve-policy-proposal`, `inspect-state-diff`, and
`list-signal-registries`. Compatibility endpoints for learned task models and
replay results remain available for non-UI/runtime work. Mutating endpoints are
privileged and should use the same shared PIN authorization path as project and
category edits.

The proposal UI is the user-facing surface for generated task proposals. It
shows the source recording, proposal status, generated time, summary counts,
and an embedded policy graph editor. The editor uses the same React Flow node
renderer as the task editor through a small embeddable graph API and includes a
proposal-local node palette. In proposal-review mode, existing/locked graph
content can be shown differently from proposed nodes, while proposal edits are
cached in workspace preferences until the user applies or saves. Selecting a
proposed node opens a compact inspector with editable node label/description,
action summaries, requirements, expected state results, and readable supporting
state signals. Proposal actions apply the current edited proposal to the last open
valid task, save it as a new task, regenerate it from the recording, or process
it with an LLM.

When a recording is finalized from the timeline, the web UI runs the recording
authoring stages in order: normalize, mine evidence, and propose task. The
timeline pane shows an overlay with the active stage and progress while this
happens. When the proposal is written, Automation Studio opens the proposal
view and highlights the generated proposal in the left hierarchy. This does not
approve or apply the proposal.

Each recording has one current proposal artifact. Regenerating the
proposal overwrites that recording-owned proposal instead of creating additional
proposal rows for the same source recording. The proposal is persisted under
the source recording's derived artifact folder. Deleting the source recording
deletes its proposal artifact and removes it from the project pipeline index.

When a connected client stops a recording, the client gateway finalizes and
processes the recording in the framework service. The web UI detects the
active-recording-to-stopped transition from gateway snapshots, refreshes the
final timeline automatically, and keeps the timeline covered with a progress
overlay until the generated proposal artifact appears.

The timeline evidence inspector is a separate addable inner-window view. A
timeline clip can be double-clicked to open the inspector for that recording
entry. The inspector is entry-centered and intentionally product-facing: it
shows the selected moment, useful state signals connected to that moment, and
proposal steps that consume those signals. Internal artifact layers such as
facts, observations, correlations, and claims remain storage/framework concepts;
the main inspector UI collapses them into readable signals like text, static
IDs, labels, before/after values, and action timing. This view explains why a
proposal used a piece of evidence without turning the global inspector into a
pipeline debugger.

The internal recording pipeline has three stages:

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

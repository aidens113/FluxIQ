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
  -> Learned Task Model
  -> Generated Policy Graph
  -> Runtime Execution + Training Data
```

The raw recording is immutable evidence. Normalization, mining, policy
generation, AI proposals, and runtime training create new artifacts that point
back to earlier evidence with stable references. This lets a host project
improve miners or regenerate policies without recapturing the task.

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
  context, and the `FingerprintScorer` interface.

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

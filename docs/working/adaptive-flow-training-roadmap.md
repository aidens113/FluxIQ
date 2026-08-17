# Adaptive Flow Training Roadmap

## Purpose

FluxIQ should not become "an LLM operating the computer every time." The
framework direction should be:

```text
recording / prompt
  -> generated Flow proposal
  -> training/adaptation runs
  -> reviewed patches
  -> stable deterministic Flow
```

The LLM is a temporary generator, trainer, and repair assistant. The saved Flow
runtime remains deterministic by default, with adaptive behavior waking up only
when the current state diverges from the known model or when the user explicitly
enters Training Mode.

This gives FluxIQ a clean product identity:

> Adaptive automation that learns how to become reliable deterministic
> automation.

Deterministic workflow support is still foundational. It powers normal API/data
workflows and lets adaptive browser/device/game/desktop steps participate in
real end-to-end workflows. The moat is not a huge integration catalog; the moat
is recording, state, evidence, runtime comparison, LLM-assisted repair, and
stabilization.

## Product Positioning

FluxIQ should support three execution characteristics inside one Flow system:

| Characteristic | Meaning | Product role |
| --- | --- | --- |
| Deterministic | Input -> node -> output, with no environmental uncertainty. | Foundation for reliable workflows, integrations, transforms, schedules, and API work. |
| State-aware | Observe state, verify expected input/output, and execute known actions. | Main shape of recording-generated automation. |
| Adaptive | Detect unknown/divergent state, ask trainer/LLM/recovery logic for help, and propose a patch. | Differentiator and training layer, not the permanent default execution path. |

These are not separate products or separate graph engines. They are execution
traits of nodes/regions inside the same canonical Flow runtime.

Example hybrid Flow:

```text
Schedule
  -> Get customers from database
  -> For each customer
  -> Open legacy portal          adaptive/state-aware
  -> Find account                adaptive/state-aware
  -> Download statement          adaptive/state-aware
  -> Upload to object storage    deterministic
  -> Send notification           deterministic
```

FluxIQ should not try to clone n8n's integration catalog. It should build a
small set of high-leverage primitives and make extension authoring easy:

- HTTP/API requests;
- webhooks;
- schedules/triggers;
- filesystem/object storage;
- databases;
- email;
- shell/code execution;
- JSON/data transforms;
- a few high-value notification integrations such as Slack/Discord.

Integrations exist to let adaptive flows complete real work. They should not
consume the roadmap at the expense of adaptive training.

## Core Mental Model

There are two AI phases:

```text
Generation:
  recording / prompt -> Flow proposal

Training:
  runtime execution -> discrepancy -> diagnosis -> patch proposal
```

Generation produces an executable hypothesis. It does not need to be perfect.
Runtime training discovers which assumptions are reliable, optional, wrong, or
missing.

The training loop:

```text
Execute deterministic nodes
  -> capture actual state
  -> compare expected vs actual
  -> diagnose discrepancy
  -> recover this run if possible
  -> produce a candidate patch
  -> review/accept/stabilize
```

The LLM should receive a compact runtime comparison, not a giant state dump.
FluxIQ prepares:

- current Flow and selected node/region;
- action parameters;
- expected input state;
- expected output state;
- actual state;
- relevant state diff;
- screenshot/reconstructed State View refs when useful;
- available node definitions and domain outputs;
- previous runtime/training history;
- known accepted/rejected patches.

The LLM task should be constrained:

```text
The expected transition did not occur.
Determine whether node parameters, state requirements, expected output, or
flow structure are wrong.
Produce the smallest safe modification.
```

## Adaptation Layers

FluxIQ should keep three layers separate.

### 1. Runtime Recovery

Runtime recovery helps the current execution continue without mutating the
saved Flow.

Examples:

- expected button is missing, but equivalent button is visible;
- a cookie banner blocks the action;
- a navigation step partially succeeded and needs one alternate click;
- a transient spinner requires a wait/retry.

Runtime recovery emits an execution trace and optional recovery note. It should
not silently write the canonical Flow.

### 2. Candidate Learning

If a recovery works, FluxIQ creates a patch proposal against the Flow, state
expectations, evidence bindings, or node parameters.

Examples:

- update click target evidence;
- relax an expected text condition;
- add optional branch for cookie dialog;
- insert verification/retry node;
- remove unnecessary recorded junk action;
- update branch condition.

These patches are micro-proposals. They belong to training history, not direct
canonical mutation.

### 3. Flow Mutation / Stabilization

Only accepted or high-confidence patches become part of the saved Flow.
Stabilization can be manual or confidence-gated.

Initial automatic criteria should be conservative:

- minimum successful runs;
- no structural changes for N runs;
- no LLM runtime intervention for N runs;
- expected transitions succeeded;
- evidence confidence above threshold;
- no rejected similar patch nearby.

## Training Mode UX

Add an explicit execution mode selector:

```text
Execution Mode

( ) Normal
(*) Train for next 5 runs
( ) Train until stable
( ) Continuous adaptive
```

Start with `Normal`, `Train for next N runs`, and later `Train until stable`.
Continuous adaptive mode should be advanced/guarded because it can become
costly and risky.

Training status should show:

```text
Runs completed: 4 / 5
Flow confidence: 92%

Learned:
- Updated repository matching
- Made cookie banner optional
- Relaxed search-results expectation
- Added retry after navigation

Remaining uncertainty:
- Login recovery only observed once
```

Each training change should be inspectable:

```text
Training Change #17

Run: 2026-08-16 21:41
Trigger: Expected state not reached after node 4
Diagnosis: Target layout differed from demonstration.
Change: Update target evidence for "FluxIQ repository"
Evidence: 3 successful executions
Status: Accepted automatically
```

This creates a history:

```text
Generated -> Training patch 1 -> Training patch 2 -> Stable
```

Rollback becomes a normal patch-history operation.

## Patch Contract

The LLM must not directly mutate canonical Flow state. It returns a structured
patch proposal.

Initial patch kinds:

| Patch kind | Example |
| --- | --- |
| `node.parameters.update` | Update click target selector/evidence. |
| `node.expectation.relax` | Accept `Continue` or `Next`. |
| `node.expectation.add` | Add missing success condition. |
| `node.expectation.remove` | Remove brittle/false expectation. |
| `flow.node.insert` | Add optional verification step. |
| `flow.node.remove` | Remove junk demonstration step. |
| `flow.branch.add` | Add optional dialog branch. |
| `flow.edge.update` | Route failure/retry differently. |
| `evidence.binding.update` | Change which state fact proves readiness/success. |
| `recovery.strategy.add` | Add retry/wait/reobserve strategy. |

Every patch stores:

- patch ID;
- project ID;
- Flow ID;
- source run/session ID;
- trigger node/region;
- diagnosis;
- proposed operations;
- before/after summary;
- supporting evidence refs;
- state comparison refs;
- confidence;
- risk level;
- status: `proposed`, `accepted`, `rejected`, `auto_accepted`, `superseded`;
- provenance: model/provider/prompt/version;
- rollback information.

## Runtime Comparison Model

Before asking an LLM, Core should build a compact comparison:

```ts
type RuntimeStateComparison = {
  flowId: string;
  runId: string;
  nodeId: string;
  phase: "input" | "output" | "recovery";
  action?: {
    nodeType: string;
    parameters: Record<string, unknown>;
    result?: Record<string, unknown>;
  };
  expected: StateFactExpectation[];
  actual: StateFactObservation[];
  matched: StateFactMatch[];
  mismatched: StateFactMismatch[];
  unexpected: StateFactObservation[];
  visualContextRefs?: string[];
};
```

The State View remains the human-facing explanation surface. The runtime
comparison is the machine-facing input to training.

## Architecture Modules

### Flow Runtime

Foundation:

- deterministic node execution;
- typed inputs/outputs;
- branches/loops;
- retries/timeouts;
- execution traces;
- run sessions;
- node effect/result metadata.

The runtime should not be browser-specific or LLM-specific.

### Integration Layer

Foundation:

- generic node registry;
- HTTP, webhook, schedule, DB, filesystem, email, code/shell primitives;
- importer-owned domain nodes and adapters;
- extension SDK for additional integrations.

Integration nodes are ordinary deterministic nodes unless they declare
state-aware/adaptive contracts.

### Adaptive Layer

Foundation:

- recordings;
- state snapshots and facts;
- evidence bindings;
- expected input/output state;
- runtime comparison;
- recovery attempts;
- training patch proposals;
- stabilization policy.

This is FluxIQ's differentiator.

### AI Layer

Foundation:

- proposal generation from recording/prompt;
- training diagnosis from runtime comparison;
- patch proposal generation;
- prompt/version/provenance storage;
- model/provider abstraction;
- cost/time limits;
- deterministic fallback where possible.

AI outputs structured proposals, not direct mutations.

## Roadmap

### Phase 1: Generation Foundation

Goal: make recording/prompt -> Flow proposal explicit and reviewable.

Status: underway through the Proposal Generator.

Deliverables:

- Proposal Generator view;
- direct mapper/mining proposal attempts;
- LLM-assisted generation contract;
- multiple proposals per recording;
- proposal deletion/replacement;
- proposal metadata and provenance;
- no auto-generation after recording stop.

### Phase 2: Apply Proposal To Canonical Flow

Goal: generated proposals become real canonical Flows cleanly.

Deliverables:

- robust apply/save-as-Flow path for recording proposals;
- clear Flow provenance from recording/proposal;
- editable Flow graph after proposal approval;
- no hidden Task/Routine compatibility writes;
- generated config/source artifacts for the Flow.

### Phase 3: Expected State And Runtime Comparison

Goal: every adaptive/state-aware node has explicit input/output expectations.

Deliverables:

- expected input/output state model on generated nodes;
- runtime State View source linked to run sessions;
- comparison artifact for expected vs actual;
- mismatch classification;
- compact comparison builder for AI/training;
- UI entry from failed run node to State View comparison.

### Phase 4: Runtime Recovery

Goal: failed runs can recover without mutating the saved Flow.

Deliverables:

- recovery mode flag on run session;
- recovery prompt context from runtime comparison;
- constrained recovery action execution;
- recovery trace entries;
- user-visible "LLM intervened" markers;
- hard limits for cost, actions, and time.

### Phase 5: Training Patch Proposals

Goal: successful recoveries become reviewable micro-proposals.

Deliverables:

- TrainingPatch artifact;
- patch operation schema;
- patch provenance and evidence refs;
- patch review UI;
- accept/reject/supersede operations;
- rollback support.

### Phase 6: Training Mode UX

Goal: users can intentionally train a generated Flow.

Deliverables:

- execution mode selector;
- train for N runs;
- training status panel;
- learned changes list;
- remaining uncertainty list;
- run history with interventions and patches;
- review learned changes before lock/publish.

### Phase 7: Stabilization

Goal: FluxIQ can decide a Flow is stable enough to run normally.

Deliverables:

- stabilization policy config;
- confidence metrics;
- automatic safe patch acceptance for low-risk changes;
- "stable" status;
- publish/lock path;
- regression detection when future runs diverge.

### Phase 8: Integration Primitives

Goal: make hybrid flows useful without chasing a large integration catalog.

Deliverables:

- HTTP/API node;
- webhook trigger;
- schedule trigger;
- JSON transform node;
- filesystem/object storage nodes;
- database query/write nodes;
- email/send notification nodes;
- shell/code execution node with explicit permissions;
- integration SDK examples.

## Near-Term Implementation Order

1. Finish Proposal Generator reliability.
2. Connect actual LLM-assisted generation behind the existing endpoint.
3. Ensure generated proposals can become canonical Flows with clean provenance.
4. Add expected input/output state to generated Flow nodes.
5. Add runtime comparison artifacts for failed/verified node executions.
6. Build TrainingPatch schema and storage.
7. Add Training Mode for a bounded number of runs.
8. Add runtime recovery as a guarded experimental path.
9. Add stabilization status and patch review.
10. Add high-leverage deterministic integration primitives.

## Non-Goals

- Do not clone n8n's integration catalog.
- Do not keep the LLM in the hot execution path for normal stable runs.
- Do not allow LLMs to silently mutate canonical Flows.
- Do not split deterministic and adaptive automation into separate graph
  engines.
- Do not send giant raw state dumps to the LLM when a compact comparison can be
  produced first.

## Open Questions

- What is the first real domain to use for Training Mode validation: browser
  automation, desktop, game, API hybrid, or another importer?
- Which patch kinds are safe enough for auto-acceptance?
- Should TrainingPatch artifacts live in pipeline storage, canonical Flow
  history, or both?
- What minimum model/provider abstraction is needed before connecting LLM
  generation?
- Should "Train until stable" be available before manual patch review is solid?


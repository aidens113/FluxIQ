# Adaptive Flow Training Roadmap

Status: Active
Status detail: Roadmap Phase 1 is "underway through the Proposal Generator"; the 2026-09-06 Production LLM Phase 0 and Phase 1A checkpoints are "implemented and focused validation complete", Phase 1B backend grants are "implemented and locally validated", and a Phase 1C UI defect is deferred.
Created: 2026-08-16
Last updated: 2026-09-10
Owner: FluxIQ Core (Automation Studio runtime); the 2026-09-06 checkpoints were executed by Core safety, provider, and backend-grant subagents operating under the repository AGENTS.md
Scope: Core-side roadmap for turning recording/prompt-generated adaptive Flows into stable deterministic Flows (generation, expected-state comparison, runtime recovery, training patches, Training Mode UX, stabilization, integration primitives), plus the 2026-09-06 Production LLM Phase 0/1A/1B safety, provider-seam, and diagnosis-only grant checkpoints.
Paired document: F:\!FluxIQWebExtension\docs\working\llm-production-automation-plan.md
Related: none

---

## Current State

Written 2026-09-10 from this document's own status lines and its most recent
dated checkpoint (the three "2026-09-06 Production LLM" sections). No facts
beyond what the document states are recorded here.

**What is true now**

- The product direction is unchanged: the LLM is a temporary generator,
  trainer, and repair assistant; the saved Flow runtime is deterministic by
  default and adaptive behavior wakes only on state divergence or explicit
  Training Mode (see "Purpose" and "Core Mental Model").
- The LLM must never mutate canonical Flow state directly; it returns
  structured patch proposals (see "Patch Contract"). The delivered Phase
  0/1A/1B work enforces this rule.
- Of the eight roadmap phases, only Phase 1 (Generation Foundation) carries a
  status line, and it still reads "underway through the Proposal Generator".
  Phases 2 through 8 carry no delivery status in this document.
- The delivered Core work is a production LLM safety and provider lane, not the
  training loop itself: new Flows default to normal/no-LLM execution, and the
  only live-capable LLM lane is a one-call `diagnosis_only` mode that produces
  no patch, adaptation, promotion, auto-recovery, or LLM-authorized external
  side effect.
- The built-in provider is DeepSeek, fixed to
  `https://api.deepseek.com/chat/completions` and `deepseek-chat`, with no
  Flow/user endpoint override.
- Enforced limits: request token limits default 8,000 input / 2,000 output /
  10,000 total under an immutable 50,000 total ceiling; provider timeout 20 s
  default / 25 s maximum; response body 1 MiB default / 2 MiB absolute;
  per-request estimated cost $0.25 default with a server-enforced $10 absolute
  ceiling and a stricter $0.25 production run ceiling.
- Every dated section states that no live provider request was made and no
  secret source or environment secret was read during that work.

**Done** (per the 2026-09-06 sections)

- Phase 0 Safety Baseline: safe defaults for new Flows (manual proposals,
  locked mutation policy, no adaptation creation, no promotion); explicit
  manual-approval runs are diagnosis-only; provider results cross an `unknown`
  boundary and are strictly parsed and bounded; deterministic recording
  generation stays direct when the unavailable LLM option is requested, with
  `requestedGenerationMode` and `llmAssistanceStatus: not_invoked` recorded;
  adaptive admission serialized per project. Validation: Core check passed,
  focused suites passed, service suite 90/90.
- Phase 1A Provider Seam: expanded `AutomationStudioLlmProvider.runTask`
  request (timeout, `AbortSignal`, request ID, idempotency key, estimated input,
  token limits); DeepSeek transport adapter with strict envelope parsing and
  normalized failure classes; scoped opaque secret resolver only; synchronous
  per-run ledger shared by diagnosis and patch calls. Two independent hardening
  rounds, a cost-accounting blocker resolution (atomic per-call cost
  reservation against the run ceiling), and a final acceptance correction
  (ledger distinguishes admission reservation from accounting; cycle-safe
  aggregate guard before parsing). Validation: provider/harness/ledger suites
  19/19, then 22/22, then 25/25; service suite 91/91 then 92/92.
- Phase 1B Backend Grants: opaque one-use `diagnosis_only` grants issued only
  after password plus configured PIN verification, bound to actor/session,
  enabled LLM key ID and revision, provider, model, canonical project/Flow and
  execution dependency digest, effective limits, one-call limit, TTL, and
  remaining uses; synchronous atomic claim; revocation on expiry timer,
  Automation Studio close, key update/rotation/deletion, capability expiry,
  cancellation, run failure, framework close, web-runtime reload, SIGINT, and
  SIGTERM; Secret Keys owns a generic opaque one-use reveal authorization with a
  zeroizable password-derived key, and decryption happens only at dispatch;
  the execution digest covers the parent Flow, effective settings, Flow Map
  Router, Subflows, routed Subflow graph Flows, applicable instructions, and
  every transitively reachable pinned published snapshot; a diagnosis grant
  cannot attach to a pre-existing runtime session (any supplied `runId` is
  rejected and the grant revoked); `authorizedDomainIds` is forced empty and
  `authorizedExternalSideEffects` forced false for `diagnosis_only`; the lane
  may run the already-authored deterministic Flow through its ordinary bound
  IO, importer-native, and host capabilities but adds no domain authorization.
  Validation: focused API/provider/harness/budget/grant/Secret Keys/framework
  suites 68/68; service suite 97/97, then 98/98, then all 100 tests; full
  `fluxiq` package 91 files / 586 tests, later 587/588 with one unrelated
  pagination performance test that passed alone; `pnpm --filter fluxiq build`,
  `pnpm docs:reference`, `pnpm docs:check`, and `git diff --check` passed;
  production web-owner lifecycle suite 8/8.

**Not done**

- Roadmap Phases 2 through 8: apply proposal to canonical Flow, expected
  input/output state and runtime comparison artifacts, runtime recovery,
  TrainingPatch artifacts and review UI, Training Mode UX (execution mode
  selector, train for N runs, training status panel), stabilization policy and
  "stable" status, and the deterministic integration primitives. None has a
  recorded status here.
- Near-Term Implementation Order items 1 through 10 have no recorded
  completion. In particular, LLM-assisted generation from recordings is not
  connected: Phase 0 states deterministic recording generation remains direct
  and the LLM option is "unavailable".
- Live provider validation: no live DeepSeek request is recorded anywhere in
  this document.
- Secret Keys/LLM Keys Programs UI composition and durable provider selection,
  deferred from Phase 1A to Phase 1B, are not explicitly recorded as delivered
  in the Phase 1B section (only Runtime Debug issuing diagnosis as a fresh run
  is recorded).
- Phase 1C UI defect (deferred): `flowHierarchyNodes` can emit canonical and
  legacy entries for the same Flow ID with the same `data-tree-item-id`, so
  filtering/clearing the hierarchy can make `.first()` select the legacy entry.
  Phase 1C must deduplicate by canonical Flow identity and add a regression for
  unique tree IDs and stable selection.
- The "Open Questions" section is unanswered: first real domain for Training
  Mode validation, which patch kinds are safe for auto-acceptance, where
  TrainingPatch artifacts live, the minimum model/provider abstraction before
  connecting LLM generation, and whether "Train until stable" precedes solid
  manual patch review.

**Next steps** (as this document states or implies them)

- Phase 1C: fix the `flowHierarchyNodes` duplicate-entry defect with the
  regression described above.
- Downstream: the Phase 1B section hands the local-loopback-only target
  boundary for the live diagnosis-only test to "the downstream testing
  facility/domain policy". That work is tracked in the paired document, not
  here.
- Resume the Near-Term Implementation Order from item 1 (Proposal Generator
  reliability) and item 2 (connect actual LLM-assisted generation behind the
  existing endpoint).

**Blockers**

- No outstanding blocker on the Core lane is recorded: the Phase 1A
  statements that Phase 1B was "paused" and "blocked on atomic cost
  reservation/settlement" were resolved by the cost-accounting blocker
  resolution, and Phase 1B was then implemented.
- The full web-package typecheck is blocked by unrelated concurrent work: an
  unsupported `transport` property in `AutomationStudioSession.tsx` and
  duplicate object properties in `useAutomationHierarchyUiRuntime.ts`. The
  Core check and build are not affected.

**Reading note**

- The Phase 1B section is not in chronological order. Its "Validation" bullets
  reference the executor-causality and pre-staged-session corrections, but the
  "Authorized executor-causality correction" paragraph appears last, after the
  "Independent acceptance security correction". Read the whole section before
  relying on any single paragraph.

---

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

## 2026-09-06 Production LLM Phase 0 Safety Baseline

Status: implemented and focused validation complete.

Assignment: Core safety subagent, operating under this repository's
`AGENTS.md`. No browser/domain concepts or secret values were introduced.

Completed:

- new Flows now default to normal/no-LLM execution, manual proposals, locked
  mutation policy, no adaptation creation, and no promotion;
- explicit manual-approval runs are diagnosis-only and cannot request or
  promote patches;
- deterministic recording generation remains direct even when the unavailable
  LLM option was requested, with `requestedGenerationMode` and
  `llmAssistanceStatus: not_invoked` replacing fabricated LLM provenance;
- provider results cross an `unknown` boundary and are strictly parsed,
  bounded, and checked for unexpected fields before use;
- provider throws, missing providers, malformed output, and over-limit usage
  produce failed intervention validation instead of escaping or appearing
  successful;
- per-request input/output/total limits are part of the provider request, with
  8,000/2,000/10,000 defaults and an immutable 50,000 total-token ceiling;
- estimated input plus requested output is checked before provider invocation;
- persisted intervention results retain compact kind/risk/count provenance,
  not provider free-text or arbitrary response metadata; and
- adaptive admission is serialized per project and rejected attempts do not
  leave orphan queued sessions.

Compatibility:

- existing Flows with a recognized canonical intervention mode retain that
  mode;
- explicit fully adaptive settings and auto-promotion remain available, but
  tests and callers must opt in rather than inheriting them from a new Flow;
- provider adapters must accept the request's `tokenLimits` and return an
  untrusted envelope that passes runtime parsing;
- abort signals, request IDs, timeouts, actual provider transport, scoped
  secret unsealing, and cross-call budget reservation remain Phase 1 work.

Validation:

- `pnpm --filter fluxiq check` passed;
- focused intervention-mode and LLM-harness suites passed;
- `programs/automation-studio/runtime/service.test.ts` passed 90/90 after
  explicit adaptive fixtures were updated to opt in.

## 2026-09-06 Production LLM Phase 1A Provider Seam

Status: implemented and focused validation complete.

Assignment: Core provider subagent, operating under this repository's
`AGENTS.md`. Scope is the domain-neutral request/reservation contract and a
production DeepSeek transport adapter with mocked tests. Secret unsealing,
Programs UI composition, and live provider calls remain sequential follow-up
work.

Completed:

- the provider boundary now carries a bounded timeout, `AbortSignal`, request
  ID, idempotency key, estimated input usage, and concrete token limits, while
  treating all transport output as `unknown` until Core validation succeeds;
- the built-in DeepSeek adapter is fixed to
  `https://api.deepseek.com/chat/completions` and `deepseek-chat`; it exposes no
  Flow/user endpoint override, requests JSON output with a concrete
  `max_tokens`, rejects redirects, and performs no hidden retries;
- the adapter enforces a 20-second default and 25-second maximum timeout, a
  1-MiB default and 2-MiB absolute response limit, strict response-envelope
  parsing, consistent non-negative usage, and normalized auth, rate-limit,
  timeout, abort, redirect, oversize, malformed, HTTP, and network failures;
- provider composition accepts only a scoped opaque secret resolver. The
  adapter does not read environment variables or durable secret storage and
  does not expose the resolved credential in results or diagnostics;
- a synchronous per-run ledger reserves calls, estimated input plus maximum
  output, and output allowance before dispatch. Diagnosis and patch calls in a
  runtime session share the ledger, so concurrent calls and later retry seams
  cannot independently oversubscribe the same run budget; and
- request identity, timeout, estimated input, and effective limits are retained
  as bounded intervention provenance, while provider free-text remains absent.

Compatibility:

- `AutomationStudioLlmProvider.runTask` now receives the expanded request and
  an optional execution object containing `signal`; existing provider mocks
  must accept the request shape but may ignore the optional second argument;
- the DeepSeek adapter is exported but is not instantiated by the default
  runtime, so existing non-LLM and injected-provider execution is unchanged;
- provider responses without trustworthy usage are charged conservatively at
  the reserved allowance; and
- scoped secret leasing, Secret Keys/LLM Keys Programs UI composition, durable
  provider selection, and live API validation are intentionally deferred to
  the sequential Phase 1B integration.

Validation:

- `pnpm --filter fluxiq check` passed;
- focused LLM harness, DeepSeek transport, and run-budget suites passed 19/19;
- `programs/automation-studio/runtime/service.test.ts` passed 91/91 after the
  shared diagnosis/patch reservation was added; and
- no live provider request was made and no secret source was read.

Independent Phase 1A hardening review:

- Phase 1B composition was paused until the provider boundary was hardened;
- direct adapter calls now revalidate request identity, task/output consistency,
  limits, and timeout, then bound the exact UTF-8 outbound body before asking
  the opaque resolver for a secret;
- secret references are typed opaque objects with validated secret-reference
  IDs; raw/key-like values are rejected, and the concrete adapter is no longer
  re-exported by the broad runtime barrel;
- the harness enforces its own abort/timeout race even for non-cooperative
  providers, bounds nested JSON depth/key/array traversal, replaces
  provider-controlled diagnostic codes/messages, and normalizes parser throws;
- usage totals must be internally consistent before they reach the ledger.
  Missing, malformed, inconsistent, or over-reservation usage consumes the
  full reservation, and every provider/parser terminal path settles the lease;
- the DeepSeek response requires the fixed origin, JSON media type, fatal
  UTF-8 decoding, one choice, and a successful finish reason; and
- ledger identifiers and numeric inputs are validated before state allocation.

Hardened focused validation: Core typecheck passed and provider/harness/ledger
tests passed 22/22. Phase 1B secret leasing and production composition remain
paused until this hardening is independently reviewed.

Round-two review corrections:

- DeepSeek usage is rejected directly when prompt, completion, or total usage
  exceeds the corresponding request limit;
- run reservations now reserve the configured maximum input allowance rather
  than an estimate, preventing valid actual input usage from being
  under-accounted;
- provider-resolution throws become a fixed, sanitized failed intervention and
  gate in the run detail, which both runtime completion paths persist;
- the concrete provider is reachable only through the dedicated provider
  factory seam rather than the broad adapter module export;
- direct request context receives bounded, cycle-safe validation before
  serialization, and provider diagnostics/nested arrays have explicit breadth
  limits without provider-controlled field names in durable issues; and
- each direct input/output limit must be within the total limit and the total
  remains capped at 50,000.

Round-two validation: Core typecheck passed, provider/harness/ledger tests
passed 22/22, and the complete Automation Studio service suite passed 92/92.
Phase 1B was blocked on atomic cost reservation/settlement (or an equally
conservative per-request cost admission rule); no nominal dollar default may
be treated as enforced until that seam exists.

Cost-accounting blocker resolution:

- Core exposes a user-configurable per-request estimated-cost allowance with a
  conservative $0.25 default and a server-enforced $10 absolute ceiling;
- the shared run ledger atomically reserves the full per-call allowance against
  the run ceiling before dispatch, so concurrent diagnosis, patch, and future
  retry calls cannot oversubscribe cost;
- missing, malformed, over-reservation, failed, aborted, or timed-out calls
  retain the full reservation. Only finite non-negative provider cost at or
  below the reservation may release unused capacity;
- runtime composition applies the stricter $0.25 production run ceiling and
  persists only sanitized aggregate accounting in the LLM gate; and
- no provider pricing claim is trusted or inferred. A future versioned-rate
  calculator may reduce reservations only after independent validation.

Final acceptance correction:

- the exported ledger now distinguishes admission reservation from accounting:
  internally consistent actual token/cost usage is always charged even when it
  exceeds the reservation, and the sanitized snapshot increments the budget
  breach count; malformed or unknown usage still charges the reservation;
- oversized patch, instruction, diagnostic, and object containers short-circuit
  without per-item findings; and
- a cycle-safe aggregate guard caps depth, visited nodes, and container breadth
  before provider-result parsing. Enumeration/proxy failures are normalized by
  the harness parser boundary without retaining provider error text.

Final focused validation: Core typecheck passed and provider/harness/ledger
tests passed 25/25, including direct valid-overage accounting and sparse
million-entry/proxy bomb regressions.

## 2026-09-06 Production LLM Phase 1B Backend Grants

Status: backend grant/composition correction and deterministic executor
causality are implemented and locally validated. The authorized diagnosis-only
lane runs only the already-authored Flow with its existing scoped capabilities;
downstream domain policy remains responsible for constraining the live test to
its local fixture target.

Assignment: Core backend grant subagent, following this repository's
`AGENTS.md`. No environment secret was read and no live provider request was
made.

Implemented:

- authenticated mutation endpoints perform sanitized local preflight and issue
  opaque one-use `diagnosis_only` grants only after password plus configured
  PIN verification;
- grants bind actor/session, enabled LLM key ID and revision, DeepSeek provider,
  `deepseek-chat` model, canonical project/Flow and execution dependency digest,
  purpose,
  caller-selected effective token/timeout/cost limits, a fixed one-call limit,
  TTL, and remaining uses;
- request token limits retain the immutable 50,000 hard ceiling, timeout retains
  the 25-second provider ceiling, and estimated cost retains the stricter $0.25
  production ceiling;
- grant claiming is synchronous and atomic before async validation, preventing
  concurrent resolution; live diagnosis requests reject idempotency keys;
- unused grants are actively revoked on an unreferenced expiry timer and all
  grants are revoked when Automation Studio closes;
- key/session/Flow/provider/model/scope/digest are checked again at claim and
  immediately around just-in-time Secret Keys resolution; secret values and
  authorization material are never written to durable state or returned;
- the provider rejects an outbound request body containing the resolved
  credential literal before transport;
- production runtime composition reaches DeepSeek only through the narrow
  provider factory and grant resolver, and propagates the grant's effective
  limits into the harness and atomic run ledger; and
- `diagnosis_only` remains one diagnosis call with no patch, adaptation,
  promotion, auto-recovery, or LLM-authorized external side effects.

Independent review correction completed:

- Secret Keys now owns a generic opaque one-use reveal authorization. It stores
  only a zeroizable password-derived decryption key in process memory; the LLM
  grant stores only the opaque authorization ID and retains neither login
  credentials nor provider secrets;
- grant issuance performs no provider-secret reveal. Decryption happens only
  when the fixed provider is ready to dispatch, and both Secret Keys and the
  LLM grant recheck active membership, claim state, expiry, key revision,
  actor/session scope, and execution digest after asynchronous work;
- the canonical execution digest includes the parent Flow and effective
  settings, Flow Map Router, Subflow records, routed Subflow graph Flows,
  applicable project/Flow/Subflow instructions, and every transitively
  reachable pinned published snapshot. Reachable publication/deprecation
  status, missing targets, and composition-validity results are bound too;
  content hashing detects same-millisecond snapshot and dependency drift. Its
  publication lookup uses canonical execution's global publication universe,
  so a domain Flow calling a globally published Flow in an external project is
  covered, while unrelated, unreachable publication records are not hashed;
- key update, rotation, deletion, capability expiry, cancellation, run failure,
  Automation Studio close, framework close, web-runtime reload, SIGINT, and
  SIGTERM revoke outstanding capability state; and
- focused regressions cover no reveal at grant issue, one-use/atomic claim,
  derived-key zeroization, timer/key/lifecycle invalidation, delayed reveal and
  persistence crossing TTL, same-millisecond dependency mutations, framework
  close idempotency, and production web-owner cleanup.

Validation:

- `pnpm --filter fluxiq check` passed;
- focused API, provider, harness, budget, grant, Secret Keys, and framework
  suites passed 68/68;
- the complete Automation Studio service suite passed 97/97 in 69.36 seconds,
  including the canonical execution-dependency digest regression;
- the publication-universe correction was independently rerun against the same
  97/97 service suite (81.37 seconds of tests): domain-to-external-global
  snapshot mutation and deprecation, missing-target appearance, cyclic traversal,
  insertion-order stability, and just-in-time grant invalidation all passed. A
  focused follow-up also passed 1/1, proving unrelated global publication
  creation and same-millisecond mutation leave the digest unchanged;
- after the authorized executor-causality correction, focused diagnosis grant and
  action-order coverage passed 2/2, and the complete Automation Studio service
  suite passed 98/98 (96.24 seconds of tests). The regression proves one existing
  scoped action executes before the single diagnosis call, its bounded failure is
  included in diagnosis context, no LLM retry or graph mutation occurs, external
  and cross-domain escalation flags are rejected, and a subsequent ordinary
  no-LLM run retains normal IO behavior;
- the complete `fluxiq` package suite passed 91 files / 586 tests with zero
  provider calls, covering IO bridges, executors, grants, budgets, Secret Keys,
  framework lifecycle, persistence, and ordinary runtime behavior;
- `pnpm --filter fluxiq build` passed after the causality correction;
- after the pre-staged-session correction, focused service coverage passed 3/3
  for IO/host causality, domain-native causality, and staged-grant rejection;
  the focused API regression passed 1/1 and the mounted Runtime Debug suite
  passed 3/3;
- the complete Core run passed 587/588 tests; one unrelated pagination
  performance test exceeded its 15-second threshold by 37 milliseconds while
  other checks ran concurrently, then passed alone in 9.49 seconds. The complete
  Automation Studio service file passed all 100 tests in that same full run;
- the Core check and build passed. The web check remains blocked only by the
  previously recorded unrelated `AutomationStudioSession.tsx` transport option
  and duplicate hierarchy-runtime object properties;
- the production web-owner lifecycle suite passed 8/8;
- `pnpm docs:reference` regenerated both deterministic framework references and
  `pnpm docs:check` passed; and
- `git diff --check` passed. The full web-package typecheck remains blocked by
  unrelated concurrent work: an unsupported `transport` property in
  `AutomationStudioSession.tsx` and duplicate object properties in
  `useAutomationHierarchyUiRuntime.ts`. The changed lifecycle module is covered
  by its passing focused suite.

Deferred Phase 1C UI defect:

- `flowHierarchyNodes` can currently emit canonical and legacy entries for the
  same Flow ID with the same `data-tree-item-id` while their labels differ.
  Filtering and clearing the hierarchy can therefore make `.first()` select the
  legacy entry. Phase 1C must deduplicate by canonical Flow identity and add a
  regression for unique tree IDs and stable selection.

Independent acceptance security correction:

- a diagnosis grant cannot attach to a pre-existing runtime session. The API and
  service reject any supplied `runId` and revoke the one-use grant before
  provider resolution or deterministic action execution;
- Runtime Debug issues diagnosis directly as a fresh run and no longer calls
  start-runtime-session for this lane; ordinary modes retain their queued run
  lifecycle;
- graph `authorizedDomainIds` is forced to an empty set for `diagnosis_only`, so
  staged session metadata cannot restore cross-domain authorization. Fresh run
  construction does not copy arbitrary metadata or external-side-effect flags;
- focused service coverage stages a queued session with a cross-domain grant
  and proves rejection occurs with zero provider resolutions and zero actions;
  API coverage proves rejection occurs before the runtime service call; and
- the executor regression now directly covers scoped IO action dispatch,
  before/after host evidence capture, and a separately bound domain-native node.
Authorized executor-causality correction:

- explicit authorization now permits `diagnosis_only` to run the existing
  deterministic Flow through its ordinary bound IO, importer-native, and host
  runtime capabilities. The grant adds no domain authorization: explicit
  cross-domain grants remain incompatible, `authorizedExternalSideEffects` is
  forced false, and all LLM patching, recovery retry, adaptation, and promotion
  paths remain disabled. Core stays domain-neutral; the downstream testing
  facility/domain policy must enforce the local-loopback-only target boundary.

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

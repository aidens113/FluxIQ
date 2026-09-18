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

A recording is complete only once it is finalized: until `endedAt` is stamped
the timeline can still grow, and appends are refused afterwards.
`process-finalized-recording` refuses an open recording outright.
`create-recording-flow-proposals` still accepts one, because a caller may
legitimately want a preview of a recording in progress, but it no longer
returns silently. The result carries an issue naming the recording and the
number of entries it was built from, and the stored proposal is stamped with
`metadata.recordingOpenAtGeneration` and
`metadata.recordingEntryCountAtGeneration`, so the caveat outlives the
response. A proposal built this way is not merely short — it looks finished, so
a reviewer can approve a Flow missing whatever the recorder had not yet
delivered. Neither field appears for a finalized recording.

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

### Where a run begins

A run begins at the node its caller names. A live-patch rerun, for example,
names the node that failed. When no node is named, Core chooses the start from
the graph alone, with `chooseAutomationStudioStartNode`, and never from the
order the nodes are listed in. That order carries no meaning: the project graph
index returns a Flow's nodes sorted by id, and a recorded node's id carries an
unpadded timeline number, so `entry.10` is listed before `entry.2`.

1. **A declared start.** When the graph has exactly one `builtin.control.start`
   node, the run begins there, whatever else the graph holds.
2. **The root.** With no Start node, the run begins at the one node that no
   edge from another node of the graph enters. A node's edge to itself, and an
   edge from a node the graph does not hold, do not count. An End node that no
   edge enters is a root only when no other node is, because a run that begins
   at End finishes there.
3. **Otherwise the run refuses.** It fails before any node runs, with no
   attempt, and its message names the case:
   - several Start nodes;
   - no Start node and several roots, naming up to five of them;
   - no Start node and no root, because every node has an edge into it from
     another node, which only a cycle allows;
   - no nodes at all: "No start node is available in this flow."

A compiled plan's `startNodeId` is chosen by the same rule, and is `null` where
a run would refuse.

A chain generated from a recording has exactly one root, its first candidate,
so a Flow generated into an empty Subflow begins at the first recorded action.
A chain appended beside other nodes gives the graph a second root. Connect the
chains, or add a Start node, before running it.

## LLM-Assisted Deterministic Automation

The next additive Flow expansion treats a Flow as the complete automation
object: interface, router, subflows, scoped instructions, runs, adaptations,
settings, provenance, and publication lifecycle.
The LLM harness is used to generate, repair, adapt, and improve deterministic
automation, then successful behavior is compiled back into durable Flow
structure so token usage scales with novelty rather than execution count.

New Flows are fail-closed: normal execution, no LLM intervention, manual
proposal review, and no automatic adaptation promotion. Fully adaptive
behavior remains an explicit opt-in. Explicit runtime assistance has three
lanes, each against an exact Flow revision. `diagnosis_only` makes one
diagnosis request and cannot patch or create an adaptation.
`diagnose_and_adapt` diagnoses, may gather evidence, and ends in at most one
runtime target-override proposal. `explore_and_adapt` diagnoses, gathers
evidence, and live-tests the runtime patches it proposes within the Flow's own
adaptation policy. Neither adapting lane has a fixed call count; see
[Iterating adaptations and their bounds](#iterating-adaptations-and-their-bounds).
Both may persist proposals for manual review, and neither can auto-apply one or
authorize external side effects. A `diagnose_and_adapt` target override is
structurally validated as an opaque target object and then passes the same
domain check every target override passes, proposed or executed; see
[Repair targets and their refusals](#repair-targets-and-their-refusals). The
proposal records only categorical target/node resolution provenance, is marked
high-risk/external-side-effecting, and is never run as a live patch. The
canonical graph changes only through the adaptation review endpoint,
`review-flow-adaptation`, whose apply runs the promotion gates.
Because the `diagnose_and_adapt` grant is schema-bound to this one proposal
kind, Core enables action-target proposal creation for that run even when the
Flow's normal policy is locked. It does not enable live patch execution,
auto-application, external side effects, or any other mutation class. An
`explore_and_adapt` run gets no such exemption: its patches are held to the
mutation flags the Flow's policy actually sets.

Every provider request carries server-enforced input, output, and total token
limits. Core defaults are 8,000 input, 2,000 output, and 10,000 total tokens.
Persisted Flow settings still carry a call count from one through 64, which the
settings API requires, but no run takes its call count from it; a run's calls
come from its grant. A call count is configuration, not a property of a
runtime intent: only `diagnosis_only` is fixed at one call, because one
diagnosis is all it asks for. Evidence-guided generation makes at most one
evidence decision per call its grant authorizes.
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
and an opaque scoped secret resolver. A per-run reservation ledger is shared by
every call a recovery makes (the diagnosis, each evidence decision, and the
patch), so the total-token, output-token, and estimated-cost budgets, and a
250-call runaway backstop, are reserved before transport dispatch. Failed or
usage-less calls are charged conservatively. The default runtime composes this adapter only through
an opaque, session-bound execution grant. Grant issue requires an authenticated
actor session and a session-scoped Secret Keys unlock established at login; it
does not accept or retain a password or PIN. The grant binds the enabled LLM key
and revision, `deepseek-chat`, a canonical execution digest, effective per-call
token limits, run token budget, call/cost/timeout limits, purpose, and claim
window, and returns no secret. The
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
Claiming is atomic. For each authorized call, Secret Keys creates a separate
opaque, one-use reveal authorization after identity verification and owns only
its zeroizable password-derived key; the LLM grant retains only those opaque
IDs. The provider secret is first decrypted just in time at dispatch, and both
the Secret Keys authorization and LLM grant recheck active state and expiry
(the grant's claim window, or its run lease once claimed) after asynchronous
work before returning it. Neither login credentials nor provider secrets are
retained by the grant or persisted. Unused capabilities expire actively and are
cleared on consume, failure, cancellation, key change, service shutdown,
web-runtime reload, SIGINT, or SIGTERM.
[LLM execution grant lifetime](#llm-execution-grant-lifetime) states what bounds
a grant before and after a run claims it. Core never reads a
provider key from the environment. Flow Settings exposes only DeepSeek and
deepseek-chat, selects only enabled Secret Keys metadata in global or current
Flow scope, and persists per-request input/output/total token limits, a call
limit, timeout, estimated-cost cap, and zero-retry policy. The settings API
rejects totals above 50,000, input-plus-output reservations above the total,
call limits outside one through 64, retries other than zero, timeouts above 25
seconds, and cost caps above USD 0.25. Runtime Debug exposes separate **LLM
diagnosis** and **Diagnose and propose adaptation** modes, performs
purpose-specific preflight, and issues the scoped grant from the authenticated
session: one call for diagnosis, and Core's default call count for the adapting
mode, whose request names none. It does not offer `explore_and_adapt`, which is
reachable through the API. Issuing a grant whose run token budget, or whose
per-call total limit, is above 100,000 tokens additionally requires an explicit
high-token confirmation; the call count alone never does. Server
failures are presented as fixed, sanitized messages. Explicit grants are
attached only to run-runtime-session; ordinary deterministic modes do not
receive them. Every explicit runtime lane must create a fresh runtime session:
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
changes. The purpose is runtime-enum validated.

The grant module's own request check lets each purpose match only its own task
kinds. A purpose says what may be asked for, never how many times:
- `diagnosis_only` matches runtime diagnosis.
- `diagnose_and_adapt` matches runtime diagnosis, evidence tool decision,
  runtime patch, loop plan, and loop verification requests.
- `explore_and_adapt` matches those, plus instruction suggestion and router,
  subflow, expectation/action-target, and change proposal requests.
- `build_and_adapt` matches all of those, plus flow bootstrap.

The production provider resolver, bound in `createGlobalProgramRuntime`
(`programs/_shared/runtime.ts`), narrows each purpose further to the entry point
it arrived through, and a call whose task kind is outside that list is refused
and its grant revoked:
- `build_and_adapt` resolves `flow_bootstrap` and `evidence_tool_decision`, the
  two task kinds Flow bootstrap generation sends; the second is sent only when
  generation is evidence-guided.
- `diagnose_and_adapt` and `explore_and_adapt` resolve `runtime_diagnosis`,
  `evidence_tool_decision`, `runtime_patch`, `loop_plan`, and
  `loop_verification`, the task kinds a runtime recovery sends. A failed run
  never reaches instruction suggestions or change proposals, whatever its grant
  allows.
- `diagnosis_only` resolves `runtime_diagnosis`.

A request that carries no execution grant resolves no provider.
`runRuntimeSession` accepts only `diagnosis_only`, `diagnose_and_adapt`, and
`explore_and_adapt` grants, so a build grant never reaches runtime diagnosis,
patch, or proposal tasks. [What the shipped app reaches](#what-the-shipped-app-reaches)
lists which runtime paths each purpose gives a provider.

Calls are sequential and atomically claimed; each call consumes a separate opaque,
one-use Secret Keys authorization and receives a grant-owned abort signal. An
iterating grant allows 26 calls unless its request names a count, and never
more than 64; a `diagnosis_only` grant allows one. A grant allows no provider
retries, at most 50,000 total tokens per request, a
finite per-call timeout and cost ceiling, a finite aggregate estimated-cost
ceiling of at most USD 2, and a run token budget, `maxTotalTokensPerRun`. By
default that budget is the per-call total limit times the calls, held to
100,000. The grant refuses a call whose worst case would cross it and charges
each call what it reported using, or its worst case when that report is missing
or inconsistent. Provider completion is not result acceptance:
Core revalidates the grant's lifetime, active membership, actor/session, key
revision, dependency digest, and settings revision at a mandatory commit
boundary before returning a result for parsing or accounting. The end of the run
lease, explicit cancellation, abort, user/session revocation, a failure that
ends the grant, or service close aborts the in-flight call and revokes all
unused authorizations. A failed call that only spent itself leaves the grant
as it was; [What a failed call does to its grant](#what-a-failed-call-does-to-its-grant)
says which is which. No password, PIN, or provider plaintext is retained or
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

`state.*` is what the host observes where the run starts, not what a caller
passed. Before routing, `runRuntimeSession` asks the bound host runtime's
optional `observeRouteState` for the state (`runtime/route-state.ts`), but only
when an active rule reads a `state.*` path; keys the host returns replace the
same keys in a caller's `inputs.state`. A host declares the paths it fills in
`routeStatePaths`, so a model can write a condition on a path that is absent
right now. The decision record keeps each rule's verdict, the matcher's reason
(which names the path and the test, never a value read), and which state paths
were read and whether the host observed them; the observed values themselves
are never stored.

A model-authored Router always carries conditions. In the Flow script a route
is a block -- `subflow <label>: <situation>`, one or more `when: <condition>`
lines, its steps, `end` -- and the steps outside every block are the fallback.
Core reads each `when:` line into an `AutomationConditionExpression`
(`runtime/flow-bootstrap/authoring/condition.ts`) and derives rule keys, order,
ids and wiring. Plan validation (`plan/route-validation.ts`) refuses a rule
with no condition (`bootstrap.route_condition_missing`: it would always hold,
so nothing after it could run), two rules testing the same thing
(`bootstrap.route_shadowed`), a condition the router cannot evaluate, and a
Subflow no rule and no fallback reaches (`bootstrap.subflow_unreachable`).
A Flow build is shown `flowBootstrap.routing` (`plan/routing-context.ts`): how
the router decides, the Flow's current structure, every path a condition can
test with its description, and the distinct states the host observed -- where
a run starts, then after each exploration step -- screened with the domain's
denied evidence keys, with credential-shaped values left out.

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
local recovery reroute, then LLM diagnosis fallback. The LLM diagnosis rung is
offered only when the run's training behaviour allows the LLM
(`allowLlmDiagnosis` on the graph options, set from `invokeLlm`); with the LLM
off, a failed node with no deterministic recovery ends `exhausted`. Recovery budgets can cap
retries per action, recovery attempts per subflow, reroutes per run, and
adaptation/LLM attempts per run; exhausted budgets produce terminal failure
metadata instead of looping. An LLM attempt is one recovery, not one provider
call: the calls inside it are bounded as described in
[Iterating adaptations and their bounds](#iterating-adaptations-and-their-bounds).

Failed attempts carry a structured failure when one is known. Core owns the one
category list, `AutomationStudioAdaptiveFailureClass`, exported from
`@fluxiq/contracts` with `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES` and
re-exported by `fluxiq/automation-studio`. A domain decides which member
applies and reports an `AutomationStudioFailureRecord` (`category`, a
producer-owned `code`, `retryable`, and optional `stage`, `expected`, `actual`,
and `evidenceDigest`) on the gateway action result, the runtime command result,
or the output dispatch result. A host may also attach one to an expectation
verdict that rejects a node's `expectedState`.
`parseAutomationStudioFailureRecord` accepts only exact, bounded,
self-consistent records and drops anything else whole.
The record travels from the dispatch result through the node result to the
attempt trace and the persisted action record, and the LLM recent-action
context carries its category but not its code or texts. Transition comparison
and adaptive failure classification read the record first; matching the
attempt's message remains only for attempts recorded without one. Core also
names the failures its own structured signals prove: a `timed_out` command is
`timeout`, a `rejected` command is `blocked_by_capability_or_policy`, a
dispatched output whose bound confirmation input never arrived is
`output_not_observed`, a succeeded attempt whose `expectedState` the host
rejected without a record that parses is `expected_state_missing`, and an
element target with no confident candidate is `target_not_found`. Output-dispatching attempts also record `targetResolution`
beside `stateRefs`: the resolution status, the candidate count, the confidence
threshold, and the best candidate's score and signals. An attempt dispatched
without runtime candidates records `unresolved_no_candidates` with a count of
zero and no threshold: Core scored nothing and enforced no floor, and resolving
the element was left to the output's adapter.

The trace a run persists withholds every value that run resolved out of a
parameter state binding, and every input the run was given. `runAutomationStudioGraph`
is the one place a run trace is produced, and it rewrites the finished trace on
the way out:
- **A resolved value** is kept only when it is identical to the one the Flow
  document carries at the same position. Anything resolution supplied is
  replaced in place by `AUTOMATION_STUDIO_WITHHELD_VALUE` (`[withheld]`): in
  effect payloads, outputs, inputs, run values, and state diffs, and inside the
  prose of messages and failure records.
- **A run input** is withheld by position: in the trace's `values` and in each
  attempt's `inputs`, wherever the entry still holds the value the caller
  supplied, whether or not a node reads it. A value the run computed that equals
  an input is kept. An input no binding reads, copied by a node into an output
  under another key, is not withheld at that copy.
- **A Call Flow child's withheld values** are withheld from its parent's saved
  trace as well, and the attempt keeps the child's saved trace.

A run's supplied inputs are withheld at rest outside the trace too: the runtime
session record's `metadata.inputs` and the run-summary envelope keep each key
and read `[withheld]`. Ids, statuses, routes, and timestamps are never
rewritten.

Execution reads real values; only the saved copies are withheld. The run executes
with the real value, a Call Flow parent builds its outputs from the trace its
child executed, and a live-patch rerun is seeded from the failed attempt as the
run executed it. So the trace still explains a failure without carrying the
credential that caused it. The rules and the reasoning are in
[Automation Studio native and importer nodes](automation-studio-native-nodes.md#a-resolved-value-never-reaches-the-persisted-trace).

Whether an expected state actually holds is the host's decision, not Core's. A
host runtime boundary may bind `expectationEvaluator(conditions, mode,
timeoutMs, context)` beside `captureStateSnapshot`, `inspectStateDiff`, and
`rollbackHint`, and `bindHostRuntime` carries it into every graph run. The
`builtin.policy.expectation` node awaits it and routes `failed` with an
`expected_state_missing` failure when the host rejects. For any other node
whose attempt succeeded and that carries an `expectedState` with at least one
key, the transition comparison asks the host after the action (an empty
`expectedState` names nothing to check and counts as none), naming the snapshot the attempt
ended on, and reports the conditions the host checked instead of counting
expected-state keys. A rejection there fails the attempt: its status and route
become `failed`, its message is the host's, and its `failure` is the host's
record when that record parses, otherwise Core's `expected_state_missing`
record with code `core.policy.expectation_rejected`. The comparison keeps the
host's verdict against the action's own outcome. The run then routes the
attempt as it routes any failed attempt, so the next node is not dispatched
unless a failed-route edge or the recovery ladder leads there. Failed, waiting,
and cancelled attempts are not asked, an evaluator that throws leaves the
attempt as it was, and a host that binds no evaluator is unchanged: the
expectation passes unconditionally and expected state is read from the
attempt's own route as before. A recording mapper can propose that
`expectedState` for a recorded action;
[Recording-derived nodes](automation-studio-native-nodes.md#recording-derived-nodes)
describes how it reaches the node.

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
Subflow-entry evidence in run detail. A routed retry reruns the selected
Subflow's graph from that graph's start;
[What the shipped app reaches](#what-the-shipped-app-reaches) says when the
shipped app retries at all.

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
checks adaptation policy and side-effect approval before execution, and a
target override also needs the domain check to accept it. A
successful patch can mark the original action retryable and produce a candidate
adaptation; structural fixes are reviewed through the same adaptation surface
according to approval mode. Failed patches remain run evidence and rejected
adaptation candidates. The clone starts at the failed node, or at the node a
reroute or node-targeted patch names. The shipped app gives live patch testing
no provider; see [What the shipped app reaches](#what-the-shipped-app-reaches).

Adaptations are reviewable change evidence. The Adaptations workspace groups
them by status, shows trigger/diagnosis/failed action/patch/validation/risk
detail, and routes review actions through privileged service mutations.

Applying a runtime adaptation first passes its promotion gates,
`evaluateFlowAdaptationPromotionGates` in `runtime/recovery/adaptation-promotion.ts`.
They ask for evidence, not for the absence of an objection:

- **A succeeded trial or replay, or a named reviewer's approval.** The gates
  read the confidence tier the saved validation results earn
  (`decideAutomationStudioChangeConfidence` in `runtime/flow-change/`). A result
  with no kind counts as a trial, and a result of any other kind counts for
  nothing. A `validated` status is a claim, not evidence. The reviewer is read
  from `metadata.review.approvedBy` and is never `runtime`. An approval never
  outweighs a failure: while the latest counted trial or replay is a failure,
  the adaptation is refused.
- **Not destructive, disabled, or rejected.**
- **A linked change proposal** for a structural adaptation.
- **A target** on every patch except `create_subflow`.

Review tries the typed project store first, then the Flow Bootstrap lifecycle,
then the file-backed applier, and the two runtime-adaptation paths both run the
gates. The typed store, `AutomationStudioProjectAdaptationStore.applyApprovedAdaptation`,
takes them as a required `promotionGates` argument, because importing them
would close a module cycle. Missing gates, gates that throw, or anything but a
consistent verdict refuse the apply and record a `policy_blocked` audit event.
For an approval that predates `metadata.review.approvedBy`, the store hands the
gates the latest named `approved` audit event instead.

Applying an adaptation records a reversible application record instead of
silently editing Flow JSON; structural changes continue through adaptation
review. In the typed store an apply is one graph patch. It writes each changed
node's whole parameter map, so the stored inverse restores it exactly, and
stamps the node with the adaptation ID. An action-target repair is written
where the node reads its target when it runs. For a native node that is
`parameterValues.target`. A recorded step is a `builtin.policy.action` node,
which dispatches only its `parameters` payload, so its repair is written to
`parameterValues.parameters.target`. A recorded step whose payload is not a
plain object is refused rather than recorded as applied, and so is any
`edit_recovery` patch, which has no durable form. In the shipped app, automatic
promotion never applies an adaptation; see
[What the shipped app reaches](#what-the-shipped-app-reaches).

Training modes make adaptation temporary and explainable. Normal mode keeps
LLM intervention and adaptation creation off by default. Train-for-N-runs and
train-until-stable enable adaptive behavior only inside an explicit window,
while continuous adaptive mode keeps learning open. Stability metrics combine
deterministic successful runs, LLM interventions per run, unresolved failures,
repeated triggers, accepted/rejected adaptations, and time since structural
change. Budgets cap interventions, tokens, and cost, and frozen Flow/route/
subflow scopes can collect evidence without auto-applying structural changes.
In the shipped app, no training window reaches a provider; see
[What the shipped app reaches](#what-the-shipped-app-reaches).

### What the shipped app reaches

The service can run every path above for a host whose provider resolver returns
a provider. The shipped app's framework host builds its programs with
`createGlobalProgramRuntime`. That resolver returns a provider only for a request
that carries an explicit execution grant, and only for that grant purpose's task
kinds. Each path reaches a model as follows:

- **Flow bootstrap generation:** a `build_and_adapt` grant.
- **Runtime diagnosis:** a `diagnosis_only`, `diagnose_and_adapt`, or
  `explore_and_adapt` grant. A run without a grant gets no provider in any
  training mode. When a training window lets such a run ask, the harness
  records `llm.provider_missing` and calls no model.
- **Evidence gathering during a recovery:** a `diagnose_and_adapt` or
  `explore_and_adapt` grant. Each `evidence_tool_decision` call chooses one of
  the domain's registered evidence tools. The captured failure evidence goes to
  the diagnosis and the patch only, never to these calls.
- **Runtime patch requests:** a `diagnose_and_adapt` or `explore_and_adapt`
  grant. The `diagnose_and_adapt` lane saves its one target override as a
  high-risk proposal and never executes it. The `explore_and_adapt` lane sends
  each patch to live patch testing. A `diagnosis_only` run sends no patch
  request, because its lane turns adaptation creation off.
- **Live patch testing:** an `explore_and_adapt` grant, which Runtime Debug does
  not offer and an API caller must request. Its patches run against a cloned Flow
  with the run's own execution options, for at most 50 steps, only when the
  Flow's adaptation policy allows runtime recovery and that patch kind. An
  explicit run never carries external side-effect authorization, so a
  side-effecting patch is refused wherever the policy disallows external side
  effects or requires approval for them. The `diagnose_and_adapt` lane never
  executes its patch, a `diagnosis_only` run sends no patch request, a run
  without a grant has no provider, and `runRuntimeSession` refuses a
  `build_and_adapt` grant.
- **Automatic promotion:** no grant purpose. Core attempts it for each adaptation
  a runtime patch saves, which in the shipped app comes only from an adapting
  grant. Every explicit run is forced into manual proposal mode, and the
  promotion gate sends manual-mode adaptations to review; a `diagnose_and_adapt`
  proposal is high-risk as well. An adaptation is applied only through the
  review endpoint, `review-flow-adaptation`, which needs `flows.write` and a
  pass from the promotion gates, not a PIN.
- **The retry after an applied patch:** no grant purpose. The retry runs only
  when a runtime patch was applied automatically and marked the original action
  retryable, which the shipped app never produces — and then only when that
  patch’s trial also vouched for continuing, after which it resumes at the
  trial’s resume point instead of the Flow’s start. A run with an explicit grant
  skips the retry at both of its call sites in `runRuntimeSession`.
- **Training modes:** every canonical run in a project still computes its
  training-mode behavior, records it in run detail, and takes its recovery
  budget from the Flow's settings and policy. The LLM intervention, adaptation
  creation, and promotion a training window turns on still need a provider,
  which a run without a grant does not get. A run with an explicit grant
  replaces the window's behavior with its lane's. `diagnosis_only` turns
  recovery, adaptation creation, and promotion off. `diagnose_and_adapt` turns
  recovery off and allows only its one manual-review proposal.
  `explore_and_adapt` also turns recovery off and allows manual-review
  proposals within the Flow's policy. An exhausted training budget stops none
  of the explicit lanes; each spends its grant's budget instead of the training
  settings'.

In a host whose resolver lets a run reach the retry, the retry reruns the updated
Flow, or a routed run's selected Subflow graph, in the same run session. It
starts from that graph's start, not from the failed node. The retry passes the run's
graph options, which set no `startNodeId`, so the executor chooses the start
node as it does for a new run.

### What a trial proved, and whether the run may continue

A trial of one change answers two questions, and Core keeps them apart because
the cost of confusing them is not symmetric. `decideAutomationStudioChangeVerdict`
(`runtime/flow-change/verdict.ts`) answers **was the change proved?** over the
attempts the trial made, per changed node and from observed evidence only.
`decideAutomationStudioChangeResume` (`runtime/flow-change/resume.ts`) answers
**may normal deterministic execution continue, and from where?** It reads the
same checks and never the proof outcome, so neither answer can stand in for the
other.

A verdict therefore carries three things beside its outcome. `checks` is what
was looked at and how each came back. `resumeFrom` is where the run reached —
the node the last changed node’s route led to and that route, or a finished
run, naming the Subflow whose graph holds that node id when the trial ran inside
one. It is present whatever the outcome, because where a run got to is a fact
the trial observed: a change that proved nothing, or that was contradicted,
still left the run somewhere and the loop still needs to know where. `resumable`
is the permission, and it is false unless all of the following hold:

- There is a resume point.
- No check failed.
- No check is `unknown`. A check exists because something declared it, so
  "could not tell" is not "held", and that outranks other evidence that did
  pass: a change proved by a later assertion whose own node’s declared state
  the host could not evaluate is verified and **not** resumable.
- At least one evidence check passed. An action that ran without failing has
  shown nothing, so success alone never makes a run resumable.

`notResumableCode` names which of those refused: `no_checks`, `check_failed`,
`check_unknown`, `no_resume_point` or `no_evidence`.

The retry after an applied patch is what reads that permission.
`decideAutomationStudioAdaptiveRetry`
(`runtime/service/adaptations/adaptive-retry.ts`) takes it back off the run’s own
`runtimePatchAttempts` receipts, which carry `resumable`, `notResumableCode` and
`resumeFrom`: by the time `runRuntimeSession` reaches the retry the trial is
over, and the receipt is the only copy of its verdict left. A retry the verdict
declined to vouch for does not run, and the run detail records
`adaptiveRetry: { attempted: false, notResumableCode }`, so a person reading the
run afterwards sees which check refused rather than a bare stop. A retry that
does run starts at `resumeFrom.nodeId`, not at the Flow’s start node:
re-running a Flow from its beginning takes every side effect it had already
caused a second time. The caller fails closed on top of the decision, and adds
four codes of its own — `resume_decision_missing` for a receipt that never
answered the question, `resume_point_subflow_mismatch` for a point that does not
name the Subflow graph the retry would run, `resume_point_completed` for a Flow
the trial already ran to its end, and `resume_points_disagree` for two repairs
that vouched for different continuations.

A check that passed only because the seam feeding it is inert is read as
`unknown` by the resume decision rather than as a pass. The `records` check is
the one such seam today: nothing writes a declared minimum until extraction
does, so rows captured against no minimum still prove the change — they are a
real observation — but the check carries `records_minimum_undeclared` and the
run does not continue on it.

The same rule governs the host’s answer about expected state. A host reports
`checkedConditionCount` beside `passed`, and `passed: true` over a short count
is its documented answer for "nothing I could look at said otherwise", not "the
evidence held" — the common answer when a condition names something the host
cannot be asked. The trial counts such an answer as `unknown`, so it never
becomes `expected_state: passed`, and a change whose evidence nobody looked at
is neither verified nor resumable.

### Iterating adaptations and their bounds

A recovery under an adapting grant is a diagnosis, then an exploration that may
ask for evidence for as long as it keeps learning something, then a patch. No
stage has a fixed call count, and a small call count is not what bounds a
recovery. Iteration stops on the first of six guards, and each reports under
its own name:

1. **Estimated cost.** The run ledger refuses a call that would cross the run's
   estimated-cost ceiling (`llm_budget.run_cost_limit`). With a grant the
   ceiling is the grant's total, and never more than USD 2 for one recovery.
   Without one it is the adaptation policy's, and never more than USD 0.25.
2. **Tokens.** The ledger refuses a call that would cross the run's token budget
   (`llm_budget.run_total_limit`, or `llm_budget.run_output_limit` for output).
   With a grant the budget is the per-call total limit times the grant's calls,
   held to the grant's `maxTotalTokensPerRun`. Without one it is the training
   settings' `maxTokensPerRun`, or 144,000 when that is unset.
3. **The recovery deadline.** A recovery has one clock, started once when it
   begins: 600 seconds, which is also the most any recovery clock may be. An
   exploration it stops reports `recovery_deadline_expired`, as distinct from
   its own `wall_clock_expired`. The per-call timeout, 20 seconds by default and
   45 at most, still catches a single hung call.
4. **No progress.** An exploration step advances only when it brings back
   something the exploration did not already have. Three consecutive steps that
   do not advance stop the exploration with the outcome `no_progress`, separate
   from `budget_exhausted`. The reason names which failure it was: a repeated
   request, an answer already held, an empty or refused answer, or an unusable
   decision. Any step that advances resets the count.
5. **Unusable decisions.** A decision call that reached the provider and came
   back as nothing the exploration can act on is asked again rather than ending
   the exploration. That covers a reply that failed Core's checks (an
   `llm_output.` finding) and every provider failure the grant treats as a spent
   call: a malformed, invalid, truncated, or oversize reply, an unusable usage
   report, a timeout, a network error, rate limiting, or an HTTP 5xx. Each one is
   charged like any other call and counts as a step that did not advance, with
   the reason `unusable_decision`, so three in a row stop the exploration as
   `no_progress`. Any other failure, such as a refused budget, a pre-send
   refusal, or an ended grant, ends the exploration.
6. **The patch reserve.** Before an exploration starts, the recovery reserves
   one patch-sized call on the run ledger: the patch's token limits and its
   per-call cost. The ledger refuses, on its ordinary codes, any exploration
   decision that would eat into that reservation, and the recovery releases it
   just before the patch. A reservation the run cannot afford is not taken. When
   the grant declares a call count, the exploration's own call ceiling is
   lowered to what remains after the patch, so a long exploration ends on its
   own limit and the patch still runs.

Call counts survive only as backstops that a working recovery should not meet.
The run ledger stops at 250 calls, or at the grant's call limit when a grant
declares one; the grant mints exactly that many reveal authorizations, so the
ledger refuses the next call with `llm_budget.run_call_limit` rather than let
the grant fail it. An exploration also stops at 24 decisions and 24 actions by
default, and at most 64 of each. A default grant's 26 calls are a diagnosis, a
patch, and those 24 decisions, so the grant does not stop a default recovery
that is still making progress.

Every call is itemized. The run ledger writes one record at the moment it
counts a call, so the records and the totals cannot disagree, and a recovered
run's detail keeps them at `metadata.llmGate.providerCalls`, beside the totals
in `metadata.llmGate.costAccounting`. This is the only place the evidence
decisions between the diagnosis and the patch are itemized, because they leave
no intervention. Each record carries its position, request ID, task kind, loop
stage, whether it was an `exploration` or an ordinary `run` call, prompt
version, provider and model, and its validation result with at most 16 issue
codes. It also carries `reported`, the provider's own figures with `null`
wherever the provider gave none, and `charged`, what the ledger put on the
run's account, whose `tokens` and `cost` say whether each came from the report
or from the reservation. A record never holds prompt text, response text, or a
diagnostic message. The receipt lists at most 250 calls, and
`metadata.llmGate.providerCallsOmitted` counts any beyond that.

Evidence-guided Flow Bootstrap follows the same model. Its loop makes at most
one decision per call its grant authorizes, and at most 64, with at most one
more tool call than decisions. Each decision reserves the grant's total
estimated cost divided by its calls. Underneath, the grant enforces its token
and cost totals on every call, and the loop stops a repeated request or a
repeated observation with no change in between. An unusable decision, or a
completed plan that Core refuses, spends that decision and the loop asks again.
Three such decisions in a row, or fewer when the loop allows fewer decisions,
end creation as `flow_bootstrap.evidence_unusable_decision`.
Bootstrap has no run ledger, so a bootstrap that runs out of the grant's tokens
or money fails as a provider request failure rather than on a named budget
code.

The worst case for one recovery follows. The figures come from the run
ledger's estimated-cost accounting and DeepSeek's peak prices of USD 0.44 per
million input tokens and USD 1.32 per million output tokens. They are
arithmetic, not a measured run.

| Recovery | Calls | Tokens | Estimated-cost ceiling | Wall clock |
| --- | --- | --- | --- | --- |
| Default adapting grant (`diagnose_and_adapt` or `explore_and_adapt`, no numbers named) | At most 26: one diagnosis, up to 24 evidence decisions, one patch | At most 100,000, of which at most 52,000 output | USD 2.00; each call reserves USD 2/26, about 0.077 | 600-second recovery deadline; 600-second grant lease from the claim |
| Confirmed maximum grant, at default per-call limits | At most 64 | At most 640,000, of which at most 128,000 output | USD 2.00 | 600 seconds |
| No grant | 250-call backstop; at most 24 exploration decisions | At most 144,000 | USD 0.25 | 600 seconds |
| `diagnosis_only` grant | 1 | 10,000 | USD 0.25 | 600 seconds |

At those prices the token budget binds long before the cost ceiling. The most a
default grant's 100,000 tokens can cost is about USD 0.09, spent as 52,000
output and 48,000 input tokens. A confirmed maximum grant can cost about USD
0.39. A recovery without a grant costs at most USD 0.25, and by tokens alone
about USD 0.06 to 0.19. DeepSeek refuses a reply above a call's token limits,
so no single call can spend more tokens than it reserved.

### LLM execution grant lifetime

A grant has two lifetimes, and they bound different things.

- **The claim window** bounds how long an issued grant may wait for a run to
  claim it. It is the issue request's `ttlMs`: 60 seconds by default, from one
  to 300 seconds. Secret Keys never lets an authorization outlive the actor's
  session unlock, so the window also ends no later than that unlock. Every
  reveal authorization minted at issue, one per authorized call, lives only as
  long as this window. The grant's public `expiresAtMs` is the end of the
  window, not the end of the grant's life once claimed. An unclaimed grant is
  revoked when its window ends, together with every authorization minted for
  it, and a claim made after the window is refused even if the timer has not
  yet run.
- **The run lease** bounds how long a claimed grant may keep making calls: 600
  seconds from the claim (`AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS`).
  Claiming replaces the claim-window timer with a lease timer, so a run is not
  cut off when its claim window ends. When the lease ends, the grant is
  revoked, a call still in flight is aborted as `llm.provider_timeout`, and a
  reveal that completes after the lease is discarded. The lease is a backstop.
  It is at least as long as the longest recovery deadline, and the recovery
  clock starts before the grant is claimed, so the recovery deadline ends a
  recovery first.

**The one-for-one exchange.** A call whose authorization would expire before
the call's own time window ends exchanges it for a fresh one. That window is
the larger of one second and the grant's per-call timeout. This covers every
call made after the claim window, and any call made too close to its end.
Secret Keys mints the fresh authorization from the actor's session unlock,
which must still be active. The fresh one is sized to that one call and capped
by the time the unlock has left, and the old one is revoked. The exchange
replaces only the authorization already taken for this call, so a grant can
never reveal the key more times than its call limit. If the grant is revoked,
cancelled, or superseded while the fresh authorization is being minted, or the
key changes, the fresh authorization is revoked at once and never used.

**What ends a claimed grant early.** Each of the following revokes the grant,
and every authorization it still holds, before its lease ends:

- the runtime session revoking it when the run ends;
- its last authorized call completing;
- a call that fails in a way that ends the grant (see below), is cancelled from
  outside, or asks for a task kind outside its entry point's list;
- a call whose worst case would cross the grant's total estimated cost or run
  token budget;
- the actor's identity session becoming invalid, which is checked on every
  call;
- the actor's Secret Keys session unlock ending, after which a call that needs
  a fresh authorization fails;
- the key being disabled or changed, or the Flow's execution digest or settings
  revision changing;
- revocation of the user or session, and service shutdown.

### What a failed call does to its grant

A failed provider call either ends the grant or only spends the call, and the
failure's code decides which, never its message.
`AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS`
(`runtime/llm/failure-disposition.ts`) gives every provider failure code one
meaning. It is a closed `Record` over the provider contract's codes, so a new
code without a meaning does not compile.

| Disposition | Codes | What happens |
| --- | --- | --- |
| Ends the grant: authorization or integrity | The 17 pre-send refusals (request built or configured wrongly, including a credential found in the outbound body); `llm.provider_secret_unavailable`, `llm.provider_auth_failed`, `llm.provider_redirect_rejected`; `llm.provider_aborted`; `llm.provider_usage_limit_exceeded` | The grant is revoked at once. |
| Spends the call: the network or the model | `llm.provider_timeout`, `llm.provider_network_error`, `llm.provider_rate_limited`; `llm.provider_malformed_response`, `llm.provider_output_invalid`, `llm.provider_output_truncated`, `llm.provider_output_padding_truncated`, `llm.provider_response_oversize`, `llm.provider_usage_invalid` | The call is counted and charged its worst-case tokens, as a successful call would be charged, and the grant keeps its remaining calls. |
| Spends the call only for a server error | `llm.provider_http_error` | A 5xx status spends the call. Any other status is the provider refusing the request, and ends the grant. |

A spent call keeps the grant only when all of the following hold: the key had
already been handed to the provider for that call, the grant is still the same
claimed grant inside its lease, the call is still its current call, and the
grant still validates afterwards. Anything that is not a typed provider failure,
including the grant's own refusals, a Secret Keys error, and an untyped
exception, has no code and ends the grant. A caller's deadline that ends a call
already handed to the provider settles that call as spent; one that fires
earlier, inside the grant's own authorization steps, ends the grant. Any other
abort from the caller is a cancellation and ends the grant.

### Repair targets and their refusals

Every target override passes one check, whether it is saved as a proposal or
run as a live patch (`checkRuntimeTargetOverride` in `runtime/live-patch.ts`).
Core first aims the override at the node whose attempt failed. It replaces a
different node the model named, and refuses the override when the failed node
is not in the current Flow. The bound domain's `validateTargetOverrideEvidence`
then judges the target against the evidence the model was shown. It receives
the failed action's node ID, definition ID, and `outputId`. The `outputId` is
the registered output the node dispatches: a policy action's
`parameterValues.outputId`, or the `outputActionId` a Flow Bootstrap wrote into
the node's metadata. It is absent where the Flow names neither. A recorded step
is always a `builtin.policy.action` node, whatever its verb, so `outputId` is
the only part of that identity that says which action failed. The domain may
accept the target (`matched`) or return one exact replacement (`resolved`),
which Core validates before using. Anything else refuses the override, and so
does a host that binds no validator.

A refusal carries its status, `absent` or `ambiguous`, and optionally a reason
from Core's closed vocabulary,
`AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS`. Core keeps a
domain's reason only when it is one of these words and drops anything else, so
a domain's own text never reaches an issue a person reads.

| Reason | Meaning |
| --- | --- |
| `action_not_repairable` | The failed action offers nothing a repair may re-point. |
| `parameter_not_offered` | The target names a parameter the failed action does not offer. |
| `parameter_missing` | The target leaves a required parameter unnamed. |
| `target_malformed` | The target is not a map of parameters to handles. |
| `handle_not_issued` | A handle is not one the evidence issued, and nothing else in it could stand in. |
| `handle_incompatible` | A handle names something the failed action cannot use, and nothing else in the evidence could stand in. |
| `handle_ambiguous` | A handle names more than one thing in the evidence. |
| `no_compatible_element` | Nothing in the evidence could fill a parameter. |
| `evidence_unrecognized` | The evidence is not a packet the domain issued. |
| `domain_check_unavailable` | Core's own: no domain check is bound to judge the target. |

The refused patch's preflight issue states the status and then, when there is
one, the reason's meaning and its code. The patch result keeps the refusal as
`metadata.targetOverrideRefusal`, and the run detail records every patch
attempt, refused ones included, in `metadata.runtimePatchAttempts`, each with
its `targetOverrideRefusal`. A refused override creates neither an adaptation
nor a change proposal.

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
  matching used by recording mappers and native runtime output logic. It is the
  one Automation Studio folder published as its own package subpath,
  `fluxiq/automation-studio/fingerprinting`, because a host that scores element
  candidates runs where the elements are and may have no Node runtime at all.
  The folder therefore holds no runtime imports, and a test inside it fails the
  build if one appears. See [package boundaries](package-boundaries.md).

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

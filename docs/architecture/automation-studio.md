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

A partial run also names where it stops: `stopAfterNodeId` in
`AutomationStudioGraphExecutionOptions` (`runtime/executor/partial-run/`).
The run ends `succeeded` with `stopReason: "stopped_at_node"` once that node has
run and its attempt is recorded, without leaving it by any way: its edge, its
failed route, a continuation past a failure, its declared skip, or a forward
state route. A state route from another node that would take the run strictly
past the stop node -- to a node reachable from it with no way back -- stops the
run too; a route back to an earlier step is followed, and a route onto the stop
node runs it. Like `startNodeId`, it belongs to the root graph:
`runCanonicalAutomationStudioFlow` never hands it to a Call Flow child. A partial
run tests part of a Flow; it never decides whether a change is kept (see
[Applying a runtime patch waits for a judged whole run](#applying-a-runtime-patch-waits-for-a-judged-whole-run)).

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
Because a `diagnose_and_adapt` run is schema-bound to this one proposal
kind, Core enables action-target proposal creation for that run even when the
Flow's normal policy is locked. It does not enable live patch execution,
auto-application, external side effects, or any other mutation class. An
`explore_and_adapt` run gets no such exemption: its patches are held to the
mutation flags the Flow's policy actually sets.

Every provider request carries server-enforced input, output, and total token
limits. Core defaults are 8,000 input, 2,000 output, and 10,000 total tokens.
Persisted Flow settings still carry a call count from one through 64, which the
settings API requires, but no run takes its call count from it. A call count
is configuration, not a property of a runtime intent: only `diagnosis_only` is
fixed at one call, because one diagnosis is all it asks for. What bounds every
other run is its budget; see
[Iterating adaptations and their bounds](#iterating-adaptations-and-their-bounds).
No request setting may raise the absolute total-token ceiling above the
model's context window, 1,000,000 tokens
(`AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`). Core measures
a request once, with one estimator (UTF-8 bytes / 3), on the larger of the
packed request and what the provider says it will send (`measureInput`), and
rejects it before provider invocation when that estimated input plus the output
allowance exceeds the effective total. The refusal states the estimated tokens,
the bytes and the window; nothing is trimmed to fit. Provider transport output
is untrusted: the harness parses strict registered structures, rejects extra
fields and malformed usage, normalizes provider throws to terminal diagnostics,
and persists only a compact structured-result summary without provider
free-text or arbitrary metadata.

Core also exports a production transport seam and a built-in DeepSeek adapter.
The adapter has one fixed HTTPS chat-completions URL and a configured set of
DeepSeek models (`AUTOMATION_STUDIO_DEEPSEEK_MODELS`: `deepseek-flash`, the
default, and `deepseek-v4-pro`); a model outside that set is refused by name,
with what replaced it where DeepSeek withdrew it, before a request is built.
User/Flow endpoint overrides, redirects, and unbounded response reads are not
supported. Every provider call passes through Core's default provider-retry
seam. A typed temporary provider fault may be attempted at most three times in
total; deterministic refusals and Core's own per-call deadline timeout are not
retried there. Requests use a concrete output
allowance, a bounded timeout and abort signal, request/idempotency identifiers,
and an opaque scoped secret resolver. A per-run reservation ledger is shared by
every call a recovery makes (the diagnosis, each evidence decision, and the
patch), so the total-token, output-token, and estimated-cost budgets, and a
250-call runaway backstop, are reserved before transport dispatch. Each call is
reserved at its own measured input tokens and, when the provider prices calls
(`estimateCostUsd`), at its own worst-case price under the call's cost ceiling,
never at its window-sized limit. Failed or usage-less calls are charged
conservatively.

**A model call is paid for by the person it is made for, and needs nothing
else.** Building, exploring, repairing, verifying or judging, diagnosing and
adapting a Flow all call the model on the caller's own unlocked Secret Keys
key. No execution grant exists: nothing is issued, leased, preflighted,
digest-checked, confirmed for size, or revoked before or during a provider
call. The caller is `AutomationStudioLlmModelCaller`
(`runtime/llm/model-caller.ts`), `{ actorUserId, actorSessionId }` -- the person
whose key pays. It is not an authorization, and nothing holds, checks, or
revokes it.

The shipped host binds one resolver,
`createAutomationStudioSessionKeyProviderResolver`
(`runtime/llm/session-key-provider.ts`), with
`automationStudio.bindLlmExecutionProvider(resolver)`. A request with no
caller resolves no provider. With a caller it returns the DeepSeek adapter
whose secret is resolved per call: the newest enabled DeepSeek LLM key,
released to the caller's own unlocked session by a one-use Secret Keys session
reveal authorization, by the same rule the chat window's key follows
(`runtime/llm/deepseek/panel-command-key.ts`). The unlock is established at
login and lives only in memory; Automation Studio never accepts or retains a
password or PIN, and a person whose keys are locked, or who has signed out,
gets no key and the call fails as `llm.provider_secret_unavailable`. The
provider refuses an outbound body that contains the secret. The model is the
request's `modelId` when that is a configured DeepSeek model, and Core's
default otherwise. The resolution carries Core's default per-call token,
timeout and cost limits (USD 0.25 per call, USD 2 per run) as defaults the run
budget applies, not as checks of their own. Provider secrets are decrypted just
in time at dispatch and never retained or persisted. Core never reads a
provider key from the environment.

**Spend is bounded by the loop's budget.** The run ledger reserves every call
before dispatch against the run's token, output-token and estimated-cost
budgets. The Flow setting `adaptationPolicySettings.maxEstimatedCostUsdPerRun`
(the policy's `maxEstimatedCostUsdPerRun`), when set, is the run's total
estimated-cost ceiling for recoveries; otherwise the resolution's default
total applies. A build is different: one purse per Flow creation, across every
build of it until a Flow is proposed or a build ends not doable, is its only
cost authority, at `FLUXIQ_LLM_RUN_COST_CEILING_USD` ($0.10 by default), which
`maxEstimatedCostUsdPerRun` may lower and nothing may raise
([One purse per Flow creation](automation-studio/llm-flow-bootstrap.md#one-purse-per-flow-creation)).
[Iterating adaptations and their bounds](#iterating-adaptations-and-their-bounds)
lists the guards.

**Paying for the model is not permission to act.** A build or run may carry
`permittedConsequences`, the lasting consequence classes the person allowed its
actions. The consequence permission gate still asks before a consequential act
-- moving money, deleting, sending or publishing -- that neither
`permittedConsequences` nor the person's instruction covers, raising
`permission_required`; see
[What a recovery may do that outlasts it](#what-a-recovery-may-do-that-outlasts-it).

Flow Settings exposes only DeepSeek and the configured model set, selects only
enabled Secret Keys metadata in global or current Flow scope, and persists
per-request input/output/total token limits, a call limit, timeout,
estimated-cost cap, and a zero-retry Flow-setting policy. That persisted
setting is not the provider retry allowance: every call passes through Core's
provider-retry seam described above. The settings API rejects totals above
50,000, input-plus-output reservations above the total, call limits outside one
through 64, retries other than zero, timeouts above 25 seconds, and cost caps
above USD 0.25. Runtime Debug exposes separate **LLM diagnosis** and **Diagnose
and propose adaptation** modes, which start a run with the matching
`runIntent`; it does not offer `explore_and_adapt`, which is reachable through
the API. Server failures are presented as fixed, sanitized messages.

`run-runtime-session` turns a `runIntent` from a signed-in actor into the run's
`llmExecution`, an `AutomationStudioRuntimeSessionLlm`
(`runtime/llm/runtime-session-llm.ts`): the caller plus the intent, one of
`AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS`. Ordinary deterministic modes
carry none. Every explicit runtime lane creates a fresh runtime session: the API
and service reject a supplied `runId`. As defense in depth, diagnosis execution
sets graph cross-domain authorization to an empty set instead of reconstructing
it from session metadata. A diagnosis-only run executes the already-authored
deterministic Flow through the same bound IO, importer-native, and host-runtime
capabilities as an ordinary run, preserving its existing Flow and domain
authorization. Its intent cannot add cross-domain grants or authorize external
side effects, and it disables LLM patching, recovery retries, adaptation, and
promotion. Target-level restrictions, such as a downstream test lane permitting
only local fixtures, remain the responsibility of the importing domain policy
rather than generic Core.

The typed `generate-flow-bootstrap-adaptation` endpoint builds a blank Flow
from its instructions. Its caller is the request's authenticated actor; it
takes the project, the blank Flow, and optional `permittedConsequences`, and
rejects runtime, idempotency, adaptation-mode, dry-run, and external-side-effect
flags. It reads the Flow's dependency digest and settings revision as they stand
as the proposal's base binding, and returns only the proposed adaptation
identity, status, risk, source-instruction IDs, base binding, and bounded
provider accounting. It neither applies the proposal nor mutates or runs the
Flow; UI review/application and runtime adaptation remain separate phases.

A run's intent selects its lane -- which recovery, adaptation and promotion
behavior the run has -- and is recorded as audit metadata. It does not authorize
or filter model task kinds. [What the shipped app reaches](#what-the-shipped-app-reaches)
lists which runtime paths each intent gives a provider.

### Judging a finished run's result, including an empty one

Every run that reports success has its result judged against the request before
it is returned (`runtime/result-verification/`). Core's own counts answer first
and cost nothing: a run whose every row was refused by record validation, and a
run whose stored rows lack a value the Flow's own record schema declares
required, are refused deterministically, because neither can be excused by any
reading of any request. Everything else is put to one `loop_verification` call,
asked twice when the first answer is not `yes`.

**An empty result is judged like any other, as of 2026-09-24.** Until then a run
that stored no rows was exempt: an empty record set was recorded
`core.result.no_records` and a run with no record set at all
`core.result.nothing_to_judge`, and neither was ever put to a model. The
exemption existed because a verification reached from an empty result had once
entered provider resolution and never returned (2026-09-20), and it cost the
product the judgement it most needed — an empty table where the person asked for
rows was the one answer nothing looked at, and because nothing refuted it,
nothing repaired it. An empty answer is now judged on the request's own terms: it
is `confirmed` where the request makes finding nothing the right answer and the
Flow's steps show it looked, and `refuted` where the steps show it never looked
or could not have stored what it found. A refutation reaches the same
wrong-answer route a non-empty one does, so the repair re-enters exploration.

**The whole verification is bounded**
(`runtime/result-verification/deadline.ts`). Resolving the provider, reading the
instructions and the run detail, and both calls run inside one deadline —
`AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS`, 120 s by default, and the
caller's own cancellation ends it too. Nothing inside that path carries a
timeout of its own -- resolving the provider waits on Secret Keys, and the run
detail is read through the project database's single serialized operation
queue -- so the deadline is the only bound. A verification that does not settle
is recorded `core.result.verification_did_not_finish`, `unverified`, with
the run keeping the status its steps earned. That is the same treatment a run
gets when no model is configured, and the reason is the same: nobody judged this
result.

Two codes and one status are historical. `core.result.no_records` and
`core.result.nothing_to_judge` are produced by nothing and readable on runs
recorded before 2026-09-24, and the `no_result` value of a run's
`result_verification_status` column is likewise only ever written by such a run.
What a new run can carry is `confirmed`, `refuted` or `unverified`, plus null
where the schedule did not check it.

The verification request's `flowShape` now gives each step its bounded label
and the same screened authored parameters the repair context receives.
`parametersWithheld` names dotted paths whose original value was removed or
transformed. There is no flow-wide byte budget, so `flowParametersWithheld` is
set only on summaries written before 2026-09-30. `loop_verification` also
receives the conversation and per-step record counts, and result data is every
record set, column and stored row the run kept, screened for the domain's
denied keys and credential-shaped values but not sampled or cut to a size.

Each `flowShape` step also carries `changed`: what this run saw that step change
where it stayed, one entry per time it ran, in run order, taken from the
session's own in-memory trace (`stateRefs.stateDiff`) and never from a
persisted record. An entry is the domain's own `added` and `removed` view
lines, forwarded uncapped and uninterpreted; a run of the step whose diff
reports `locationChanged` carries none, since the later steps and the end view
(`endView`) say what the new location shows. It is screened like the end view:
nothing without a denied-keys declaration, a diff holding a denied key or a
credential-shaped value is withheld whole, and locator-shaped runs are
redacted, each setting the summary's `withheld`. Run `run-muw5zv4m-52d83027`'s
judges, shown only status rows and a stale end view, refuted a playback that
had built exactly what was asked
(`result-verification/step-changes.ts`).

A `does_not_answer` verdict carries
`automation-studio.result-repair-directive.v1`: Core-authored coded findings and
fix lines, plus optional screened judgement fields `expected`, `observed`, and
`advice`, with a `withheld` flag. The structured directive reaches the synthetic
failed attempt and recovery context independently of the 1,024-character
failure prose. Persisted result records keep Core's bounded facts; arbitrary
provider prose is not persisted as repair authority.

### A repair is accepted only after a whole run judged success

The user's rule (2026-10-02): a repair loop may run part of the Flow to test
it, but the Flow must run whole from its start and be judged a success at least
once, on the Flow as it finally stands, before it is accepted; an edit after
that run needs another. The two repair paths stand differently against it.

**Re-author: holds the rule.** A run refuted as not answering the request is
handed to the build's own loop as an extend build seeded with the Flow it ran
(`runtime/recovery/refuted-result/reauthor.ts`), and so is an "improve" from
the chat. That build finishes only on a judge's `yes` about a test of the very
Flow it finished with, and steps carried from the stored Flow must be rerun
live before that test can run (`llm_evidence_loop.full_run_required`); see
[A whole run judged success, on the Flow as it stands](automation-studio/llm-flow-bootstrap.md#a-whole-run-judged-success-on-the-flow-as-it-stands).
The re-author approves and applies the adaptation only when its build
finished, so the Flow on disk changes only after the re-authored Flow, carried
steps included, ran whole and was judged. A rerun keeps the node id of the
carried step it replaces (`standsFor`) and its `metadata.routeSignatures`
where it recorded none. Inside that build the model can run part of the Flow
with `core.run_flow`. An applied extend still cannot be reverted: it overwrites
the Subflow graph it was given and records nothing to put back.

**The patch ladder: open.** The recovery ladder's exploration has no draft, so
it is not offered `core.run_flow`, and a runtime patch is still trial-run from
the changed node (`runtime/flow-change/trial.ts`, `startNodeId`) and, where the
promotion gates pass on that succeeded trial, applied mid-run by
`maybePromoteRuntimeAdaptation` (`runtime/service.ts`) before the run resumes
and before its result is judged. Meeting the rule there needs two changes not
yet made: an executor stop node (`stopAfterNodeId` on the graph execution
options, ending a run `succeeded` after that node without following its edge)
behind a ladder `core.run_flow` that runs the run's current Flow from one node
to another with the values the run holds there; and an apply deferred until the
run that trialled the patch finished whole from its start and its result was
judged to answer the request. In the shipped app automatic promotion applies
nothing (see [What the shipped app reaches](#what-the-shipped-app-reaches)), so
this matters for a host that turns it on.

### The standing authorization, for runs nobody is watching

An interactive model call is paid for by a signed-in person's unlocked key, and
a request with no caller resolves no provider. A Flow replaying on a schedule
at three in the morning has no caller, so without a second instrument it could
neither have its result judged nor repair itself when it failed. That
instrument is the Flow-scoped standing authorization in
`runtime/result-check-authorization/`, stored in the Flow's own settings and
given once by a person rather than prompted for per occurrence. It is not a
caller, it never reaches `input.llmExecution`, and so it never implies
`manual_approval`. It is unchanged by the removal of interactive execution
grants.

One record, with one key, one purse (`maxTotalCostUsd`), one expiry, and two
clauses the person switches on separately:

- **Checking.** Redeemed by `redeem.ts` for `loop_verification` and nothing
  else, at its own per-call ceiling, when the Flow's schedule says this run is
  judged — or always, when the run repaired itself (`core.check.after_repair`).
- **Repairing.** Redeemed by `repair.ts` for `runtime_diagnosis`,
  `evidence_tool_decision` and `runtime_patch` and nothing else, at its own
  per-repair ceiling, and only where the run's caller resolved no provider. The model it
  buys is wrapped so a call outside those kinds throws rather than spends.

Neither redemption takes its task kinds as an argument, so no settings field and
no caller can widen either. Both draw on the one purse, both stop at the one
expiry, and both fail closed with their own code — `core.check.*` and
`core.repair.*` — recorded on the run (`metadata.resultCheck` and
`llmGate.repairAuthority`) so an unjudged or unrepaired run says which refusal
it was rather than looking like a deployment with no model configured.

Paying for the model is not permission to act. Neither redemption supplies
`permittedConsequences`, so a repair that would press something with a lasting
consequence meets the recovery's permission gate with nothing permitted and
raises a request for the person.

Whichever way a run's calls are paid for, they are made one at a time, and
each releases the key afresh through its own one-use Secret Keys authorization.
Every request carries at most the model's context window (1,000,000 total
tokens) and a finite per-call timeout and cost ceiling, and the run ledger
reserves the request's own measured size and price before dispatch and
charges it what it reported using, or its worst case when that report is
missing or inconsistent. Cancellation, the run's abort signal, the recovery
deadline, or service close aborts the call in flight. No password, PIN, or
provider plaintext is retained or persisted.

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
optional `observeRouteState` for the state (`runtime/route-state/`), but only
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
A build learns those states from its own calls. An execution result may carry
`routeState`, the route state of the page the call left, which the web domain
projects from the capture the call already took exactly as `observeRouteState`
projects a fresh one; the build routing (`runtime/route-state/build-routing.ts`)
records it from every call it is handed, dry-run replay steps included, and
before a decision records the newest call's state when a call ran since the
last one -- Core's own notes and a shifting window record nothing. It asks the
host for a capture only when the newest call carried none. An evidence-guided
build takes the start state from its opening call -- the free first look, or,
for a build told where its Flow starts, the arrival there that the loop makes in
its place (`automation-studio/llm-flow-bootstrap.md`, F31) -- captured right after it only when
that call carried none; a build that writes its Flow in one reply
observes the start before anything runs.

A draft step that repeats a span over a list
(`runtime/flow-bootstrap/authoring/draft-routing.ts`) is wired through
`builtin.control.for-each`: the list step's array output goes to For Each's
`items`, and For Each's `item` output (which declares `multiple`) goes to every
step of the span whose node declares an input `item`. A node that can act on
"the current row of an enclosing loop" declares that input as
`{ id: "item", valueType: "any", role: "data", required: false }` after its
control input `in`, and receives each pass's row as `inputs.item`. A span that
repeats while a check holds has no rows and gets no `item` edges. A do-while
repeat (`repeat {through, while, most}`, used to page a list: read, Next page,
again while Next page moves on) is wired through `builtin.control.repeat`
instead: the span runs, its last step's `success` goes back to the loop for
another pass, and its `ended` route or Repeat's `done` after `most` passes
leaves the loop (`automation-studio/flow-authoring.md`). The assembler
reaches a `role: "data"` input only through a branch that names it; an edge
that names no port never falls into one.

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
priority order, cheapest first and the model last: skip the node whose recorded
state already holds, wait for the recorded state and attempt again, clear known
interference and attempt again, attempt the node again, the configured
failed-route path, an approved runtime patch, a graph-local recovery reroute,
then the LLM diagnosis fallback. The LLM diagnosis rung is
offered only when the run's training behaviour allows the LLM
(`allowLlmDiagnosis` on the graph options, set from `invokeLlm`); with the LLM
off, a failed node with no deterministic recovery ends `exhausted`. Recovery budgets can cap
recovery attempts per subflow, reroutes per run, and
adaptation/LLM attempts per run; exhausted budgets produce terminal failure
metadata instead of looping. An LLM attempt is one recovery, not one provider
call: the calls inside it are bounded as described in
[Iterating adaptations and their bounds](#iterating-adaptations-and-their-bounds).

**Defensive dispatch is on by default, and each rung is consumed as it runs.**
`executeAutomationStudioNode` is the single dispatch seam for built-in,
output-dispatch, native, and composite nodes. A thrown value is classified into
a failed attempt instead of escaping the graph run. The policy reads structured
producer failures, classified throws, and bounded legacy result messages;
honours bounded retry hints; and records every absorbed or refused assessment in
the run's defence ledger. Waits are capped per attempt, per arrival at a node,
and per run.

A node that fails may still be attempted again without anyone opting in: three
attempts at 250 ms, 1 s and 2 s
(`AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY`), overridable by a node's
`parameterValues.retry` or `metadata.retry`, by a `builtin.timing.retry` node
guarding the branch, by a Flow's `metadata.retry`, or by the run's own
`retryPolicy`, and capped by `maxRetriesPerAction`. Retryability and failure
stage are evidence, not sufficient authority to repeat an action.
`verification` and `confirmation` no longer prohibit retry by stage alone:
Core asks whether the node could act twice. Read-only or positively non-acting
work may repeat; an ambiguous mutating or destructive action is refused unless
the node positively declares repetition safe. A terminal non-fatal failure may
also be continued past when the Flow or node policy says so. The defence ledger
records whether Core retried, continued, or stopped; it does not claim that
every failure is swallowed. Each deterministic ladder rung leaves the candidate
list once it has run, so an already-consumed deterministic answer does not
suppress escalation forever.

**A step that cannot run continues where the page is.** When a step of a run
cannot run, Core reads the page through the host and continues at the node
whose recorded pre-state matches, before any recovery rung or model call
(user, 2026-10-01 and 2026-10-02; t243). A step cannot run when its attempt
failed with category `target_not_found`, or when its readiness gate judged at
least one condition and the state did not hold (synthesized before dispatch as
`executor.ready_state.not_shown`). `target_ambiguous`, an action that ran and
failed, and a target covered by a layer (`unexpected_state` at stage
`execution`, which `clear_interference` owns) keep the ladder. The decision
(`decideAutomationStudioStateRoute`, `runtime/executor/state-routing/`) runs in
this order:

1. **Declared way on.** A sometimes-present step takes the way on the Flow
   itself declares, with no observation (the next paragraph). This is the case
   of the rule where the Flow already says where the page is.
2. **Candidates.** Every other node with a `before` signature in
   `metadata.routeSignatures` (`runtime/route-state/signatures/`). With none,
   and no effect of the failing step's own to test (step 3), nothing is
   observed and the outcome is `no_pre_states`.
3. **Observe, once,** the route state through the host (`observeRouteState`);
   a failure is `unobserved`. The host is asked for the Flow document's
   `flowId` and its `metadata.projectId`, else its `ownerId`, because a graph
   run is handed no project id. Then the **effect** case: when the failing
   step recorded its own `effect` and has a success edge, the host is asked
   whether the page already shows that effect (`routeEffectHolds`, over the
   route state itself, not a signature). This is the site having already done
   what the step does -- a store already chosen, behind the store picker the
   previous step opened (bigbox `store-remembered`). When it holds, the run
   goes on along the step's own success edge, forward, through the progress
   guard (step 6), with outcome `effect_holds`. When it does not, or the host
   cannot say, matching goes on with the same observation, signed through the
   host (`signRouteState`). The effect comes before matching because the
   matching rule refuses this case on purpose: the open picker is a layer, and
   layers must be equal, so no later step's pre-state matches -- a rule that
   must not be relaxed, or a popup hiding a step's target would match the next
   step's pre-state and skip the step silently. It is safe for out of stock:
   "Add to cart" is absent, but its effect (the "Added to cart" panel) is not
   on the page, the host's answer is true only on positive evidence (an effect
   that added nothing says nothing), and no later pre-state matches, so the
   ladder runs exactly as before.
4. **Match** each candidate's `before` against the page
   (`compareRouteSignatures`, structural equality without one). A node that
   already acted in this run (succeeded, not skipped) is passed over when its
   `after` also matches, because its effect still holds and running it again
   would repeat it, or when it recorded no `after`, because nothing shows its
   effect is gone. The failing node is never a candidate.
5. **Choose** the highest closeness, then a node reachable forward from the
   failing node (the page is already past it) before one reachable only
   backward (the page went back), then the nearest by edge distance, then
   document order.
6. **Progress guard.** The progress mark is the count of distinct nodes that
   acted plus For Each passes into a body. For each route target the run keeps
   the mark at its last route there and a count of returns: a route into a
   node whose mark has not moved since the previous route into it is a return
   without progress. Three are allowed
   (`AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT`); the fourth ends the run
   `failed`, with a message naming the node, the count and why. Targets are
   counted apart, any progress resets a target's count, and the run's step
   limit still bounds everything else.

A routed attempt reads `status: "succeeded"`, `route: "state_routed"` and
`skipped: { reason: "state_routed", code, toNodeId, direction }`, with no
`failure`, `fault` or `message`; the chat says which step was passed over and
where the run continued, nothing goes on the defence ledger and no "Recovery
started" is posted. Every consulted attempt carries a `stateRouting` record
(`outcome`: `effect_holds`, `routed`, `no_match`, `unobserved`,
`no_pre_states` or `guard_stopped`; candidate and match counts; target,
direction and closeness)
and never a route state or a signature. The run detail's action attempt
carries it as `stateRouting` in closed words only
(`service/summaries/state-routing.ts`, t250): `{ outcome }` for `routed` and
`effect_holds`, beside the `skipped` mark that already names the destination;
`{ outcome, code, toNodeId }` for `guard_stopped`; `{ outcome, code }` for the
three outcomes that found no way on. `code` is the Core code that asked
(`executor.ready_state.not_shown` when the readiness gate did, else the
attempt's failure code); the record's reason sentence and counts stay on the
trace. With no way on, the record stays on the
failed attempt and the ladder runs exactly as before. Each failed attempt goes
through ask and park handling, the waiting status, state routing, the ladder,
the continuation rule, then failure, and a model is only ever called after the
run, so routing always precedes it. Before dispatch, a readiness gate that did
not hold asks the same decision: a way on skips the dispatch entirely, and none
attempts the node as before, the dispatch reusing that decision if it fails as
`target_not_found`. Flows without pre-states (built before t243, recorded
Flows, nodes an extend re-seeds) keep the declared way on, record
`no_pre_states` without observing the page, and run the ladder as before; a Flow
gains state routing when it is next built or repaired
(`runtime/executor/tests/state-routing-run.test.ts`).

**A sometimes-present step that is not shown is skipped, not recovered.** A
popup, banner or consent prompt is only sometimes on the page, so finding it
gone is the page's state, not a failure (t174). It is state routing's first
case: before the fault assessment, the "Recovery started" activity and the
ladder, the decision asks `automationStudioAbsentStepSkip`
(`runtime/executor/step-skip/absent-step.ts`) whether the failed node is
sometimes-present and its target was observed absent, and reads no page.
Sometimes-present is the optional shape a build writes (a `failed` edge into a
`builtin.control.merge` that the node's `success` edge also enters) or
`metadata.sometimesPresent === true`; absent is a failure of category
`target_not_found`, which is the host's own look at the page after its own
wait. On a skip the attempt reads `status: "succeeded"`, `route: "skipped"`
and `skipped: { reason: "target_absent", code }`, with no `failure`, `fault`,
`message` or `recoveryDecision`. No retry runs, no recovery budget is spent,
nothing goes on the defence ledger, and the run follows the Merge edge (or,
for a node marked by metadata alone, its `success` edge). The step's activity
row says it was skipped because what it acts on was not shown ("Skipped
“Not now”: it was not shown"). A node that also declares a `readyState` is
observed first: when the gate judged at least one condition and the state was
not met, the same skip is taken with nothing dispatched, under the code
`executor.ready_state.not_shown`. A gate that judged nothing says nothing about
the page and the node is pressed as before. A straight-line node whose target
is absent goes on to the rest of state routing, and through the ladder when that
finds no way on; an optional node failing any other way (`target_ambiguous`, an
action that ran and failed) goes through the ladder unchanged
(`runtime/executor/tests/optional-failed-route.test.ts`, `absent-step.test.ts`).

**The recorded state is read while the Flow runs.** Every node a recording
proposal produces carries `stateLink`, `stateSnapshotId`, `stateRef` and
`recordedGapMs` in its metadata; the executor reads them
(`automationStudioRecordedState`) onto each attempt, so a diagnosis names the
snapshot the run was supposed to be standing in. `recordedGapMs` is how long the
recording waited between the entry the **previous candidate** was mapped from
and this one, on the monotonic clock: the gap between steps rather than between
timeline entries, because a node follows the node before it and the observations
in between are part of that wait. It is derived where the recording's clock and
the candidates meet (`recordingCandidateGapTracker`), travels on the proposal
candidate, and is written onto both the Flow node and a reviewed candidate's node
definition. The first candidate of a proposal has none; two candidates mapped
from one entry give the second a zero, which is a different fact from none and is
kept as one. A node that declares a `readyState` is gated on it before **every**
attempt, for at most `clamp(recordedGapMs x 2, 2 s, 30 s)`: the state arriving sooner
runs the node sooner, so a replay on a fast page is faster than the recording
that produced it, and the deadline passing attempts the node anyway and marks
`readiness.satisfied: false`, because the recording is evidence the action was
possible at that point. A missing state is never itself a failure. The recorded
expectation is now evaluated on a **failed** attempt as well as a succeeded one,
and a rejection is re-checked once, within the same wait ceiling, before any
failure record is built, so a page a moment late is not minted as a
non-retryable state mismatch.

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
- **A run input** is withheld by position -- in the trace's `values` and in each
  attempt's `inputs`, wherever the entry still holds the value the caller
  supplied, whether or not a node reads it -- and by value: each of its texts and
  numbers is recorded for the same rewrite as a resolved value
  (`trace-withholding.ts`, `supply`), so a copy a node makes under another key
  is withheld too, and every dispatch is told to withhold it in its command
  attempt. The cost is that a value the run computed that equals a supplied
  input also reads `[withheld]` in the saved trace; the executed trace keeps it.
  An input still equal to the default the Flow's published interface declares
  is authored, not supplied (`declaredInputDefaults`, which
  `composite-executor.ts` sets for a Call Flow child), so it is withheld only by
  position.
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
runs on the caller's own key under the per-run budget, and the final
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

### Applying a runtime patch waits for a judged whole run

A runtime patch reaches the stored Flow only after a whole run that ran it, from
the Flow's start, was judged to answer the request (user, 2026-10-02: the loop
"must test the entire flow & have that judged success at least one time"). The
order, as built:

1. **The run fails at a step.** It began at the Flow's start; a run never takes
   a `startNodeId` from `runRuntimeSession`.
2. **The patch ladder writes a patch and trials it** from the changed node on a
   throwaway copy (`runtime/live-patch.ts`), and saves the adaptation.
3. **The promotion gate decides, and nothing is applied.**
   `promoteAutomationStudioRuntimeAdaptation`
   (`runtime/service/runtime-adaptation/runtime-promotion.ts`) records the
   decision. One that allows an unattended apply says `autoApply: true`,
   `applyAt: "judged_whole_run"` and `applied: false`; one that sends the change
   to a person is recorded as before.
4. **The run resumes on the unapplied candidate.** The resume
   (`runtime/service/runtime-adaptation/repair-rerun.ts`) reads the stored Flow
   and writes every pending patch of this run onto it in memory, by the same
   function an apply uses (`runtime/service/adaptations/graph-flow-patch.ts`).
   It keeps the run's id, so the run that is judged went from the Flow's start,
   through the patched step, to its end. The pass records the patches it ran as
   `adaptiveRetry.candidateAdaptationIds`. A pending patch that cannot be read,
   or cannot be written onto the Flow, declines the resume
   (`repair_rerun.candidate_unreadable`, `repair_rerun.candidate_unwritable`)
   rather than running a Flow the patch took no part in.
   - **A trial that ran the Flow to its end** leaves nothing to resume
     (`resume_point_completed`), and it is already the whole run: it began at
     the Flow's start and finished on the candidate. Its saved trace rides on
     the patch's receipt (`completedTrace`, `runtime/recovery/annotation/patches.ts`)
     and is adopted as the resumed pass -- appended to the run's own trace,
     `adaptiveRetry.trialCompleted: true` -- with nothing run again. The trial
     numbers its attempts after the run's, so the two never share an id.
   - **A patch the refuted result's repair wrote** has no failed step to resume
     from. The run is run again from the Flow's start on the candidate
     (`repairedRerun.candidateAdaptationIds`), the same whole-Flow re-run a
     re-authored Flow takes (`automationStudioRefutedResultRerunsFlow`,
     `runtime/recovery/refuted-result/reauthor.ts`), and that run is judged.
     Before it starts, a patch an earlier pass already ran is settled on that
     pass's ending, so a later verdict never stands for it.
5. **The result is judged, then the patch is settled.** Once
   `verifyAutomationStudioRuntimeSessionResult` returns, the service settles every
   pending patch of the run (`settleAutomationStudioRunJudgedPromotions`,
   `runtime/service/runtime-adaptation/judged-promotion.ts`). It is applied,
   through `review-flow-adaptation`'s apply and so through the promotion gates,
   only when the run ended `succeeded`, its verdict was performed and is
   `answers`, and a pass ran the patch. Otherwise it stays unapplied with
   `notAppliedReason`: `not_rerun` (no pass ran it -- the resume was declined,
   or the Flow was re-authored before it ran), `run_cancelled`, `run_failed`,
   `refuted` (judged, and not `answers`), `not_judged`, `run_parked` (the run
   stopped waiting on a person), `run_errored` (the run threw; settled by
   `endAutomationStudioRuntimeSessionAfterThrow`'s `settleAfterThrow` port after
   the session is marked failed), or `apply_failed` (judged to answer; the
   apply refused). The decision on the adaptation and on the run's
   `runtimePatchAttempts` receipt carry `judgedRunId` and `settledAt`. A
   settle is final: no Core path continues a parked run, and a continuation
   would run the stored Flow rather than the candidate, so it could not be the
   judged whole run for the patch.

**Why the trialling run is the judged whole run.** The trial and the resume
continue one run that began at the Flow's start: the steps before the patched
one are the same in the candidate and the stored Flow, and the steps after it
ran on the candidate. Running the Flow again from its start after an apply would
repeat every lasting effect the run already had, which is why the resume exists
at all, and why a trial that already ran to the end is adopted rather than run
again. A re-run from the start happens only where there is no step to resume
from: after a re-authoring, which settles every pending patch first (it was
written for the graph before), or for a patch the refuted result's repair
wrote, which that re-run carries as its candidate.

**Reuse.** Only an applied patch changes the stored Flow, so only it is run by
later runs, replayed as evidence by a run that asks no model, and counted as
changed durable behavior (`automationStudioDecisionAppliedAutomatically`,
`runtime/durable-behavior/`: `autoApply: true` and `applied` not `false`; a
decision recorded before this rule carries no `applied` and was applied when it
was made). An unapplied patch keeps its trial evidence and its `validated`
status, and a person can still apply it through review.

Build and re-author repairs are gated separately, by a whole-Flow run judged on
the Flow as it finally stands (t244).

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
`createGlobalProgramRuntime`, which binds the session-key resolver: it returns a
provider only for a request that names a caller, and pays with that caller's own
unlocked key. A build's caller is the signed-in actor who asked for it; a run's
is the actor of a `run-runtime-session` request that names a `runIntent`. The
intent selects the lane and is audit metadata; it does not authorize or filter
task kinds. Each path reaches a model as follows:

- **Flow bootstrap generation:** `generate-flow-bootstrap-adaptation`, whose
  caller is the request's actor.
- **Runtime diagnosis:** a run with a `diagnosis_only`, `diagnose_and_adapt`, or
  `explore_and_adapt` intent. A run without an intent has no caller and gets no
  provider in any training mode. When a training window lets such a run ask,
  the harness records `llm.provider_missing` and calls no model.
- **Evidence gathering during a recovery:** a `diagnose_and_adapt` or
  `explore_and_adapt` run. Each `evidence_tool_decision` call chooses one of
  the domain's registered evidence tools. The captured failure evidence goes to
  the diagnosis and the patch only, never to these calls.
- **Runtime patch requests:** a `diagnose_and_adapt` or `explore_and_adapt`
  run. The `diagnose_and_adapt` lane saves its one target override as a
  high-risk proposal and never executes it. The `explore_and_adapt` lane sends
  each patch to live patch testing. A `diagnosis_only` run sends no patch
  request, because its lane turns adaptation creation off.
- **Live patch testing:** an `explore_and_adapt` run, which Runtime Debug does
  not offer and an API caller must request. Its patches run against a cloned Flow
  with the run's own execution options, for at most 50 steps, only when the
  Flow's adaptation policy allows runtime recovery and that patch kind. A
  side-effecting patch runs only where the consequence permission gate permits
  it (see [What a recovery may do that outlasts it](#what-a-recovery-may-do-that-outlasts-it)).
  The `diagnose_and_adapt` lane never executes its patch, a `diagnosis_only` run
  sends no patch request, and a run without an intent has no provider.
- **Result verification:** a run's own caller, or, for a run nobody is
  watching, the Flow's [standing authorization](#the-standing-authorization-for-runs-nobody-is-watching).
- **Automatic promotion:** no intent. Core decides it for each adaptation a
  runtime patch saves, which in the shipped app comes only from an adapting
  run, and applies an allowed one only after the run's judged end (see
  [Applying a runtime patch waits for a judged whole run](#applying-a-runtime-patch-waits-for-a-judged-whole-run)). Every explicit run is forced into manual proposal mode, and the
  promotion gate sends manual-mode adaptations to review; a `diagnose_and_adapt`
  proposal is high-risk as well. An adaptation is applied only through the
  review endpoint, `review-flow-adaptation`, which needs `flows.write` and a
  pass from the promotion gates, not a PIN.
- **The retry after a patch allowed unattended:** no intent. The retry runs only
  when the gate allowed a runtime patch to be applied automatically and the patch
  marked the original action retryable, which the shipped app never produces — and then only when that
  patch’s trial also vouched for continuing, after which it resumes at the
  trial’s resume point instead of the Flow’s start, on the unapplied candidate. A run with an explicit
  intent skips the retry at both of its call sites in `runRuntimeSession`.
- **Training modes:** every canonical run in a project still computes its
  training-mode behavior, records it in run detail, and takes its recovery
  budget from the Flow's settings and policy. The LLM intervention, adaptation
  creation, and promotion a training window turns on still need a provider,
  which a run without an intent does not get. A run with an explicit intent
  replaces the window's behavior with its lane's. `diagnosis_only` turns
  recovery, adaptation creation, and promotion off. `diagnose_and_adapt` turns
  recovery off and allows only its one manual-review proposal.
  `explore_and_adapt` also turns recovery off and allows manual-review
  proposals within the Flow's policy. An exhausted training budget stops none
  of the explicit lanes; each spends the run's own budget instead of the
  training settings'.

In a host whose resolver lets a run reach the retry, the retry runs the candidate
-- the stored Flow, or a routed run's selected Subflow graph, with the run's
pending patches written onto it unsaved -- in the same run session, from the
trial's resume point (below).

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

The retry after a patch the gate allowed unattended is what reads that permission.
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

A recovery in an adapting run is a diagnosis, then an exploration that may
ask for evidence for as long as it keeps learning something, then a patch. No
stage has a fixed call count, and a small call count is not what bounds a
recovery. Iteration stops on the first of six guards, and each reports under
its own name:

1. **Estimated cost.** The run ledger refuses a call that would cross the run's
   estimated-cost ceiling (`llm_budget.run_cost_limit`). The ceiling is the
   Flow setting `adaptationPolicySettings.maxEstimatedCostUsdPerRun` when it is
   set, and the resolution's default total otherwise. It is a plain configured
   limit: nobody confirms it and nothing issues it.
2. **Tokens.** The ledger refuses a call that would cross the run's token budget
   (`llm_budget.run_total_limit`, or `llm_budget.run_output_limit` for output).
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
   `llm_output.` finding) and every provider failure that only spends the call:
   a malformed, invalid, truncated, or oversize reply, an unusable usage
   report, a timeout, a network error, rate limiting, or an HTTP 5xx. Each one is
   charged like any other call and counts as a step that did not advance, with
   the reason `unusable_decision`, so three in a row stop the exploration as
   `no_progress`. Any other failure, such as a refused budget, a pre-send
   refusal, a key Secret Keys would not release, or a provider refusing the
   request, ends the exploration.
6. **The patch reserve.** Before an exploration starts, the recovery reserves
   one patch-sized call on the run ledger, sized on the largest call the run
   has already made (the diagnosis, which carries the same evidence and
   context) and priced by the provider under the per-call cost ceiling. It was
   sized on the token limits, which at the window profile made one held call
   the whole purse. The ledger refuses, on its ordinary codes, any exploration
   decision that would eat into that reservation, and the recovery releases it
   just before the patch. A reservation the run cannot afford is not taken.
   When the resolution declares a call count, the exploration's own call
   ceiling is lowered to what remains after the patch, so a long exploration
   ends on its own limit and the patch still runs.

Call counts survive only as backstops that a working recovery should not meet.
The run ledger stops at 250 calls (`llm_budget.run_call_limit`), or at the
resolution's call limit when it declares one. An exploration also stops at 24
decisions and 24 actions by default, and at most 64 of each.

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
64 decisions, or fewer when the resolution declares a call count, with at most
one more tool call than decisions. No decision has a cost share: each is held
at its own worst case against the Flow creation's one purse
([One purse per Flow creation](automation-studio/llm-flow-bootstrap.md#one-purse-per-flow-creation)),
whose ceiling is `FLUXIQ_LLM_RUN_COST_CEILING_USD` ($0.10 by default), lowered
by `maxEstimatedCostUsdPerRun` when that is smaller. The loop's count of
decisions left only informs the model and drives the wrap-up; the purse
refusing a call is the only cost ending.
The loop stops a repeated request or a repeated observation with no change in
between. An unusable decision, or a completed plan that Core refuses, spends
that decision and the loop asks again. Three such decisions in a row, or fewer
when the loop allows fewer decisions, end creation as
`flow_bootstrap.evidence_unusable_decision`.

DeepSeek refuses a reply above a call's token limits, so no single call can
spend more tokens than it reserved.

### What a recovery may do that outlasts it

A recovery is capable by default and asks rather than refuses. It builds one
permission gate once its provider has resolved
(`runtime/recovery/annotation/permissions.ts`), and the exploration and the
patch stage share it. The gate's authority is the run's own
`permittedConsequences` -- the classes the person allowed when the run was
started, passed on the run input -- plus the set the Flow's build stored as what the person's instruction asks for
(`metadata.bootstrapInstructedConsequences`), keeping an entry only while its
instruction is active and its text unchanged. A recovery never asks a model to
read the instruction again.

**Only a high-risk real-world consequence reaches that gate as something
refusable.** The gate is defined in `action-permissions/destructive.ts`:
`move_money`, `delete`, and `send_or_publish` are the classes the run's
`permittedConsequences` or a person's answer has to authorise; the instruction
asking for one does not (restored 2026-09-30). `modify_existing`
and `create_new` do not prompt merely because of their class. All five classes
remain on declarations and in the instruction/consequence cross-check, so the
narrow prompt gate does not erase an under- or over-declaration. On the repair
path the narrow gate is what makes a live repair possible at all: a target
override the gate permits carries `sideEffectPermission: "permitted"`, which is
the authorization both of the policy's side-effect lines ask for, so a repair
under `explore_and_adapt` may press a control that makes or edits something even
though `policy.allowExternalSideEffects` is `false` on every default policy. A
repair that would move money, delete, or send or publish, with no person's
permission for it, stops and asks (`permission_required`).

**`policy.allowExternalSideEffects` is no longer read on the recovery
exploration path.** The exploration is offered the domain's `mutate` options
whatever that flag says (`mutationsGovernedByPermission` on the harness-option
resolution), and never a `destructive` one. Each action the domain declares
with a lasting consequence is checked by the gate. The first one neither the
run's `permittedConsequences` nor the instruction covers ends the recovery: the patch call is not made
(`llmGate.patchSkippedCode: "llm.runtime_patch_permission_required"`), and the
run detail carries the request at `metadata.permissionRequest`
(`automation-studio.action-permission-request.v1`, `reason.stage: "recovery"`),
beside `metadata.llmGate.permissions`, which lists the classes `granted`,
`instructed` and `lapsed` (`granted` is the run's `permittedConsequences`). A
person's answer reaches the next run as that run's `permittedConsequences`.

**A request raised while exploring is put to the person, in the run's own
thread.** Where the run has a parking port bound -- every run that has a
conversation does -- the exploration opens the gate's request as the same
`permission` ask the authoring path uses, keyed by the request's own
`requestId`, and waits. An answer that allows it widens what the run holds,
the same check is asked again rather than answered a second time, and the
action goes ahead. A refusal, or nobody answering, ends the exploration on the
request, and one question is asked per exploration. Without a port there is
nowhere to ask and a request is terminal. Creation, a runtime failure and improving an existing Flow are three entry
points into one loop, so a question that parks a build and kills a repair is the
loop half-built.

**A repair that would lastingly act asks the same gate.** The patch schema a
model is shown requires `consequences` on each acting patch that may run
(`temporary_target_override`, `temporary_action_sequence`): Core's classes,
`[]` when the new target only opens, shows or chooses
(`runtime/llm/harness/runtime-patch-schema.ts`). A proposal in a
`diagnose_and_adapt` run runs nothing and is asked for none. Before a target
override runs, the patch stage (`runtime/recovery/annotation/patches.ts`)
records a `permissionOutcome` on its receipt:

- `not_asked`: another check -- the domain's target check, a policy toggle,
  a host capability -- would refuse it whatever the person said, so it runs
  into that refusal and nobody is asked.
- `undeclared`: it said nothing about its consequences, so it does not run.
- `permitted`: it declared nothing lasting, or the run's
  `permittedConsequences` or the instruction covers every class it declared. It runs with `sideEffectPermission:
  "permitted"`, which is the explicit authorization both policy side-effect
  lines ask for, so neither applies (`runtime/live-patch.ts`).
- `required`: a class nobody allowed. The gate raises a `flow_step` request at
  stage `recovery` ("To repair the step that failed, the Flow would press ...
  each time it runs"), naming the control the domain's target check described
  (`control: { name, kind }` on its answer) when that name was in evidence the
  model was shown. The receipt carries `permissionRequired: true`,
  `requestId` and `missing`; the recovery ends there, with
  `metadata.permissionRequest`, `llmGate.patchHeldCode:
  "llm.runtime_patch_permission_required"` and the resolution stage's
  `failureCode` of the same name.

`policy.allowExternalSideEffects` therefore no longer decides a target override
a recovery would run: the gate does. A direct caller of
`executeAutomationStudioRuntimePatch` that passes no `sideEffectPermission` is
still judged by the flag.

The model is told the same thing. On the diagnosis, on each exploration
decision, and on a patch call that may run, `policyGates` carries
`actionPermissions` -- the classes `permitted`, `granted` and `instructed`,
and Core's sentence that any other lasting consequence is asked for rather
than refused, and never makes a step unachievable -- in place of
`allowExternalSideEffects` and `requireApprovalForExternalSideEffects`. A
proposal-only patch call is still told the flag.

An exploration shows the model a tool that failed rather than ending on it: the
loop runs with `toolFailures: "observe"`, as a build does, and the gate's
request and the exploration ledger's limits stop it through its signal.

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

A service constructed with no `dataDir` or `storageRootDir` --
`new AutomationStudioService()`, the public default -- is in memory: it keeps
its project catalogue and recordings for its own lifetime and writes no project
file. `AutomationStudioProjectPaths` refuses to name a file without a root,
because a path joined onto an empty root is relative to the process's working
directory, where the default service used to leave partial `indexes/` and
`recordings/` trees. Production always passes a root.

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

## Parked run deadlines

Durable runtime sessions parked with `expiresAtMs` arm a deadline when written or read; overdue records encountered after restart settle immediately. Expiry persists a failed session and an expired ask before emitting the original ask's `timed_out` row. It preserves the timeout route in the attempt without executing further actions. Indefinite waits remain open. Deadline writes, cancellation, and session persistence share a per-run lock; a failed deadline write reports failure and retries without resolving the card. Unconfirmed parked settlements retain their original and terminal snapshots while the service is alive, so a session-file write followed by an index/detail failure retries the complete persistence path before resolving the card. A retry proceeds only when the stored session still matches one of those snapshots; newer work is never overwritten. Closing the service removes its timers and waits for in-flight persistence.

Project deletion blocks deadline writes, waits for in-flight session writes, and persists cancellation of parked sessions before settling their asks and removing project records. If removal fails, the original error is retained, and waits already cancelled remain cancelled. Waiting records whose cancellation failed retain their deadlines.

## Parked run deadlines

Durable runtime sessions parked with `expiresAtMs` arm a deadline when written or read; overdue records encountered after restart settle immediately. Expiry persists a failed session and an expired ask before emitting the original ask's `timed_out` row. It preserves the timeout route in the attempt without executing further actions. Indefinite waits remain open. Deadline writes, cancellation, and session persistence share a per-run lock; a failed deadline write reports failure and retries without resolving the card. Closing the service removes its timers.

Project deletion blocks deadline writes, waits for in-flight session writes, and persists cancellation of parked sessions before settling their asks and removing project records. If removal fails, the original error is retained, and waits already cancelled remain cancelled. Waiting records whose cancellation failed retain their deadlines.

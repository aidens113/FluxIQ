# LLM Flow Bootstrap Contract

Automation Studio owns a domain-neutral, instruction-first authoring boundary for
building a new executable Flow without a recording. The boundary is implemented
in `runtime/flow-bootstrap.ts` and integrated with the existing LLM harness as
the `flow_bootstrap` task. It does not execute a provider request, persist a
proposal, or mutate a Flow by itself.

## Context boundary

A bootstrap request carries the existing effective active instruction
resolution plus a compact node catalog. The canonical node registry filters the
catalog before it reaches the model:

- the Flow's global or domain scope must allow the definition;
- every required runtime capability must be present;
- every required permission must be present;
- entries are sorted by definition ID and capped by both entry and UTF-8 byte
  limits;
- only definition/version, compact labels, capabilities, ports, parameter
  contracts, and output-action contracts are exposed.

The service derives this registry resolution from a defensive snapshot of the
bound native runtime's configured scope, runtime capabilities, and permissions.
It uses the same projection for generation, proposal normalization, and apply
revalidation. Required permissions remain definition-owned safety metadata: a
node whose permission is not granted is excluded rather than made available by
a bootstrap-specific exception. When no native runtime is bound, Core retains
the fail-closed empty capability and permission fallback.

For the first live authoring lane, Core fixes the input ceiling at 4,000 estimated
tokens and the resolved instruction allowance at 384 tokens. Core budgets the
exact schema, instruction packet, and provider-envelope reserve before selecting
catalog entries. Catalog allocation and provider enforcement share the same
conservative three UTF-8 bytes per estimated token, so increasing the numeric
ceiling does not silently expand the selected catalog. It ranks only definitions that already passed scope,
capability, and permission resolution, recognizes small domain-neutral intent
groups such as fill/type, select, click, assert/verify/wait, and includes stable
start/end foundations when available. Required intent groups are selected
first. If a viable required group is unavailable or cannot fit, the context
records it as missing and generation fails before provider or secret resolution.
The provider independently estimates model-visible system and user message
content as `ceil(UTF-8 bytes / 3)` plus a fixed chat-framing reserve, and rejects
a request above either the configured input ceiling or combined input/output
ceiling. The context also contains an explicit compact output schema. Recording IDs,
recording events, timelines, screenshots, and recording-derived candidates are
not part of the schema or context. A `flow_bootstrap` request fails before
provider invocation when it has no effective active instruction or no
scope-aware registry context.

## Untrusted output boundary

The model returns symbolic keys rather than durable IDs. Symbolic keys are
lower-case plan-local identifiers. A later normalization phase owns durable
Router, Subflow, graph Flow, node, and edge IDs.

The strict plan has one Router, bounded owned Subflows, bounded nodes and edges,
and an explicit fallback. Each node pins an exact catalog definition version,
declares only registered parameters, and selects an output action when its
definition requires one. Each edge names registered output/input ports.

The prompt-facing output contract is a compact JSON Schema Draft 2020-12
document, not a prose example. It declares every required field and optional
node field, exact `additionalProperties: false` boundaries, the lower-case
plan-local symbol pattern, per-array minima and maxima, exactly one primary
Subflow, and mutually exclusive `fail` versus `subflow` fallback shapes. The
`parameters` object is the deliberate dynamic-key exception: its description
restricts keys and JSON values to the selected catalog entry's parameter
contracts, which Core enforces against the registry after parsing. The optional
`outputActionId` description requires it if and only if that catalog entry has
an output-action contract. Core remains authoritative for these catalog-relative
rules; the schema does not weaken or replace parser and registry validation.

Core rejects unknown fields and validates all untrusted output against the same
scope-aware registry used to form the catalog. Validation covers:

- schema, UTF-8 bytes, counts, and graph depth;
- exactly one primary Subflow and valid symbolic Router targets;
- definition availability and exact version pins;
- required, unknown, typed, constrained, and state-bound parameters;
- source/output ports, target/input ports, compatible types, and port
  cardinality;
- importer/recording output-action contracts;
- duplicate nodes, edges, and connections;
- disconnected, cyclic, or excessively deep graphs.

This is deliberately stricter than general hand-authored Flow validation.
Bootstrap graphs are finite DAGs so a model cannot introduce an implicit
unbounded loop during first authoring.

## Core-derived fields

The model cannot supply risk or canvas positions. Core derives risk from
registered definition safety, runtime, permission, capability, and output-action
contracts. Core then lays each validated Subflow out by topological depth and
stable symbolic-key order using fixed spacing. The result is deterministic and
contains no overlapping positions.

The validated plan is the only input accepted by the dedicated Bootstrap
Adaptation lifecycle. Provider execution grants, UI controls, and same-run
execution remain separate concerns and must consume this boundary rather than
bypass it.
## Provider transport

The DeepSeek adapter maps `flow_bootstrap` only to the
`flow_bootstrap` expected output. Its user payload carries the compact output
schema as an explicit field as well as the bounded bootstrap context. Before
secret resolution, the adapter rejects a missing or altered schema, excess
catalog size, non-bootstrap expected output, and context outside the
instruction/catalog allowlist.

The trusted system message requires exactly one JSON object, treats every user
string as data rather than instruction, requires object delimiters, and forbids
padding, Markdown, commentary, and code fences. For bootstrap it additionally
binds the result to the `outputSchema` field and requires minified JSON, concise
summaries, identifiers, and names, and only the nodes, edges, Subflows, and
routes required by active instructions. Optional recovery, integration, and
extra branches are excluded unless an active instruction explicitly requests
them. The bootstrap directives are absent from the untrusted user context and
other task messages. Requests disable thinking and set temperature to zero;
the strict Bootstrap response schema remains authoritative.

Provider response content is still untrusted. For bootstrap tasks the adapter
requires exactly `kind`, `summary`, and `plan`, then parses the plan through
the strict bootstrap parser before returning it to the harness. The harness
performs the subsequent scope-aware registry validation. Provider transport
therefore cannot reinterpret bootstrap output as a generic change proposal or
pass recording/timeline-shaped context into this lane.
## Bootstrap Adaptation lifecycle

The runtime/flow-bootstrap-adaptation.ts module defines a separate, typed
flow_bootstrap adaptation. It is not a recording proposal and it cannot be
applied through the arbitrary patch/document-replacement path.

At proposal time the service requires a blank top-level orchestration Flow and
an exact dependency digest. It revalidates the plan against the current Core
registry, deriving risk and layout again, then normalizes plan-local keys into
Core-owned Router, Subflow, graph Flow, node, edge, and route IDs. The normalized
topology is persisted with the proposal so review shows exactly what apply will
write. Recording and timeline provenance keys are rejected recursively.

Manual review moves the proposal from proposed to validated; only a validated
proposal can be applied. Application checks the full dependency digest again,
checks the stored topology against a fresh Core normalization, and writes owned
graph Flows, Subflows, the Router, and constrained parent lineage. Every graph
carries exact parent Flow/Subflow ownership metadata and the deterministic node
positions from validation. The operation is serialized per parent Flow. Because
the durable stores span document and relational boundaries, atomicity is
implemented with verified compensating rollback: failure removes newly created
Router/Subflow/graph artifacts and restores the parent state.

Revert requires the exact post-application dependency digest and preflights
every ownership link before mutation. It removes only artifacts carrying the
adaptation identity and restores the constrained parent state. Revert failures
also compensate back to the complete applied topology. Lifecycle transitions append project change-feed entries with
bootstrap_adaptation identity and deterministic, standard-shaped audit events
(created, approved, rejected, applied, and rollback) to the dedicated proposal
document. Audit reasons and detail are canonical and contain no provider key,
grant, session, prompt, or response data. Standard Adaptation Inbox queries
merge these dedicated summaries with ordinary adaptations by adaptation ID, so
proposals remain discoverable after restart without duplicating their topology
or changing the ordinary-adaptation persistence path. The dedicated proposal
document remains available as lineage after revert.

AutomationStudioService.getLlmExecutionBinding(projectId, flowId) exposes the
current execution dependency digest together with the canonical numeric Flow
settings revision. Persistent projects use the SQL settings revision; the
memory-only fallback derives a stable numeric fingerprint from the effective
settings content and never uses wall-clock time. Grant minting and provider
execution remain outside the Bootstrap Adaptation persistence path.
## Grant-bound generation command

The public service command generateFlowBootstrapAdaptation is the only Core
command that joins production provider resolution to the strict bootstrap
contract. Its input is deliberately narrow: project ID, blank Flow ID, and a
build_and_adapt grant handle containing actor/session identity plus the exact
execution digest and settings revision that were authorized. Runtime flags,
dry-run flags, side-effect authorization, provider overrides, and arbitrary
metadata are rejected before provider resolution.

Before any provider call, the command serializes generation for the parent
Flow and verifies all of the following:

- the parent is a blank top-level orchestration Flow with no Router or Subflow;
- grant purpose, execution digest, and canonical settings revision are exact;
- no proposed or validated Bootstrap Adaptation is already pending;
- at least one active global, project, or target-Flow instruction resolves
  without instruction conflicts;
- the scope/capability/permission-filtered node catalog is nonempty and remains
  inside the bootstrap contract's count and byte bounds;
- the configured resolver returns a grant-resolved provider with bounded
  execution settings.

The command invokes the harness exactly once with task and expected output
flow_bootstrap. The harness packs only active scoped instructions and the
compact catalog/schema context. Provider output is parsed and registry-validated
as untrusted data, then Core validates it again and rechecks the exact Flow
binding before persistence. Provider or validation failures create no proposal.
The execution grant is closed after the command so unused reveal capacity does
not outlive the operation; provider-wrapper accounting is committed or revoked
according to the grant lifecycle.

Grant issuance relies on the authenticated actor session rather than accepting
the account password or PIN again. A successful web login asks Secret Keys to
derive per-key decryption buffers for that session and retain them only in
memory, bounded by the session expiry. One-use reveal authorizations copy only
the selected derived buffer; logout, session expiry, key mutation, and runtime
close revoke and zero the applicable buffers. Neither the login password nor
the unlock state is persisted. Grant issue revalidates the actor/session/key
binding, and requests above 100,000 total tokens additionally require an
explicit high-token confirmation flag (while the current absolute token ceiling
remains lower).

The API failure boundary is cross-bundle-safe without trusting JavaScript class
identity. It recognizes only the canonical error name and message paired with a
diagnostic accepted by the strict public diagnostic parser, reconstructs the
response message from the parsed code, and returns only allowlisted fields.
Malformed, spoofed, or unrelated errors receive a fixed unclassified failure
message; raw thrown messages and response data are never returned. The service
attributes ordinary failures to pre-provider validation, provider resolution,
provider request, provider-output validation, post-provider validation, or
persistence. Only phases after a successful provider response carry its bounded
request/usage accounting; call and response states remain conservative when the
harness throws unexpectedly. Deterministic pre-provider gates use a closed,
public reason-code taxonomy for invalid input, blank-target requirements,
canonical settings binding, stale grants, pending adaptations, active
instructions, node-catalog availability, and required capabilities. Provider
resolution separately distinguishes an unavailable resolver, resolver failure,
and malformed resolution. The parser rejects known reason codes paired with a
contradictory stage, retryability, call state, response state, or pre-provider
accounting.

Provider-output validation distinguishes a valid envelope whose completion was
cut off by the configured output-token limit
(`flow_bootstrap.provider_output_truncated`) from malformed media, JSON, or
envelope structure. A length stop containing only empty or whitespace padding
uses the narrower `flow_bootstrap.provider_output_padding_truncated` code;
substantive partial content retains `flow_bootstrap.provider_output_truncated`.
Both are received, non-retryable results under the current grant. Diagnostics
expose only the closed reason code and bounded accounting, never provider
content.

Evidence-guided Bootstrap completion uses a separate self-contained,
reference-free schema while retaining the canonical public Bootstrap plan
shape. This avoids dangling local references when the plan schema is nested
inside an evidence decision. The evidence completion is capped at 12,000 UTF-8
bytes, a 240-character summary, four Subflows, eight Router rules, sixteen
nodes and twenty-four edges per Subflow, and sixteen parameters per node. Its
instruction asks for one primary Subflow with Router fallback by default and
permits extra topology only when the active instruction requires it. Core
rechecks these bounds after parsing and before registry validation. The ranked
evidence path also sends at most twelve catalog entries, selecting required
instruction capabilities first; ordinary one-call Bootstrap retains the
existing catalog ceiling. A representative routed three-action web plan is
1,110 bytes (370 tokens under Core's conservative estimator), so the 4,000
output-token limit remains unchanged.

After an evidence loop returns `complete`, Core classifies the remaining local
validation boundary without retaining or returning provider content. An invalid
`{summary, plan}` envelope reports
`flow_bootstrap.evidence_completion_wrapper_invalid`; a structurally invalid or
registry-incompatible plan reports
`flow_bootstrap.evidence_completion_plan_invalid`; and a candidate exceeding
the tighter evidence completion profile reports
`flow_bootstrap.evidence_completion_profile_limit_exceeded`. These diagnostics
retain only bounded provider accounting plus the content-free evidence trace
(tool IDs, byte counts, effect state, and categorical result codes). They never
include the completion, validation paths, tool inputs, or page evidence.

Success persists exactly one proposed, reviewable Bootstrap Adaptation bound to
the base dependency digest and settings revision. It does not create or mutate a
Router, Subflow, graph Flow, node, or edge. The return value contains only
project/Flow/adaptation identifiers, proposed status, Core risk, source
instruction IDs, base binding, and sanitized request/token/cost accounting. It
does not return the plan, prompt, instruction bodies, provider credential/key
identity, execution grant ID, or secret material. Explicit review and apply are
still required to materialize topology.

Successful DeepSeek usage accounting includes a conservative finite
`estimatedCostUsd`. As reviewed on 2026-09-08, `deepseek-chat` compatibility
maps to the non-thinking `deepseek-v4-flash` model. Core uses the official peak
cache-miss rate of USD 0.44 per million input tokens and the peak rate of USD
1.32 per million output tokens; it intentionally does not assume cache-hit or
off-peak discounts. These provider-owned prices are a dated maintenance input
and must be reviewed when DeepSeek changes model compatibility or pricing.

## Generation readiness capability

The authenticated, read-only `get-flow-bootstrap-generation-readiness` endpoint
is requested with HTTP `GET` (and no request payload) and returns the exact
`automation-studio.flow-bootstrap-generation-readiness.v1`
capability document before any build authorization or provider work. The
handler reads only a pure runtime-wiring snapshot: whether the grant service and
provider resolver are configured and whether a nonempty native node registry is
bound. It does not inspect or claim a grant, read secret-key metadata, create a
reveal authorization, invoke the provider resolver or LLM harness, or perform
persistence or revision mutation. `supported` is true only when all three
runtime-wiring checks pass. Registry readiness requires the canonical Start and End controls plus at least one non-control executable native domain definition; an empty or control-only registry fails closed.

The capability document pins generation, preflight, grant-issue, and review
endpoint identities plus the `build_and_adapt` grant
purpose, `flow_bootstrap` task and output, canonical execution-binding fields,
native node-registry-context requirement, and the complete structured-failure
diagnostic version, stages, provider call states, and accounting field
allowlist. Clients must compare the whole bounded document and fail closed on a
missing, older, newer, malformed, or unequal response. The same pure readiness predicate runs for `build_and_adapt` preflight and grant issuance before any grant-service, password/PIN, key-summary, or reveal-authorization work, and for direct generation before grant inspection. Readiness is a build
compatibility assertion, not authorization; generation still performs the
existing digest, settings-revision, registry, grant, and post-provider TOCTOU
checks.

## Blank-Flow authoring UI

### Evidence-guided generation

Domains may bind a provider-neutral evidence runtime with
`bindLlmEvidenceRuntime({ tools, executeTool })`. Core exposes only bounded tool
IDs, descriptions, and JSON input schemas to the model. The domain owns tool
execution and sanitization; Core contains no browser, DOM, URL, selector, or
other domain-specific execution behavior.

The authenticated authoring sequence first saves the user's bounded text with
`save-flow-generation-instruction`. Core upserts one active, required,
Flow-scoped generation instruction before LLM preflight so the subsequently
issued grant binds its exact revision. The normal
`generate-flow-bootstrap-adaptation` request then opts in with
`evidenceGuided: true`; it does not carry another instruction body.

Evidence-guided generation uses the grant-resolved provider for a bounded series
of `evidence_tool_decision` tasks. Every task carries the current filtered node
catalog, strict dynamic decision schema, allowlisted tools, and prior sanitized
evidence. A decision either requests one registered tool or completes with a
`{ summary, plan }` candidate whose plan schema is the existing strict Flow
Bootstrap schema. Unknown tools, duplicate calls, malformed output, cancellation,
iteration exhaustion, and evidence-byte overflow fail closed. The final plan is
parsed and registry-validated again before the ordinary proposed Bootstrap
Adaptation is written.

The evidence loop is an authoring-time information-gathering boundary, not a
runtime executor for the workflow being authored. Provider-neutral instructions
require completion as soon as the collected evidence is sufficient to construct
the strict candidate. Once completion is permitted, the dynamic decision schema
places the strict completion variant before all remaining tool-call variants;
provider projection preserves that order and explicitly directs the model to
evaluate completion first. Tools are used only to resolve information missing from
that candidate, with observation preferred over mutation. A mutation is valid
only when its state change reveals otherwise unavailable evidence, such as
navigating to a required page or exposing hidden content; filling, selecting,
submitting, or otherwise performing eventual workflow steps is not evidence
collection merely because an action tool is available.

The coordinator distinguishes cumulative audit evidence from model-visible
context. It preserves cumulative byte/call totals while selecting only the
newest complete evidence records that fit a configured context-byte window.
Each tool invocation receives the maximum serialized evidence bytes it may
return. The production Bootstrap lane uses an 8,000-byte context window and a
64,000-byte cumulative ceiling; domain adapters may impose a smaller result
cap. Evidence is never split into malformed partial JSON to fit the window.
The coordinator canonicalizes each tool ID and JSON input and terminates with
a closed `evidence_duplicate_tool_request` diagnostic before executing the
same effective request twice, even when a provider changes only the call ID.
Tools may additionally declare domain-neutral `effect: observe|mutate` and
`repeatPolicy: after_mutation` semantics. A protected observation cannot run
again, even with varied arguments, until a successful mutating tool advances
the coordinator epoch. While blocked, it is omitted from the decision tool
list and JSON schema, making the no-progress choice structurally unavailable;
a nonconforming provider result still fails closed as
`evidence_repeat_without_progress` before another tool execution. Declaring
this policy requires at least one mutating tool to remain eligible.
One observation tool may also declare
`initialObservation: { input }`. Core executes that domain-declared, bounded
observation deterministically before the first provider decision, accounts for
it as an ordinary tool call and evidence result, and exposes its evidence to
the first decision. This lets a provider complete a simple evidence-guided
generation in one request instead of spending an initial request asking for
the obvious observation. An initial observation is implicitly protected from
repetition for the current mutation epoch even when the descriptor omits
`repeatPolicy`; Core removes that tool from both the first provider catalog and
decision schema until a successful mutation occurs. If no other tool is
eligible, the provider still receives the completion-only schema once the
minimum evidence requirement is satisfied. Configuration fails closed if more than one tool is
designated or if the designated tool is mutating. The initial marker and input
are coordinator-only metadata and are omitted from the provider-facing tool
catalog; the model receives the resulting evidence, not a duplicate execution
hint.

Reusable context is an explicit per-request option layered on this fresh
inspection path. The service invokes a host-supplied, domain-neutral
`selectForFreshEvidence` projection only after at least one current evidence
result exists, then exact-filters and deterministically packs protected
project-local records. The provider-neutral harness receives at most five
items under its independent 10%-of-input/fixed-byte ceiling. Every item is
marked advisory; current evidence remains authoritative, and the harness
rejects cached projections containing selector or target fields. Feature-off,
unconfigured, and non-opted-in requests do not add a reusable-context packet.
Ordinary non-evidence-guided Bootstrap generation cannot opt in because it has
no fresh inspection.

Bootstrap proposals and their creation audit retain only safe cache status,
fresh/reused contribution counts, packed byte/token counts, and selected
record/run/adaptation IDs. They do not retain the packed projection or fresh
evidence. A miss continues generation without changing the evidence or review
requirements.

Marked mutation tools report
`{kind: llm_evidence_tool_execution, evidence, effectApplied, resultCode?}`. The
optional result code is a bounded safe identifier for categorical outcomes, not
provider text or evidence. Their bounded
evidence is retained even when an action is recoverably rejected, but the
mutation epoch advances only when `effectApplied` is explicitly true. Legacy
raw results remain valid for observations and unmarked tools; raw marked
mutation results fail closed as no applied effect.
Evidence-decision context sizes its node catalog against 5,000 rather than the
full 8,000 input tokens, reserving 3,000 tokens for the five bounded tool
schemas, decision schema, and collected evidence. DeepSeek still estimates the final provider projection and rejects it
if the authoritative per-call input or total-token limits would be exceeded.

The persisted adaptation records only bounded iteration, decision, call/tool ID,
categorical result code, effect-applied state, evidence-byte, and usage
accounting. Public failure diagnostics may project at most 16 content-free
`{toolId, effectApplied?, resultCode?}` steps. Raw tool inputs, call IDs, and
collected evidence are not copied into that diagnostic. Aggregate grant exposure is
`maxTotalTokens * maxCalls`; explicit high-token confirmation is required only
when that amount is greater than 100,000 tokens.

The success audit exposes `providerCallCount` and `decisionCount` from trace
entries whose iteration is greater than zero, excluding the deterministic
iteration-zero initial observation. `traceStepCount` reports all trace entries.
The older bounded `iterationCount` remains the total trace length for compatible
readers and must not be used as provider-call accounting. `toolCallCount`
continues to count actual tool executions, including an initial observation.

Runtime diagnosis and patching may use an optional domain-owned failure-evidence
capture callback. Core invokes it at most once after an action fails, passing
only project/Flow/run identifiers and a compact action descriptor; action
inputs, outputs, messages, metadata, page snapshots, and state references are
excluded. The returned JSON is revalidated against Core's failure-evidence
allowlist and must fit both the 3,000-byte hard ceiling and a dynamic allowance
of at most 20 percent of the request input budget. A malformed, oversized, or
failed applicable capture stops before any provider request. An absent callback
or an `undefined` result preserves diagnosis behavior without evidence.

The same in-memory sanitized packet is supplied to diagnosis and patch context.
Only its schema version, serialized byte count, truncation flag, and Core SHA-256
digest may be persisted; its contents never enter run detail. Proposal-only
target overrides can additionally use a domain validator closed over that
packet. Core supplies that validator only the failed node ID and definition ID,
allowing the domain to reject a structurally present target that is
semantically incompatible with the failed action without receiving action
values or trace content. The validator may accept the proposed target or return
one exact canonical replacement when sanitized evidence has exactly one
compatible candidate. Core validates a replacement before using it; malformed,
absent, ambiguous, or unresolved targets fail preflight and create neither an
Adaptation nor a Change Proposal. Persisted resolution provenance is categorical
(`matched` or `resolved`); selectors appear only in the proposal patch itself.
Proposal-only overrides are also bound to the failed trace node: Core requires
that node to exist in the current Flow and deterministically replaces any other
model-selected node ID before evidence resolution. Only categorical
`targetNodeResolution` provenance is retained outside the patch.

Runtime Debug exposes `Build Flow from instructions` only for a blank top-level orchestration Flow with no Router or Subflows, at least one active applicable instruction, an enabled key that passes purpose-aware preflight, and the exact saved build limits: 4,000 input tokens, 1,000 output tokens, 5,000 total tokens, one call, 20 seconds, USD 0.25, and zero provider retries. Ordinary Run remains unavailable while the Flow has no executable topology.

The `Website task` exploration action is available on the same blank Flow as soon as the DeepSeek provider, model, and key reference are configured; it does not require the user to first persist an exact exploration profile. The client derives the bounded 8,000 input, 4,000 output, 12,000 total, four-call, 45-second-per-call, USD 1 aggregate request at action time, while server preflight and grant issuance remain authoritative. Its 48,000-token aggregate exposure remains below the threshold that requires high-token confirmation. This does not relax the exact persisted-limit requirement for the ordinary one-call instruction build.

The authoring action uses the current authenticated session to issue its bounded grant and does not ask for the account password or PIN again. Only a preflight whose total-token limit exceeds 100,000 opens an additional confirmation dialog; confirmation is carried as a boolean grant-request field and enforced again by Core. Preflight and grant issuance use `build_and_adapt`; the browser route adds the authenticated session ID, so browser code never derives or exposes it. The surface keeps availability checks visible instead of disappearing while preflight is pending or rejected, and a rejected check offers an explicit retry.

Website exploration distinguishes its two safety boundaries in the interface: bounded browser actions happen immediately against the connected tab, while the generated Router, Subflows, and actions remain an unapplied proposal. Preparing and exploring states expose an accessible indeterminate progress indicator, elapsed time, and a reminder to keep the target tab connected. Shared LLM progress vocabulary uses `Checking prior evidence`, `Inspecting live target`, `Generating proposal`, and `Ready for review`; the current authoring surface renders only phases supported by observable state. In particular, prior-evidence wording and controls remain hidden until reusable-context candidate data exists. Successful generation states explicitly confirm that no generated change has been applied. Failures map only allowlisted diagnostic codes to fixed, actionable recovery guidance; raw service errors, provider output, prompts, and page evidence are never rendered.

Successful generation opens the returned proposed Bootstrap Adaptation in the existing Adaptations view. A typed compatibility bridge projects the dedicated Bootstrap document through the standard `get-flow-adaptation` DTO without copying it into standard Adaptation persistence. The projection exposes only the source instruction IDs, Core-derived risk, summarized Router/Subflow changes, bounded request/token/cost accounting, and the base/current Core execution digests and settings revisions. It never exposes a key identity, grant, session, prompt, instruction body, or raw provider response.

The authoring surface cannot approve or apply the proposal. The standard PIN-protected review endpoint detects the Bootstrap identity and delegates only approve, reject, apply, and revert to the dedicated lifecycle; the Adaptations UI hides unsupported standard actions. Review responses re-project the new lifecycle state immediately. An applied response includes the canonical post-apply execution digest, which must match the dedicated application record. Only explicit application materializes the deterministic Core-owned Router, Subflows, and graph Flows; existing Router/Subflow mutation subscriptions then refresh Runtime Debug readiness and allow a deterministic Run.

The browser request policy marks preflight, grant authorization, and generation as explicit mutations. No bootstrap provider request is part of ordinary preload or summary hydration.

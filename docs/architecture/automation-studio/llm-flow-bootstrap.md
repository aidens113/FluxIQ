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

For the first live authoring lane, Core fixes the input ceiling at 2,000 estimated
tokens and the resolved instruction allowance at 384 tokens. Core budgets the
exact schema, instruction packet, and provider-envelope reserve before selecting
catalog entries. It ranks only definitions that already passed scope,
capability, and permission resolution, recognizes small domain-neutral intent
groups such as fill/type, select, click, assert/verify/wait, and includes stable
start/end foundations when available. Required intent groups are selected
first. If a viable required group is unavailable or cannot fit, the context
records it as missing and generation fails before provider or secret resolution.
The provider independently estimates its exact serialized outbound body as
`ceil(UTF-8 bytes / 4)` and rejects a request above the configured input ceiling.
The context also contains an explicit compact output schema. Recording IDs,
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

Success persists exactly one proposed, reviewable Bootstrap Adaptation bound to
the base dependency digest and settings revision. It does not create or mutate a
Router, Subflow, graph Flow, node, or edge. The return value contains only
project/Flow/adaptation identifiers, proposed status, Core risk, source
instruction IDs, base binding, and sanitized request/token/cost accounting. It
does not return the plan, prompt, instruction bodies, provider credential/key
identity, execution grant ID, or secret material. Explicit review and apply are
still required to materialize topology.

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

Runtime Debug exposes `Build Flow from instructions` only for a blank top-level orchestration Flow with no Router or Subflows, at least one active applicable instruction, an enabled key that passes purpose-aware preflight, and the exact saved build limits: 2,000 input tokens, 512 output tokens, 3,000 total tokens, one call, 20 seconds, USD 0.25, and zero provider retries. Ordinary Run remains unavailable while the Flow has no executable topology.

The authorization modal states those limits and requires the current account password plus security PIN. Credentials remain controlled transient fields and are cleared on close, validation failure, authorization failure, generation failure, and success. Preflight and grant issuance use `build_and_adapt`; the browser route adds the authenticated session ID, so browser code never derives or exposes it. Failures render fixed sanitized copy instead of service or provider text.

Successful generation opens the returned proposed Bootstrap Adaptation in the existing Adaptations view. A typed compatibility bridge projects the dedicated Bootstrap document through the standard `get-flow-adaptation` DTO without copying it into standard Adaptation persistence. The projection exposes only the source instruction IDs, Core-derived risk, summarized Router/Subflow changes, bounded request/token/cost accounting, and the base/current Core execution digests and settings revisions. It never exposes a key identity, grant, session, prompt, instruction body, or raw provider response.

The authoring surface cannot approve or apply the proposal. The standard PIN-protected review endpoint detects the Bootstrap identity and delegates only approve, reject, apply, and revert to the dedicated lifecycle; the Adaptations UI hides unsupported standard actions. Review responses re-project the new lifecycle state immediately. An applied response includes the canonical post-apply execution digest, which must match the dedicated application record. Only explicit application materializes the deterministic Core-owned Router, Subflows, and graph Flows; existing Router/Subflow mutation subscriptions then refresh Runtime Debug readiness and allow a deterministic Run.

The browser request policy marks preflight, grant authorization, and generation as explicit mutations. No bootstrap provider request is part of ordinary preload or summary hydration.

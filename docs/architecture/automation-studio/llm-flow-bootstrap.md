# LLM Flow Bootstrap Contract

Automation Studio owns a domain-neutral, instruction-first authoring boundary for
building a new executable Flow without a recording. The boundary is implemented
in `runtime/flow-bootstrap/plan.ts` and integrated with the existing LLM harness as
the `flow_bootstrap` task. It does not execute a provider request, persist a
proposal, or mutate a Flow by itself.

## Context boundary

A bootstrap request carries the existing effective active instruction
resolution plus the node catalog. The canonical node registry filters the
catalog before it reaches the model:

- the Flow's global or domain scope must allow the definition;
- every required runtime capability must be present;
- every required permission must be present;
- entries are sorted by definition ID, and every one that passes is sent,
  whole: its label and description uncut, and every parameter's authoring
  text and example (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER
  OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION OR USE ANY RANKING
  ALGORITHM");
- definition/version, labels, descriptions, capabilities, ports, parameter
  contracts with their authoring text, and output-action contracts are exposed.

The service derives this registry resolution from a defensive snapshot of the
bound native runtime's configured scope, runtime capabilities, and permissions.
It uses the same projection for generation, proposal normalization, and apply
revalidation. Required permissions remain definition-owned safety metadata: a
node whose permission is not granted is excluded rather than made available by
a bootstrap-specific exception. When no native runtime is bound, Core retains
the fail-closed empty capability and permission fallback.

Nothing ranks, budgets or condenses the catalog. Until 2026-09-30 a first live
bootstrap was held to 4,000 input tokens and 384 instruction tokens, the
catalog was ranked against the instruction and filled to a byte budget (64
entries for an evidence-guided build), and an entry's text was cut or
condensed. The only bound on the request is now the model's context window: a
request over it is refused before it is sent, with its size, and is never
trimmed (`runtime/llm/harness/run.ts`). The instruction is still read for one
thing: a capability it asks for (to enter, choose, press, verify and so on) that
no offered node provides is recorded in `catalogSelection.missingRequiredTerms`
(`runtime/flow-bootstrap/plan/required-terms.ts`), and generation fails before
provider or secret resolution.
The provider independently estimates model-visible system and user message
content as `ceil(UTF-8 bytes / 3)` plus a fixed chat-framing reserve, and rejects
a request above either the configured input ceiling or combined input/output
ceiling. The context also contains an explicit compact output schema. Recording IDs,
recording events, timelines, screenshots, and recording-derived candidates are
not part of the schema or context. A `flow_bootstrap` request fails before
provider invocation when it has no effective active instruction or no
scope-aware registry context.

### The catalog an evidence decision is shown

The one-shot `flow_bootstrap` call has no tools, so it is sent the whole
catalog above. An evidence decision -- every decision of an evidence-guided
build: its exploration, its repair rounds and a re-author -- is sent the
catalog by name instead, and the full definitions only of the nodes it asked
for (user, 2026-10-01: the whole catalog, 41,122 of the 58,547 characters of
one decision, was resent on every decision). Its `flowBootstrap` carries:

- `nodeCatalog`: every offered node as `{"<category>": ["<id>: <description>"]}`,
  nothing cut, descriptions whole with whitespace collapsed, categories in the
  order they first appear in the id-sorted catalog and entries by id
  (`runtime/flow-bootstrap/plan/catalog-names.ts`);
- `nodeCatalogNote`: one constant sentence on how to read the two fields;
- `describedNodes`: the full catalog entries (label, description, ports,
  parameter contracts with their authoring text, output-action contract) of
  the nodes this build has described, in the order each was first described,
  absent until there is one.

`catalogTruncated` and `catalogSelection` are not sent on that payload. The
packet still carries the whole `nodeCatalog`, `catalogSelection` included, for
every check that reads it (`catalogNames` and `describedNodes` sit beside it,
`runtime/llm/harness/context-packet.ts`); only the request body leaves it out
(`runtime/llm/deepseek/request-body.ts`).

The model reads a definition with Core's tool `core.describe_nodes`
(`{ids}`, up to 64 per call; `runtime/llm/node-tools/describe-nodes.ts`). It
observes only, is never a step of the Flow, and is offered only beside the
node library (`core.run_node`). It answers with a receipt -- `described`,
`alreadyDescribed`, `unknown`, `shownIn: "flowBootstrap.describedNodes"` --
never the definitions, which appear in `describedNodes` from the next decision
on, so each is shown once per request however long ago it was asked for. A
call naming only unknown ids is refused as `describe_nodes.unknown_nodes`. The
memory is one build's (`runtime/llm/node-tools/node-descriptions.ts`): every
round of the build shares it, and a new build starts empty. A describe call
reads nothing on the page: build routing records nothing for it (`pageless`,
`runtime/route-state/build-routing.ts`) and the state-digest hook skips it, so
it costs no page capture.

Describing first is advice, never a gate: nothing is refused before a call for
not having been described. `core.run_node`'s description teaches the two steps
(pick a name, read its definition before first running it). When a
`core.run_node` call fails -- refused evidence `ok: false`, or a thrown call,
including a rerun asked through `amend_draft` -- the node it named is described,
and a refusal says so (`described`, or `definition` when it already was) with
`undeclaredParameters` listing any parameter it gave that the definition does
not declare (`runtime/llm/node-tools/describing-failures.ts`). Core's own
replays of the draft pass through untouched.

## Permission on the authoring path

A build may carry `permittedConsequences`, the lasting consequences the person
allowed its actions to have. The build's model calls need no authorization of
their own: they run on the caller's own unlocked Secret Keys key. The domain
declares, action by action, what one would do --
for a step the build takes now while exploring, and for a step the finished Flow
would take each time it runs -- and
`AutomationStudioActionPermissionGate` answers from `permittedConsequences`, which a
person's answer to the gate's question extends. An action whose gated consequences the
build does not hold raises an
`automation-studio.action-permission-request.v1` with `reason.stage: "authoring"`.

**Only a high-risk real-world consequence is ever refused.**
`AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES` is exactly `move_money`,
`delete`, and `send_or_publish` (`action-permissions/destructive.ts`): completing
a purchase or checkout, moving money, deleting, and sending or publishing on the
person's behalf. `modify_existing` and `create_new` do not cause an authoring
permission question solely from their class. **The instruction authorises none of
the three** (the user's rule, `docs/working/mvp-today-plan.md:150` in the web
extension repository: these acts independently require a person's authority, so
each is asked about even when the instruction asked for it; restored 2026-09-30
after the gate had let an instructed class through unasked and never gated
sends). The derivation in `instructed.ts` still reads which of them the
instruction asks for: the answer travels in the request's
`authority.instructed`, is stored with the Flow, and feeds the cross-check
below. Every class is still declared, kept in the declaration record, and
compared with the instruction. Only a gated subset no person has permitted
produces an `automation-studio.action-permission-request.v1`.

**The request is put to the person, in the Flow's own thread.** The request's
`requestId` is the id of a `permission` ask
(`runtime/conversations/ask.ts`), so the gate and the conversation name the same
question without either inventing an id, and the ask carries the request
verbatim. Answering `grant` adds exactly the classes the request listed as
`missing` and the build carries straight on -- the same check is asked again
rather than answered a second time. A refusal, or nobody answering, leaves the
domain's own recoverable `permission_required` for the model to route around.

**Nobody answering and a person saying no are different answers (t195-w18).**
`automationStudioPermissionAskOutcome` (`runtime/parking/permission-ask.ts`)
reads the ask back as `granted`, `declined` (a `deny` in the thread) or
`unanswered` (the wait ran out, the caller did not wait, the wait was
cancelled, or the thread could not be reached), and the gate settles each
differently. An unanswered request stays in force: every later gated action
is refused with that request's id and no new request is raised, so a build
nobody is watching still costs one wait rather than one per action. A decline
is remembered for that question alone -- the same control name, the same
control kind, and the same classes it was asked about. That question is refused
from then on without asking, carrying the declined request's id and
`declined: true` on the verdict, and a later grant of the same classes on
another control does not lift it. A different question raises a new request,
which is put to the person in the same way. The request the build ends on, or
is proposed with, is the one the latest refusal carried, with one exception: a
declined request is carried only while a step of the Flow needs it. An
exploration press of a declined control is refused without the build standing
on it, so a later stalled round is not ended as that question and a finished
Flow that never presses the control stays approvable; a plan step refused by a
declined question ends the build on the declined request, and one refused by a
new question ends it on that. Until this, one declined press on "Continue
to checkout" refused "Place order" -- the press the task needed -- unasked for
the rest of the build. The domain tells its model `consequences_declined` for a
declined press rather than `consequences_not_granted`, which says the request
is still in front of the person. The repair path
(`recovery/runtime-exploration.ts`) follows the same rules since 2026-10-01:
each request is asked once, a decline is told to the repair's model as
declined and its exploration goes on, a different control is asked, and only
an unanswered request ends the exploration, with `operator_approval_required`
carrying it. Before that a repair settled a no as silence and ended on it.
The gate settles only `granted` and `declined`; any other answer leaves the
request in force, so nothing is ever granted by default.

**Whether the build waits is the caller's decision.**
`permissionAskTimeoutMs` on the generation input is how long it holds open for
an answer; absent, the question is still opened in the thread and the build
carries on without waiting. The API handler passes
`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS`, because somebody
has just pressed build; an unattended caller passes nothing. The caller decides
whether to wait; how long is capped at that same constant, since a build holds
its caller's request open while it waits.

**A build may propose while carrying an unanswered request.** It ends on the
request only when it produced nothing; a plan the completion check accepted is
still a Flow worth having, and the request is stored on the adaptation as
`permissionRequest` and returned with the proposal. Approving or applying such
an adaptation is refused until the ask it names is answered `grant`
(`assertAutomationStudioBootstrapPermissionAnswered`), because a saved Flow
replays with no gate in front of it, by design.

**Both generation paths go through the same gate.** The evidence-guided build
hands the check to every exploration call and to every step of the plan it
completes; the one-call build, which explores nothing, hands it to every step of
the plan as its parameters are resolved. Before this, the one-call path resolved
with no check at all, so every step that declared a lasting consequence was
refused with no request raised and nobody asked.

**Every declaration is kept, including the empty one.** An action that says it
causes nothing lasting is put to the gate like any other: it is read, recorded
and permitted. The gate keeps one `AutomationStudioActionDeclarationRecord` per
action asked about -- the action, the control as a person would name it under
the same evidence rule the request uses, the classes, and Core's answer -- and
the build stores them on the proposal as `declaredConsequences`. Until
2026-09-22 a permitted verdict discarded the declaration where it was read and
the domain never even called the check for an empty one, so what a step had said
about itself could only be deduced from the absence of a refusal. Four live
builds authored Flows containing presses that nobody could account for.

**Core holds the declarations against the instruction.** After the loop stops,
`automationStudioActionDeclarationCrossCheck` compares what the build declared
with what the person's instruction was read as asking for, and stores the
finding on the proposal as `consequenceCrossCheck`. `verdict: "undeclared"` is
the contradiction nothing else catches: the instruction plainly asks for
something lasting, actions that commit ran, and not one of them said it would
cause it. Measured live on `social-scheduler-schedule-post`, twice: the press on
"Schedule post" declared `send_or_publish`, the instruction asked for
`send_or_publish` **and** `create_new`, and `create_new` was declared by
nothing.

It refuses nothing and grants nothing. The instruction is the authority for
permitting, so a class the instruction asks for was already allowed and an
under-declaration bypasses no permission; refusing the build would be Core
overruling the person's own instruction on Core's reading of their words.
Instead the finding is recorded on what the person approves and said out loud in
the Flow's thread. It is a `confirm` ask ("... Apply it as it stands?"), which
does not park, only when a class nobody declared is one a person is asked about
(`destructive.ts`: moving money, deleting, sending or publishing -- the user's
rule of 2026-10-01); a creation or an edit nobody declared is said as a plain
line with no question (t174 F42). The sentence names each class in plain words
beside the person's own quoted words, with no class codes and no action counts:
run `run-muqk4u32-0b36e58f` ended on "The instruction asks for modify_existing
and create_new, and none of this run's 72 actions said it would cause that",
whose 72 counted every replay of the draft. Nothing here reads a control, a
label or a node id: both sides of the comparison are the model's own statements.

The comparison may cost one provider call the build would not otherwise make,
and only in the case worth paying for -- at least one action was put to the gate
and none of them declared anything lasting, so the derivation that reads the
instruction was never triggered. That call is counted:
`totalProviderCallCount` on the created-audit detail is every call the build
made. `providerCallCount` and `decisionCount` remain the evidence loop's own and
stay equal to each other, because a downstream reader holds them to that.

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

- schema, UTF-8 bytes, counts, and graph depth, each derived from the Flow's
  size setting (see "Flow Size" below);
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

## Flow Size

How large a Flow may be is one setting a person changes: the most nodes one
Subflow may hold, `flowSizeSettings.maxNodesPerSubflow` in the Flow's metadata,
shown in Flow Settings as "Maximum nodes per Subflow". It defaults to 100 and
accepts a whole number from 1 through 1,000; a Flow saved before the setting
existed reads the default. The model is `model/flow-size/`.

Every bound on a Flow's size is derived from it in
`runtime/flow-bootstrap/plan/size-limits.ts`, so raising it raises all of them:
two edges per node in a Subflow, eight full Subflows in total, a graph depth
equal to the node setting (a straight chain of every node fits), two kilobytes
of plan per node (never below 65,536 bytes), and one kilobyte per node for one
reply's result (never below 12,000 bytes). Parsing, registry validation, the
reply and draft profile limits, the output and evidence completion schemas the
model is shown, and the deterministic recovery path all read it. A refusal over
a bound names the setting and the value it had. A reader of a record written
earlier -- a published trace, a stored incomplete draft -- has no Flow in hand
and bounds by the setting's largest value instead, so a record any Flow's
setting allowed stays readable. The setting is part of the Flow's settings
revision whenever it differs from the default, so changing it makes a proposal
built under the old value stale rather than applying it; a Bootstrap context
built for a non-default Flow carries `maxNodesPerSubflow`, which is how the
provider adapters, holding only the request, size the schema they check and the
plan they parse.

## Plan handles

The model never sees a locator. A domain names each thing it observed while
exploring with an opaque handle and keeps what the handle points at to itself,
so a node the model writes can refer to what it observed only by handle.
Wherever a real value belongs, such as a target or an extraction item, a
parameter value may be `{ "handle": "<token copied from the evidence>" }`. When
the model explored more than one place, the value may also name the place the
evidence reported, as `{ "handle": "<token>", "location": "<location>" }`
(`runtime/llm/harness-options/plan-node-handles.ts`). The shape is reserved.
An object whose keys are `handle` and, optionally, `location` is always a
reference, in any node's parameters. An object with `handle` beside any other
key is not a reference. A reference is malformed when its token is outside the
handle syntax: letters and digits, with `_.:-` allowed between them, at most 64
characters. It is also malformed when its location is not a string of 1 to
2,048 characters without control characters, or when one node names more than
16 references.

After parsing and before registry validation, Core asks the bound domain about
every node, once each (`resolveAutomationStudioFlowBootstrapPlanParameters` in
`runtime/llm/harness-options/plan-parameter-resolution.ts`). The domain answers
through `resolvePlanNodeParameters` on its evidence binding
(`runtime/llm/harness-options/binding.ts`). It receives the project ID, Flow ID,
node definition ID, and a copy of the node's parameters as the model wrote
them. It answers with one of three results:

- `unchanged`: the parameters stand as written.
- `resolved`: the node's complete parameters, with every handle replaced from
  what the domain retained when it issued it.
- `refused`: issue codes only. Core keeps at most 16 of them.

Core trusts none of the answer. Each of the following refuses the node under a
code of Core's own:

| Code | Cause |
| --- | --- |
| `bootstrap.handle_malformed` | A reference is malformed. |
| `bootstrap.handle_not_issued` | The node names a handle, but the generation explored nothing, so no handle can have been issued. |
| `bootstrap.handle_resolution_unavailable` | The node names a handle, and the domain binds no resolver. |
| `bootstrap.parameter_resolution_failed` | The resolver threw. |
| `bootstrap.parameter_resolution_invalid` | The answer has another shape, or its resolved parameters are not plain JSON within 16,384 bytes. |
| `bootstrap.parameters_refused` | The domain refused without a usable code. |
| `bootstrap.handle_unresolved` | The parameters still name a handle after resolution, `unchanged` ones included. |

A refused node fails the plan and never reaches dispatch. In evidence-guided
generation the refusal is fed back to the model (see
[Generation command](#generation-command)).
`createFlowBootstrapAdaptation` and Bootstrap apply both run
`assertAutomationStudioFlowBootstrapPlanHandlesResolved`, so a plan that
reaches either without resolution is refused if any handle survives.

## Core-derived fields

The model cannot supply risk or canvas positions. Core derives risk from
registered definition safety, runtime, permission, capability, and output-action
contracts. Core then lays each validated Subflow out by topological depth and
stable symbolic-key order using fixed spacing. The result is deterministic and
contains no overlapping positions.

The validated plan is the only input accepted by the dedicated Bootstrap
Adaptation lifecycle. Provider resolution, UI controls, and same-run
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

### Domain system instructions

A domain may bind its own instructions with its evidence runtime:
`AutomationStudioLlmEvidenceRuntimeBinding.systemInstructions`, a
`{ version, text }` checked when the runtime is bound
(`runtime/llm/domain-instructions/`). `version` matches
`^[a-z0-9][a-z0-9._-]{0,63}$`, and `text` is non-blank, at most 4,000
characters, with no control character but a line feed. A text that fails is
refused by the service constructor or `bindLlmEvidenceRuntime`, never mid-build.

Coverage is central, not per call site. The service wraps the host's execution
resolver and the result-check resolver once, where they are stored, with
`automationStudioLlmResolverWithDomainInstructions`. Every provider either
resolves is decorated by `automationStudioLlmProviderWithDomainInstructions`,
which sets `domainInstructions: { domainId, version, text }` on each request
passed to `runTask` and to `measureInput`. That covers every evidence decision,
the bootstrap call, the instruction authority, the build judge, runtime
diagnosis and patch, result verification, recovery annotation and the standing
repair authority, and any call site added later. The binding is read when a
provider is resolved, so a runtime bound after the resolver is the one sent.

The request carries the instructions beside its context, like
`deniedEvidenceKeys`. They are never part of the user payload, but they are
part of the system message, so the provider's `measureInput` counts them. The
DeepSeek system message is built in three parts:

1. Core's rules: the JSON-only and injection rules, then the task's schema
   instruction.
2. The domain's text, set off by a blank line before and after.
3. Core's prose for the task, as before: the evidence-decision instruction,
   compact-output rules, runtime-patch prose, diagnosis fields and the
   reusable-context rule.

Both of the first two parts are constant for a binding and a task kind, so the
text sits inside the prefix a provider's cache reuses from one call to the next.
Nothing a domain writes replaces Core's schema or injection rules. Without
instructions the message is byte for byte what it was; the pins are
`runtime/llm/deepseek/tests/system-prompt-pins.json`.

The chat's interpreter (`runtime/conversations/instructions/prompt.ts`) gets
the same text. The service connects the conversations collaborator to its
binding with `bindDomainInstructions`. The text follows the panel's fixed
capability vocabulary and precedes the project's Flows and what is on screen.
The answer-shape rules stay last.

Provider response content is still untrusted. For bootstrap tasks the adapter
requires exactly `kind`, `summary`, and `plan`, then parses the plan through
the strict bootstrap parser before returning it to the harness. The harness
performs the subsequent scope-aware registry validation. Provider transport
therefore cannot reinterpret bootstrap output as a generic change proposal or
pass recording/timeline-shaped context into this lane.
## Bootstrap Adaptation lifecycle

The runtime/flow-bootstrap/adaptation.ts module defines a separate, typed
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
session, prompt, or response data. Standard Adaptation Inbox queries
merge these dedicated summaries with ordinary adaptations by adaptation ID, so
proposals remain discoverable after restart without duplicating their topology
or changing the ordinary-adaptation persistence path. The dedicated proposal
document remains available as lineage after revert.

AutomationStudioService.getLlmExecutionBinding(projectId, flowId) exposes the
current execution dependency digest together with the canonical numeric Flow
settings revision. Persistent projects use the SQL settings revision; the
memory-only fallback derives a stable numeric fingerprint from the effective
settings content and never uses wall-clock time. Provider execution remains
outside the Bootstrap Adaptation persistence path.
## Generation command

The public service command generateFlowBootstrapAdaptation is the only Core
command that joins production provider resolution to the strict bootstrap
contract. Its input is deliberately narrow: project ID, blank Flow ID, the
`caller` (`AutomationStudioLlmModelCaller`, the actor whose unlocked Secret Keys
key pays), and optional `permittedConsequences`. The API endpoint takes the
caller from the request's authenticated actor. Runtime flags, dry-run flags,
side-effect authorization, provider overrides, and arbitrary metadata are
rejected before provider resolution. No grant, purpose, execution digest, or
settings revision is supplied or compared: the model call needs no
authorization beyond the caller's own key.

Before any provider call, the command serializes generation for the parent
Flow and verifies all of the following:

- the parent is a blank top-level orchestration Flow with no Router or Subflow;
- no proposed or validated Bootstrap Adaptation is already pending;
- at least one active global, project, or target-Flow instruction resolves
  without instruction conflicts;
- the scope/capability/permission-filtered node catalog is nonempty and remains
  inside the bootstrap contract's count and byte bounds;
- the configured resolver returns a provider for the caller with bounded
  execution settings.

It reads the Flow's dependency digest and settings revision as they stand as
the proposal's base binding. Without `evidenceGuided`, the command invokes the
harness exactly once with task and expected output flow_bootstrap. The harness
packs only active scoped instructions and the compact catalog/schema context.
Provider output is parsed, its node parameters are resolved through the bound
domain (see [Plan handles](#plan-handles)), and it is registry-validated as
untrusted data. Nothing was explored on this path, so a plan that names a
handle is refused. Core then rechecks the Flow's base binding before
persistence. Provider or validation failures create no proposal.

The caller's key is released per call by a one-use Secret Keys session reveal
authorization against the unlock established at web login; the account
password or PIN is never asked for again. Secret Keys derives per-key
decryption buffers for that session and retains them only in memory, bounded
by the session expiry. One-use reveal authorizations copy only the selected
derived buffer; logout, session expiry, key mutation, and runtime close revoke
and zero the applicable buffers. Neither the login password nor the unlock state
is persisted. The per-request ceiling is the model's context window --
1,000,000 tokens for both configured models, derived from
`AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` as
`AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST` -- and the session-key
profile is that whole window: 992,000 input tokens, 8,000 reserved for the reply
by default (build decisions send and reserve 2,000), 1,000,000 total. A request whose estimated input plus reserved output exceeds the
window is refused before it is sent, never trimmed:
`llm_budget.input_limit_exceeded` or `llm_budget.request_total_exceeded` from
the harness, and `llm.provider_input_budget_exceeded` from the DeepSeek adapter,
each stating the estimated input tokens, the bytes and the window. The build's
spend is bounded by the Flow creation's one purse, not by the window; see
[One purse per Flow creation](#one-purse-per-flow-creation).

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
canonical settings binding, pending adaptations, active
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
Both are received, non-retryable results of the call that was made. Diagnostics
expose only the closed reason code and bounded accounting, never provider
content.

Evidence-guided Bootstrap completion uses a separate self-contained,
reference-free schema while retaining the canonical public Bootstrap plan
shape. This avoids dangling local references when the plan schema is nested
inside an evidence decision. The evidence completion is held to a
240-character summary, four Subflows, eight Router rules and sixteen parameters
per node; how many nodes and edges it may carry, and its UTF-8 byte budget, come
from the Flow's size setting (see "Flow Size" below). Its
instruction asks for one primary Subflow with Router fallback by default and
permits extra topology only when the active instruction requires it. Core
rechecks these bounds after parsing and before registry validation. No path
cuts the catalog: the one-shot path sends it whole, and an evidence decision
sends every node by name plus the definitions it asked for (see
[The catalog an evidence decision is shown](#the-catalog-an-evidence-decision-is-shown)). A representative routed three-action web plan is
1,110 bytes (370 tokens under Core's conservative estimator), so the 4,000
output-token limit remains unchanged.

A completed candidate is checked while the model can still correct it. Every
check a completion must pass runs as the evidence loop's completion check,
`checkAutomationStudioFlowBootstrapCompletion`
(`runtime/llm/harness-options/bootstrap-completion.ts`). The checks run in this
order. Checks 1 to 5 refuse, each with its own code: a plan that cannot be
built at all cannot run. Checks 6 and 7 are information, not refusals (user,
2026-10-01: no restriction on what the model does beyond the permission
gates): what they find travels on the accepted verdict as `notes`, and reaches
the judge of the build's test as `buildTest.notes`
(`runtime/result-verification/build-test/`). A replayed list read's observation
also carries `readRows`: the labels of the rows it returned and, per condition,
the rows that condition alone left out, screened by the same function as the
runtime judge's `leftOutOnlyByThis` (`build-test/read-rows.ts`), so the judge
can see an asked row was dropped (live run `run-muqk713g`, cause C3). A judge
reply that leaves a diagnosis text empty (`changed: ""` beside a yes) has that
field read as omitted, not refused (`runtime/llm/harness/provider-result.ts`,
cause C2). A diagnosis text (`expected`, `observed`, `changed`) past its
500-character bound is read clipped to it, at a word boundary and ending
`… [clipped]`, with a warning `llm_output.diagnosis_text_clipped` naming the
field; the verdict and the other fields stand, and only a text that is not a
string is refused. It used to void the whole reply: live run `run-murwcmx2`'s
second judge call answered a clear `no` with a 581-character `changed`, and the
refutation was recorded as unconfirmed (t194 cause C-A). The bound stays 500 in
the instruction and the output schema. When the judge's two calls do not settle
(`model_disagreed`, `model_unconfirmed`) but one of them judged the test not to
do what was asked, that call's expected, observed and advice travel on the
unsettled verification as `unconfirmedReading`, on the build's `unknown`
verdict, and into the repair's judgement as `judge.unconfirmedReading`; the
repair is told it is one judge call's reading the second check did not confirm,
to act on where the rows and the test bear it out (cause C-B). It is never a
failure record or a repair directive: an unsettled runtime verification still
does not fail a run, and the reading is not recorded on run records. The judge's verdict on what the
test actually did decides, and a wrong result is repaired with its reasons. The
instructed-act check that follows is information the same way, except
`act_consequence_undeclared`, which is what makes a delete, a payment or a send
get asked.

1. The `{summary, plan}` envelope: `flow_bootstrap.evidence_completion_wrapper_invalid`.
2. The plan's structure: `flow_bootstrap.evidence_completion_plan_invalid`.
3. The tighter evidence completion profile:
   `flow_bootstrap.evidence_completion_profile_limit_exceeded`.
4. The domain's resolution of each node's parameters:
   `flow_bootstrap.evidence_completion_parameters_unresolved`.
5. Registry validation: `flow_bootstrap.evidence_completion_plan_invalid`.
6. Whether the Flow could answer the instruction at all: a note with code
   `bootstrap.cannot_answer_instruction` and the requested `columns`.
7. Whether the Flow could reach the place it starts: a note with the start
   location it `starts` from.

Check 6 is the only one that reads the instruction rather than the node library,
and it is what stops a build proposing a Flow that cannot produce what the
sentence asked for. Four live builds against one instruction — every pair of
wireless earbuds matching three conditions across every page of results, as a
table with four named columns — proposed four different Flows as finished, one
of which navigated twice, typed three times and read nothing. Checks 1 to 5
confirmed all four parsed, resolved and validated.

`flow-bootstrap/answerability/` answers it from the plan and the active
instructions' own text, with no provider call on any path. It reads what the
instruction asks to be given back from a short list of unambiguous words
(`records`, `rows`, `columns`, `as a table`, `scrape`, `extract` and a few
more), and notes only where the instruction plainly asks for a set of records
and no step of the Flow produces or saves one — a step whose definition declares
where its own result keeps rows, or one whose record output names a dataset. It
judges capability, never a chain: a Flow that reaches a search by URL rather
than typing into a field is accepted, as is an extraction that may find nothing,
because whether what it found answers the request is the finished run's
verification to judge. Two cases are left alone outright: an instruction that
asks for no records, and a node library that registers nothing returning rows of
its own, where a refusal would ask for a node that does not exist.

Check 7 asks the other question none of checks 1 to 5 asks: not whether the Flow
could answer, but whether it could run. `run-muht9lpw-a39aa056` built a Flow of
one node — a single list extraction, with no navigation anywhere in it — and
replay failed before its first step with `Cannot access contents of url
"about:blank"`. Its exploration had navigated, dismissed the page's
interruptions and read the list; the amendments that followed reduced the draft
to the reading alone. An extraction on its own satisfies answerability, because
a step that returns rows is present; it simply has nowhere to do it.

`flow-bootstrap/reachability/` answers it from the plan and the start location
the build was given (`flow-bootstrap/start-location.ts`), with no provider call
on any path. It notes only when all three hold: the build was given a start
location, the plan holds at least one step that acts on the bound domain's own
target — a node the domain registered, or one of Core's told to dispatch a
domain output — and no step of the plan carries where the Flow starts. Core
never parses a start location, so "carries" is a text comparison and a loose
one: a value counts when it agrees with the start location from the first
character for twelve characters, or for the whole of it when it is shorter, so
the site's front page, a deeper page and a neighbouring one all count. This is
the plan-side statement of the rule the bound domain already enforces while a
build explores — the node that goes to the start location is also the Flow's own
first step, because the Flow is built from the steps that ran — so a Flow refused
here could not have run under the rule its own build ran under. Three cases are
left alone outright: a build given no start location, which begins already
there; a Flow of Core nodes, which touches no target; and a node library that
registers no node which can be told a destination, where a refusal would ask for
a node that does not exist.

A refused completion is not the end of creation. The loop adds feedback to the
evidence the model sees next, and asks again. The feedback holds the refusal
code, at most 16 issue codes with their plan paths, and a fixed instruction to
correct them and to name observed elements by handle. A refusal under check 6
carries instead what the instruction asks for, the person's own sentence asking
for it, the columns they named, and the Flow's own steps, with an instruction to
run the step that returns rows and finish again. A refusal under check 7 carries
where the Flow starts and the Flow's own steps, with an instruction to run the
node that goes there and keep it as the first step. The refusal counts as an
unusable decision and spends one of the loop's decisions. Repeated unusable
decisions stop that live round; on the build path the phases coordinator
receives its progress instead of publishing the former bare
`flow_bootstrap.evidence_unusable_decision`. A partial Flow is tested, judged
and repaired; an empty Flow explores again while budget remains. Unreadable
replies have their own counter, described below. A completion the check accepts
is tested before its Flow can be persisted.

**An unreadable reply is asked again, never a bare ending (t211).** A reply that
arrived and could not be read (`llm.provider_malformed_response`, a truncated
or oversized reply, output that is not the decision object) has a count of its
own and never moves the no-progress guard. It is asked again with the same
context and a `core.decision_check` note saying what could not be read (the
reply's case from `runtime/llm/reply-account.ts`, in words) and how many in a
row stop the build; it is paid for and counted in the budget. Six in a row end
the round `llm_evidence_loop.unreadable_replies`, and the build ends
`flow_bootstrap.model_replies_unreadable` with an `ending` message saying so,
how many tries it took, what of the request the Flow already does and whether
the Flow so far was kept (`runtime/llm/unreadable-reply.ts`,
`runtime/flow-bootstrap/unfinished-build/replies-unreadable.ts`). A reply that
was read but is no decision the iteration offered -- a shape the grammar does
not read, finishing before finishing was offered, editing the draft when that
was not offered -- is refused as `llm_evidence_loop.decision_shape_invalid`,
`complete_not_offered` or `amend_not_offered` and asked again like any unusable
decision, rather than ending the loop `invalid_decision`
(`runtime/llm/evidence-loop/decision-refusal.ts`).

**The model authors the draft (user, 2026-09-30).** A step the loop runs is
appended as `taken`: evidence, not a step of the Flow. It enters the Flow only
when the model adds it, either with `add: true` on the tool call that runs it
(no extra decision) or with an `add` amendment naming its step (`to` places it,
`act` names the act it does). Drop, exploratory, reorder, rerun, repeat,
only_if, on_failed and optional edit the authored Flow as before. A rerun's
`input` is a JSON merge patch over the argument the step ran with -- only the
keys that change; a list replaces whole and `null` removes a key -- because the
long free-form whole arguments it used to carry were the replies that came back
unreadable (`runtime/llm/evidence-loop/rerun-input.ts`). A rerun that
worked takes the replaced step's place: its position, its membership, its acts
and its routing, and every routing statement naming the old step is rewritten
to it (`runtime/llm/evidence-loop/rerun-replacement.ts`). The draft entry's
guidance says so, and the Flow is assembled only from added steps. The loop
option `draftAuthoring: "transcript"` keeps the old rule, under which every step
that ran was `kept` unless withdrawn; it exists only to replay builds recorded
under that rule (`runtime/llm/loop-configuration.ts`, `runtime/flow-draft/step.ts`).

**A step added to the Flow brings the way to its page (t174/F41).** When a step
joins the Flow -- `add` on its call, or an `add` or `keep` amendment -- every
step since the last step in the Flow that the model took without deciding
about (`taken`) and that changed the state joins with it, because the step ran
on what they left (`runtime/flow-draft/opener.ts`, `runtime/flow-draft/path-to-step.ts`).
The walk back passes over a look and a call that did not work (even where the
page went on loading under it), and over a step that changed nothing or has no
states; it ends at a step in the Flow or at one the model dropped or called
exploratory. A detour -- a stretch that came back to a state already seen on
the way, such as a listing opened and left again -- is left out; the state a
step left and the state the next one found are compared as one moment, because
a page can go on changing between two calls. Until t174/F41 the rule brought at
most two steps back: live run `run-muqk4u32-0b36e58f` added 7-in-1 on an item
page reached by a ×, a search, a listing in a new tab, a consent and a colour;
the colour and the consent were kept and the rest were not, and two dry runs
ran the item-page steps on the home page. For the same reason a refused dry
run, given the draft, names the taken steps that changed the page on the way
to its first `unreproducible` step and are not in the Flow (`notInFlow`:
"Steps 3, 4 and 5 changed the page on the way to step 6 ... add them",
`runtime/flow-draft/dry-run.ts`).

**Each step names the control it acted on (t174/F33).** A step's `input` names
a control by the token the domain minted for it, a handle on the web, and a
token says nothing once its page is gone: live run `run-muqiho5c-e830ce01`
pressed "Not now" (t1082), then added that step as its add-to-cart act from a
draft showing only `input: {target: {handle: "t1082"}}`, and completed with an
empty cart. A call's draft statement may therefore carry `control`, the words
its own outcome showed for what it acted on; the draft step keeps it and the
draft entry prints it beside `input`. It is absent where nothing was acted on
(a look, a navigation) and on a refusal. It is page text, so it crosses the
evidence boundary as a permission request's control name does: read only on
the execution-result parse path, carried only when the call's own evidence
showed those words, plain (no control characters or `<>`), and cut to 120
characters; anything else is withheld, never refused
(`runtime/flow-draft/control-words.ts`). It is never a parameter: the Flow is
written from `input`, `ranWith` and `settings` (`runtime/llm/node-tools/draft-step.ts`).

**A step that answered an interruption is optional (t174, case 2 of t174-w60).**
A call's draft statement may also carry `interruption: true`: the host saw the
call answer something standing in front of the page -- a dialog, a consent
wall, a covering popup -- that was gone after it. Only `true` is carried; any
other value is withheld, never refused. The draft step keeps it, and a proposed
step that says it, claims none of the instructed acts and has no routing of its
own is wired as `optional` when the Flow is written
(`runtime/flow-draft/sometimes-present.ts`,
`runtime/flow-bootstrap/authoring/draft-routing.ts`): its failure reaches the
join the next step runs from, so playback skips it on a visit where the site
remembers the answer. The stored draft is not rewritten, and a step that does
an instructed act is never made optional.

**Each step records the page it started on and the page it left (t243).** A
run that meets a step it cannot run continues at the node whose expected
pre-state matches the page, so the build records each step's pre-state as it
sees it. The build's routing (`runtime/route-state/build-routing.ts`) keeps,
for every call that reports the digest of the page it left
(`stateDigests.after`) and that page's route state, the host's signature of the
state (`signRouteState`) under that digest; the free first look counts the same
way. A draft step's `stateBefore` and `stateAfter` digests then name its route
signatures: `before`, its expected pre-state, and `after`. They ride the plan
node (`routeSignatures`) through validation, which apply repeats and compares
byte for byte, to the Flow node's metadata under `routeSignatures`
(`runtime/flow-bootstrap/adaptation.ts`). They are keyed by digest rather than
by call id because call ids repeat across repair rounds -- `initial.<tool>`
opens every round -- while a digest names the page itself, and a step's
`stateBefore` is the previous call's `stateAfter` whenever nothing moved the
page in between. A host that signs no states records nothing, an observation
made outside a call has no digest and maps nothing, and a plan the model wrote
itself has any `routeSignatures` dropped before it is read: they are
Core-derived only. Steps also record their **effect**, what they did to the
page: the routing keeps the full route state of the page the newest call left,
with that call's `stateDigests.after` -- one state in memory, never more -- and
for a call whose `stateDigests.before` equals that digest, whose `after`
differs and that reported the route state it left, keeps the host's
`signRouteEffect(previous state, left state)` under the pair of digests. The
web domain reports both digests on an action (its read before acting and its
read after, `withCallStates`). A step's signatures then carry `effect` for its
own `stateBefore` and `stateAfter`. A look (equal digests) records none, nor
does a call that started on a page the previous call did not leave, a call
after one that threw, or a host that records no effects. A run reads the
effect for a step it cannot run, to pass over a step the site already did
(`../automation-studio.md`, "A step that cannot run continues where the page
is").

**The instructed acts are the model's checklist from the first decision**
(audit A1, cause 1). The draft entry carries `acts`: each lasting act the
instruction asks for, in the person's words, with `done` naming the step of the
Flow that does it or `todo` saying why none does yet. It is computed each
decision by the same rule the completion check applies
(`runtime/flow-bootstrap/instructed-acts/checklist.ts`, `check.ts`
`automationStudioInstructedActStepFault`), is carried whole and never trimmed,
and is shown even before any step has run. A step added with `act` is the
model's claim for that act, so a completion need not name it again; a claim in
the result names a step by the number the draft shows. The standing decision
instruction says a Flow is ready only when every act on the checklist is done.
Each act includes its requested choices (quantity, size, colour or version),
with their own `done` step or `todo` reason. A claim such as `act: "a2.quantity"`
adds the step toward that choice; completing the parent act alone does not
complete its choices.

**Progress means the Flow advanced** (audit A1, cause 2). A call that applied
an effect is no longer progress by itself: one that leaves a state the build
has already been in (its post-call digest, for the life of the loop, across
tools) is a step without progress, and so is a completion refused for the same
issues over the same proposed steps, even after calls between. What clears the
guard, besides new evidence, is the authored draft advancing: a step entering
the Flow for the first time, or fewer acts undone than ever before
(`runtime/llm/evidence-progress/authored-progress.ts`); a step toggled out and back
in is not new. A redirect names the acts still undone (`actsMissing`) and the
step to take next.

**A continued build carries no start location on its calls.** Its draft
already reached the start in the build it continues, so Core does not tell the
domain to hold it there: exploration carries on from the page as it stands
(`runtime/service.ts`, the harness registry built for a continuation).

**A round that stops short is not a silent build ending (t208).** The
coordinator in `runtime/flow-bootstrap/unfinished-build/phases.ts` tests a
partial non-empty Flow from its start with the same deterministic gate, judges
it against the checklist, and seeds a live repair with that Flow and judgement.
An empty Flow has nothing to test and explores again from the live page while
budget remains.

**Repairs are bounded by money and progress, not by a count (t240).** Another
round opens only when both hold:

- **The purse can fund it.** It must hold one more decision plus the judging of
  its Flow, each at its capped hold (2,000 reply tokens for either): what the
  purse last priced a decision at and a judge call at
  (`AutomationStudioLlmBuildPurse.lastProjectedCostUsd`). A judge not yet priced
  is held at the decision's price, which is at least its own: its request carries
  the test's account, not the page. A build that cannot fund the round ends
  `budget_exhausted` (`cost`), saying what was left and what the round could have
  cost (run 38, cause C7). A provider that does not price leaves nothing to
  project, and only an empty purse stops the round.
- **The round before it measurably progressed** (`unfinished-build/progress.ts`),
  by what the test and the judge report. That means more acts or choices with a
  step, or more of them proven by the test; a test that now runs clean, or fails
  at fewer steps; with no judge, more steps that worked; a round that finished
  and was judged where the one before stopped short; a Flow judged where the
  one before was not judged either way (`judged_after_unjudged`: the judge was
  unsure, did not run, said yes about another version of the Flow or about no
  test, or carried steps never ran); or a judge finding no longer reported. It also counts what the judged test
  stored: the build-test judge returns its summary's stored, refused and
  missing-required row counts on a `no`. Progress there means rows stored where
  none were, or fewer refused or incomplete rows while no fewer are stored. A
  merely different Flow is not
  progress: the earbuds build `run-muqiho7e-13be6c03` handed back three
  different Flows, and the judge reported the same thing each time.

A round that did not progress ends the build `not_doable`, saying what stood
still. So does a round that ended on refused repeats
(`repeat_without_progress`) and handed back the Flow it started from: a second
round would only repeat it (run 38, cause C8). For an extend build's first
round, `runtime/service.ts` passes the replay signature of the Flow that
round starts from as `seedSignature`: the extended Flow's seed, or the kept
draft a continuation carries on. Six live rounds stay the backstop, since the published
record's reader is bounded by it. Every round draws on the Flow creation's one purse and
shares the build's time/token budget and declared call count; no round has a
cost share of its own, and the per-round decision backstop starts afresh.
A permission or person-needed question takes precedence over another round.
A build that ends without a Flow records why each round stopped and, for "not
doable", which case left no route, as closed words on its ending's `tried`
(`stops: [{round, stopped}]`, `noRoute: {kind}`, `unfinished-build/tried.ts`);
a re-author attempt keeps that ending (`service/runtime-adaptation/reauthor-build.ts`),
so a debug can tell which bound ended which round. A rerun of a draft step says
where it ran (`rerunPlace`: put back to its start page, or in place and why,
`runtime/llm/node-tools/step-place.ts`).

A re-author's rerun starts where its node started. A re-author seeds its draft
from the Flow, and a step carried from the Flow records no `replay.from`, because
the build never ran it, so its rerun used to run wherever the refuted run had
left the target: in live run `run-murwcmx2-a1c6edf7` the rerun of the Flow's list
read ran on results page 5 and read 11 records from 1 page (t194 cause C-D). The
host may state, on each state snapshot, its own reset token for that state
(`AutomationStudioHostStateSnapshotRef.from`, the same token as a step's
`replay.from`; the web writes `{ location }` only when the address holds nothing
the evidence packet withholds). The re-author build reads each node's first
`before_action` token off the refuted run (`llm/node-tools/run-start-pages.ts`,
called in `service/runtime-adaptation/reauthor-build.ts`); the extend seed keeps
them beside its steps as `startedOnByStepId`, not in `replay.from`, so the
dry-run gate sees the same draft; the loop receives them as `draft.seedStartedOn`.
A rerun of a carried step, or of the step that took its place (`standsFor`), with
no start page of its own is put back there through the ordinary reset before it
runs, and says `rerunPlace: { place: "put_back", startPage: "seeded_run" }`;
with no start page known it runs in place and says `start_page_unknown`.

A repair may not complete the Flow its judge refuted, unchanged (t194 cause
C-C). When a finished round's test is judged `no`, the repair round starts from
that Flow, and its completion check first asks whether the Flow being completed
is that same Flow: the draft's Flow signature
(`automationStudioFlowDraftFlowSignature`) equal to the repair seed's, where the
draft is what the check builds the Flow from (every step a library
`core.run_node` step). Such a completion is the identical retry of a failed act
on an unchanged state, so it is refused with
`bootstrap.flow_unchanged_since_judged_wrong`, with feedback that testing it
again tests the same thing, to change what the judge's advice names, and that a
round that changes nothing ends the build as not doable
(`runtime/flow-bootstrap/unfinished-build/unchanged-complete.ts`). It never fires
after an `unknown` or `not_judged` verdict, which refuted nothing, nor for a Flow
built from the reply's own plan. Each refusal is an unusable decision: a model
that keeps completing the unchanged Flow ends its round on the stall guard as
`unusable_decisions`, and the build then ends `not_doable` for no progress
against the judged round, without asking the judge again. In live run
`run-murwcmx2` the unchanged Flow was tested again and one lone judge yes
finished a build its earlier judges had refuted. A repair of a round whose Flow
was not run from its start (`judgement.test: not_tested`) is told exactly that,
and the chat's "Testing the Flow so far" note is posted only when that test will
actually run (causes C-F, UI-4).

A round that could not be measured is never "not doable" (t194-w70). A
re-author or extend build seeds its draft from a stored Flow. Each step it
carries (`f<n>`) has nothing it ran with and nothing to put the target back with
until it is rerun live, and Core never runs such a step itself, because the
permission gate reads its missing consequence declaration as "none". A round
whose Flow still holds one is therefore not tested at its end; its judgement
names those steps (`notRunInThisBuild`), and neither `repeated_unchanged` nor
`no_progress` is concluded from it, since there is no measurement to compare.
Live run `run-murwcmx2`'s re-author ended not doable with the advised fix in its
draft, never run from the Flow's start. Such a round is repaired again under the
same money and round bounds; its progress is fewer steps not run, or a changed
Flow, and the announcement says which. The repair's resume names the steps and
tells the model to rerun each live, in the Flow's order (`amend_draft rerun`),
before completing, and the re-author's brief says the same up front (its step 5
no longer says to keep steps as they are without running them). If money or the
round limit runs out first, the budget ending says the Flow as it stands was
never run whole and names those steps.

A build's yes is asked twice (t194-w71). The build-test judge's `yes` finishes
a build, so its verification request sets `confirmAnswer`, and a first `yes` gets
a second call with the same evidence (`result-verification/agreement.ts`). Two
`yes` answers are a yes. A `yes` followed by a `no` is `model_disagreed`: unsure,
carrying the `no` call's expected, observed and advice as `unconfirmedReading`,
which the build reads as `unknown` and repairs with. A second call that answers
`unknown`, gives no verdict, does not come back, or is refused by the build's
purse leaves the first `yes` standing, because on correct results a `yes` was
measured to flip to `unknown` and never to `no`. In live run `run-murwcmx2`,
build judges 0032 and 0051 were sent the same request except for one step
number; they answered `no` and then `yes`, and that single `yes` finished the
build on rows the playback judge refused. The runtime result check does not set
the option, and a first `yes` there still stands on one call.

The three explicit endings carry `diagnostic.ending.message`, the outstanding
acts/choices and `tried` (rounds, decisions, Flow steps and test verdict).
`runtime/activity/build.ts` and conversation progress use that message:

| Code | Trigger | Message begins |
| --- | --- | --- |
| `flow_bootstrap.not_doable` | A round of a tested, non-empty Flow made no measurable progress on the previous judgement, or ended on refused repeats with the Flow it started from unchanged | "I could not build this Flow, and I found no way to:" followed by what could not be done, the test and what was tried |
| `flow_bootstrap.evidence_budget_exhausted` | The purse refused a call or could not fund another round (the only cost endings), time, token or declared calls ran out, or the live-round backstop was reached | "The build stopped at ... before the Flow was finished." followed by progress, what blocked it and whether the Flow was kept |
| `flow_bootstrap.model_replies_unreadable` | Six consecutive unreadable replies, each asked again with a corrective note | "The build stopped because the model's replies could not be read:" followed by the count, cause, paid attempts, progress and kept-Flow status |

Budget exhaustion does not establish that the task is impossible, and an empty
Flow never establishes `not_doable`. Budget and unreadable endings are
retryable; a kept incomplete draft lets the next build continue.

Once drafting has begun and at least one actionable step exists, a provider
decision also receives the Flow-draft beside entry, always whole: every
actionable step in object form, each with the full argument it ran with, and the
full guidance. There is no draft byte budget, no packed row form, no shortened
guidance, no argument withheld or replaced by an `inputTooLarge` marker and no
oldest step counted instead of listed (removed 2026-09-30, with the 4,000-byte
draft cap, the 1,280-byte draft floor and the 512-byte step-input bound). The
trace row's `draft` measurement records its bytes, steps and guidance bytes, and
`budget` equals `bytes`.

From the model's first decision, every provider decision also receives the
decision history beside entry, `core.evidence_history`
(`runtime/llm/decision-context/`). It is one row per decision the loop answered,
oldest first: the initial look; each executed call with its closed result code,
whether it changed anything and whether the tool refused it; each failed call;
each request answered from memory with the call that answered it; each
amendment with its refusals (marked when repeated), the positions of withdrawn
steps that had applied an effect, the iteration an undo returned the draft to
and the step it reran; each completion with the draft revision it was checked
against, its issue codes, the closed codes of the check's feedback and the
steps the dry run refused (or `clean`, `reused_clean` when the gate answered
from an earlier clean replay of the same Flow, by its Flow signature, or
`not_run`); each unusable
reply; and,
beside the rows, each no-progress redirect. Rows hold only closed codes, ids
and integers, never page content or model prose. Identical decisions are
grouped with their iterations and carry `sameAs`, the first iteration the same
decision was made. The entry is always told in full, every row with its full
closed detail; the compression ladder (codes only, folded calls, joined
refusals, least form) and its byte cap were removed on 2026-09-30. The beside
entries follow every evidence entry: `[...evidence, history, draft, budget]`.

These diagnostics retain only bounded provider accounting, the content-free
evidence trace, and, where a plan was refused, at most 16 `issueCodes`. The
trace holds tool IDs, byte counts, effect state, and categorical result codes.
Every build ending retains the trace from every live round, including a
cancelled build, a refused configuration, and cancellation during judgement.
Decisions are numbered across the build; each round's opening observation
keeps iteration zero. Diagnostics use whole-build accounting beside these
rows, including permission and person-needed endings after earlier rounds.
The final round's loop result remains local to that round; its caller uses
the build's accumulated trace when publishing a failure or storing a Flow.

A tool execution may carry an optional `diagnostic` object beside its evidence.
Core copies that object through the execution parser, decision row, persisted
trace and public evidence steps without interpreting the importing domain's
vocabulary. Its transport accepts only a shallow object of code-shaped strings,
booleans, nonnegative integer counts and scalar lists; malformed diagnostics are
dropped while the actual tool outcome remains intact. Shape validation does not
certify that a string is safe: the producer and consuming domain must enforce
their own field and value allowlists before recording domain facts. Older
callers and stored steps that omit the field remain valid. A producer must use
the matching Core build that accepts this optional execution key.

A trace row also carries bounded, content-free convergence facts: the measured
draft shape shown to the decision; build-local draft revisions and stable step
ids; applied/refused/kept amendment counts; page-state changed/unchanged/
unobserved state derived from paired digests; and answerability booleans plus
the closed cannot-answer code. The record never carries the digests themselves,
step inputs, prompt/provider text, page values, selectors, instruction quotes,
or content-derived hashes. These members are observational and do not change
budgets, completion acceptance, amendment behavior, or retry policy.
Draft-shape measurement accepts either the legacy object steps or the exact
`step_rows_v1` format and ten-column declaration. Packed rows must contain seven
through ten cells; a `null` input cell is measured as withheld. An unknown
format, a missing or reordered field declaration, or a malformed row fails
closed instead of being reported as zero omissions. The trace retains only the
existing counts, booleans, and serialized-byte measurement; it does not retain
the draft entry or its step inputs.
A decision that called no tool appears in it as `core.decision_unusable` or
`core.decision_complete`, with the first code that refused it as its result
code, so a build stopped on refused plans says what refused each one. The
diagnostics never include the completion, validation paths, tool inputs, or
page evidence.

Success persists exactly one proposed, reviewable Bootstrap Adaptation bound to
the base dependency digest and settings revision. It does not create or mutate a
Router, Subflow, graph Flow, node, or edge. The return value contains only
project/Flow/adaptation identifiers, proposed status, Core risk, source
instruction IDs, base binding, and sanitized request/token/cost accounting. It
does not return the plan, prompt, instruction bodies, provider credential/key
identity, or secret material. Explicit review and apply are
still required to materialize topology.

Successful DeepSeek usage accounting includes a conservative finite
`estimatedCostUsd`. As read from DeepSeek's own price list on 2026-09-23
(`https://api-docs.deepseek.com/quick_start/pricing/`), the default model
`deepseek-flash` is served by DeepSeek-V4.1-Flash at a peak cache-miss rate of
USD 0.3 per million input tokens, a peak cache-hit rate of USD 0.006, and USD
1.2 per million output tokens; `deepseek-v4-pro` costs USD 1.32, 0.044 and 3.96
on the same three axes. Core prices per model and does not assume the off-peak
discount, which halves every rate outside 01:00-04:00 and 06:00-10:00 UTC on
weekdays: the run budget reserves before a call is made, so an off-peak run is billed
less than Core estimated and never more. These provider-owned prices are a dated
maintenance input and must be reviewed when DeepSeek changes its line-up or
pricing.

A cache hit costs a **fiftieth** of a miss, not a tenth. Until 2026-09-23 this
document and the constants behind it said 0.44, 0.044 and 1.32 -- figures that
matched no model on the current price list, with the hit rate derived from an
unsourced "a tenth of a miss". Anything that lengthens the cached prefix of a
payload is worth five times what those numbers credited it with.

The cache-hit rate is applied only to the tokens DeepSeek reports it served from
its own context cache, which the adapter reads from `prompt_cache_hit_tokens`
and `prompt_cache_miss_tokens` (or `prompt_tokens_details.cached_tokens`) into
`cacheHitInputTokens` and `cacheMissInputTokens` on the usage summary. A report
whose two halves do not add up to the input tokens is dropped and the call is
priced as though none of it was cached. **Reservations never see the hit rate.**
The run budget reserves against `estimateAutomationStudioDeepSeekInputTokens`,
which measures the bytes about to be sent and knows nothing about caching, so it
still holds back the cache-miss price for every call; the hit rate prices only a
call that has already been made.

Because every decision of an evidence loop is a fresh, stateless request, the
whole of that cache turns on the order of the user message, and
`providerUserPayload` arranges it deliberately: the task envelope, the decision
grammar, the person's instruction, the tool descriptions, the policy gates and
the catalog context (the node names, their note and `describedNodes`) first,
then the evidence window, and the iteration counter last. Everything invariant
is therefore one contiguous prefix, and the window -- which usually only gains
an entry between calls -- extends it. `describedNodes` is the one part of that
head that grows: it is append-only for the length of a build, so a describe
keeps the cached prefix through every node described before it. The order used to
put the counter before the tool descriptions and the catalog, which left 20,341
identical bytes of a 50,840-byte message behind a value that changed on every
call. A key added here must go on the correct side of that line: anything that
varies per call belongs after the evidence.

### One purse per Flow creation

One purse per Flow creation is the only cost authority for a build
(`runtime/llm/build-purse/purse.ts`, `run.ts`). A Flow creation runs from its
first build until a Flow is proposed or a build ends not doable. Every build of
it -- continuations after a budget ending included, with each one's rounds,
test, judge and repairs -- draws from one ceiling:
`FLUXIQ_LLM_RUN_COST_CEILING_USD`, $0.10 by default, which the Flow's
`maxEstimatedCostUsdPerRun` may lower and nothing may raise. The whole build
body runs inside `automationStudioLlmBuildPurseScope`, so reading the
instruction, every decision, the test and the judge are all held against it.

- **The spend outlives a build.** It is kept on a per-Flow creation record
  (`runtime/flow-bootstrap/creation-spend/`, stored as `creation-spend.json`
  beside the Flow by `runtime/service/creation-spend.ts`), carried into the
  next build's purse as `carriedUsd`, and cleared when the creation ends. A
  refuted-result repair during a later scheduled run keeps its own run ceiling
  and never touches the record.
- **Holds are true worst cases.** Each call is held at all of its input
  uncached at peak rates -- input measured at 3 UTF-8 bytes per token plus 16
  framing tokens, which overstated every recorded call -- plus its reply
  allowance. Build decisions send and hold `max_tokens` 2,000
  (`AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS`,
  `runtime/llm/harness/token-limits.ts`), at least three times the largest of
  6,119 recorded decision replies (593 tokens; p99 469). Other calls keep the
  8,000 default; a runtime patch step can reach about 2,700 tokens.
- **The loop budget does not end a build on cost.** Its count of decisions
  left (`runtime/llm/loop-budget.ts`) reads the purse's figures with no
  held-back decision; it only tells the model what is left and drives the
  wrap-up. The purse refusing a call is the only cost ending, and that ending
  states what was spent (earlier builds of the Flow included), what was held,
  the refused call's worst case, and what the Flow has left.
- **The judge has no cap of its own.** Each judge call is held at its true
  worst case rather than at a share of what is left, and a judge call the
  purse refuses gives a `not_judged` verdict, which finishes nothing: the
  round goes to repair, and a purse that cannot fund that repair ends the build
  at its budget with the Flow kept.

## Generation readiness capability

The authenticated, read-only `get-flow-bootstrap-generation-readiness` endpoint
is requested with HTTP `GET` (and no request payload) and returns the exact
`automation-studio.flow-bootstrap-generation-readiness.v1`
capability document before any build authorization or provider work. The
handler reads only a pure runtime-wiring snapshot: whether a provider resolver
is configured and whether a nonempty native node registry is bound. It does not
read secret-key metadata, create a reveal authorization, invoke the provider
resolver or LLM harness, or perform persistence or revision mutation.
`supported` is true only when the runtime-wiring checks pass. Registry readiness requires the canonical Start and End controls plus at least one non-control executable native domain definition; an empty or control-only registry fails closed.

The capability document pins the generation and review endpoint identities,
the `flow_bootstrap` task and output, canonical execution-binding fields,
native node-registry-context requirement, and the complete structured-failure
diagnostic version, stages, provider call states, and accounting field
allowlist. Clients must compare the whole bounded document and fail closed on a
missing, older, newer, malformed, or unequal response. The same pure readiness
predicate runs for generation before any key-summary or reveal-authorization
work. Readiness is a build compatibility assertion, not authorization;
generation still performs its blank-Flow, registry, and post-provider
base-binding checks.

## Blank-Flow authoring UI

### Evidence-guided generation

Domains may bind a provider-neutral evidence runtime with
`bindLlmEvidenceRuntime({ tools, executeTool })`. Core exposes only bounded tool
IDs, descriptions, and JSON input schemas to the model. The domain owns tool
execution and sanitization; Core contains no browser, DOM, URL, selector, or
other domain-specific execution behavior.

The authenticated authoring sequence first saves the user's bounded text with
`save-flow-generation-instruction`. Core upserts one active, required,
Flow-scoped generation instruction before generation, so the build reads its
exact revision. The normal
`generate-flow-bootstrap-adaptation` request then opts in with
`evidenceGuided: true`; it does not carry another instruction body.

Evidence-guided generation uses the caller's provider for a bounded series
of `evidence_tool_decision` tasks. Every task carries the current filtered node
catalog by name with the definitions the build has described, strict dynamic
decision schema, allowlisted tools, and prior sanitized evidence. A decision either requests one registered tool or completes with a
`{ summary, plan }` candidate whose plan schema is the existing strict Flow
Bootstrap schema. Unknown tools, duplicate calls, cancellation, iteration
exhaustion, and evidence-byte overflow fail closed. An unusable reply and a
refused completion are asked again, up to three in a row, as described above.
The series has no fixed length of its own. It makes at most 64 decisions, or
fewer when the resolution declares a call count, with at most one more tool
call than decisions. No decision has a cost share: each is held against the
Flow creation's one purse at its own worst case, and the loop's budget holds
the build's token totals on every call. The cost ceiling is
`FLUXIQ_LLM_RUN_COST_CEILING_USD` ($0.10 by default), which the Flow setting
`adaptationPolicySettings.maxEstimatedCostUsdPerRun` may lower and nothing may
raise ([One purse per Flow creation](#one-purse-per-flow-creation)). The
ordinary proposed Bootstrap Adaptation is written only from a completion the
completion check accepted.

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

The coordinator shows the model every evidence entry it holds, whole and in
call order, on every decision; it ranks nothing and chooses nothing. It still
accounts cumulative byte and call totals, but no byte total ends a loop: the
24,000-byte evidence-context window (`maxEvidenceContextBytes`,
`AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES`), the 1,048,576-byte cumulative
evidence backstop (`maxEvidenceBytes`, which ended a loop
`llm_evidence_loop.evidence_limit`), the per-call evidence allowance handed to a
tool (`maxEvidenceBytes` on `executeTool`) and the evidence-entry count in the
DeepSeek pre-flight were all removed on 2026-09-30. Neither the loop's check of
a tool result nor the adapter's pre-flight holds evidence to an array, entry,
string or key length; both keep cycle detection and a recursion guard of depth
64. The only size bound on a request is the model's context window, enforced
loudly before sending with the request's measured size. A Core note is still
superseded by a newer one of its kind; a tool's result never leaves. A request
answered from memory names the entry that answers it, which stays where it
happened.

Each decision is shown the current view of the target whole, and no view the
target has left (B1, 2026-10-01; `runtime/llm/context-window.ts`). A domain
declares which top-level keys of its results are its view of the target, as
`observedStateKeys` on its evidence-runtime binding, beside
`deniedEvidenceKeys`; the registry's loop binding carries the declaration to
the build and the repair's exploration alike, and never onto a tool. In every
result but the newest carrying a view, exactly those keys are replaced by
`supersededBy`, the callId of the next result that carried a view, and the
rest of the result -- what the step did, what it read, what changed, why it
was refused -- stays whole, in its place. A reference names its direct
successor, never the newest, so once written it never changes and each request
is a byte prefix of the next through every entry before its current view. The
decision instruction tells the model once what the reference means. A domain
that declares nothing is shown every result whole, as before. Live run
`run-mup2i28c-6c7fc209` is why: three whole pages of one store in its fifth
decision, 214,853 input tokens, on course to pass a 1M-token window near the
twenty-second call of a thirty-step build.

**A call already tried on this page is not made again** (2026-10-01;
`runtime/llm/repeat-guard/`, `decision-handlers/refused-repeat.ts`). The loop
records every call by its tool, its whole input as canonical JSON, and the
page it found: the domain's `stateDigests.before`, or else the last state seen.
A call whose key matches an earlier call that failed (a refusal, or an action
with no effect) or changed nothing (the page after it the same as before) is
refused before it runs, with nothing spent but the decision. It is recorded as
`llm_evidence_loop.repeat_refused`, and the model is shown a `core.repeat_check`
note saying when it was tried, what came of it, and what to do instead. A rerun
amendment is checked against the same record and refused as `changes_nothing`.
Three such decisions in a row stall the round, which the build then tests,
judges and repairs, or ends as not doable with its reason.

The guard is checked before the repeat policy, so every action repeat is
refused in one place. It never refuses:
- a look, which the repeat policy still answers from memory;
- anything after the page changed;
- an outcome whose code says to try again later (a rate limit, a disabled
  control, a page still loading);
- a call that threw.

A dry run moves the page without the loop seeing it, so the last state is
forgotten until a call reports one. The domain's `answered_the_same_again`
mark and `repeatedAnswer` stay as what they were, a marking, and the
no-progress guard stays the far backstop. Live runs `run-muq310ht-ab80eed0`
(a close button pressed 20 times, one list read rerun 8 times) and
`run-muq3ubys-4b4dbf5b` are why.

A build has three phases (user, 2026-09-30): live exploration and draft
authoring, testing and judgement, then live repair. In exploration
the model writes its draft, and nothing replays the draft
from its first step: not a completion the check refuses, and not a continued
build, which carries on from wherever the page stands
(`runtime/llm/evidence-loop/completion-attempt.ts`,
`runtime/llm/evidence-loop/resume.ts`). The judgement phase starts when the
model says the Flow is ready and the completion check accepts it: the draft is
then dry-run, which is the one full run from where the Flow starts, and a
refused test sends the model back to live repair from where the test stopped,
to be tested again the next time it says the Flow is ready
(`runtime/flow-draft/dry-run.ts`, `runtime/llm/node-tools/dry-run-gate.ts`):
the target is reset to where the first proposed step started and every
proposed step is run again in order with the argument the Flow will use, with
no model attached. Each step answers `replayed`, `failed`, `changed` or
`unreproducible` (its target was not there on the replay, which the domain
cannot tell apart from a site that remembers an earlier answer). Every answer
but `replayed` refuses the completion, on every attempt: finishing again with
the step unchanged is refused again. The only exemptions are a step the Flow
would not always run (marked `optional`, made `only_if` on a check, the check
guarding such a step, or a step another falls back to) and a step no longer
proposed (dropped, exploratory or failed), which is not replayed. A step
reported before is marked `again: true` on the next refusal, which changes no
verdict. Until 2026-09-30 an `unreproducible` step stopped blocking once it had
been reported, and live runs 18, 21 and 33 were accepted or passed a dry run
that way with a step that did not replay. Clean and refused verdicts are
remembered by the draft's Flow signature
(`runtime/flow-draft/flow-signature.ts`: per proposed step, in order, its
action, the argument it runs with, its settings, its routing, whether it
answers an interruption, and its acts), so a completion over the same unchanged
Flow is not replayed again; its history row says `reused_clean`. A refused Flow
completed again unchanged is replayed at most twice; after that it is refused
again from what those replays found, never passed from them. Routing and
settings are in the signature because an edit to either is an edit to the Flow:
a step marked optional or `only_if` since the refusal is a changed Flow, and
the changed Flow is run (user, 2026-10-02). A refused replay that itself proved
a step only sometimes there and made it optional passes on the Flow signature
taken after that change, because that replay is a run of that Flow. The
replay signature (`automationStudioFlowDraftReplaySignature`, routing left out)
remains only for progress and no-progress: whether the model is re-sending the
same steps, and the `seedSignature` an extend build's first round starts from.

A dry run never clears site data or logs the person out, never repeats a
lasting effect, and checks a changing step rather than running it again
(decision D1, `runtime/flow-draft/verify-only.ts`). The reset is a navigation
and nothing more. A proposed step that changes something and declares any
consequence but none is sent `replay: "verify"` with where it found the target
(`replay.from`) instead of `replay: "step"`, and the host acts on nothing. It
answers `core.replay.verified` (the target is there and would take the action),
`core.replay.present` (the target is gone from the very page the step acted on:
its effect is already in place, as when a store already chosen shows "Your
store" instead of its button), or `unreproducible` (gone, and the page is not
the one the step acted on: the steps before it no longer reach it), `failed`
otherwise. `verified` and `present` pass, and only for a check; a step asked to
run that answers either has failed. The model sees the words `verified` and
`present`, never `replayed`, for a checked step. A step after a verified step
that does not replay is excused (`afterWithheld`) only when the verified step's
own run moved the target, which Core reads by comparing the two steps'
`replay.from` values whole: the withheld effect then left the steps after it on
the page before the move. A verified step that did not move the target excuses
nothing, because the site still holds the effect from exploring. Steps that
declare none (an open, a filter, a navigation) are run again as before, since
the steps after them stand on them. The build trace prints a dry run's own call
ids (`dryrun.<attempt>.<step|reset>`), so a completion that replayed can be told
from one that reused a verdict.

#### Running part of the Flow

The user's rule (2026-10-02): the build and repair loops can run the Flow from
a chosen step to test part of it, but the Flow must also run whole and be
judged a success at least once. The first half is `core.run_flow`
(`runtime/llm/node-tools/run-flow.ts`, `run-flow-part.ts`). Its input is
`{from, to?}`, step numbers as the draft shows them; it runs the proposed steps
from `from` to `to` (the last proposed step when `to` is absent), in order, **on
the target as it stands**: nothing is reset first, which is the point -- a
repaired step and the ones after it are tried without running everything
before them. Each step is sent with the very call the dry run would send
(`replay: "step"`, or `replay: "verify"` for a step that declares a lasting
consequence, D1) through the loop's own executor, so the permission gate sees
it as it sees every call. Unlike the dry run there is no second try on a step's
own page.

A step the Flow does not always run that does not pass is reported and the run
goes on, as the Flow would; any other step that does not pass stops the run
there and leaves the target where it broke. A step with nothing to run it with
-- one carried from an earlier Flow that never ran in this build -- stops it as
`not_run_in_this_build`: it declares no consequence, and running it would pass
a permission gate that reads an absent declaration as "no consequence". The
answer is `core.run_flow.ran` or `core.run_flow.stopped`, with each step's word
(`replayed`, `verified`, `present`, `failed`, ...), `stoppedAt`, and the
evidence of the last step that answered; a bad range is refused
`run_flow.input_invalid`, `run_flow.nothing_in_flow` or
`run_flow.not_a_flow_step`. It costs one decision and counts as one tool call;
the steps it sends make no provider call and are not counted, as the dry run's
are not. The chat shows "Running part of the Flow" (or "the rest of the Flow",
"one step of the Flow", "the Flow from its start": never a step number, which
the person never sees) and each step as "Trying part of the Flow: ..." in the
`verifying` phase
(`runtime/activity/wording/core-tool.ts`, `tool-call.ts`).

**It is never the Flow's test.** It records no draft step, writes no
`step.replayed`, and leaves the dry-run gate's verdicts alone; its answer tells
the model so. **Where it is offered:** the evidence loop adds it after the
caller's tools only where the loop drafts and its dry run is on, only while the
draft holds a proposed step that can run again (one with `ranWith` and
`replay`), only where the caller's own tools can act (a tool with
`effect: "mutate"` or a per-call effect), never in place of a caller tool with
the same id, and never past the 32-tool limit. That is the build, each of its
repair rounds, and a re-author (an extend build). The recovery ladder's
exploration has no draft and nothing that acts, so it is not offered there.

#### A whole run judged success, on the Flow as it stands

The second half of the rule: a build finishes only after a run of the whole
Flow from its start was judged to do what was asked, on the Flow as it finally
stands; any edit after that run needs another. Three pieces hold it:

- **A test says which Flow it ran.** The report the dry-run gate hands
  `observeTest` carries the Flow signature of the draft it ran, and the build's
  judge (`runtime/service/flow-bootstrap-commands/build-judge.ts`) stamps that
  signature on its verdict as `flowSignature` -- this round's observed test,
  never an earlier round's, and none when no test was observed.
- **Only a yes about this Flow finishes.** The phases coordinator
  (`runtime/flow-bootstrap/unfinished-build/phases.ts`) ends a round finished
  only on a `yes` whose `flowSignature` equals the Flow signature of the steps
  the loop accepted. `no`, `unknown`, `not_judged`, and a `yes` about another
  version of the Flow or about no test (treated as `not_judged` in Core's
  words) are a round `judged_wrong`, repaired live with the judge's account
  under the same funding, progress and round bounds. There is no "finished
  unverified" outcome and no "Flow not verified" note. A phases caller given no
  judge still finishes unjudged; the service always passes one for an
  evidence-guided build. The one-shot build runs no test and no judge and
  produces a proposal for review.
- **A Flow the test cannot run whole is refused, not passed untested.** A
  completion is refused `llm_evidence_loop.full_run_required`
  (`runtime/flow-draft/full-run-required.ts`, `dry-run-gate.ts`), naming each
  step with its word, before any replay and before a judge is paid:
  `not_run_in_this_build` (carried from an earlier Flow, always refused);
  and, where the loop sets `fullRunRequired` (the build's every round,
  `runtime/llm/loop-configuration.ts`, set by `runtime/service.ts`),
  `cannot_run_again` (its run left nothing to run it again with, or the first
  step has nothing to put the target back where the Flow starts), a Flow none
  of whose steps ran in this build (refused naming no step), and
  `not_a_library_step` where the loop offers `core.run_node` (a step taken
  through another tool would send the Flow to the plan the reply wrote out,
  which never ran). The way through is to rerun each step in the Flow's order
  (`amend_draft` rerun, declaring its consequences) or run its library node in
  its place. A loop that authors no Flow -- the recovery ladder's exploration --
  does not set `fullRunRequired` and still passes what it cannot run.

**Re-authored and extended Flows.** A re-author or an improve is an extend
build seeded from the stored Flow (`runtime/llm/node-tools/draft-from-flow.ts`):
its carried steps `f<n>` have no `ranWith`, no `replay` and no consequence
declaration, so each must be rerun live before the Flow can be tested whole.
The rerun is a new step; it records `standsFor`, the id of the step whose place
it took (`runtime/flow-draft/step.ts`,
`runtime/llm/evidence-loop/rerun-replacement.ts`), so the written Flow keeps
that node's id. The re-seed carries a node's `metadata.routeSignatures` onto
its step as `routeSignatures`, and a rerun that recorded none of its own takes
them, so a re-authored Flow keeps state routing for a node whose fresh
signatures could not be taken. Because the re-author's build finishes only on a
judged success, its approve and apply (`runtime/recovery/refuted-result/reauthor.ts`)
happen only after the re-authored Flow, carried steps included, ran whole and
was judged. Until 2026-10-02 carried steps were never run, the judge answered
`unknown`, and the Flow was applied unverified.

Core's own notes are superseded rather than accumulated. Before a
`core.request_check`, `core.no_progress`, `core.decision_check`,
`core.amendment_check` or `core.completion_check` note is added, earlier notes
of that tool id leave the evidence. Each completion attempt removes the earlier
`core.completion_check`, `core.dry_run` and `core.dry_run.page` entries before
the check and the gate run, and whichever still refuses shows a fresh one, so a
check that now passes leaves no stale refusal beside a dry run that still
refuses. A tool call that runs removes the `core.request_check` and
`core.decision_check` notes, whose moment the build has left, and a call that
makes progress removes the `core.no_progress` redirect. Tool results never leave
this way. Each removed note's trace is its row in the decision history.

A request answered from memory says what it repeats. Its `core.request_check`
note carries `timesAsked` and `askedAt` (every iteration the same request was
made over the same state, the executed one included: the history keys a call on
its repeat-policy request signature, which carries the epoch it was asked in),
`answeredAt`, and `lastActionBefore`, the
newest action that ran before it. Its instruction says that no action has run
since it was answered (for a tool that acts and is keyed on what has changed,
that no action has changed anything), and from the second ask that this is the
Nth time and it will be answered the same way until an action runs. An answer
from memory takes no capture of any kind. The first time one request is asked
again in the same epoch, and the call that answered it recorded the state it
left, the request is run once more for real -- for a look that is the look's own
single capture -- and the two after-digests are compared: equal is a verified
repeat (a step without progress; the fresh result replaces the answering entry,
and its note, `llm_evidence_loop.looked_again_unchanged`, says Core looked again
and the page is exactly as before), different is a page that moved by itself
and counts as an ordinary look. Every later ask of that request in that epoch is
answered from memory. The second time
one request is answered from the same result, the no-progress redirect is given
at once, below `redirectAt`. A completion refused for the same issue codes over
the same draft revision as an earlier one -- whatever its summary said, since
that is prose the model rewords -- is still checked and replayed; its
`core.completion_check` feedback gains `sameAsIteration` and `timesSent` unless
the check already wrote those keys.

An ignored redirect withdraws looking. When a no-progress redirect was shown and
the next decision again asks for what the loop holds (answered from memory, or a
verified repeat), looks are withdrawn from the following decision until an action
runs and the attempt epoch moves: an observe-only tool is not offered, and a tool
that runs many actions and names the input that picks one (`actionInputKey`,
`node` on `core.run_node`) is offered with that input's enum narrowed to exclude
the actions this build saw report `effect: "observe"` and `proposes: false`. The
key itself is never sent to a provider. A withdrawn look asked for anyway is
refused as the unusable decision `llm_evidence_loop.look_withdrawn` -- never
answered from memory, never run -- and counts toward the no-progress stop. The
decision history lists the withdrawal among its redirects. Only loops that can
refuse a decision (`unusableDecisions`) withdraw looks.

The state digests a build records come from the calls themselves. A binding that
sets `stateDigestsOnCalls` reports on every execution result the digests of the
state the call found and left (`stateDigests`), taken from the captures the call
already made: a look's one capture is both, an action's read before acting and
its read after. The build then passes the loop no `captureStateDigest` hook at
all (`runtime/service/flow-bootstrap-commands/state-digest.ts`), so no step costs
an extra capture on either side. A binding that does not set it keeps the hook,
asked before and after each call as before.
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

**A build told where its Flow starts opens by going there (F31).** A tool whose
calls declare their own effect (`perCallEffect`, the run-node tool) may carry
`initialObservation: { input, arrival }`, where `arrival` is an input of the
same tool that takes the target to the start location. A binding declares it as
`runsNodes.arrival: { node, parameter }` — the node that goes somewhere and the
parameter the location is written into — and the registry puts the build's
`startLocation` there, without reading it, when the build has one and the node
is offered (`runtime/llm/harness-options/binding.ts`,
`runtime/llm/node-tools/run-node.ts`). The loop then runs the arrival instead of
the look, under the same `initial.<toolId>` call id the domain keys its
per-build memory on, before the first provider decision, and records it exactly
as a model's call added to the Flow at iteration 0 would be: a kept step when it
worked, with the epochs, repeat record, history row and trace row a call has; a
failed call otherwise (`runtime/llm/evidence-loop.ts`, the shared `runCall`
path). The start-location note tells the model the build opened there and that
the step is the Flow's first, already kept, and that it must go there itself
only if that entry failed. Before this, the web domain refused the free look of
every such build for not being at the start yet, and the model's first paid
decision was the navigation (`run-muqc07fh-eeffbc86`, about 17k tokens).
`input` stays the look: a fresh look after a person cleared a check still takes
it (`runtime/parking/person-needed-tool-calls.ts`). A build told no start, a
binding that declares no arrival, and a continued build, which passes no start,
open with the look as before. Every validator of the tool list accepts
`arrival` only on a `perCallEffect` tool, and the provider projection never
carries it.

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
Evidence-decision context carries every node by name and the definitions the
build has described beside the tool schemas, decision schema and collected
evidence. In the decision schema, the `add` and `act` properties are explained
once, on the first tool variant that can act, and offered bare on every other
(`runtime/llm/evidence-loop-decision.ts`). DeepSeek still estimates the final provider projection and rejects it
if the authoritative per-call input or total-token limits would be exceeded.

The persisted adaptation records only bounded iteration, decision, call/tool ID,
categorical result code, effect-applied state, evidence-byte, and usage
accounting. Public failure diagnostics may project at most 65 content-free
`{toolId, effectApplied?, resultCode?}` steps: the loop's 64-decision ceiling
plus its initial observation. Raw tool inputs, call IDs, and
collected evidence are not copied into that diagnostic. The loop's budget
charges each call what it reported using, or its worst case when that report is
missing or inconsistent.

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
digest may be persisted; its contents never enter run detail. Every target
override, proposed or executed, is judged by a domain validator closed over
that packet. Core supplies that validator only the failed node ID, definition
ID, and, where the Flow names one, the output the node dispatches (`outputId`).
That lets the domain reject a structurally present target that the failed
action cannot use, without receiving action values or trace content. The
validator may accept the proposed target or return one exact canonical
replacement when sanitized evidence has exactly one compatible candidate. Core
validates a replacement before using it. Malformed, absent, ambiguous, or
unresolved targets fail preflight and create neither an Adaptation nor a Change
Proposal, and so does every target override when no validator is bound. A
refusal may name one reason from Core's closed vocabulary;
[Repair targets and their refusals](../automation-studio.md#repair-targets-and-their-refusals)
lists them. Persisted resolution provenance is categorical (`matched` or
`resolved`); resolved targets appear only in the patch itself. Overrides are
also bound to the failed trace node: Core requires that node to exist in the
current Flow and deterministically replaces any other model-selected node ID
before evidence resolution. Only categorical `targetNodeResolution` provenance
is retained outside the patch.

Runtime Debug exposes `Build Flow from instructions` only for a blank top-level orchestration Flow with no Router or Subflows, at least one active applicable instruction, an enabled DeepSeek key, and saved limits that exactly match the build profile: 4,000 input tokens, 1,000 output tokens, 5,000 total tokens, 20 seconds, USD 0.25, and zero provider retries. The build always asks Core for one call; the Flow's saved call count is not consulted. Ordinary Run remains unavailable while the Flow has no executable topology.

The `Website task` exploration action is available on the same blank Flow as soon as the DeepSeek provider, model, and key reference are configured; it does not require the user to first persist an exact exploration profile. The client derives the request at action time: 8,000 input, 4,000 output, and 12,000 total tokens per call, 45 seconds and USD 0.25 per call. It names no call count and ignores the Flow's saved one. The build is bounded by the Flow creation's one purse -- `FLUXIQ_LLM_RUN_COST_CEILING_USD`, $0.10 by default, lowered by the Flow's `maxEstimatedCostUsdPerRun` when that is smaller -- and by its token budget and its deadline, and the panel describes the run by what ends it (a proposal, a lack of progress, the token budget, the total cost, or the deadline) rather than by a call count. This does not relax the exact persisted-limit requirement for the ordinary one-call instruction build.

The authoring action runs on the current authenticated session's own unlocked key and does not ask for the account password or PIN again, or for any confirmation of its size. The browser route adds the authenticated session, so browser code never derives or exposes it. Where the person has allowed lasting consequences, the request carries them as `permittedConsequences`. The surface keeps availability checks visible, and a rejected check offers an explicit retry.

Website exploration distinguishes its two safety boundaries in the interface: bounded browser actions happen immediately against the connected tab, while the generated Router, Subflows, and actions remain an unapplied proposal. Preparing and exploring states expose an accessible indeterminate progress indicator, elapsed time, and a reminder to keep the target tab connected. Shared LLM progress vocabulary uses `Checking prior evidence`, `Inspecting live target`, `Generating proposal`, and `Ready for review`; the current authoring surface renders only phases supported by observable state. In particular, prior-evidence wording and controls remain hidden until reusable-context candidate data exists. Successful generation states explicitly confirm that no generated change has been applied. Failures map only allowlisted diagnostic codes to fixed, actionable recovery guidance; raw service errors, provider output, prompts, and page evidence are never rendered.

Successful generation opens the returned proposed Bootstrap Adaptation in the existing Adaptations view. A typed compatibility bridge projects the dedicated Bootstrap document through the standard `get-flow-adaptation` DTO without copying it into standard Adaptation persistence. The projection exposes only the source instruction IDs, Core-derived risk, summarized Router/Subflow changes, bounded request/token/cost accounting, and the base/current Core execution digests and settings revisions. It never exposes a key identity, session, prompt, instruction body, or raw provider response.

The authoring surface cannot approve or apply the proposal. The standard review endpoint, `review-flow-adaptation`, detects the Bootstrap identity and delegates only approve, reject, apply, and revert to the dedicated lifecycle; the Adaptations UI hides unsupported standard actions. Review responses re-project the new lifecycle state immediately. An applied response includes the canonical post-apply execution digest, which must match the dedicated application record. Only explicit application materializes the deterministic Core-owned Router, Subflows, and graph Flows; existing Router/Subflow mutation subscriptions then refresh Runtime Debug readiness and allow a deterministic Run.

The browser request policy marks generation as an explicit mutation. No bootstrap provider request is part of ordinary preload or summary hydration.

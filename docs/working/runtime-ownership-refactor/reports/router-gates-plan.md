# R6 router, permission, change and recovery gates

Outcome: Read-only investigation complete; implementation has not begun.
Owned change: this report only. Core source remains frozen.
Role: heavy worker, gpt-6.1-sol, max effort.

## First independent implementation: context packing

Move the actual `runtime/reusable-llm-context.ts` implementation to
`runtime/models/context/pack.ts`, not a wrapper around Studio. Its only upward
dependency is the storage record type. It performs no database access, TTL
selection, credential handling, encryption or project lookup.

Paths below are relative to `packages/fluxiq/src`; `S` abbreviates
`programs/automation-studio`.

| Owned old/new paths | Exact responsibility |
| --- | --- |
| `S/runtime/reusable-llm-context.ts` -> `runtime/models/context/{candidate,packet,packing-result,pack,index}.ts` | Move packing and its real input/output DTOs. Candidate contains exactly recordId, contentDigest, outcome, reviewerState, validationState, sourceRunIds, sourceAdaptationIds, promptProjection and createdAt. Keep readonly input arrays and unknown-free JsonValue projection. |
| `S/storage/project/reusable-llm-context-store.ts` **DTO slice only** | Extract the three disposition enum authorities to the canonical candidate contract and compose the stored record from that candidate plus its existing persistence fields. The stored record remains unchanged structurally and on disk. No storage method, query, keyed digest, TTL, encryption or migration edits. |
| `S/runtime/tests/reusable-llm-context.test.ts` | Move pure packer tests beside canonical pack. Keep `reusable-llm-context-service.test.ts` Studio, where it proves actual selection/store/audit integration. |
| Old packer leaf | Exact named forwards through `runtime/models/context/index.ts`; old exported names/schema marker stay supported. |

The current token estimator already forwards to `runtime/models/limits`; import
that owner directly. No R5, router, provider call, engine or permission dependency
is needed. This is the smallest independent R6 source brief.

Acceptance must preserve exclusion of rejected/reverted outcomes or reviews,
newest-created-first order with recordId tie-break, newest equal-digest winner,
whole projections, sorted unique source IDs, byte/token accounting and ignored
legacy maxInputTokens. The current implementation returns an empty packet object
when no candidates survive, despite its nullable declared result: do not silently
change that to null. Do not reintroduce ranking, count limits, byte limits or
token-share truncation. Canonical inputs must not be `Pick` of a Studio store or
service declaration.

## Contract ownership before the larger units

R5 already specifies one condition authority in
`@fluxiq/contracts/state/conditions`, absorbing `S/model/conditions.ts`. R6 uses
that contract; it must not create a second condition union under flows. State
and recording contracts, references, passive targets and signal comparators
remain owned by the R5 plan in `state-recording-plan.md`.

One serial contract extraction from `S/model/flow-adaptation.ts` is needed for
router/change work. Extract only these executable portions, leaving full
project/history/view records Studio:

- `flows/executable/routing/{target,rule,router,subflow,status,decision}.ts`:
  target kind/subflowId; ruleId/order/status/condition/target; routerId/flowId/
  rules/fallback; subflowId/status; route-decision fields actually emitted.
  Persisted names, timestamps, project IDs and editor layout remain additions
  on Studio types. `defaultAutomationStudioSubflowForFlow` remains Studio because
  it deliberately stamps a persisted default subflow with project/time/source.
- `flows/executable/change/{risk,status,kind,validation,origin,patch-policy}.ts`:
  risk/status/patch-kind vocabulary, trial/replay result, origin variants and
  the exhaustive patch-gate table. Move the origin parser's exact slice from
  `S/model/validation/adaptation.ts`, not the whole model validator.
- `S/runtime/service/adaptations/gates.ts` owns the actual exhaustive
  `AUTOMATION_STUDIO_ADAPTATION_PATCH_GATES` table today. Move it once to the
  executable change owner. Its old leaf forwards. The pure
  `adaptationRequiresChangeProposal` predicate at the bottom of
  `service/adaptations/durable.ts` must consume that authority; do not move the
  durable writer to obtain the predicate.
- Preserve the seven-member persisted run-status vocabulary as its own
  executable contract where a shared consumer truly requires it; router results
  themselves use queued/running/failed. R2 progress-state inputs must reference
  the same authority rather than independently redeclare persisted statuses.

Use new minimal canonical inputs explicitly and keep old stored DTOs assignable.
Do not move all of flow-adaptation.ts or manufacture canonical artifact contexts.
For callers that need returned subflow metadata, make the router generic over
`TSubflow extends ExecutableSubflowTarget`; return the supplied object itself.
This preserves identity and additional Studio fields without requiring those
fields in the framework.

## R6 implementation units and disjoint ownership

Each row is a bounded source brief, with its old/new feature barrels and tests.
Shared model/type extraction above must be serial and complete before dispatch.
Root exports, package subpaths, broad import retargeting, architecture documents
and mechanical guard configuration remain lead-owned.

| Unit and exact existing implementation | Canonical owner and actual extraction |
| --- | --- |
| Router: `S/runtime/router-runtime.ts`, `route-state/router-state.ts`; pure path/key helpers in `flow-bootstrap/plan/route-condition.ts` | `engine/router/{contracts,compile,run,decision,state,index}.ts` owns compile/order/select/fallback and observed-state orchestration. `flows/conditions/{evaluate,paths,key,index}.ts` owns the pure expression interpreter/path walk/key; it imports R5 condition DTOs. Old source forwards, except persisted default-subflow creation remains a Studio adapter. |
| Permission core: `S/runtime/action-permissions/{gate,declaration,declared,declaration-required,projection,destructive,cross-check}.ts`, `assessment-observation/**`, `plan/**`, old barrels | Extend existing `runtime/action-permissions` with real gate, declaration parsing, consequence projection, standing-decline/settlement and assessment scopes. Existing canonical request/consequences remain the authorities. Canonical plan effect access reads canonical component registry/effect contracts, never the old node barrel. |
| Grounded instruction authority: `action-permissions/{instructed,instruction-quote/**,instruction-reading/**,instruction-route/**}` | `flows/instructions/authority/**` owns quote matching, instruction/set digests, stale-authority checking, route reading and structured read schemas. Minimal grounded consequence/quote/digest entry DTO lives with runtime permissions, so the base gate never imports Flow authoring. Agent/model invocation remains injected through the existing deriveInstructed callback. |
| Change engine: `S/runtime/flow-change/{contracts,verdict,resume,confidence,attempt-projection,trial,action-target-parameters}.ts`, `adaptation-confidence/replay.ts` | `engine/automation/change/{contracts,verdict,resume,confidence,attempts,trial,replay,target-parameters,index}.ts` owns actual trial/verdict/replay machinery. Pure metadata constants/stamping and existing `node-adaptation` facades consume `flows/executable/adaptation` and new change contracts; do not create another adaptation-ID implementation. |
| Training/admission: `S/runtime/training-modes.ts` pure functions; `recovery/adaptation-promotion.ts`; table/predicate slice above | `runtime/adaptation/{settings,behavior,budget,invocation,promotion,stability,frozen-scope,index}.ts` owns supplied-policy decisions and metrics. Inputs contain actual settings/history facts; no engine trace or Studio service dependency. Engine change supplies confidence DTOs via executable contracts. Studio retains run-detail metadata stamping and persisted review/audit extraction wrappers. |
| Failure/repair admission: `S/runtime/adaptive-orchestrator.ts`, `recovery/{deterministic-diagnosis,llm-invocation,diagnosis-chain,structured-diagnosis,plan,unresolved-failed-attempt}.ts`; pure decision from `annotation/early-refusal.ts` | `engine/automation/adaptation/{failure,signature,diagnosis,invocation,patch-admission,plan,index}.ts` owns classification and deterministic-first repair planning. Small model-answer view and patch-kind authority replace imports of the whole Studio LLM barrel. Studio early-refusal wrapper converts the decision into its stored detail/trace; it does not retain the actual admission rules. |
| Bounded exploration primitives: `recovery/{recovery-deadline,progress-guard,exploration-budget,exploration-outcome}.ts`, `exploration-state/{digest-source,step-record,recorder}.ts` | `runtime/agents/recovery/{deadline,outcome,index}.ts` and `runtime/agents/exploration/{budget,progress,state/**,index}.ts` own clock/progress/lease-like accounting and opaque state-record contracts. Preserve existing absolute deadlines/defaults/ceilings; no provider execution enters this group. The real exploration loop and Flow-specific tools are R7, consuming these primitives. |
| Verification funding/schedule: `S/runtime/result-check-schedule/{settings,contracts,policy,ordinals,decide,resolve,configuration}.ts`, `result-check-authorization/{contracts,redeem,repair}.ts` | `runtime/verification/schedule/**` and `runtime/verification/authorization/**` own the actual pure algorithms. Extract the four verification-status literals from `result-verification/verification-status.ts` to a canonical status DTO; leave its richer outcome-to-status adapter with verification implementation until R7. Studio conversation posting stays an adapter. |
| Authorized provider resolution: `result-check-authorization/{provider-contract,provider,reveal}.ts` | `runtime/models/authorization/{contracts,provider,reveal,index}.ts` owns provider creation and the one-use credential resolver through the existing four-method key port. Canonical model factories/catalogue are already available; program host composition supplies actual key custody. This must not import Secret Keys or Studio service classes. |
| Judged receipt reads: `S/runtime/durable-behavior/**`, `authored-metadata/revision-pattern.ts` | `flows/executable/change/{judged-application,judged-decision,durable-behavior,revision-pattern}.ts` owns pure receipt/version readers. Move the re-author metadata-key constant into a lower contract shared with R7; eliminate the current typed duplicate string/cycle workaround. Persistence and applying receipts remain Studio. |

Only new cohesive feature subdirectories are worker-owned; do not add a generic
utilities directory or a broad replacement runtime coordinator. Where one row
would exceed directory/file budgets, split by the named capability, such as
permission declarations/assessment or change trial/verdict/replay.

## Stable ports and exact behavior at the cuts

Router inputs are explicit data: ordered rules, supplied active targets, inputs,
observed state, optional state provenance/reroute reason and clock. It needs no
adaptation policy to evaluate conditions: the current input declares one but
never reads it. Do not drag that unused whole model into the canonical router.
Keep no-condition truth, all/any/none/weighted semantics, numeric coercion,
regex-invalid no-match, missing/history-only operator behavior, root path
reading and first-match ordering. Input-only rules must perform no host read;
state rules preserve the current caller-state fallback and host-key precedence.
Decision records keep bounded reasons/paths, never raw observed state.

The permission gate already has the important authority ports:
`permittedConsequences`, grounded `instructed` entries/`deriveInstructed`, clock,
request-ID factory and whether a request is answerable. Use them as data and
callbacks, not a service-shaped interface. `observe` needs only JSON evidence
or a tiny envelope with the existing execution discriminator and evidence;
it must not depend on Flow draft/tool task types merely to unwrap evidence.
Extract that minimal envelope view, or unwrap in a narrow compatibility adapter.
The actual gate class moves once, preserving class identity.

Assessment context is particularly identity-sensitive: its current
`Symbol.for("fluxiq.automation-studio.action-assessments.v1")` storage lets
separately bundled host/domain Core copies share nested scopes. Keep that exact
symbol and linked ancestor scopes. A nested veto cannot hide its parent.
Preserve one settlement, resolved client floors, denied/unanswered state,
decline-by-control behavior, latest evidence-name budget, per-action undo
allowance that never enlarges standing grants, and immutable request fields.
Moving instruction reading must not turn an instruction into permission for a
class the existing gate requires a person to grant.

Change trial/replay requires real graph/attempt/verdict inputs and supplied
`verifiesState` where a domain assertion is hidden inside another node. It must
not treat a successful dispatch, a failed-route default, short expectation count,
unreached node, cancelled trial or retried/replaced attempt as proof. Preserve
the saved/executed trace distinction and actual resume point.

The trial currently substitutes a Proxy host to observe expectation evaluation.
It binds methods back to the host, but it changes identity and has no own data
descriptors for the runtime-repeat port. Do not carry this hidden coupling into
the new owner. Add an optional **per-run expectation observation port** to engine
options and one engine evaluator helper. It reports requested condition count,
context/source/attempt identity and result or failure while calling the real
host evaluator with its original receiver. Route the actual evaluator reads in
`node-execution/attempt.ts`, `transitions/comparison.ts` and `recovery/run.ts`
through that helper. The trial records observations through this port and keeps
hostRuntime untouched. Preserve same-source recheck replacement, distinct-source
attempt-ID ambiguity, failed evaluation propagation and unknown short counts.
This source ownership must be named explicitly in the trial implementation brief.

Failure matching needs a canonical `KnownChangeFact`, not a full persisted
adaptation: adaptationId/status/riskLevel, optional subflowId, recorded failure
signature and legacy failed node/definition identity. A Studio adapter reads
those facts from stored metadata. Classification uses canonical attempt/failure
contracts. Preserve exact failure-signature serialization/hash input, structured
failure precedence, validated-known versus applied-recurred distinction and the
deterministic recovery/reroute/model ordering.

Repair model admission consumes a narrow answer view:
`ok`, optional response kind, bounded diagnosis fields, confidence and metadata
needed to explicitly refuse misrouted diagnosis claims. It does not need the
full `AutomationStudioLlmTaskResult`. Extract the actual diagnosis field contract
from `llm/harness/structured-response.ts` and a discriminator-only runtime patch
kind authority, keeping payload/agent execution with R7. Do not reinterpret
arbitrary response metadata as checked diagnosis. The existing in-run patch-kind
allowlist remains mechanically tied to the patch union.

Early recovery admission takes facts: repaired-in-run, deliberate authored stop,
in-run/refuted-result entry, model behavior, explicit run-budget presence,
training budget outcome and cost left. It returns allow or a coded refusal;
the Studio adapter stamps that refusal on its detail. Preserve the current
in-run repair fault check and propagation before deciding already repaired;
do not replace it with an optimistic boolean or optional no-op port.

Promotion admission takes confidence, named review evidence, explicit user
approval settings, risk/patch classification, status and proposal linkage facts.
The runtime decision never fetches a proposal. Studio reads its durable review
and audit record and supplies those facts. Keep trial/replay evidence rules,
judged-whole-run deferred application, mixed/manual settings and the distinction
between editing a Flow and granting permission for an external action. This
migration does not authorize changing which existing gates win.

Verification scheduling takes ordinal, last checked ordinal/status, settings and
repaired-this-run. Funding redemption takes the standing authorization, task
kind, time and already-spent amount. Neither reads history itself. Preserve
person-off/never precedence, after-repair/refutation checks, one scheduled
unsettled reask, task allowlists, shared check/repair purse, whole-call/repair
coverage, expiry and malformed/absent refusal codes. Model funding is never
permission to perform an action.

Credential resolution retains the existing four operations: get summary, mint
session reveal authorization, reveal once, revoke. Preserve project/Flow scope,
user/unlock custody, enabled key/provider/model binding, key-version race check,
10-second one-use TTL, and credential-in-outbound-request rejection. Tests remain
mocked and must never print credential contents. The authorization default's
single shared run-cost constant currently comes from
`S/model/run-cost-ceiling/run-cost-ceiling-env.ts`; extract the domain-neutral
default constant to canonical model limits and forward the old export, leaving
environment/test override parsing with host configuration.

## Authoring routing/evidence closure and R7 boundary

Do not leave `route-state/build-routing.ts` behind merely because it runs during
a build. Its actual state/situation/signature ledger is reusable. Move it to
`runtime/flow-authoring/routing/{build,contracts,context,index}.ts`, together
with the pure builder in `flow-bootstrap/plan/routing-context.ts`. It receives
ports for observed state, opaque signatures/effects, declared paths/inputs and
tool-call/decision observation. Caller-supplied context-free tool IDs remain
supplied; Core must not acquire a hardcoded browser tool allowlist.

The remaining closure is explicit and small:

- `route-state/{delta,screen-situation}.ts` ->
  `runtime/agents/evidence/{delta,screen,canonical-json,index}.ts`.
- Extract only `automationStudioLlmEvidenceCanonicalJson` from
  `llm/evidence-loop-decision.ts`; do not move draft/amendment dispatch with it.
- Move `llm/harness/evidence-screen.ts`'s actual neutral denied-key/credential
  screen and the small `automationStudioEvidenceKey` function from
  `failure-evidence.ts`; keep full Flow failure packet construction with R7.

Screen before delta, snapshot the screened baseline, preserve immutable earlier
window bytes and exact baseSituation/updates/removed semantics. Null is a value,
not removal. Preserve the free-first-look/state-carry and pageless-tool behavior
and no-capture-on-memory-feedback rule. Use existing privacy tests rather than
introducing an evidence-size cap or another sanitizer fallback.

The large annotation/exploration/patch application/refuted-result repair loops
are R7 implementation, not authorization to move them wholesale in R6. R6 moves
their actual decision primitives above. Their remaining explicit ports are:
`EvidenceSource`, checked diagnosis/model call, `PermissionGate`, graph-change
trial, artifact/change apply/rollback sink, run-history reader and presentation.
`recovery/annotation/ports.ts` currently still names Studio service/adaptation
types; a canonical replacement must be declared from those operations/results,
never `Pick<AutomationStudioService, ...>`. The real loop must later move and
call those ports; leaving it in Studio behind a new generic interface is not
completion of R7.

## Browser interpretation and adapters

The inspected router interpreter uses arbitrary input/state paths; it does not
interpret page, URL, selector or DOM semantics. Rule path examples and opaque
host state keys are not browser ownership. Action declarations carry legacy
page/item/dialog/place tokens, but validation and equality are generic; do not
resolve them or rename their persisted fields in this migration.

`actionTargetParameterValues` maps the documented built-in policy action payload
slot versus a native node's target slot. It carries target JSON unchanged; it
does not score a selector. Keep that exact built-in mapping and use trusted
registered target descriptors if extending it to other parameter layouts.
Model-authored arbitrary locators must not become a fallback to the host's
resolved handle/target authority.

Grounded instruction schemas and routing/permission/recovery guidance currently
say page/browser in explanatory text. Generic mechanics should receive neutral
resource/action descriptions; domain-specific descriptions come from the host
presentation port. The known active browser target/name/location extraction
sites in residual-runtime.md still require R8's downstream move. None may be
imported as a convenient default by these new owners. Denied-key names and
credential-shape screening are privacy policy, not selector matching; they stay
Core with caller-supplied raw-evidence key declarations.

Studio intentionally retains endpoint composition, repository reads/writes,
full project/publication/review/run records, settings persistence, default
persisted subflow stamping, run-detail metadata adapters and conversation
thread posting. `result-check-schedule/conversation.ts` binds its actual thread
and attachments there; generic ask DTOs come from canonical interaction, never
from a new copy of the conversation model.

## Dispatch order and validation

1. Dispatch the independent context-packer group now when source is authorized.
2. Serial shared routing/change/disposition/status contract extraction, aligned
   with R5 and R2. Freeze these contracts before dependent workers.
3. Router/conditions, permission/instruction authority, and change verdict/trial
   are disjoint after those contracts. The trial alone owns the named engine
   evaluator helper/options/call sites. Their parent/root barrels remain lead-owned.
4. Training/promotion and deterministic recovery planning consume the settled
   change authority. Verification schedule/redemption/provider resolution can
   proceed independently after the small model/status/default contracts settle.
5. Routing evidence/build-ledger closure consumes canonical screen/condition
   primitives and gives R7 its stable integration seam. R7 loop implementation
   and R8 host wording/target interpretation remain required continuation.

Move subject tests beside canonical owners, with minimal executable fixtures.
Keep small compatibility identity and true persistence/thread integration tests
Studio; canonical tests must never import its builders or model barrels.
Preserve every existing assertion before adding port-boundary regressions.

| Unit | Existing acceptance subjects and additional boundary checks |
| --- | --- |
| Context | `runtime/tests/reusable-llm-context.test.ts`; retain service integration; whole payload, newest digest and empty-packet behavior. |
| Router | `runtime/tests/router-runtime.test.ts`; route-state tests; condition tests from flow-bootstrap/plan. New minimal targets/no-project fixture; supplied-target identity and host receiver preserved. |
| Permission | All current `runtime/action-permissions/tests` and instruction subdirectory tests. Cross-bundle/nested assessment Symbol scope, standing decline, undo and client-floor tests stay mandatory. |
| Change | `flow-change/tests/{contracts,verdict,resume,confidence,trial,attempt-projection}.test.ts`, `adaptation-confidence/tests/replay.test.ts`. Add frozen/inherited/private receiver host and repeat-descriptor identity coverage for the observation-port cut. |
| Policy/recovery | `runtime/tests/{training-modes,adaptive-orchestrator}.test.ts`; recovery tests for deterministic-diagnosis, llm-invocation, diagnosis-chain, structured-diagnosis, plan, plan-in-run-repair, adaptation-promotion, deadline/budget/progress/outcome. No provider call is needed. |
| Verification | `result-check-schedule/tests/schedule.test.ts`, authorization tests for contracts/redeem/repair/provider; thread conversation test stays Studio. Preserve all refusal/expiry/key-race/secret-screen assertions. |
| Routing evidence/receipts | route-state tests for build-routing/signatures/shown-window/delta/screen; durable-behavior and authored metadata tests. Preserve immutable window prefix bytes and judged-end receipt semantics. |

After each bounded unit: affected tests, touched-package typecheck in a stable
source window, and selected fullgraph import/cycle/module-reach/browser-import/
failure-handling/structure rules. Configure hard boundaries against every new
canonical owner reaching Studio, including erased type imports. Base runtime
policy/permission/context modules must not reach engine; engine integrations
may depend on their data/ports. No baseline remap, increase, exception or generic
index alias replacing an actual implementation move.

## Investigation validation and limits

Inspected the named router/route-state, training/context, permission, change,
recovery-admission, verification and direct DTO/consumer seams using read-only
Get-Content/rg and a TypeScript AST import/export inventory. Read and referenced
the R5 state/recording and R1/R3 native/IO plans. No tests, typecheck, build,
provider, browser, panel, source edit or git mutation was performed for this
planning brief. Future code and proposed ports are not implemented or verified.
The report is complete; source remains frozen pending the lead's next task.

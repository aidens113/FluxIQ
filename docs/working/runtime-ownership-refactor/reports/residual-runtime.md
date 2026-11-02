# Remaining Studio ownership and migration closure

## Result

The kernel/provider/DSL cuts do not finish the user's runtime ownership request.
Substantial reusable execution, state, recording, Flow authoring, result judgment,
recovery and resource scheduling remain under Studio. Move these by capability,
with Studio supplying persistence, project selection and presentation adapters.
Neither an `AutomationStudio` symbol nor a `projectId` data field proves that an
implementation requires the Studio program.

This is a read-only inventory after the engine source handoff. AST inspection
visited every production `.ts` path under Studio, excluding `tests/`; it separated
declaration/reexport-only compatibility files from implementations and summarized
imports/exports. Implementation bodies were then inspected for the decisive
groups below. Provider and DSL workers were still active, so counts describe an
intermediate snapshot, not a final repository manifest.

## Complete area inventory

Paths below are relative to `packages/fluxiq/src/programs/automation-studio`.
`Split` means a concrete remaining capability extraction, not permission to keep
the whole directory merely because some files touch program data.

| Remaining area | Actual responsibility and decisive evidence | Correct ownership |
| --- | --- | --- |
| `api/**`, `metadata.ts`, `ui/**` | Registers Studio endpoints/program navigation and defines its view DTOs. `api/handlers/conversations.ts` routes program commands. | Keep endpoint registration, authorization/composition and view DTOs Studio. Host-location interpretation described below must leave Core. |
| `storage/**` | SQLite/project hierarchy, artifact/revision/publication/run stores and program migrations; repositories own durable Studio records. | Keep stores/migrations Studio; extract DTO/algorithms only where a runtime consumer currently depends on a storage declaration. Do not move generic execution into storage. |
| `model/artifacts.ts`, `flows.ts`, `composites.ts`, `flow-adaptation.ts`, `regions.ts` | Persistence envelopes, legacy artifacts, publication records and adaptation history, now using executable DTOs. | Keep project/source/publication/history envelopes; executable graph/interface/call/region/handler authority is canonical. Published snapshot execution contract and composition validation still need extraction. |
| `model/{state,state-store,state-diff,signals,conditions,actions,node-state,recordings,timeline,recording-domain,recording-framework}.ts` | Shared snapshot/value schemas, in-memory observable state, JSON deltas, condition/action contracts and recording construction. `AutomationInMemoryStateStore` clones/maps/notifies; `diffStateSnapshots` compares namespace values; neither uses an editor or repository. | Split reusable state/condition/recording mechanics into focused `runtime/state`, `flows/conditions` and `runtime/recording`; keep legacy/project artifact DTO envelopes as aliases/adapters. Canonical browser-safe state types must align with existing shared wire contracts before moving callers. |
| Other `model/**`, `types.ts` | Program fixtures, settings, retired task/policy/proposal formats, validation and presentation-facing state. | Keep true program/legacy DTOs. Extract runtime budget/policy decisions separately from Studio settings serialization; do not move fixtures into a generic runtime. |
| `nodes/**` | All current node implementations are facades except `importer-sdk.ts` (about 188 lines at inspection). SDK now uses a neutral matcher port. | Move SDK contracts/registry/validation to `components/automation/importer`; keep old exports forward. No remaining web-shaped matcher dependency justifies retaining it. |
| `dsl/**`, `runtime/region-compiler.ts` | DSL compiler facade and persisted artifact stamping; executable validation/region compilation is the active DSL worker's cut. | Complete that cut; Studio retains artifact stamping/source ownership and its policy-to-region legacy adapter. |
| `fingerprinting/**` | Neutral matcher compatibility facade plus passive legacy browser-shaped DTOs/weights and policy scorer contracts. Concrete browser scoring already moved downstream. | Keep inert compatibility DTOs/exports; all active browser scoring/projection belongs downstream. Do not reintroduce their interpretation in generic matching. |
| `learning/**`, `mining/**` | Contract-only legacy pipeline ports/results: learned task/action clusters and evidence facts; no mining/learning algorithm implementation exists in these directories. | Passive legacy program contracts can remain. A new generic learner must depend on canonical evidence/action ports, not these program artifact envelopes. |
| `normalization/**` | `ConservativeTimelineNormalizer` selects nearby checkpoints, computes state deltas and compacts high-frequency observations. No project store/UI calls. | Move actual normalization to `runtime/recording/normalization`, with canonical recording/state DTOs. Keep legacy pipeline envelope adaptation Studio. |
| `client-gateway/**` | Recording bridge and client-event write ordering, followed by project recording writes. | Split generic gateway-event decoding/order/sink protocol into `client-gateway/recording`; Studio supplies its project recording sink. |
| `testing/**` | Marketing/scale fixtures and graph-store support exported for Studio artifact tests. | Keep program fixture support. This is not evidence that production runtime belongs Studio. |
| `runtime/{executor,reference-now,runtime-repeat,actionability}/**`, `executor.ts`, `host-runtime.ts`, `provider-refusal/**` | Mostly compatibility facades after current moves. Four executor wrappers compose the legacy host interpretation. | Keep forward compatibility only; canonical implementations must not import them. Legacy host interpretation still requires the downstream boundary cut below. |
| `runtime/{adapters.ts,contracts.ts}` | `AutomationStudioAdapterRegistry` registers observation/action capability ports; `contracts.ts` carries legacy task/recorder/runner interfaces. Registry has no repository/UI calls. | Move active adapter registry/neutral observation and action ports to runtime adapters. Retain passive legacy task interfaces as compatibility types or derive them from neutral ports. |
| `runtime/native-node-runtime.ts` | Trusted implementation binding, capability grants, manifest consistency, per-domain matchers, logging and target refresh. All dependencies now have canonical owners. | Move to `runtime/native-execution`; old class export forwards unchanged. |
| `runtime/io-policy.ts` | Dispatches registered IO/runtime outputs, waits for confirmation and projects failures/actionability; only remaining Studio model edge is the policy action/target DTO normalization. | Move to `runtime/output-dispatch`, extracting a minimal action request and treating host targets as opaque. Keep legacy target-envelope normalization as an adapter. |
| `runtime/compiled-plan.ts` | Pure deterministic sort/index/digest/validation and graph execution. No repository calls. Its only product projection synthesizes a legacy FlowDocument owner envelope. | Framework compiled-plan contracts/compiler/assertion/execution; retain that legacy envelope projection Studio. Preserve exact digest inputs and schema/compiler markers. |
| `runtime/composite-execution/owner.ts`, `composite-executor.ts` | Runs an already supplied array of immutable pinned snapshots, validates composition, compiles regions, binds frames and tracks private provenance. It does **not** perform repository lookup. | Move whole execution class/wrapper to engine composite once snapshot DTO and `validateFlowComposition` move to executable composite contracts. Studio publication creation and snapshot retrieval stay outside it. |
| `runtime/environment/**` | Live/virtual clock, randomness, timer, run ID and isolated gateway channel scope. `_shared/runtime.ts` directly imports `AutomationStudioChannelScope.gatewaySource`. | Move clock/channel/environment capability to runtime. This is an actual framework-to-program dependency to eliminate. |
| `runtime/run-control/**` | Abort/pause/resume/takeover state machine, weak host registry and lifecycle snapshots. Opaque project/run keys index an in-memory registry; no store/editor dependency. | Move to runtime control; Studio API handlers remain adapters. Types already have a canonical host owner. |
| `runtime/activity/**` | Remaining words/cards, project build/run presentation and conversation binding. Hub/context/sanitization/numbering are canonical. | Keep Studio presentation and scope composition; move active browser parameter interpretation to host presentation ports. Pure additional activity mechanics belong canonical runtime. |
| `runtime/action-permissions/**` | Run-scoped consequence gate/declarations/settlement, instruction authorization and evidence-bound naming. `gate.ts` owns generic deny/grant safety, not a UI. | Move gate/declaration/assessment to runtime action permissions; Flow instruction interpretation belongs Flow authoring permission adapters. Studio conversations carry asks through the existing port. |
| `runtime/{adaptive-orchestrator.ts,adaptation-confidence/**,flow-change/**}` | Generic failure classification, patch confidence/verdict, resume selection and action target binding. `decideAutomationStudioChangeResume` consumes checks and a resume point only. | Engine adaptation/change capability. Keep conversion to persisted Studio adaptation records outside it. Reuse host identity ports for concrete target interpretation. |
| `runtime/authored-metadata/**`, `durable-behavior/**` | Revision metadata pattern and pure parsing of judged application/decision records. | Executable revision/change contracts; Studio records their durable application history. |
| `runtime/{candidate-start-hook/**,completed-llm-evidence.ts}` | Configured HTTP lifecycle callback and evidence persistence callback protocol. The hook POSTs an empty object, contains no browser/scenario implementation, and is bound by `_shared/runtime.ts`. | Generic host lifecycle/evidence ports. Deployment configuration and program-specific record writers remain host composition. Browser/site reset implementations stay downstream. |
| `runtime/domain-build-state/**` | Validates bounded build memory, then writes JSON through Studio project/Flow paths. | Flow-authoring memory contract/validation generic; Studio path/store adapter remains program persistence. |
| `runtime/exploration-reduction/**` | Backward slice and reduction over observed steps/state predicates. | Generic Flow-authoring/exploration analysis, with opaque domain evidence. No Studio editor required. |
| `runtime/flow-bootstrap/**` | About 355 implementation modules: plan acceptance/validation, script wiring/statements, reachability, task coverage, reset/retest ledgers, candidate authoring and build completion. Existing barrel documents a real loop with LLM harness consumers. | Split into focused `runtime/flow-authoring/{plans,scripts,coverage,candidates,trial-policy,change-ledger}` capabilities. Studio retains review DTO projection, stored draft selection and applying proposals to project artifacts. Never move the whole dependency closure into one renamed runtime catch-all. |
| `runtime/flow-draft/**` | About 48 modules implementing draft steps, amendments, proposed/accepted state, replay positions and carried parameters, all used by the build agent. | Flow-authoring draft model and pure transforms. Studio stores/displays drafts through adapters; these are not React/editor state merely because they are called a draft. |
| `runtime/flow-version/**` | Remaining instruction digest, run/judged-trial version records and graph metadata readers. `judged-build-trial/applied.ts` already receives `readGraph`/`instructions` callbacks. | Generic immutable execution/judgment identity and digest readers in executable/change contracts. Studio repository history queries and persisted receipt writes remain adapters. |
| `runtime/gateway-trace/**` | Episode/control trace sequence, sink and flush/environment binding; control vocabulary includes turn/ask/run-control/hook/artifact/child-episode markers. | Generic command/activity trace protocol and recording mechanics in runtime tracing; Studio supplies project episode lifecycle/storage. Browser fixture drivers/replayers remain downstream. |
| `runtime/live-patch.ts`, `live-patch/**` | Pure overlay, digest/ownership checks, inserted step/handler build, preflight and runtime trial; final adaptation envelope construction is mixed in. | Engine change/Flow repair mechanics; Studio adaptation record creation and persistence are adapters. Existing effect certainty and same-step repair rules must remain mechanical. |
| `runtime/llm/**` | Providers are moving now. Remaining evidence-loop/tool execution, retry/progress, draft handlers, rerun provenance and Flow tools are runtime authoring machinery. | Generic agent protocol/loop to `runtime/agents`; Flow-specific tool set/guidance/decisions to `runtime/flow-authoring/agents`. Only Studio project command/capability selection and persistence presentation remain program adapters. Model names do not justify retaining all LLM runtime Studio. |
| `runtime/loop-limits/**` | Evidence-loop attempts/time and project build duration/ending-time policy. | Generic loop/deadline machinery in runtime agents; Flow build duration policy with authoring contracts; Studio user settings serialization remains program model. |
| `runtime/panel-capabilities/**` | Advertises/parses actual Studio panel commands and their argument schema. | Keep program capabilities; generic parser fragments should be shared only if there is another real consumer. |
| `runtime/parking/**` | Remaining conversation adapter and person-needed tool-call extraction. | Conversation adapter stays Studio. Generic tool-result intervention detection belongs runtime agents/interaction; browser wording must come from host context. |
| `runtime/{pipeline-model.ts,policy-model.ts,recording-flow-proposal.ts}` | Legacy recording/mining/learned-policy/project proposal envelopes and transforms; helpers are mixed with public artifacts. | Keep legacy/project envelope and review destination construction Studio model. Extract generic recording candidate/graph transforms into recording/authoring capabilities as needed by active execution; do not promote unrelated scalar helpers as utilities. |
| `runtime/project-agents/**` | Generic host-resource queue/lease scope mixed with Flow brief dispatch/supervisor/assembly and persisted build records. `host-resources/scheduler.ts` has only port/error dependencies and enforces fair capacity/release. | Scheduler/leases to runtime resources now; agent scheduling to runtime agents, Flow briefs/assembly to Flow authoring. Studio build record/store and project command adapter stay program-owned. |
| `runtime/{recording-controller.ts,io-bridge.ts,state-linker.ts}` | Observable-state recording, deterministic IO input/output eligibility projection and linking actions to indexed state. IO bridge's concrete service dependency is only `appendRecordingEvent`. | Recording/controller/linker/IO projection to runtime recording; inject append/store ports and keep Studio project writers/index persistence adapters. Preserve passive-vs-executable evidence distinction. |
| `runtime/recovery/**` | About 54 modules: budget/deadline, diagnostic classification, state/progress digest, exploration loop, in-run repair, refuted-result repair and annotation. | Generic exploration/repair to runtime agents/engine adaptation; Flow repair task schemas/tools to Flow authoring. Studio annotations/adaptation persistence and project evidence retrieval remain adapters. |
| `runtime/{result-check-authorization,result-check-schedule}/**` | Budget authorization redemption and deterministic ordinal/periodic result-check decisions; conversation creation is mixed in. | Generic verification authorization/scheduling to runtime verification; Studio conversation and settings/history retrieval remain adapters. |
| `runtime/result-verification/**` | About 245 modules comparing requested results to observed/captured facts, agreement/contradiction handling, accounting, verdicts and repair directives. `verify.ts` consumes a provider and request data, and emits activity; it has no inherent editor dependency. | Runtime verification plus Flow-authoring requested-output adapters; Studio persisted run-detail projection and activity wording remain program composition. Host factual interpretation must remain opaque/domain supplied. |
| `runtime/reusable-llm-context.ts` | Pure deterministic context packet/token packing; storage record is a type-only input dependency. | Runtime model-context packing after extracting that small input DTO; Studio query/select/store adapter supplies candidate records. |
| `runtime/route-state/**` | Remaining router-state orchestration, condition paths, delta and evidence screening. Passive host operations already canonical. | Router execution/state screening belongs engine/router + runtime evidence screening; authored draft/router revision writes remain Studio/authoring adapter. |
| `runtime/router-runtime.ts` | Pure condition compilation/evaluation and subflow route choice. No store/editor side effect. | Engine router with executable route DTOs/condition contracts. Default subflow construction that projects a Studio artifact stays a compatibility adapter. |
| `runtime/training-modes.ts` | Runtime intervention/promotion/budget/frozen-scope gates mixed with persisted settings and UI status projections. Imports a constant from `service/adaptations`. | Runtime adaptation/learning policy owns executable decisions/constants. Studio owns settings serialization/status projection/history selection. Invert the service constant edge. |
| `runtime/toggle-state/**` | Pure consistency of opaque before/after/ensured signatures; no DOM interpretation. | Runtime action-state evidence/Flow-authoring validation. Preserve exact observed-state requirement. |
| `runtime/service/**`, `service.ts` | Project CRUD/query/mutation and runtime orchestration are mixed. Root service is about 4,305 lines at inspection. | Retain only program API/persistence/selection/composition; extract the concrete generic subsets listed next. |
| `runtime/conversations/**` | Studio thread/turn storage, command dispatch, project/Flow resolution and program capability selection, plus generic ask/context mechanisms. | Keep conversation records, project command orchestration and selection. Canonical ask protocol already extracted; generic model conversation loop/context can move behind storage/capability ports. Browser 'here' context must be host supplied. |

## Service cut: what actually remains program-owned

Keep `service/{projects,flows,hierarchy-nodes,paths,indexes,legacy,flow-settings,
publication-dependencies,datasets,reusable-context,adaptation-projections,
run-detail-read,session-listing,end-view,summaries}` where they select/query/write
Studio projects, revisions, published artifacts, datasets and API/view records.
`flow-bootstrap-commands` and `project-build` command handlers keep their request,
authorization and persistence composition; that is not ownership of the algorithms
they invoke. Likewise conversation command handlers keep their thread/project
context rather than moving a command registry into generic execution.

Extract these observed service mechanisms:

- `runtime-session/graph-options.ts`: canonical IO/native/host/environment option
  assembly, with no project store or UI access. It belongs with engine runtime
  composition once native/output dispatch/environment are canonical.
- `command-{context,execution,run}` and `execution-authority`: generic command
  ownership/security lifecycle belongs engine/client-gateway capabilities;
  Studio opens/closes its persisted session through ports.
- `candidate-trial`, `subflow-trial`, `trial-ports`, `offline-first`, `offline-trial`:
  canonical trial/continuation behavior and environment selection belong Flow
  authoring/execution. Persisted draft/run lookup and result writes stay Studio.
- `recordings/{proposal-generation,proposal-candidates}.ts`, recording projections
  and state-index linking: mapper loop, candidate validation and timing are generic
  recording machinery. `proposal-generation.ts` itself says the service only held
  the registries it needed. Store the resulting proposal envelope in Studio.
- `runtime-adaptation`, `adaptations`, `candidate-drafts`, `candidate-failure`:
  engine patch/trial/verdict mechanisms move; durable application/revision receipts
  and selecting the current project draft remain adapters.
- `instruction-led` and `evidence`: Flow-authoring evidence assembly and recording
  analysis move behind bounded evidence ports; project recording retrieval stays
  Studio. Browser parameter interpretation must leave Core, below.
- `scalar-readings`, `json-lines`, `problems`: preserve their semantic owner with
  their consuming operation. Do not create a new generic utilities area merely
  because the functions are small/pure.

## Next closed implementation units, ordered

1. **SDK/native binding**: move `nodes/importer-sdk.ts` and
   `runtime/native-node-runtime.ts`, with their `nodes/tests/importer-sdk.test.ts`
   and `runtime/tests/native-node-runtime.test.ts`. Neutral matcher and log DTO
   already exist. Retarget only graph/scope, node/effect, reference-time and trusted
   target-refresh imports. Split SDK contracts/registry/validation and native
   grants/execution/runtime by responsibility. Old exports forward; no new ports
   are required. This is immediately actionable.
2. **Execution host composition**: move `runtime/environment/**`,
   `runtime/run-control/**`, `project-agents/host-resources/{scheduler,lease-scope,
   port-contract-error,stale-lease-error}.ts` and corresponding tests. Consume
   canonical host resource/control DTOs. Retarget `_shared/runtime.ts` channel
   scope. Environment's only engine dependency is its option-shape adapter;
   extract clock contracts so generic clock/channel ports do not import engine.
3. **IO dispatch and runner options**: move `runtime/io-policy.ts` and
   `service/runtime-session/graph-options.ts` plus focused IO/options tests after
   unit 1/2. Minimal request port is outputId/actionType/parameters/confirmation/
   metadata. Keep target JSON opaque; move old target-envelope read/write
   normalization to a legacy adapter. Domain matcher is explicit, as implemented.
4. **Compiled and composite execution**: move pure `compiled-plan.ts` mechanics
   and `composite-execution/owner.ts`/`composite-executor.ts`; extract immutable
   snapshot DTO and composition validation from model/composites after DSL's
   accessor cut. Preserve digest byte inputs/schema strings/private callback
   registration and same-run provenance. Studio retains the legacy FlowDocument
   envelope projection and publication creation/history. Existing compiled-plan
   store tests remain Studio persistence integration tests.
5. **State/recording foundation**: align duplicate shared state wire contracts,
   then move model state store/diff, recording/controller/normalizer, IO projection
   and action-state linker. Ports: append recording event, read/write state/index,
   domain observation interpretation. Keep project proposal/store envelopes.
6. **Policy/router/change foundation**: executable condition/router DTOs and
   pure router runtime; runtime consequence gate and typed tool-result evidence
   port; patch/verdict/resume/confidence and toggle-state evidence. Move generic
   training/result-check gates and context packing with their small DTO closure.
7. **Authoring and verification capability groups**: stable ports first:
   `FlowArtifactSource`, `DraftStore`, `RunHistory`, `EvidenceSource`,
   `ResultSink`, `Presentation`, `ModelProvider`, `HostActionSemantics`.
   Move plans/scripts/draft/coverage/trial policies, then generic agent build/
   repair/verification loops. Studio implements project/persistence/command
   adapters. The build-whole/test-once/repair-from-failing-step contract and
   per-node retry/effect certainty are acceptance tests, not prose exceptions.

Units 1, 2 and the already progressing DSL/provider units can be partitioned
by disjoint files. Unit 3 depends on 1/2. Unit 4 shares model/composites with the
DSL accessor and must wait for its source-stable handoff. Unit 5 establishes
the state/recording boundary needed by 6/7. Large authoring groups need bounded
port briefs; moving all 1,000+ related modules under one new noun would preserve
the same ownership defect.

## Active browser interpretation still in Core

These are executable semantics, unlike inert legacy DTO fields or tests:

- `runtime/llm/model-facing/control-words.ts` reads
  `parameters.element`, `target.fingerprint` and accessible/visible/placeholder
  fields in a chosen priority. Its comment calls that neutral, but the code
  interprets the host's concrete target representation. Use a host-provided safe
  action/target description. The downstream web adapter reads old browser DTOs.
- `runtime/flow-bootstrap/site-reset/explored-on-absorbed.ts` duplicates that
  extraction; `service/instruction-led/recording-steps.ts` and
  `activity/wording/action.ts` read the same concrete fields. Route all through
  one host description/identity port; keep generic act-ledger comparison Core.
- `runtime/llm/node-tools/rerun-check.ts` hardcodes
  `TARGET_KEYS = [target, selector, element]` when deciding whether an action
  changed. Use trusted registered target descriptors/refresh declarations or a
  host identity comparator. Missing evidence must stay conservative.
- `runtime/conversations/instructions/prompt.ts` interprets `pageUrl`, labels
  the current resource as a browser page/site and turns a described job on it
  into a create-here request. Replace with a bounded host location/context
  description and opaque start token. Existing pageUrl DTO can remain legacy.
- `runtime/service/evidence/state-elements.ts` gives `selector` a fixed ranking
  bonus; that preference belongs in domain evidence metadata/priority, not Core.
- `runtime/service/summaries/host-target-resolution.ts` whitelists browser
  resolution strategy names. Project generic candidate-count/confidence records
  through a host diagnostic adapter; do not teach Core selector strategy meaning.
- Canonical `runtime/parking/person-needed-ask.ts` and
  `engine/automation/person-needed.ts` still default to page/robot wording.
  Intervention mechanics remain Core; host presentation supplies domain wording.
- Engine executed-location/target-lineage compatibility should be inspected in
  this same pass: source names such as element/target/url must represent opaque
  host tokens, never gain selector/DOM interpretation through the ownership move.

Selector/name strings used solely to redact evidence in recovery/object-document
screens are privacy handling, not selector resolution. Passive legacy target
normalization and DTOs likewise do not justify moving the domain matcher back
into Core. No browser API, Playwright driver or concrete site/scenario should be
introduced by any of these moves.

## Validation and limits

Read-only `rg`, `Get-Content` and TypeScript AST inventory/import/export probes
were used. No new tests, builds, typecheck, paid run, browser, panel, git or source
mutation occurred for this residual brief. The engine implementation's checks
are recorded separately in `execution-ownership.md`.

Every top-level remaining Studio production area is represented in the table;
this is not a claim that every function in the largest groups was manually
audited. Their generic responsibility is established by the inspected pure
implementations, input/provider/host ports and service/storage seams above.
Implementation briefs must close the stated DTO/port dependencies and preserve
wire/digest behavior before moving each large group. The remaining groups are
required continuation work, not deferred recommendations or a completed overall
refactor claim.

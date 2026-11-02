# Executable runtime ownership migration

## Recommendation and closure

Move the rich executable graph, node catalog and execution engine into their
framework owners. Preserve exported symbol names and serialized fields during
this move. Automation Studio becomes the editor, project/persistence owner and
composition adapter consuming those capabilities. Its current names do not make
its framework contracts program-owned: downstream executes the graph runner and
registers/uses its nodes without the Studio editor.

The existing `flows/index.ts` and `engine/index.ts` are a simpler, different
contract (`id/start/type/from/to`, versus `flowId/definitionId/sourceNodeId`).
Do not convert one format into the other or replace the mature execution loop
with the simpler engine. Add focused `flows/executable`, `components/automation`
and `engine/automation` areas while retaining existing exports unchanged.

First implement the node group already briefed below, then the whole executable
engine group. This is a capability migration with real implementations moved,
not aliases pointing back into the program. Old paths point toward the new
owners; no new framework module imports a Studio module, including type imports.

AST inspection found 212 production modules in `runtime/executor`, 94 in `nodes`,
72 in `model`, and five in `dsl` at the inspected snapshot. A named-binding
dependency walk from `executor/graph-run.ts` reached 398 Studio source modules
when types were included. The number is an investigation aid, not a finished
build-graph proof: it follows static relative imports and resolves named barrel
exports, and does not resolve arbitrary computed module loading.

## Ownership map

| Current capability | Framework destination | Studio retains |
| --- | --- | --- |
| Graph node/edge/executable graph, typed interface, variables, errors, region and call contracts | `flows/executable/` | Project ID, ownership, provenance, source ownership, publication history and migration records |
| Node contracts, registry, builtin neutral node packs, action effects/consequences, parameter bindings | `components/automation/` | Studio importer SDK additions that still depend on the web-shaped matcher; editor composition |
| Graph run, node dispatch, frames, lifecycle/recovery, state routing, retries, stale target handling, records withholding, resume | `engine/automation/` | Session persistence, project selection, repository-backed composite resolution, event presentation adapters |
| Host boundary and reacquisition/fact/resource DTOs | `runtime/automation-host/` | Host construction/composition only |
| Runtime repeat evidence/guard | `runtime/repeat/` | Binding the host observer to a project session |
| Pure ask/effect DTOs and effect construction | `runtime/interaction/` | Conversation store and thread adapters |
| Parked-run carry, settlement, parking port, resume primitives | `runtime/parking/` | Conversation-port integration |
| Activity hub, async context and structured run activity | `runtime/activity/` | Project cards, editor/build presentation and wording adapters |
| Fixed run reference time | `runtime/reference-time/` | Binding its value during composition |
| Graph revision and adaptation ID reading | `flows/executable/version/`, `flows/executable/adaptation/` | Published run history, judged-build-trial receipts and repository writes |
| Region compilation and execution-neutral validation | `flows/executable/regions/`, `flows/executable/validation/` | Policy-specific adaptation helper and project validation |
| Declarative DSL and source parsing | `flows/executable/dsl/` | Studio artifact stamping and code-owned project source updates |
| Model transport, credentials binding, request/response accounting, provider retries, model limits | Focused `runtime/models/` subareas | Build intent, draft decisions, editor feedback and project-context selection |
| Generic tool-calling agent protocol and loop | `runtime/agents/` | Studio's Flow authoring tool set and build workflow policy |

The test is responsibility, not whether a filename currently mentions Studio.
Retries, recovery frames, permission enforcement, trace privacy and record
capture remain framework behavior. Repository-backed editing and persistence
remain program behavior. A host adapter owns browser/DOM/selector meaning.

## First implementation: node pack and its exact external edges

This group was sent to the lead before the report finished; the node worker is
already assigned it. Keep its paths disjoint from the next engine worker.

1. Move `nodes/**` except `importer-sdk.ts` to
   `components/automation/**`, moving colocated tests with their subjects.
   The new barrel excludes the retained SDK. The old node barrel exports the
   canonical pack plus the retained SDK; old internal paths may be thin facades.
2. Move `model/action-consequences/**` (six production files and barrel) into
   `components/automation/action-effect/consequences/**`. Its implementation
   is self-contained. Old consequence paths reexport canonical definitions.
3. Extract `AutomationStudioFlowScope` from `model/flows.ts` into
   `flows/executable/scope.ts`, leaving a reexport. Move
   `model/validation/issue.ts` to `flows/executable/validation/issue.ts`;
   it has no imports and holds the shared issue/result DTOs and functions.
4. `nodes/routine/approval.ts` has the only remaining external value edge:
   `automationStudioAskEffect`. Move its constant and tiny builder from
   `runtime/parking/ask-effect.ts` into `runtime/interaction/effect.ts`.
   Keep the parser/completion behavior in parking until the parking move.
5. Put ask input/options/routes/control/kind/status DTO authority in
   `runtime/interaction/request.ts`. Current parking ask types derive from
   `conversations/ask.ts`; invert that direction so Studio's persisted
   conversation row refers to runtime-owned ask DTOs. Move
   `runtime/action-permissions/request.ts` and its consequence reexport to
   `runtime/action-permissions/`. Preserve all schema strings and field names.
6. `importer-sdk.ts` remains a Studio adapter for now. Its fingerprint matcher
   is concretely web-shaped, not a generic node requirement. Its node registry,
   definition and execution-result imports change to canonical components.

Direct external node imports verified: `definitions.ts` and
`canonical-registry.ts` use scope; `definitions.ts` uses validation issue/result;
`action-effect/{combine,definition,read-resolved,resolved}.ts` use consequences;
`routine/approval.ts` uses the ask builder; only `importer-sdk.ts` uses the
fingerprint matcher. Nodes have no direct source dependency on the executor.

## Next implementation: executable graph and complete execution engine

Assign one worker the following old/new paths, excluding the node worker's
`flows/executable/{scope.ts,validation/**}`, `runtime/interaction/**` and
`runtime/action-permissions/**`. The lead owns package exports, root barrels,
audit configuration and authored architecture documents.

### Contract cut

Create `flows/executable/{graph,node,edge,interface,variable,error,defaults}.ts`
and focused `regions`, `composite`, `version`, `adaptation` directories.

- `ExecutableGraph` needs `flowId`, `nodes`, `edges`, optional `metadata`;
  existing complete Studio documents are structurally assignable.
- A richer executable Flow contract adds interface/errors/variables, regions,
  region handoffs, execution defaults and scope. It does not require project ID,
  authoring timestamps, publication history or legacy owner fields.
- Extract node/edge definitions from `model/artifacts.ts`; leave Studio artifact
  contracts in place and have them refer to the canonical definitions.
- Extract interface/value type/error/variable/default contract declarations from
  `model/flows.ts`. Serialize exactly the current fields. Coordinate this file
  serially after the node worker's scope extraction finishes.
- Extract call target/binding/configuration DTOs from `model/composites.ts`;
  retain publication creation/history/project projection in Studio.
- Move `model/regions.ts` validation and region contracts to executable regions.
- Extract the two executor-used DTOs from `model/flow-adaptation.ts`:
  `AutomationStudioFlowRunHandlerExecutionRecord` and
  `AutomationStudioFlowRunStateRouteNoMatchCause`, including their immediate
  DTO dependencies. Keep adaptation history and repository-facing artifacts.
- The engine imports four recovery budget defaults from `model/flows.ts`;
  move their authority into `engine/automation/recovery/defaults.ts` and make
  old model exports point there only after concurrent scope edits finish.
- Engine options currently use `AutomationStudioNativeLogEntry` from the SDK.
  Move that execution log DTO to `runtime/automation-host/log.ts`; Studio's SDK
  reexports it, avoiding an engine dependency on the retained SDK.

### Physical implementation moves

Move all `runtime/executor/**` and its colocated tests to
`engine/automation/**`. Keep `runtime/executor.ts` and old private paths as
compatibility facades where existing importers/tests still need them. Preserve
the graph runner, resume entry points, retry floors, target reacquisition,
privacy treatment and result statuses.

Move these closed execution support groups with it:

- `runtime/host-runtime.ts` -> `runtime/automation-host/boundary.ts`.
- `runtime/runtime-repeat/**` -> `runtime/repeat/**` (13 implementation
  modules plus barrel/tests at the inspected graph closure).
- `runtime/reference-now/**` -> `runtime/reference-time/**`.
- `runtime/composite-execution/{boundary,child-bounds}.ts` ->
  `engine/automation/composite/`; leave repository snapshot resolution outside.
- `runtime/flow-version/{contracts,flow-graph-version}.ts` ->
  `flows/executable/version/`; do not move its judged-build-trial tree.
- `runtime/flow-change/node-adaptation/{contracts,ids}.ts` ->
  `flows/executable/adaptation/`.
- `runtime/route-state/observe.ts` and
  `runtime/route-state/signatures/{effect,host,node,value}.ts` ->
  `runtime/automation-host/route-state/`; these delegate domain meaning to host
  ports. Do not pull route-state authoring/draft writers into the runtime.
- Parking implementation: `answer.ts`, `ask.ts`, `ask-effect.ts` parser portion,
  `parked-run.ts`, `permission-ask.ts`, `port.ts`, `settlement.ts` ->
  `runtime/parking/`; consume the node worker's interaction/request authority.
  `conversation-port.ts` stays Studio. Split person-needed waiting mechanics
  from web wording: execution emits an intervention request; the host supplies
  its user message/control label rather than Core hardcoding a page/robot check.
- `runtime/run-control/types.ts` is a generic pause/checkpoint port; move it to
  `runtime/automation-host/control.ts`, retaining Studio command handlers.
- `runtime/project-agents/host-resources/types.ts` is the generic resource lease
  port; move it to `runtime/automation-host/resources.ts`. The scheduler and
  project plan are a later separate capability group.

### Edges requiring inversion rather than a larger blind move

1. **Host/executor type cycle:** `host-runtime.ts` imports lifecycle fact types,
   bound/source/unbound reacquisition DTOs from executor. Move those DTO
   declarations into `runtime/automation-host/contracts/`; executor imports
   them. The host boundary must not import `engine/automation`, even as a type.
2. **Activity:** graph runner and collaborators import 20+ activity functions.
   Separate hub/context/structured execution activity into `runtime/activity`.
   Project cards and human wording stay Studio UI adapters. Add a small runtime
   activity port for presentation calls still needed by the engine; Studio's
   compatibility runner binds it. Prefer an explicit per-run port or scoped
   per-run context over a process-global callback registry. Pure graph execution
   with no presentation port must still run successfully. Never pull activity's
   project-card/flow-draft dependency closure into the engine.
3. **Legacy optional-step label heuristic:**
   `executor/step-skip/act-not-done.ts` imports
   `flow-bootstrap/instructed-acts/kind-words.ts` and
   `llm/model-facing/control-words.ts`. The latter reads browser-shaped
   `parameters.element/target/fingerprint`. Canonical action-effect metadata is
   already the primary authority. Put remaining legacy interpretation behind
   an optional host classifier; web owns the old page/control interpretation.
   Keep the conservative result and retry safety when no classifier is bound.
4. **Composite contracts:** executor frames accept an entire
   `AutomationStudioFlowArtifact` although they need its executable interface,
   errors, regions, defaults and graph only. Narrow that input; Studio's
   repository-backed source can return its full artifact structurally.
5. **Model settings:** do not import `model/index.ts` from the new engine.
   That barrel reexports publication, fixtures and other program concerns.
   Import only canonical executable contracts and runtime defaults.

## DSL migration after the execution seam is stable

`dsl/compiler.ts` currently constructs a persisted Studio artifact (projectId,
source, publication, createdAt/updatedAt), validates it, checks registry/dependency
pins, compiles regions and digests it. Separate those responsibilities:

- `flows/executable/dsl` owns definition, dependency pins, normalized executable
  plan, pure validation, source parsing and generation.
- Studio compiler facade adds/stamps its persistence envelope and invokes the
  executable compiler. Preserve the current digest contract; changing which
  fields participate in a digest needs a versioned migration and is outside
  this ownership move.
- `runtime/region-compiler.ts` splits: neutral region compilation goes to
  executable regions; `adaptPolicyGraphToPolicyRegion` stays a Studio adapter.
- Generated TypeScript currently imports `fluxiq/automation-studio/dsl`.
  Existing source must continue to compile. New canonical generation may use
  `fluxiq/flows/executable/dsl` after that explicit public export exists.

## Model/provider and agent infrastructure follow-on

Do not leave transport/pricing/accounting under Studio just because its first
consumer was the Studio build loop. Inspect and move `runtime/llm/{anthropic,
deepseek,models,model-limits,provider-retry,provider-factories}` into focused
`runtime/models/{providers,catalog,limits,retry}` groups, splitting Studio tool
schemas/prompts out of provider transports before moving them. Host-injected
credentials and provider contracts belong to runtime; policy for selecting an
authoring model and Studio's prompts/tool descriptions belong to its authoring
adapter. No provider logic belongs downstream.

Separate `runtime/llm/evidence-loop` into a generic tool-calling execution
protocol/loop under `runtime/agents` and a Studio authoring adapter defining the
Flow draft, its tools and completion/repair phases. Preserve the build-whole,
test-once, repair-from-failing-step invariant; do not treat loop behavior as
UI merely because its events are visible in the panel. Exact provider/agent
closure requires a dedicated next brief; the executor walk above does not
establish that closure and no worker should move all `llm` as one directory.

## Public API and mechanical acceptance

Lead adds canonical browser-safe `fluxiq/components/automation`,
`fluxiq/flows/executable` and Node engine `fluxiq/engine/automation` exports.
Keep all existing `fluxiq/automation-studio*` exports resolving forward.
Do not export the Node engine from a browser-safe component barrel. Update
browser bundle entry allowlists/tsconfig paths with those new explicit exports.

Enforce no imports from canonical `flows/executable`, `components/automation`,
`engine/automation` and new runtime capability areas into
`programs/automation-studio`, including type edges. Also enforce no runtime
imports from flows into engine and no runtime host port imports into engine.
Retain the existing import-cycle/browser-import guards and add public entry
compatibility tests that load old and new exports and assert function/class
identity. Typecheck assignability between old artifact/host signatures and new
executable ports. Keep serialized golden fixtures/digest tests unchanged.

Move behavior tests beside their new implementation. Keep only compatibility
tests under Studio. Update explicit contract-test paths in
`scripts/task/contract/list.mjs`, quality configs and any browser entry fixtures
when their tests move. No full suite is needed for each group.

Required narrow commands after implementation:

- `pnpm --filter fluxiq check`
- `pnpm --filter fluxiq exec vitest run src/components/automation`
- `pnpm --filter fluxiq exec vitest run src/engine/automation`
- Focused legacy facade, DSL round-trip/digest, retry, target reacquisition,
  state routing, parked/resume, handler/frame and withholding tests.
- `pnpm structure:check` and the task tool's mandatory contract tests.
- Lead rebuilds Core before downstream typecheck and its direct graph-run/node
  integration tests; browser bundle build checks the neutral node entry.

## Validation and limitations

Read-only inspection completed using `Get-Content`, `rg` and TypeScript-AST
probes through inline Node scripts. Source counts, named imported symbols,
direct external edges, the rich graph runner, host/runtime options, DSL
compiler, model artifact contracts and node/parking dependencies were inspected.
No source changes, git actions, test suite, paid run or panel launch occurred.
Some guessed exploratory filenames did not exist; the subsequent symbol/path
searches found the actual definitions listed above. No success claim depends
on those missing reads. The migration acceptance checks above remain to run
against implementation. Provider/agent and all downstream browser closure are
not claimed verified by this report.

# Runtime Ownership

Core owns every executable capability. Automation Studio is a controller program: it registers the endpoints a person's client calls and calls the framework to do the work. It holds no execution, authoring, verification, persistence or orchestration of its own.

| Owner | Responsibility |
| --- | --- |
| `flows/executable` | Rich graph, node/edge, interface, region, composite and execution DTOs without a project persistence envelope |
| `components/automation` | Neutral node definitions, registry, action effects and consequences, processing and parameter contracts |
| `engine/automation` | Graph/node execution, frames, lifecycle, state routing, retries, target reacquisition, trace privacy and resume |
| `runtime/automation-host` | Domain host ports, execution facts, resource/control contracts and opaque domain observations |
| `runtime/interaction`, `runtime/action-permissions`, `runtime/parking` | Questions, permission request contracts, parked-run carry and settlement |
| `runtime/action-permission-requests` | Action consequences, the permission gate, what each action declared, the cross-check against the person's instruction, and the request a run carries to a person |
| `runtime/automation-parking` | Parked-run, ask and permission-ask carry bound to the conversation |
| `runtime/repeat`, `runtime/reference-time` | Repeat observations and a fixed execution reference time |
| `runtime/activity` | Structured runtime activity and scoped presentation ports |
| `runtime/automation-activity` | The live activity stream of a build or run: hub, scope, emitters, the evidence-loop observer and the model's stated reason beside each decision |
| `runtime/conversations` | The conversation thread, its store and writer, how a person's message is read as an instruction, and the capabilities Core runs itself when chat chooses them |
| `runtime/target-matching` | Neutral matching contracts, aggregation and state identity; domain scoring supplied explicitly |
| `runtime/models` | Provider transports, model catalog/limits, usage/pricing, secret-resolution ports and retry/error mechanics |
| `runtime/agents` | Model-call budgets and settlement, scoped allowances, tool-call identity/usage, repeated-state tracking and bounded iteration |
| `runtime/llm` | The Flow-building model loop: harness, evidence loop, decision handlers, repeat guard, purse, model-facing text and provider contracts |
| `runtime/loop-limits` | Round, duration, ending-time and evidence-loop limits for a build |
| `runtime/flow-authoring` | Flow bootstrap, drafts, versions, authored metadata, candidate trials and domain build state |
| `runtime/result-verification`, `runtime/result-control` | Verification of a run's result, the result checks (`result-verification/check-*`) and their authorization, and actionability reads |
| `runtime/adaptation` | Recovery, live patches, Flow change verdicts, adaptation confidence, exploration reduction and training modes |
| `runtime/project-agents` | The supervisor, builders and repair agents, and the build record they share |
| `runtime/recording` | Recording normalization, gateway trace, policy models and the recording controller |
| `runtime/native-nodes`, `runtime/output-dispatch` | The domain implementation bundle and its hooks; preparing an output action for a domain's target |
| `framework/automation-service` | The automation service: the project, Flow, run, recording, dataset and conversation operations every endpoint calls; the executor wiring, node pack and the public `fluxiq/automation` entry |
| `framework/persistence/automation` | Project catalog, canonical stores, schema migrations, indexes, ownership and the state index |
| `api-contracts/automation`, `@fluxiq/contracts/automation` | Endpoint names, request and response contracts, and the browser-safe shared contract |
| `flows/executable/dsl` | Declarative executable Flow source and compilation; the automation service stamps its persistence envelope |
| `flows/authoring` | The authoring model (recordings, evidence, policies, state) and the Flow source language behind `fluxiq/automation-studio/dsl` |
| `programs/automation-studio` | A controller of the framework: `api/` registers each endpoint with its permission and resource and makes one call to the service; `ui/` holds view state; `metadata.ts` and `index.ts` are the catalog entry and the public entry |
| `packages/ui-components` | The chat UI as plain DOM and CSS behind ports; clients supply the transport |

The existing simple `FlowDocument` engine remains compatible. The mature executable graph has a different contract; the ownership move does not convert stored documents or replace its execution behavior with the simpler engine.

A full stored Flow document is structurally assignable to the execution contract. The engine does not require editor timestamps, project storage ownership or publication history to execute a graph; the automation service composes those concerns around framework execution.

Host contracts do not import the engine. No framework area imports Studio, including erased type imports and tests: `importBoundaries` in the structure audit's configuration stops it, and only the program catalog composes Studio. Presentation is supplied per run or scoped context; pure execution can run without a panel.

## Studio is a controller

`packages/fluxiq/src/programs/automation-studio` holds four things and nothing else:

- `api/`: endpoint registration (`handlers.ts` and `handlers/`). A handler names its permission, resource and classification, reads its request, makes one call to the automation service and shapes the reply.
- `ui/`: view-state contracts for the panel.
- `metadata.ts`: the program catalog entry.
- `index.ts`: the entry published as `fluxiq/automation-studio`.

The `program-controllers` rule in `scripts/structure-audit/rules/program-controllers.mjs` enforces it. A source file in the program outside those entries fails the audit, and a function longer than 20 lines is counted and ratcheted, because a handler that long has logic in it that belongs to the framework. The 20 lines is a threshold the audit uses, not a product rule; `register*` functions, which are tables of endpoints, do not count. A new capability goes in the framework area that owns it, even when Studio is its only caller.

Handlers reach the work through the service. Request-shaped operations too large for a handler live in `framework/automation-service/service/`: `flow-bootstrap-requests`, `run-requests`, `conversation-requests`, `flow-instruction-requests` and `flow-settings-requests`.

## Public entries

Automation:

- `fluxiq/automation` and its subpaths (`/nodes`, `/action-effect`, `/actionability`, `/testing`, `/fingerprinting`, `/llm-models`, `/action-permissions`, `/panel-capabilities`, `/candidate-authoring`, `/evidence-build-scope`) are the automation runtime. `fluxiq/automation` is node-only; the browser-safe subpaths are listed in [package boundaries](package-boundaries.md).
- `fluxiq/automation-studio` is only the controller: its endpoints, view state and metadata.
- `fluxiq/automation-studio/dsl` (and `/dsl/generator`) is the Flow source language. It keeps this name because saved Flow source contains that exact import.
- `@fluxiq/contracts/automation` is the shared, browser-safe contract.

Also:

- `fluxiq/components/automation` and `fluxiq/components/automation/action-effect`;
- `fluxiq/flows/executable`;
- `fluxiq/engine/automation`;
- `fluxiq/runtime/target-matching`;
- `fluxiq/runtime/automation-host` for the domain host boundary and execution DTOs;
- `@fluxiq/contracts/runtime` for failure/actionability contracts and strict parsers.
- `@fluxiq/contracts/records` and `@fluxiq/contracts/recording-capture` for data/capture contracts;
- `fluxiq/runtime/models` and `fluxiq/runtime/agents` for generic model-backed execution;
- `fluxiq/flows/executable/dsl` for declarative executable compilation.

Exported names keep the `AutomationStudio` prefix, whichever area defines them. Schema discriminators, graph fields and stored target payloads are the same in every area.

The rich executor owns retry floors, lasting-act uncertainty protection, stale-source reacquisition, lifecycle handling, record withholding and partial-run behavior. The service may bind a presentation/classification adapter while domains provide their concrete host behavior.

`captureStateSnapshot` returns a captured reference or
`{ kind: "unavailable", reason: "unsupported_node" }` for a node the host does not observe.
Actual capture failures remain errors with sanitized diagnostics. A host that declines a node returns
the explicit unsupported result rather than throwing. Execution preserves the original
host object and its method receivers; classification is a separate per-run option.

## Web boundary

Core owns matching interfaces and generic confidence policy. The web domain owns selector/XPath/tag/class/attribute comparisons, browser URL interpretation, DOM candidates and calibrated web weights. The extension executes browser actions and supplies live candidates; the domain provides web adapters and recording mappings. Core never imports downstream modules.

A registered domain matcher is used consistently for importer implementations, target resolvers and recording mappers. Output dispatch without a matcher preserves unresolved targeting for host resolution and reports `unresolved_no_matcher`; it does not select using partial neutral scores.

The fingerprint factory (`fluxiq/automation/fingerprinting`) is a neutral matcher. Callers needing web scoring register the web domain's matcher, which the downstream extension does. Serialized browser fields are opaque data in Core.

### Hooks on the implementation bundle

Web semantics reach Core only through hooks on the domain's implementation bundle (`AutomationStudioImporterImplementationBundle`, in `framework/automation-service/nodes/importer-sdk.ts`). The domain supplies each one when it registers its bundle with its native runtime (`runtime/native-nodes`). Core calls them and reads no browser field itself.

The native runtime holds the hooks per domain (`getTargetHooks`) and refuses a second, different hook for a domain before registering anything. So a hook must be a stable value, as a module constant is. No hook is a process-wide setting.

| Hook | What the domain says with it | With none |
| --- | --- | --- |
| `outputTargetPreparer` | Reads an output action's target and prepares it for dispatch. The contracts and the matcher call are in `runtime/output-dispatch`, published as `fluxiq/runtime/output-dispatch/preparation` | An element output refuses dispatch (`output.target_preparer_missing`) |
| `recordingEntryTargetPreparer` | Projects the target data of a recorded action entry as it is stored | The entry is stored as it came |
| `recordingTargetPolicy` | Checks the target data a recording carries | A recording is validated for structure only |
| `recordingCandidateParameterNormalizer` | Normalizes the parameters a mapper binding reads | Parameters pass through unread |
| `llmEvidenceSummary` | Reads the page text the model's step log records for a tool step. Handed to each loop as `stepLogPageText`, and never able to change what a model is sent | The step writes no `page.txt` |
| `recordedStepReader` | Says what a recorded entry means, for the build model's account of a recording: which entries are no step, the control's name, role and identifying words, and whether it holds a secret. Core keeps the order, the undoing, the bounds and two screens every reading passes through: `SENSITIVE`, a generic rule over the identifying words, and `cleanLabel`, which drops an address, an email or a long number | **Fails closed:** every step is withheld and only counted, and the model sees `steps: []` |
| `controlWordsReader` | Lists a control's own words from a node's parameters, for what a model is told about it, and says when those words are the value the step reads. Core collapses and screens them (`runtime/llm/model-facing/control-text.ts`) | **Fails closed:** a model is told no name for a control. A legacy step with a structured parameter is read as lasting rather than risk repeating it, and the explored-on-absorbed finding is not said, because it cannot be measured |
| `controlParameterKeys` | Names the parameters that name the control a step acts on, for a checked rerun of a done lasting act | **Fails closed:** every parameter counts as naming the control, so any new value is refused as another control |
| `activityControlReader` | Reads the control a step carries for the activity stream: its names in order of preference, and plain widget words for what it is | A card says its verb alone ("Clicking on the page"). Words for the chat only, never for a model |
| `stateElementKindReader` | Names a recorded state path the domain never declared, by the domain's own words. Asked before Core's neutral words | Core's neutral words decide. A kind only ranks a path, so nothing is screened less |

### How a hook reaches its reader

Where the caller knows the domain, it asks `getTargetHooks` and passes the hook as an argument or a loop input: `recordedStepReader`, `stateElementKindReader` and `controlParameterKeys`, the last through the build's loops and the recovery ports.

`activityControlReader` and `controlWordsReader` are asked for far below anything that knows a domain: by the executor, a state route, a script check, a trial's feedback and a result's check. They travel in the async context, as the activity presentation does (`runtime/domain-readings`). A run, a build and a trial each enter their own domain's readings, and a host seam that works outside them (`automationStudioProjectSingleSubflowRebuild`) takes them as input.

- **Each unit of work holds exactly its own domain's.** Entering replaces what is in scope and never falls back to it, so work for a domain with none reads none, even when started from inside another's.
- **Two runs cannot see each other's.** `framework/automation-service/tests/domain-hooks/tests/activity-control-hook.test.ts` runs two services with different readers in flight at once.
- **The cost.** An entry that forgets to enter them gets the closed side silently, rather than an error. Add a new entry that runs a Flow or a script check to the list above.

### What Core still spells, and why

`scripts/structure-audit/rules/web-vocabulary.mjs` holds all of Core's non-test source to a browser's field names and notations, as names, as whole strings and inside regular expressions. A new reader fails the build. What may stay is listed under `domainReadingExceptions` in `scripts/structure-audit/config.mjs`, each with its terms and reason, and an entry that no longer holds its terms fails too, so the list can only shrink. The groups are:

- **Safety screens that only deny.** `runtime/llm/screening/locator-text.ts` screens address notation out of text on its way to a provider. It takes no hook, because it must apply whether or not a domain is bound, and it still spells web tokens in its patterns: a neutral pattern would change what a model is sent, and a shorter one would screen less. The recovery context's forbidden keys and the secret-name screens are the same kind.
- **Core's target scoring.** `runtime/target-matching/` scores `visibleText`, `accessibleName`, `testId` and `queryPath` by neutral default weights a domain may replace (t842).
- **Passive types and carried fields.** `flows/authoring/model/action-element-target.ts` and the `selector` a contract carries unread.
- **`StateElementKind`'s `selector`.** A published enum member a domain declares. Core ranks it and never decides a path is one.
- **A host's reported strategy.** `service/summaries/host-target-resolution.ts` admits a closed list into a run record. Moving it needs a design: its only caller is a pure conversion that also runs when a stored run is read back, with no domain in hand.
- **A person's account password.** Credentials, not a control's field.

`element` and `target` as parameter names are not on the audit's list: the rule's header records them as Core's own nouns. `engine/automation/target-reacquire/lineage.ts`, `runtime/adaptation/live-patch/failed-action.ts` and the authoring synonyms name those parameters and read no field inside them.

## Distribution

The packages are `fluxiq@0.27.0`, `@fluxiq/contracts@0.7.0` and `@fluxiq/ui-components@0.1.0`. Downstream consumers rebuild against the matching Core version before compiling against these subpaths.

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

Web semantics reach Core only through hooks on the domain's implementation bundle (`runtime/native-nodes`, the importer SDK in `framework/automation-service/nodes`). A domain registers them with its native runtime; Core calls them and reads no browser field itself.

| Hook | What the domain does with it |
| --- | --- |
| `outputTargetPreparer` | Reads an output action's target and prepares it for dispatch. An element output refuses dispatch without one (`output.target_preparer_missing`). The contracts and the matcher call are in `runtime/output-dispatch`, published as `fluxiq/runtime/output-dispatch/preparation` |
| `recordingEntryTargetPreparer`, `recordingTargetPolicy` | Project and validate the target of a recorded entry; without a policy a recording is validated for structure only |
| `recordingCandidateParameterNormalizer` | Normalizes the parameters a mapper binding reads |
| `llmEvidenceSummary` | Reads the page text the model's step log records for a tool step |

The native runtime holds the hooks per domain and refuses a second, different hook for a domain before registering anything. The step log's evidence summary is a process-wide registry, so a second domain in one process is asked in registration order.

### Browser fields Core still reads

Five Core readers still interpret browser fields. They are known open work, not part of the boundary:

| File | What it reads |
| --- | --- |
| `framework/automation-service/service/instruction-led/recording-steps.ts` | `implicitRole`, password and autocomplete attributes and element names, to word and withhold recorded steps |
| `runtime/automation-activity/wording/action.ts` | `label`, `accessibleName` and `visibleText`, for activity card names |
| `framework/automation-service/service/evidence/state-elements.ts` | Classifies state paths by words such as `selector` and `testid` |
| `runtime/llm/node-tools/rerun-check.ts` | `TARGET_KEYS`: `target`, `selector`, `element` |
| `runtime/llm/screening/locator-text.ts` | Screens CSS and XPath shapes out of text; screening, not interpretation |

`runtime/target-matching/matcher.ts` scores `visibleText` and `queryPath` with neutral default weights.

## Distribution

The packages are `fluxiq@0.27.0`, `@fluxiq/contracts@0.7.0` and `@fluxiq/ui-components@0.1.0`. Downstream consumers rebuild against the matching Core version before compiling against these subpaths.

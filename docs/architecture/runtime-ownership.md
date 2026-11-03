# Runtime Ownership

Core separates executable capabilities from the Automation Studio program that edits and persists projects.

| Owner | Responsibility |
| --- | --- |
| `flows/executable` | Rich graph, node/edge, interface, region, composite and execution DTOs without a project persistence envelope |
| `components/automation` | Neutral node definitions, registry, action effects and consequences, processing and parameter contracts |
| `engine/automation` | Graph/node execution, frames, lifecycle, state routing, retries, target reacquisition, trace privacy and resume |
| `runtime/automation-host` | Domain host ports, execution facts, resource/control contracts and opaque domain observations |
| `runtime/interaction`, `runtime/action-permissions`, `runtime/parking` | Questions, permission request contracts, parked-run carry and settlement |
| `runtime/repeat`, `runtime/reference-time` | Repeat observations and a fixed execution reference time |
| `runtime/activity` | Structured runtime activity and scoped presentation ports |
| `runtime/target-matching` | Neutral matching contracts, aggregation and state identity; domain scoring supplied explicitly |
| `runtime/models` | Provider transports, model catalog/limits, usage/pricing, secret-resolution ports and retry/error mechanics |
| `runtime/agents` | Model-call budgets and settlement, scoped allowances, tool-call identity/usage, repeated-state tracking and bounded iteration |
| `flows/executable/dsl` | Declarative executable Flow source and compilation; Studio stamps its persistence envelope |
| `programs/automation-studio` | Project/editor APIs, persistence, publication and repository-backed resolution, authoring workflow composition, conversation and presentation adapters |

The existing simple `FlowDocument` engine remains compatible. The mature executable graph has a different contract; the ownership move does not convert stored documents or replace its execution behavior with the simpler engine.

A full Studio document is structurally assignable to the execution contract. The engine does not require editor timestamps, project storage ownership or publication history to execute a graph. Studio composes those concerns around framework execution.

Host contracts do not import the engine. The engine and framework-owned contracts do not import Studio, including erased type imports. The structure audit enforces these boundaries. Presentation is supplied per run or scoped context; pure execution can run without a panel.

## Public API migration

New consumers use:

- `fluxiq/components/automation` and `fluxiq/components/automation/action-effect`;
- `fluxiq/flows/executable`;
- `fluxiq/engine/automation`;
- `fluxiq/runtime/target-matching`;
- `fluxiq/runtime/automation-host` for the domain host boundary and execution DTOs;
- `@fluxiq/contracts/runtime` for failure/actionability contracts and strict parsers.
- `@fluxiq/contracts/records` and `@fluxiq/contracts/recording-capture` for data/capture contracts;
- `fluxiq/runtime/models` and `fluxiq/runtime/agents` for generic model-backed execution;
- `fluxiq/flows/executable/dsl` for declarative executable compilation.

Legacy `fluxiq/automation` entry points retain their exported names and delegate toward framework owners. Existing Studio-prefixed symbols remain compatible during this ownership migration. Schema discriminators, graph fields and stored target payloads remain unchanged.

The rich executor preserves retry floors, lasting-act uncertainty protection, stale-source reacquisition, lifecycle handling, record withholding and partial-run behavior. Studio composition may bind its legacy presentation/classification adapter while domains provide their concrete host behavior.

`captureStateSnapshot` returns a captured reference or
`{ kind: "unavailable", reason: "unsupported_node" }` for a node the host does not observe.
Actual capture failures remain errors with sanitized diagnostics. Hosts that previously threw to
decline a node must return the explicit unsupported result. Execution preserves the original
host object and its method receivers; compatibility classification is a separate per-run option.

## Web boundary

Core owns matching interfaces and generic confidence policy. The web domain owns selector/XPath/tag/class/attribute comparisons, browser URL interpretation, DOM candidates and calibrated web weights. The extension executes browser actions and supplies live candidates; the domain provides web adapters and recording mappings. Core never imports downstream modules.

A registered domain matcher is used consistently for importer implementations, target resolvers and recording mappers. Output dispatch without a matcher preserves unresolved targeting for host resolution and reports `unresolved_no_matcher`; it does not select using partial neutral scores.

The legacy fingerprint factory is retained as a neutral matcher compatibility API. Callers needing historical web scoring register the web domain's matcher; the downstream extension already uses that implementation. Legacy serialized browser fields remain opaque compatibility data in Core.

## Distribution

This additive public API and ownership migration sets the next package versions to `fluxiq@0.26.0` and `@fluxiq/contracts@0.6.0`. Publication is separate from this refactor. Downstream consumers must rebuild against the matching Core version before compiling against canonical subpaths.

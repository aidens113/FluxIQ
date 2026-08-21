# Runtime Kernel Plan

Status: working document  
Created: 2026-08-20  
Scope: FluxIQ core runtime architecture, direct-import host runtimes, websocket
runtime transport, Automation Studio execution integration, and the
`F:\!FluxIQWebExtension` repository as the first validation target.

This plan is framework-level. FluxIQ core remains public, domain-neutral, and
modular. Importing repositories own domain-specific runtime behavior,
recording semantics, output adapters, native node implementations, and client
capabilities.

## Purpose

FluxIQ already has several runtime-shaped pieces:

- global program services and a shared web runtime;
- direct-import host registration through `FluxIQ.create(...)`;
- an Automation Studio graph executor;
- trusted-local native node support;
- a client gateway with pairing and websocket transport;
- importer-owned domain IO and recording-domain registration.

Those pieces work, but they do not yet form one explicit runtime kernel. The
next step is to define a core runtime layer that can dispatch work through the
same contracts whether the executor is:

- directly imported into the host process;
- bound as trusted-local importer code;
- connected through websocket;
- later connected through another transport such as worker, queue, remote HTTP,
  or process isolation.

The first proving ground is the Chrome extension in
`F:\!FluxIQWebExtension`, because it already speaks FluxIQ's websocket gateway,
registers a web automation domain through direct imports, records browser
events, executes browser actions, and returns action results.

## Current Inventory

### Global Program Runtime

`packages/fluxiq/src/programs/_shared/runtime.ts` currently defines
`GlobalProgramRuntime` and `createGlobalProgramRuntime(...)`. It composes:

- `GlobalProgramApiRegistry`;
- `AutomationStudioService`;
- `ClientGatewayService`;
- `AutomationStudioClientGatewayBridge`;
- background tasks;
- compute control;
- database manager;
- deployment sync;
- docs;
- identity access;
- production runner.

This is the closest current concept to a host runtime. It is service
composition rather than a runtime kernel. It wires services together but does
not own a generic run/session/client/command lifecycle.

### Public Host API

`packages/fluxiq/src/framework/index.ts` exposes the public `FluxIQ` class.
The constructor:

- resolves host paths and `.fluxiq` layout;
- creates the global program runtime;
- binds Automation Studio to the IO registry;
- optionally binds `AutomationStudioNativeNodeRuntime`;
- binds the Automation Studio client-gateway bridge to the IO registry;
- registers importer domains and IO.

This is the direct-import entry point importing repositories use today. It
should remain the primary host API, but it needs a runtime-facing extension
surface instead of requiring callers to reach into individual program services.

### Program API Registry

`GlobalProgramApiRegistry` provides a typed-enough, permission-gated program
API call surface. It already models:

- actor/session permissions;
- program ID and endpoint;
- scoped requests;
- consistent error responses.

Runtime APIs should be registered here rather than introduced as an unrelated
control plane.

### Client Gateway

`packages/fluxiq/src/client-gateway/service.ts` owns:

- paired client sessions;
- trusted client persistence;
- operator approval flow;
- client capability updates;
- client state updates;
- recording events;
- snapshots;
- server action command dispatch;
- action-result correlation;
- audit log.

This is a transport/session service, not the whole runtime. It should remain
focused on client trust, pairing, and JSON message flow. A runtime transport
adapter should sit above it.

### WebSocket Client Package

`packages/client-gateway-websocket` provides:

- `FluxIQClientGatewayWebSocketClient`;
- typed message construction/parsing;
- token storage callbacks;
- pairing/session events;
- low-level typed `send(...)`;
- an Automation Studio facade for recording methods.

This package is browser/client-safe and should stay domain-neutral. It is the
client half of the websocket runtime transport.

### Web Runtime Host

`apps/web/src/lib/fluxiq.ts` owns the shared web-panel runtime. It:

- creates a `FluxIQ` instance;
- loads an importing host module through `FLUXIQ_HOST_MODULE`;
- starts the client gateway websocket server;
- exposes runtime status;
- tracks web-panel Automation Studio project context for paired clients.

This already proves that an importing repo can augment the global runtime
without core importing domain code.

### Automation Studio Executor

Automation Studio has several runtime pieces:

- `runAutomationStudioGraph(...)` executes graph documents;
- graph options accept `effectDispatcher`;
- graph options accept `nativeNodeExecutor`;
- canonical Flow execution supports nested composite Flow calls;
- region compilation enforces deterministic/trigger/policy boundaries;
- traces record node attempts, effects, child traces, logs, and policy
  decisions.

The executor is a strong kernel candidate, but it currently executes one
Automation Studio concern. It does not own generic runtime clients, sessions,
runs, dispatches, leases, or transport selection.

### Trusted-Local Native Runtime

`AutomationStudioNativeNodeRuntime` lets a host explicitly register importer
manifests and implementation bundles. It enforces:

- manifest/bundle identity matching;
- declared implementation presence;
- grants and capability checks;
- timeout and cooperative cancellation;
- output boundary validation;
- redacted logs.

This should remain an implementation adapter under the runtime model. It is
trusted-local Node.js, not a sandbox.

### Runtime Model Types

`packages/fluxiq/src/programs/automation-studio/model/runtime.ts` defines
runtime action attempts and runtime sessions, but these types are Automation
Studio-specific and are not yet wired into a general runtime service.

### Chrome Extension Validation Repo

`F:\!FluxIQWebExtension` currently has two important surfaces:

- `domain/` registers web automation domain facts, IO, recording events, and
  host integration.
- `apps/extension/` connects through websocket, records browser/page events,
  reports browser state, receives action commands, executes them in content
  scripts, and returns action results.

This is the right validation target because it exercises both desired paths:

- direct import: domain registration into `FluxIQ`;
- websocket: extension runtime client connected to core.

## Current Problems

### Runtime Is Implied Rather Than Explicit

FluxIQ has a global program runtime, client gateway, Automation Studio runtime
executor, and native node runtime. None of them is the one place that answers:

- what runtime clients exist;
- what capabilities are available;
- where a command should run;
- what run is active;
- how cancellation works;
- how websocket and direct import compare;
- how runtime traces are persisted and queried.

### WebSocket Clients Are Not First-Class Runtime Workers

The client gateway knows sessions and action commands, but a paired websocket
client is not represented as a generic runtime worker. Automation Studio can
bridge to it, but the concept is specific and not reusable enough.

### Direct Import And WebSocket Use Different Shapes

Direct-import hosts register domains, IO, and native node runtimes. Websocket
clients send gateway messages. These are currently parallel integration styles
rather than two transports implementing a common runtime adapter contract.

### Runtime Control Is Spread Across Programs

Automation Studio, client gateway, production runner, background tasks, and
compute control each have runtime/control concepts. A core runtime kernel can
coordinate shared concerns without collapsing those programs into one large
service.

### Traces Exist But Runtime Runs Are Not Centralized

Automation Studio traces are strong, but there is no generic durable runtime
run model for:

- command dispatch attempts;
- runtime client selection;
- transport events;
- cancellation and timeout results;
- linked Automation Studio run traces;
- runtime audit events.

## Target Principles

1. FluxIQ core owns runtime contracts, lifecycle, dispatch, permissions,
   traces, and transport abstractions.
2. Importing repositories own domain behavior, action semantics, state
   reducers, output adapters, recording mappers, native code, and client-side
   execution.
3. Direct import and websocket are peer runtime paths.
4. The client gateway remains a transport/session service, not the runtime
   kernel itself.
5. Automation Studio executes through the runtime kernel for external effects.
6. Runtime contracts are JSON-safe across transport boundaries.
7. Direct-import adapters may use richer TypeScript types locally, but must
   declare a serializable boundary.
8. Runtime clients advertise capabilities. Core dispatches only through
   registered, authorized capabilities.
9. Runtime execution is observable: every run, command, result, cancellation,
   timeout, and selected client is traceable.
10. Trusted-local code remains explicitly trusted-local and is not described as
    sandboxed.

## Target Architecture

```text
FluxIQ host
  |
  |- RuntimeService
  |    |- clients and sessions
  |    |- adapters and transports
  |    |- capability registry
  |    |- run lifecycle
  |    |- command dispatch
  |    |- cancellation and timeout
  |    |- event stream
  |    `- runtime traces/audit
  |
  |- Direct runtime adapters
  |    |- importer-owned trusted code
  |    |- native node runtime
  |    `- host process capabilities
  |
  |- WebSocket runtime transport
  |    |- ClientGatewayService
  |    |- paired browser extension
  |    |- desktop recorder / worker / custom clients
  |    `- JSON message protocol
  |
  `- Automation Studio
       |- graph executor
       |- Flow runtime sessions
       |- policy output dispatch
       |- state/confirmation waits
       `- execution traces
```

Runtime dispatch path:

```text
Flow node/effect
  -> RuntimeService.dispatch(...)
  -> capability and permission resolution
  -> direct adapter or websocket transport
  -> runtime command attempt
  -> runtime result/event stream
  -> Automation Studio trace/result
```

## Core Runtime Contracts

Add a new core runtime module, likely:

```text
packages/fluxiq/src/runtime/
  contracts.ts
  service.ts
  direct-adapter.ts
  client-gateway-transport.ts
  storage.ts
  index.ts
```

The public package export should expose `fluxiq/runtime` through the existing
package export strategy.

### Runtime Identity

```ts
type FluxIQRuntimeId = string;
type FluxIQRuntimeClientId = string;
type FluxIQRuntimeSessionId = string;
type FluxIQRuntimeRunId = string;
type FluxIQRuntimeCommandId = string;
```

IDs are opaque outside the creating service. They should be stable enough for
trace references and logs but callers must not parse them.

### Runtime Capability

```ts
type FluxIQRuntimeCapability = {
  id: string;
  label?: string;
  kind:
    | "recording"
    | "snapshot"
    | "action"
    | "state"
    | "flow"
    | "native-node"
    | "runtime"
    | "custom";
  domainId?: string | null;
  actionTypes?: string[];
  inputIds?: string[];
  outputIds?: string[];
  metadata?: JsonObject;
};
```

Capabilities are factual declarations. They do not grant permission by
themselves. Core checks actor permission, host grants, domain scope, and runtime
adapter availability separately.

### Runtime Client

```ts
type FluxIQRuntimeClient = {
  clientId: string;
  sessionId?: string;
  label: string;
  transport: "direct" | "websocket" | "native" | "worker" | "custom";
  status: "available" | "pairing_required" | "ready" | "busy" | "offline";
  domainId?: string | null;
  capabilities: FluxIQRuntimeCapability[];
  connectedAt?: number;
  lastSeenAt?: number;
  metadata?: JsonObject;
};
```

For websocket clients, this is projected from `ClientGatewaySession`. For
direct adapters, this is projected from adapter registration.

### Runtime Command

```ts
type FluxIQRuntimeCommand = {
  commandId?: string;
  kind: "execute_action" | "capture_snapshot" | "read_state" | "run_flow" | "custom";
  domainId?: string | null;
  capabilityId?: string;
  actionType?: string;
  inputId?: string;
  outputId?: string;
  parameters?: JsonObject;
  target?: JsonObject;
  timeoutMs?: number;
  metadata?: JsonObject;
};
```

The command contract is transport-neutral. A websocket transport can translate
`execute_action` to `server.execute_action`; a direct adapter can execute a
function in-process.

### Runtime Result

```ts
type FluxIQRuntimeCommandResult = {
  commandId: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "rejected" | "unknown";
  startedAt?: number;
  completedAt?: number;
  message?: string;
  payload?: JsonObject;
  target?: JsonObject;
  error?: string;
  metadata?: JsonObject;
};
```

This should adapt cleanly to the existing `ClientGatewayActionResult`.

### Runtime Adapter

```ts
type FluxIQRuntimeAdapter = {
  adapterId: string;
  label: string;
  transport: "direct" | "native" | "worker" | "custom";
  domainId?: string | null;
  capabilities(): Promise<FluxIQRuntimeCapability[]> | FluxIQRuntimeCapability[];
  canExecute?(command: FluxIQRuntimeCommand): Promise<boolean> | boolean;
  execute(command: FluxIQRuntimeCommand, context: FluxIQRuntimeExecutionContext):
    Promise<FluxIQRuntimeCommandResult> | FluxIQRuntimeCommandResult;
  captureSnapshot?(command: FluxIQRuntimeCommand, context: FluxIQRuntimeExecutionContext):
    Promise<FluxIQRuntimeCommandResult> | FluxIQRuntimeCommandResult;
  readState?(command: FluxIQRuntimeCommand, context: FluxIQRuntimeExecutionContext):
    Promise<FluxIQRuntimeCommandResult> | FluxIQRuntimeCommandResult;
};
```

### Runtime Transport

```ts
type FluxIQRuntimeTransport = {
  transportId: string;
  label: string;
  kind: "websocket" | "worker" | "remote" | "custom";
  clients(): FluxIQRuntimeClient[];
  dispatch(command: FluxIQRuntimeCommand, context: FluxIQRuntimeDispatchContext):
    Promise<FluxIQRuntimeCommandResult>;
  onEvent(handler: (event: FluxIQRuntimeEvent) => void | Promise<void>): () => void;
};
```

`ClientGatewayRuntimeTransport` should implement this interface by wrapping
`ClientGatewayService`.

### Runtime Run

```ts
type FluxIQRuntimeRun = {
  schemaVersion: "0.1";
  runId: string;
  projectId?: string | null;
  domainId?: string | null;
  targetKind: "flow" | "node" | "command" | "recording" | "custom";
  targetId: string;
  status: "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  selectedClientId?: string;
  selectedSessionId?: string;
  transport?: string;
  commandIds: string[];
  traceRef?: string;
  metadata?: JsonObject;
};
```

Runtime runs should link to Automation Studio traces when the target is a Flow,
but should not be limited to Automation Studio.

### Runtime Event

```ts
type FluxIQRuntimeEvent =
  | { type: "client.connected"; client: FluxIQRuntimeClient }
  | { type: "client.ready"; client: FluxIQRuntimeClient }
  | { type: "client.disconnected"; client: FluxIQRuntimeClient }
  | { type: "run.queued"; run: FluxIQRuntimeRun }
  | { type: "run.started"; run: FluxIQRuntimeRun }
  | { type: "run.finished"; run: FluxIQRuntimeRun }
  | { type: "command.dispatched"; runId?: string; command: FluxIQRuntimeCommand }
  | { type: "command.result"; runId?: string; result: FluxIQRuntimeCommandResult }
  | { type: "state.update"; client: FluxIQRuntimeClient; payload: JsonObject }
  | { type: "snapshot"; client: FluxIQRuntimeClient; payload: JsonObject }
  | { type: "recording.event"; client: FluxIQRuntimeClient; payload: JsonObject }
  | { type: "runtime.error"; message: string; metadata?: JsonObject };
```

## Runtime Service Responsibilities

`RuntimeService` owns the framework runtime lifecycle:

- register and list direct adapters;
- register and list transports;
- project transport clients into runtime clients;
- collect runtime capabilities;
- resolve dispatch targets;
- create and update runtime runs;
- create command attempts;
- enforce timeouts and cancellation;
- emit runtime events;
- expose snapshots;
- persist summaries and traces through a storage adapter;
- expose program API handlers.

It should not:

- implement domain action behavior;
- know browser DOM details;
- load importer code by scanning files;
- bypass IO output registration;
- bypass identity or program permissions;
- replace the existing client pairing flow.

## Dispatch Selection

Dispatch selection should be deterministic and explainable.

Inputs:

- requested domain ID;
- requested action type, output ID, input ID, or capability ID;
- actor permissions;
- project/runtime scope;
- available direct adapters;
- available websocket clients;
- command metadata such as preferred client/session;
- active recording/run context.

Selection order:

1. Explicit requested session/client when valid and authorized.
2. Direct adapter explicitly bound for the requested capability.
3. Ready websocket client with matching domain/capability.
4. Other transport-advertised client with matching capability.
5. Clear failure with a diagnostic listing missing capability, denied scope, or
   unavailable clients.

Selection must record:

- candidate clients/adapters considered;
- selected transport/client;
- rejection reason when no target exists;
- timeout/cancel reason when execution does not complete.

## Direct Import Runtime Path

Importing repositories should be able to register runtime behavior directly:

```ts
import { FluxIQ } from "fluxiq";
import type { FluxIQRuntimeAdapter } from "fluxiq/runtime";

const adapter: FluxIQRuntimeAdapter = {
  adapterId: "web-automation.local",
  label: "Local web automation runtime",
  transport: "direct",
  domainId: "web-automation",
  capabilities: () => [{
    id: "web.actions",
    kind: "action",
    domainId: "web-automation",
    actionTypes: ["web.dom.click", "web.dom.type"]
  }],
  execute: async (command) => {
    return {
      commandId: command.commandId ?? "local-command",
      status: "succeeded",
      payload: {}
    };
  }
};

export function registerFluxIQHost(fluxiq: FluxIQ): void {
  fluxiq.runtime.registerAdapter(adapter);
}
```

The public `FluxIQ` class should expose a stable runtime property or method:

```ts
fluxiq.runtime.registerAdapter(...);
fluxiq.runtime.registerTransport(...);
fluxiq.runtime.snapshot();
```

This can delegate to `fluxiq.programs.runtime` internally, but host code should
not need to know the private program-service layout.

## WebSocket Runtime Path

The websocket path should reuse existing client gateway infrastructure.

Server-side adapter:

```text
ClientGatewayService
  -> ClientGatewayRuntimeTransport
  -> RuntimeService
```

Mapping:

| Runtime concept | Client gateway concept |
| --- | --- |
| runtime client | `ClientGatewaySession` |
| capability | `ClientGatewayCapability` |
| dispatch action | `server.execute_action` |
| capture snapshot | `server.capture_snapshot` |
| state event | `client.state_update` |
| recording event | `client.recording_event` |
| snapshot event | `client.snapshot` |
| command result | `client.action_result` |
| ready/offline status | session status |

The client package should remain generic. Browser-extension logic stays in the
importing repo.

## Automation Studio Integration

Automation Studio should use `RuntimeService` at three boundaries.

### Output Dispatch

`policy.output.dispatch` effects should route through runtime dispatch.

Flow:

```text
builtin.policy.action
  -> effectDispatcher
  -> RuntimeService.dispatch({ kind: "execute_action", outputId, ... })
  -> IO output adapter / runtime target
  -> result
  -> graph trace
```

The existing IO output verification remains required. Runtime dispatch does
not allow arbitrary action execution outside registered outputs.

### Native Node Execution

`AutomationStudioNativeNodeRuntime` should be represented as a direct runtime
adapter or runtime implementation provider. It keeps its existing trust model
and boundary checks.

### Runtime Sessions And Traces

When a Flow run starts, Automation Studio should create or attach a
`FluxIQRuntimeRun`. The Automation Studio graph trace remains the detailed
Flow trace. The runtime run records the cross-cutting execution envelope:

- selected runtime client/adapter;
- dispatched commands;
- command attempts;
- timeouts/cancellations;
- final status;
- trace reference.

## Storage

Runtime state should start with a small file-backed store consistent with the
current project-file direction.

Suggested layout:

```text
.fluxiq/
  data/
    programs/
      runtime/
        clients.json
        audit.jsonl
  artifacts/
    runtime/
      indexes/
        runs.json
      runs/
        <runId>/
          run.json
          commands.jsonl
          events.jsonl
          trace.json
```

For Automation Studio project-owned runs, prefer the project runtime folder
from the Automation Studio data-flow plan:

```text
.fluxiq/artifacts/automation-studio/projects/<projectId>/runtime/runs/<runId>/
```

Rules:

- runtime clients/trust stay with the gateway or runtime program data;
- project-specific runs live with the project when a project ID exists;
- command/event logs can be JSONL to support append-friendly writes;
- indexes contain summaries only;
- full traces load on demand;
- runtime memory is a cache.

## Program API

Add runtime endpoints through `GlobalProgramApiRegistry`.

Read endpoints:

- `runtime/snapshot`
- `runtime/list-clients`
- `runtime/list-runs`
- `runtime/get-run`
- `runtime/list-capabilities`

Control endpoints:

- `runtime/dispatch-command`
- `runtime/start-run`
- `runtime/cancel-run`
- `runtime/register-adapter` only if the adapter is data-only; executable
  adapters must be bound through trusted host code, not remote API payloads.

Permissions:

- read endpoints require `programs.read`;
- dispatch, start, cancel, and transport control require `runtime.control`;
- Flow mutation still requires `flows.write` where applicable;
- domain output dispatch must also satisfy IO output registration and domain
  authorization.

## Web Panel Runtime Status

Extend the current runtime status endpoint/model to include:

- runtime ID;
- host root;
- active domain;
- loaded host module;
- runtime client count;
- ready websocket client count;
- direct adapter count;
- capability count;
- active run count;
- last runtime error;
- client gateway status;
- native importer runtime summary.

Do not build a large runtime UI before the kernel contracts settle. A compact
status/debug view is enough for the first slice.

## Chrome Extension Validation Plan

The extension repo is the first proving ground, but core must remain generic.

### Existing Extension Path

The extension already:

- connects to `ws://127.0.0.1:4777/client`;
- sends `client.hello` with web automation capabilities;
- supports pairing and token rotation;
- sends browser state updates;
- sends domain recording events;
- uploads or references visual/state evidence;
- receives `server.execute_action`;
- executes browser actions in content scripts;
- returns `client.action_result`.

### Desired Runtime Validation

Acceptance scenario:

1. Start the FluxIQ web panel against `F:\!FluxIQWebExtension`.
2. Load the host module from the extension domain package.
3. Pair the Chrome extension through the existing approval flow.
4. Open an Automation Studio project.
5. Start a recording from the extension.
6. Capture web automation domain events and browser state.
7. Generate or hand-author a Flow with a web action output.
8. Run the Flow.
9. Automation Studio dispatches the output through `RuntimeService`.
10. Runtime selects the paired extension websocket client.
11. Extension executes the action in the active tab.
12. Runtime records the command attempt and result.
13. Automation Studio trace shows selected client, dispatched command, action
    result, and state/confirmation evidence.

### Extension Repo Responsibilities

The extension repo should continue to own:

- `web-automation` domain manifest;
- domain IO definitions;
- recording event definitions and reducers;
- browser action types and schemas;
- gateway mapping between browser payloads and domain events;
- extension UI/sidepanel behavior;
- content-script DOM execution;
- browser state/snapshot generation.

Core should not copy any of this behavior.

## Non-Goals

- Do not add browser automation code to FluxIQ core.
- Do not add OSRS-specific or private project behavior to FluxIQ core.
- Do not turn trusted-local native runtime into an alleged security sandbox.
- Do not replace the client gateway pairing model.
- Do not execute host/importer code loaded dynamically from arbitrary manifest
  paths.
- Do not make websocket the only runtime path.
- Do not make direct import the only runtime path.
- Do not add a broad runtime UI before the contracts and traces are stable.

## Implementation Phases

### Phase 1: Contracts And Skeleton Service

- Add `packages/fluxiq/src/runtime/contracts.ts`.
- Add in-memory `RuntimeService`.
- Add direct adapter registration.
- Add transport registration.
- Add snapshot and capability listing.
- Export deliberate public runtime contracts.
- Add focused tests for registration, capability projection, and duplicate IDs.

Exit criteria:

- no behavior change for existing programs;
- runtime service can list direct adapters and transport clients;
- contracts are JSON-safe and exported intentionally.

### Phase 2: Runtime Service In Global Runtime

- Add `runtime: RuntimeService` to `GlobalProgramRuntime`.
- Instantiate it in `createGlobalProgramRuntime(...)`.
- Expose `fluxiq.runtime` on the public `FluxIQ` host class.
- Keep `fluxiq.programs.runtime` available as the internal global program
  service.
- Add runtime API handlers for snapshot/list clients/list capabilities.

Exit criteria:

- host modules can register direct runtime adapters;
- web runtime status can report runtime summary;
- existing tests keep passing.

### Phase 3: Client Gateway Runtime Transport

- Implement `ClientGatewayRuntimeTransport`.
- Project paired `ClientGatewaySession` records into runtime clients.
- Map gateway capabilities into runtime capabilities.
- Dispatch `execute_action` to `ClientGatewayService.executeAction(...)`.
- Map action results back into runtime command results.
- Forward state, snapshot, recording, and client lifecycle events into runtime
  events.

Exit criteria:

- a paired extension appears as a ready runtime client;
- dispatching a runtime action command reaches the extension;
- result/timeout/cancellation are traceable.

### Phase 4: Command Attempts And Run Lifecycle

- Add runtime run creation and status transitions.
- Add command attempt records.
- Add timeout and cancellation handling.
- Add event stream subscription.
- Add in-memory tests for success, failure, timeout, cancellation, and no
  matching client.

Exit criteria:

- every dispatch can be tied to a run or standalone command attempt;
- failures explain target-selection decisions;
- cancellation and timeout are deterministic in tests.

### Phase 5: Automation Studio Dispatch Integration

- Replace ad hoc Automation Studio external action dispatch with
  `RuntimeService.dispatch(...)`.
- Keep IO output validation and confirmation semantics intact.
- Attach runtime run IDs and command IDs to graph traces.
- Preserve existing native node behavior, either through an adapter wrapper or
  a clearly separated implementation provider.

Exit criteria:

- policy output dispatch uses runtime service;
- Flow trace includes runtime dispatch metadata;
- registered outputs remain the only executable domain action path.

### Phase 6: Runtime Persistence

- Add file-backed runtime store.
- Persist run summaries and command/event logs.
- Store project-owned Automation Studio runs under the project runtime folder.
- Add `list-runs` and `get-run` APIs.
- Keep full trace/event loading explicit.

Exit criteria:

- runtime runs survive process restart where persistence is configured;
- list APIs read summaries only;
- full run details load on demand.

### Phase 7: Extension Validation Slice

- Run the web panel against `F:\!FluxIQWebExtension`.
- Pair the extension.
- Verify runtime client projection.
- Start/stop recording through existing extension UI.
- Run a Flow action dispatch through runtime service to the extension.
- Verify command result in runtime run and Automation Studio trace.

Exit criteria:

- the extension can be used as a websocket runtime worker;
- no web automation behavior is added to FluxIQ core;
- direct host registration and websocket transport both participate in one
  runtime snapshot.

### Phase 8: Documentation And Cleanup

- Add authored architecture docs for the runtime kernel.
- Update websocket integration docs to describe runtime transport.
- Update importer docs to show direct adapter registration.
- Update generated reference docs.
- Remove or deprecate old duplicated runtime/session types where safe.

Exit criteria:

- docs explain direct import and websocket as peer paths;
- runtime ownership boundaries are clear;
- obsolete wording does not imply the client gateway is the runtime kernel.

## Validation

Core validation:

- `pnpm --filter fluxiq check`
- `pnpm --filter fluxiq test`
- `pnpm --filter fluxiq build`
- `pnpm docs:check`

Web package validation when touching web runtime status or websocket server:

- `pnpm --filter @fluxiq/web check`
- `pnpm --filter @fluxiq/web test`
- `pnpm --filter @fluxiq/web build`

Extension repo validation:

- in `F:\!FluxIQWebExtension`: `pnpm --filter @fluxiq-web-extension/domain check`
- in `F:\!FluxIQWebExtension`: `pnpm --filter @fluxiq-web-extension/domain test`
- in `F:\!FluxIQWebExtension`: `pnpm --filter @fluxiq-web-extension/extension check`
- in `F:\!FluxIQWebExtension`: `pnpm --filter @fluxiq-web-extension/extension build`

Manual validation:

- start the FluxIQ web panel with the extension repo as the importer root;
- pair the Chrome extension;
- verify the runtime snapshot sees the extension as a websocket client;
- record a browser workflow;
- run a Flow that dispatches a web automation output;
- inspect runtime and Automation Studio traces.

Per repository instructions, do not run the web panel for the user. Tell the
user to run it manually with:

```bash
pnpm --filter @fluxiq/web dev
```

## Acceptance Criteria

- Core exposes a domain-neutral runtime service.
- Direct-import adapters and websocket clients share one runtime client and
  capability model.
- The client gateway remains responsible for pairing/trust and is wrapped as a
  runtime transport.
- Automation Studio dispatches external effects through the runtime service.
- Runtime runs and command attempts are observable and testable.
- The Chrome extension can execute a Flow-dispatched browser action through
  the websocket runtime transport.
- Importing repositories can register direct adapters without adding domain
  behavior to FluxIQ core.
- Runtime docs clearly describe ownership boundaries, trust model, direct
  import, and websocket use.

## Open Questions

- Should runtime runs live in the generic runtime artifact root by default, or
  always under an Automation Studio project when project context exists?
- Should runtime command logs be JSONL from the start, or ordinary JSON until
  high-volume streaming requires append optimization?
- Should a direct adapter be allowed to report multiple logical clients, or
  should each adapter map to exactly one runtime client?
- Should websocket client selection prefer the active Automation Studio client
  context, the most recent state update, or explicit user selection?
- How should runtime leases relate to the existing compute-control program?
- Should `ProductionRunnerService` become a runtime consumer, or remain
  separate until Automation Studio dispatch is complete?
- Should runtime event streaming be API polling first, or should the web panel
  get a server-sent/websocket event stream later?

## Immediate Next Steps

1. Done: implement the runtime contracts and in-memory service.
2. Done: register the service in `GlobalProgramRuntime`.
3. Done: expose `fluxiq.runtime` for importing repo host modules.
4. Done: add `ClientGatewayRuntimeTransport`.
5. Done: expose runtime snapshot/status through the runtime program API.
6. Done: route Automation Studio output dispatch through the runtime service.
7. Done: validate automated extension checks against `F:\!FluxIQWebExtension`.
8. Done: add authored runtime architecture docs and refresh generated
   framework reference.

## Implementation Log

This section is updated as implementation steps complete.

| Step | Status | Completed | Notes | Remaining |
| --- | --- | --- | --- | --- |
| Runtime kernel spec | Done | 2026-08-20 | Captured current inventory, target contracts, direct-import path, websocket transport path, Automation Studio integration, validation target, phases, and acceptance criteria. | Begin Phase 1 contracts and in-memory service. |
| Phase 1 contracts and service | Done | 2026-08-20 | Added `fluxiq/runtime` contracts, an in-memory `RuntimeService`, direct adapter/transport registration, runtime snapshots, queued run creation, package exports, and focused tests. Validation passed: `pnpm --filter fluxiq check`; `pnpm --filter fluxiq test -- src/runtime/service.test.ts`. | Begin Phase 2 global runtime wiring and public `FluxIQ.runtime` host API. |
| Phase 2 global runtime wiring | Done | 2026-08-20 | Added the `runtime` global program, read-only runtime API endpoints, `RuntimeService` composition inside `GlobalProgramRuntime`, public `FluxIQ.runtime`, catalog coverage, and host-level API tests. Validation passed: `pnpm --filter fluxiq check`; `pnpm --filter fluxiq test -- src/framework/index.test.ts src/programs/index.test.ts src/runtime/service.test.ts`. | Begin Phase 3 `ClientGatewayRuntimeTransport`. |
| Phase 3 client-gateway transport | Done | 2026-08-20 | Added `ClientGatewayRuntimeTransport`, gateway-session-to-runtime-client projection, capability mapping, websocket action dispatch, snapshot dispatch acknowledgement, gateway event forwarding, default global transport registration, and focused tests. Validation passed: `pnpm --filter fluxiq check`; `pnpm --filter fluxiq test -- src/runtime src/framework/index.test.ts`. | Begin Phase 4 command attempts and run lifecycle. |
| Phase 4 command attempts and lifecycle | Done | 2026-08-20 | Added `RuntimeService.dispatch(...)`, deterministic direct-adapter/transport target selection, command attempt records, run start/finish transitions, dispatch/result events, timeout and cancellation bounds, rejection diagnostics, and focused tests for success, rejection, timeout, and cancellation. Validation passed: `pnpm --filter fluxiq check`; `pnpm --filter fluxiq test -- src/runtime`. | Begin Phase 5 Automation Studio dispatch integration. |
| Phase 5 Automation Studio dispatch integration | Done | 2026-08-20 | Added runtime-aware policy output dispatch, `AutomationStudioService.bindRuntimeService(...)`, default global binding, output-ID capability matching, IO fallback when runtime has no matching target, runtime command metadata in node outputs, and tests preserving registered-output safety. Validation passed: `pnpm --filter fluxiq check`; `pnpm --filter fluxiq test -- src/programs/automation-studio/runtime/io-bridge.test.ts src/runtime`. | Begin Phase 6 runtime persistence and run APIs. |
| Phase 6 runtime persistence and APIs | Done | 2026-08-20 | Added `RuntimeStore`, `FileRuntimeStore`, runtime startup loading, queued write persistence for runs and command attempts, `runtime/list-runs`, `runtime/get-run`, default `.fluxiq/artifacts/runtime` storage wiring, and restart/API tests. Validation passed: `pnpm --filter fluxiq check`; `pnpm --filter fluxiq test -- src/runtime src/framework/index.test.ts`. | Begin Phase 7 extension repository validation. |
| Phase 7 extension repository validation | Automated validation done | 2026-08-20 | Verified the Chrome extension test ground still compiles and builds against the new core runtime contracts. Validation passed in `F:\!FluxIQWebExtension`: `pnpm --filter @fluxiq-web-extension/domain check`; `pnpm --filter @fluxiq-web-extension/domain test`; `pnpm --filter @fluxiq-web-extension/extension check`; `pnpm --filter @fluxiq-web-extension/extension build`. | Manual web-panel pairing/action dispatch validation remains operator-run because repository instructions say not to run the web panel for the user. Begin Phase 8 docs/reference cleanup. |
| Phase 8 docs and final validation | Done | 2026-08-20 | Added authored runtime architecture documentation at `docs/architecture/runtime-kernel.md`, linked it from docs indexes, documented the client gateway as the websocket runtime transport, refreshed generated framework reference docs, and updated the permission matrix for the new global runtime program. Validation passed: `pnpm docs:check`; `pnpm build`; `pnpm check`; `pnpm test`; plus the Phase 7 extension repository checks. | Manual web-panel pairing/action dispatch validation remains operator-run per repository instruction: run `pnpm --filter @fluxiq/web dev` locally when ready to test the browser pairing flow. |
| Live extension hookup CJS import fix | Done | 2026-08-20 | The extension web-panel host bundle was failing with `ERR_PACKAGE_PATH_NOT_EXPORTED` while loading `fluxiq/runtime` from CommonJS. The extension runtime service now relies on core's default `client-gateway` runtime transport and keeps `fluxiq/runtime` as type-only, then the host bundle was rebuilt. Validation passed in `F:\!FluxIQWebExtension`: `pnpm --filter @fluxiq-web-extension/domain check`; `pnpm --filter @fluxiq-web-extension/domain host:build`; `pnpm --filter @fluxiq-web-extension/domain test`; `pnpm --filter @fluxiq-web-extension/extension build`; `rg "fluxiq/runtime" domain\dist\host\web-panel-host.cjs` returned no matches. | Restart the web panel process so it reloads the rebuilt host module, then retry pairing/snapshot. |

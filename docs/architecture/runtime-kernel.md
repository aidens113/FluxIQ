# Runtime Kernel

FluxIQ's runtime kernel is the domain-neutral control layer for runtime
clients, capabilities, command dispatch, run lifecycle, and runtime traces. It
does not implement domain behavior. Importing repositories provide domain IO,
recording reducers, native implementations, direct adapters, and websocket
clients.

## Responsibilities

The runtime kernel owns:

- runtime adapter and transport registration;
- runtime client and capability snapshots;
- command dispatch through direct adapters or transports;
- command attempts, run status, timeout, cancellation, and result events;
- file-backed runtime run and command-attempt persistence;
- read-only global program APIs for snapshots, clients, capabilities, and runs.

It does not own:

- browser automation, scraping, or content-script behavior;
- domain action payload semantics;
- importer recording mappers or reducers;
- trusted-local implementation loading from arbitrary manifests;
- client pairing and credential rotation.

Client pairing remains owned by the client gateway. The runtime kernel wraps
the paired gateway sessions as websocket runtime clients.

## Direct Import Path

Host modules can register direct runtime adapters through the public
`FluxIQ.runtime` surface:

```ts
import type { FluxIQ } from "fluxiq";

export function registerFluxIQHost(fluxiq: FluxIQ): void {
  fluxiq.runtime.registerAdapter({
    adapterId: "example.direct",
    label: "Example Direct Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{
      id: "example.actions",
      kind: "action",
      domainId: "example",
      outputIds: ["example.activate"]
    }],
    execute: (command) => ({
      commandId: command.commandId ?? "command.example",
      status: "succeeded",
      payload: { outputId: command.outputId ?? null }
    })
  });
}
```

Direct adapters are trusted host code. They are appropriate for importer-owned
logic already trusted at the same level as the importing application. They are
not a sandbox for untrusted packages.

## WebSocket Transport Path

The global runtime includes a `ClientGatewayRuntimeTransport` by default. It
projects paired `ClientGatewayService` sessions into runtime clients and maps:

| Runtime | Client gateway |
| --- | --- |
| runtime client | paired gateway session |
| runtime capability | client capability |
| `execute_action` command | `server.execute_action` |
| snapshot command | `server.capture_snapshot` |
| state event | `client.state_update` |
| snapshot event | `client.snapshot` |
| recording event | `client.recording_event` |
| command result | `client.action_result` |

The transport only dispatches to ready paired sessions whose advertised
capabilities match the requested domain, action type, output ID, input ID, or
capability ID.

## Automation Studio Integration

Automation Studio still requires registered IO outputs for executable policy
actions. Runtime dispatch is layered behind that safety gate.

When a `policy.output.dispatch` effect runs:

1. Automation Studio verifies the output ID is registered for the active IO
   domain.
2. If a runtime adapter or transport advertises a matching output/action
   capability, Automation Studio dispatches through `RuntimeService`.
3. If no runtime target advertises that capability, Automation Studio falls
   back to the existing IO output adapter.
4. Optional action-role input confirmation remains an IO wait and is never
   reclassified as policy state.
5. Node outputs include the runtime command ID and runtime status when runtime
   dispatch handled the command.
6. The command's `status` and any `failure` record reach the node result and
   the attempt trace: a valid host-reported record is kept, a `timed_out`
   command becomes a `timeout` failure, and a `rejected` command becomes
   `blocked_by_capability_or_policy`. IO output adapters report the same through
   the optional `status` and `failure` fields of `OutputDispatchResult`.

This keeps the framework's output-native policy model intact while allowing
websocket clients and direct adapters to participate in one dispatch path.

## Command Deadlines

A command's `timeoutMs` is the time its target is given to do the work, and
`ClientGatewayRuntimeTransport` sends it to the client unchanged. A target that
honours it answers with its own timeout, and its own failure record, once that
time runs out, and that answer still has to come back. So both deadlines that
wait on an answer add `COMMAND_ANSWER_MARGIN_MS`, 3,000 ms, defined once in
`client-gateway/service/command-answer-margin.ts`:

- **`RuntimeService`** resolves a command with a positive `timeoutMs` as
  `timed_out` only after `timeoutMs` plus the margin. This holds for every
  adapter and transport target. An in-process adapter's work is bounded by its
  timeout anyway, so for one the margin only delays a hung adapter's failure.
- **The client gateway's pending command** waits `timeoutMs` plus the margin
  when the command carries a timeout. A command without one waits
  `commandTimeoutMs`, 30,000 ms by default.

An answer that arrives inside the margin is reported as the target sent it: its
status, message, and failure record. A `timed_out` result from either deadline
means the target never answered, and Automation Studio names it
`output_dispatch.timed_out`.

## Persistence

Runtime runs and command attempts use `FileRuntimeStore` when host paths are
available. The default global location is:

```text
.fluxiq/artifacts/runtime/
  indexes/runtime.json
  runs/<runId>/run.json
  command-attempts/<attemptId>/attempt.json
```

Runtime memory is a cache. A new `RuntimeService` with the same store reloads
known runs and command attempts before serving snapshots.

A command attempt withholds the values its caller marks as withheld. The
dispatch context's optional `withheldValues` (`{ texts, numbers }`) tells the
runtime that a value is withheld, never why. When the attempt is built, each
withheld text is replaced by `FLUXIQ_RUNTIME_WITHHELD_VALUE` (`[withheld]`)
wherever it appears in `command.parameters`, and a parameter number equal to a
withheld number becomes the marker. When the attempt settles, the same text rule
applies to `result.message`, `result.error`, and the attempt's `message`. Every
key and every other value stays, so the attempt in memory, in snapshots, and in
`attempt.json` is the same. The adapter or transport executes the command as
given and is never handed the list. Automation Studio's runtime dispatcher
passes every value its run has resolved out of a parameter state binding, which
the run trace also withholds. `command.metadata`,
`result.payload`, `result.failure`, and `result.metadata` are kept as built or
returned. Attempts saved before this rule are not rewritten.

## Program APIs

The `runtime` global program currently exposes:

- `snapshot`
- `list-clients`
- `list-capabilities`
- `list-runs`
- `get-run`

Read endpoints require `programs.read`. Future control endpoints for dispatch
or cancellation should require `runtime.control`.

## Validation Target

The first integration target is the Chrome extension repository at
`F:\!FluxIQWebExtension`. That repo owns the `web-automation` domain, browser
action schemas, gateway mapping, side panel, background service worker, and
content-script execution. FluxIQ core only sees the domain IO registration and
the paired websocket client's advertised runtime capabilities.

# Automation Studio Client Gateway

[Back to the Automation Studio overview](../automation-studio.md)


Automation Studio can also receive evidence and dispatch actions through the
global client gateway. This is the framework-side boundary for any
WebSocket-capable recorder or action executor. Browser extensions are one
client type, but the protocol is deliberately generic so desktop recorders,
CLI workers, mobile clients, and importer-owned automation clients can connect
without importing FluxIQ directly.

The reusable gateway lives under `packages/fluxiq/src/client-gateway/`:

- `contracts.ts` defines the versioned JSON protocol, client capabilities,
  session records, pairing challenges, audit entries, and a socket interface
  that hosts can back with any WebSocket implementation.
- `service.ts` separates transient socket sessions from persisted trusted-client
  identities. It owns approval references, hashed rotating credentials,
  expiry/revocation, outbound messages, command/result correlation, timeouts,
  heartbeat messages, and gateway events.
- `@fluxiq/client-gateway-websocket` is a small typed client package for
  WebSocket-capable recorders. It re-exports the same protocol types as
  `fluxiq/client-gateway` and the same Automation Studio recording request
  types as `fluxiq/automation-studio`. Its Automation Studio facade mirrors
  direct-import method params such as `createRecording`,
  `appendRecordingEvent`, `appendRecordingDomainEvent`, and
  `finalizeRecording`, but implements them by sending websocket messages. The
  package is split into transport, message helpers, Automation Studio facade,
  and shared types so the public `index.ts` stays an export doorway rather than
  the implementation.

Automation Studio consumes the gateway through
`packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts`.
The bridge converts client messages into canonical Studio artifacts:

- `client.recording_event` is accepted only when its `domainId` and `eventType`
  match a registered `RecordingDomainDefinition`; accepted events become
  `domain_event` timeline entries and may derive observations, state deltas,
  and state checkpoints.
- `client.state_update` and `client.snapshot` become `observation`
  timeline entries.
- `client.start_recording` is accepted only when the approving operator has an
  active Automation Studio project context. Context is isolated by operator
  and can be overridden for a specific client. The web runtime publishes that
  context while a project is open. If no matching project is open, the gateway sends
  `server.error` with `recording.project_required` and the web panel surfaces a
  modal instead of silently dropping the client request.
- `server.execute_action` waits for `client.action_result`; resolved action
  results are appended as `action` timeline entries when a client recording is
  active.
- `server.start_recording` and `server.stop_recording` are mirrored to the
  client while the canonical `RecordingSession` remains owned by FluxIQ.

The bridge buffers high-frequency recording timeline writes before persisting
them. State snapshots captured at screenshot cadence are flushed in bounded
batches and are synchronously drained before recording finalization, so Stop
Recording does not wait on one read/append/write cycle per frame. The bridge
does not drain the snapshot queue before ingesting a `client.recording_event`;
actions and domain events are accepted immediately, while adjacent state remains
correlated by timestamp, sequence, snapshot ID, or correlation ID.

Raw recording data remains complete, but full `client.state_snapshot` payloads
are stored as recording-owned project objects when object storage is enabled.
The timeline observation keeps a lightweight `payload.stateRef` plus metadata,
and `get-recording` hydrates the referenced `StateSnapshot` only when the full
recording is opened.
When the web panel initiates stop, the bridge also allows a short post-stop
drain window before finalization. This gives websocket clients time to send
their final action-adjacent screenshots or state observations after receiving
`server.stop_recording`, so the finalized recording timeline is complete when
the user later opens the Proposal Generator.

While a recording is active, Core updates in-memory state and cheap recording
index counts instead of rewriting the full screenshot-heavy recording document
for every append batch. Finalization writes the full recording and event
timeline once. Stop/finalize API responses return recording summaries; clients
should call `get-recording` only when they need the full raw timeline.

Project refreshes should request recording summaries
instead of full recording sessions. Summaries include IDs, timestamps, status,
and event/note counts without replaying screenshot-heavy timeline entries.
Views that need the raw timeline or State View source data load the selected
recording through `get-recording`.
The client gateway view must not generate proposals automatically after stop.
The workspace-level gateway monitor refreshes the finalized recording once,
opens or keeps the timeline available, and lets the manual `Generate Proposal`
action open the Proposal Generator. No proposal artifact exists until
generation has actually been requested.

The protocol starts with:

```text
client.hello
server.pairing_required
web panel approve
server.session_ready
```

Paired clients can then send generic state updates, snapshots, recording events, action
results, and errors. FluxIQ can send start/stop recording, capture snapshot,
set active tab, ping, disconnect, and execute action commands. Every message is
versioned JSON with an ID and timestamp; action commands include a command ID
so results can be correlated.

The web app starts a concrete WebSocket listener from the shared
`apps/web/src/lib/fluxiq.ts` runtime singleton when
`FLUXIQ_CLIENT_GATEWAY_ENABLED` is not `false`. The default development
endpoint is:

```text
ws://127.0.0.1:4777/client
```

`apps/web/src/server/client-gateway-websocket.ts` owns the dependency-free Node
WebSocket adapter. It accepts upgrade requests, validates configured origins,
attaches sockets to `ClientGatewayService.connect()`, forwards incoming text
frames to `receiveRaw()`, and relies on the service to serialize outbound
messages through the provided socket. Startup is intentionally bound to
`getFluxIQ()` rather than an independent instrumentation runtime so app API
routes and the WebSocket listener share the same in-memory gateway sessions.

Importing repositories or production hosts can still provide their own socket
adapter. The framework package only requires a `ClientGatewaySocket` with
`send()` and optional `close()` methods.

Automation Studio exposes framework API endpoints for the editor:

- `client-gateway-snapshot`
- `revoke-client-trust`
- `start-client-recording`
- `stop-client-recording`
- `capture-client-snapshot`
- `execute-client-action`

The web shell exposes global client-gateway endpoints:

- `GET /api/client-gateway/snapshot`
- `POST /api/client-gateway/approve-pairing`
- `POST /api/client-gateway/dismiss-pairing`

Start/stop recording and action execution are privileged operations and use
shared PIN authorization. Client-initiated pairing requests can create pending
display references without PIN because the client still cannot pair until a
signed-in web-panel user approves the request.

The initial UI is the `Connected Clients` inner-window view. It lists paired
sessions, starts/stops recordings, queues snapshots, and sends test actions
using client-declared action capabilities. Pairing itself is globalized at the
web-panel shell through `/api/client-gateway/snapshot`, so a request can pop up
from any signed-in page or program instead of requiring Automation Studio to be
open. Closing or dismissing the pairing modal calls
`/api/client-gateway/dismiss-pairing` and removes the pending challenge from
the gateway, so dismissed requests do not reappear after a browser refresh.
Approving the modal calls `/api/client-gateway/approve-pairing`; the client
then receives `server.session_ready` with its client credential. Raw
credentials are never included in session snapshots. The Client Gateway view
lists safe trust metadata and lets a PIN-authorized operator revoke access.

Extension/client connection flow:

1. Start the web app with `pnpm --filter @fluxiq/web dev`.
2. Sign in to the FluxIQ web panel.
3. Click connect in the extension and connect it to `FLUXIQ_PUBLIC_CLIENT_WS_URL` or the default
   `ws://127.0.0.1:4777/client`.
4. The extension sends `client.hello` with the client type, name, capabilities,
   and any saved trusted-client credential.
5. If FluxIQ replies with `server.pairing_required`, the global web-panel shell
   shows a modal with Approve and Reject controls. The modal displays the same
   reference code sent to the client so the user can verify the right client is
   being approved.
6. If the user approves, FluxIQ pairs the waiting socket directly.
7. Replace the saved token with every token returned by
   `server.session_ready`; reconnect consumes and rotates it. The persisted
   trust record is bound to the approving operator and stable `clientId`, while
   each socket connection receives a new session ID.
8. Stream `client.state_update`, `client.snapshot`,
   `client.recording_event`, `client.action_result`, and `client.error` as
   appropriate. Execute incoming `server.execute_action`,
   `server.start_recording`, `server.stop_recording`, and
   `server.capture_snapshot` commands according to the declared client
   capabilities.

For framework-side smoke testing without the real extension, run:

```bash
pnpm --filter @fluxiq/web mock:client
```

The mock client will print the reference code it receives and then wait for
approval from the web panel.

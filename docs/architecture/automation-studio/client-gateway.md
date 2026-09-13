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
  context while a project is open — on load, on a project or flow change, on
  focus, and on every visibility change, never on a timer — and clears it when
  the page closes. If no matching project is open, the gateway sends
  `server.error` with `recording.project_required` and the web panel surfaces a
  modal instead of silently dropping the client request. The same code answers a
  context older than `AUTOMATION_STUDIO_CONTEXT_LEASE_MS`, which bounds a Studio
  page that vanished without clearing its context rather than expiring the
  operator's decision; `activeProjectId` in the refusal metadata separates a
  lapsed context from no project at all.
- `server.execute_action` waits for `client.action_result`; resolved action
  results are appended as `action` timeline entries when a client recording is
  active. A result may carry a structured `failure` record. The runtime
  transport keeps it on the command result and on the `command.result` runtime
  event only when `parseAutomationStudioFailureRecord` accepts it.
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

Once a recording is finalized it is immutable, so a message that arrives after
that cannot be kept. The bridge does not discard one in silence. Every
discarded `client.recording_event` and `client.recording_entry` is counted
against the recording it was meant for and written to the gateway audit log,
which the Connected Clients view already surfaces:

- `recording.action_discarded` is recorded for *every* discarded message that
  would have become an executable action entry. Each one is a piece of the
  user's work the client believes it recorded and Core does not have.
- `recording.event_discarded` is recorded *once* per closed recording for
  discarded evidence. A page unloading after Stop legitimately emits a trail of
  observations, and an entry per event would teach the reader to ignore all of
  them. Later evidence discards are counted instead, and the running
  `discardedEvents` and `discardedActions` totals ride on the metadata of the
  next entry written for that recording.

The same accounting covers the moment between finalization and the bridge
closing the recording. Stop finalizes the recording in the service before the
bridge forgets it, so a message arriving in between still finds the recording
open and the service refuses its append. That applies to a
`client.recording_event`, a `client.state_update`, the marker for a
`client.error`, and a queued `client.recording_entry` or `client.snapshot`
whose flush lands late, whether a timer or a caller started the flush. The
service's refusal carries no code, so the bridge recognises it by re-reading the
recording's `endedAt` and reports the message as discarded, attributed to that
recording. Letting the refusal escape would fail the gateway receive, and the
WebSocket host would answer with a `server.error` coded
`gateway.receive_failed`, which a client is entitled to read as a failed
connection. Any other append failure still fails the receive. Snapshots and
state updates that arrive after the recording is closed are dropped without
being counted.

Both entries carry the recording ID, the project, the event type, the input ID,
and how long after finalization the message arrived. Nothing is sent back to
the client. `server.error` is the only wire frame the gateway has for this, and
a client is entitled to read one as a failed connection, so telling a recorder
that its action was lost needs a protocol addition rather than a reused error
code.

There is no push notification that a recording has been finalized. A consumer
that must not read a recording before it is closed polls `get-recording` or
`list-recordings` for `endedAt`. Finalization is the last write the bridge
makes — it runs after the post-stop drain and after the queued appends are
flushed — and appends are refused once it has happened, so a recording that
reports `endedAt` is complete and will not change.

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
lists safe trust metadata and lets a PIN-authorized operator revoke access. The Connected Clients view also exposes Approve and Reject beside every pending reference, using the same global endpoints as the shell modal. Snapshot polling runs only while the view is active, rejects stale responses, and uses a five-second interval. Start/stop recording, action testing, and trust revocation open command-specific PIN-only authorization dialogs after the command is chosen; no shared always-visible credential field is used.

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

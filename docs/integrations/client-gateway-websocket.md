# Client Gateway WebSocket Integration

FluxIQ exposes a global WebSocket client gateway for browser extensions,
recorders, workers, and other clients that can speak JSON over WebSockets.
Automation Studio can use connected clients for recordings, snapshots, and
actions, but pairing is global to the signed-in web panel.

## Development Endpoint

Start the web panel:

```bash
pnpm --filter @fluxiq/web dev
```

The default client WebSocket endpoint is:

```text
ws://127.0.0.1:4777/client
```

The endpoint can be configured with:

```bash
FLUXIQ_CLIENT_GATEWAY_ENABLED=true
FLUXIQ_CLIENT_GATEWAY_HOST=127.0.0.1
FLUXIQ_CLIENT_GATEWAY_PORT=4777
FLUXIQ_CLIENT_GATEWAY_PATH=/client
FLUXIQ_CLIENT_GATEWAY_TRUST_TTL_MS=2592000000
FLUXIQ_PUBLIC_CLIENT_WS_URL=ws://127.0.0.1:4777/client
FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS=chrome-extension://your-extension-id,moz-extension://your-extension-id
```

Loopback listeners may omit an origin allowlist for native and extension
development. A listener bound to `0.0.0.0`, a LAN address, or another
non-loopback host will refuse to start unless
`FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS` is a restrictive list; `*` is not
accepted for those listeners.

## Approval Flow

Pairing is an approval flow, not a code-entry flow.

1. User signs into the FluxIQ web panel.
2. Client opens the WebSocket connection.
3. Client sends `client.hello`.
4. FluxIQ replies with `server.pairing_required` and a `referenceCode`.
5. Client displays that reference code to the user.
6. The web panel shows a global modal with the same reference code.
7. User clicks **Approve** or **Reject** in the web panel.
8. If approved, FluxIQ sends `server.session_ready` to the waiting socket.
9. Client replaces its saved token with the returned token and includes it in
   the next `client.hello` message.

Approval creates a trusted-client identity bound to the approving operator and
the stable `clientId`; it does not make the current socket durable. FluxIQ
persists only a SHA-256 digest of the 256-bit credential. The raw token is sent
only to the client.

The user should only compare the reference code. They do not type it into the
client.

## Client Hello

```json
{
  "id": "message-1",
  "type": "client.hello",
  "protocolVersion": "0.1",
  "timestamp": 1785560378159,
  "payload": {
    "clientId": "extension-abc",
    "clientType": "extension",
    "name": "FluxIQ Extension Client",
    "version": "0.1.0",
    "capabilities": [
      {
        "id": "sample.actions",
        "label": "Sample actions",
        "kind": "action",
        "actionTypes": ["sample.action", "sample.capture"]
      }
    ]
  }
}
```

For reconnects, include the saved token:

```json
{
  "id": "message-2",
  "type": "client.hello",
  "protocolVersion": "0.1",
  "timestamp": 1785560379000,
  "payload": {
    "clientId": "extension-abc",
    "clientType": "extension",
    "name": "FluxIQ Extension Client",
    "token": "saved-session-token"
  }
}
```

## Pairing Required

If the client is not already trusted, FluxIQ responds:

```json
{
  "id": "server-message-1",
  "type": "server.pairing_required",
  "protocolVersion": "0.1",
  "timestamp": 1785560379200,
  "sessionId": "session-id",
  "clientId": "extension-abc",
  "payload": {
    "referenceCode": "482913",
    "reason": "Approve this client in FluxIQ before sending data."
  }
}
```

Display `referenceCode` in the client UI and wait. Do not send the reference
code back to FluxIQ.

## Session Ready

After the user approves the global web-panel modal, FluxIQ sends:

```json
{
  "id": "server-message-2",
  "type": "server.session_ready",
  "protocolVersion": "0.1",
  "timestamp": 1785560381000,
  "sessionId": "session-id",
  "clientId": "extension-abc",
  "payload": {
    "sessionId": "session-id",
    "token": "session-token"
  }
}
```

Always replace the locally saved token with `payload.token`, including after a
successful reconnect. FluxIQ consumes and rotates the credential on every
reconnect, so the previous value stops working. Disconnecting ends the socket
session but does not remove client trust. Trust survives a FluxIQ restart,
expires after 30 days by default, and can be revoked from Automation Studio's
Client Gateway view. Expired, revoked, mismatched, and unknown credentials all
return to the same approval flow.

## Client Messages After Approval

After `server.session_ready`, clients may send:

- `client.capabilities`
- `client.state_update`
- `client.snapshot`
- `client.recording_event`
- `client.action_result`
- `client.error`

FluxIQ may send:

- `server.start_recording`
- `server.stop_recording`
- `server.capture_snapshot`
- `server.execute_action`
- `server.set_active_tab`
- `server.ping`
- `server.disconnect`
- `server.error`

## Typed WebSocket Client Package

Framework clients can use the workspace package. It exposes a low-level gateway
transport and an Automation Studio facade. The facade imports Automation Studio
request types from `fluxiq/automation-studio`, so websocket clients compile
against the same params as direct-import callers.

```ts
import { FluxIQAutomationStudioWebSocketClient } from "@fluxiq/client-gateway-websocket";

const client = new FluxIQAutomationStudioWebSocketClient({
  url: "ws://127.0.0.1:4777/client",
  client: {
    clientId: "extension-abc",
    clientType: "extension",
    name: "Domain Recorder",
    capabilities: [{ id: "recording.events", kind: "recording" }]
  },
  tokenStorage: {
    read: () => localStorage.getItem("fluxiq-client-token") ?? undefined,
    write: (token) => localStorage.setItem("fluxiq-client-token", token)
  }
});

client.on("pairing_required", ({ message }) => {
  console.log("Approve this client in FluxIQ:", message.payload.referenceCode);
});

client.on("session_ready", ({ message }) => {
  console.log("Connected to FluxIQ session:", message.payload.sessionId);
});

await client.connect();
```

The package is split by responsibility:

- `transport.ts`: connection, pairing/session events, token callbacks, and raw
  typed `send(...)`.
- `automation-studio.ts`: websocket-backed wrappers for Automation Studio
  recording methods.
- `messages.ts`: message construction/parsing helpers.
- `types.ts`: websocket constructor/event types.
- `index.ts`: public exports only.

The package exports protocol types from `fluxiq/client-gateway` and recording
request types from `fluxiq/automation-studio`. It does not contain browser,
scraping, or domain-specific automation behavior.

## Domain Recording Events

Domain-specific repositories must register their accepted recording event
contract with Automation Studio before events are recorded. FluxIQ core stays
domain-neutral; the importing domain repo owns event names, payload schemas,
state reducers, and observation extractors.

For a registered FluxIQ IO input, clients may additionally include
`metadata.inputId` on `client.recording_event` or `client.state_update`.
The gateway bridge then routes the payload through the importer's IO adapter
instead of treating it as a raw domain event. An action input with an output
binding becomes an output-native policy candidate; a state input remains a
non-executable observation. The input ID must be registered for the active
recording domain or FluxIQ preserves the normal raw gateway behavior.

Direct import path:

```ts
import { AutomationStudioService } from "fluxiq/automation-studio";

const automationStudio = new AutomationStudioService();

automationStudio.registerRecordingDomain({
  domainId: "example.domain",
  label: "Example Domain",
  schemaVersion: "0.1",
  events: [
    {
      eventType: "value.observed",
      label: "Value observed",
      payloadSchema: {
        type: "object",
        required: true,
        properties: {
          value: { type: "number", required: true, label: "Observed value" }
        }
      },
      stateReducer: ({ event, previousState }) => ({
        state: {
          timestamp: event.timestamp ?? Date.now(),
          namespaces: previousState.namespaces
        }
      })
    }
  ]
});
```

WebSocket path:

```ts
await client.createRecording({
  projectId: "project-id",
  recordingId: "recording-id",
  startedAt: Date.now(),
  initialState: { timestamp: Date.now(), namespaces: {} },
  environment: {
    id: "environment.example",
    label: "Example environment",
    kind: "custom",
    domainId: "example.domain"
  }
});

await client.appendRecordingDomainEvent({
  projectId: "project-id",
  recordingId: "recording-id",
  domainId: "example.domain",
  eventType: "value.observed",
  payload: { value: 42 }
});

await client.finalizeRecording({
  projectId: "project-id",
  recordingId: "recording-id",
  endedAt: Date.now()
});
```

Automation Studio rejects events whose `domainId` is not registered, whose
`eventType` is not allowed by that domain, or whose payload does not match the
registered schema. Accepted events are appended as domain events and can derive
observations, state deltas, and state checkpoints through the registered
reducers.

## Recording Start Sequence

Recording over WebSocket is project-bound.

1. The user opens Automation Studio in the web panel.
2. If a project is open, the web panel heartbeats that active project to the
   shared gateway runtime under the signed-in operator's identity.
3. A paired client calls `createRecording(...)` on
   `FluxIQAutomationStudioWebSocketClient`, which sends `client.start_recording`.
4. FluxIQ resolves an optional operator+client project override first and then
   that operator's default project. It cannot use another operator's context.
   FluxIQ creates the recording there, marks the client session as recording,
   and the web panel opens the recording timeline in the main workspace area.
5. If Automation Studio has no open project, FluxIQ rejects the request,
   sends `server.error` with code `recording.project_required`, and the web
   panel shows a modal telling the user to open a project first.

## Web Panel APIs

The global web shell uses these authenticated endpoints:

- `GET /api/client-gateway/snapshot`
- `POST /api/client-gateway/approve-pairing`
- `POST /api/client-gateway/dismiss-pairing`

Clients do not call these HTTP endpoints. They are for the signed-in web panel.

## Smoke Test

Run:

```bash
pnpm --filter @fluxiq/web mock:client
```

The mock client connects, prints the reference code from
`server.pairing_required`, and waits for approval in the web panel.

## Notes

- The WebSocket listener is bound to the shared web runtime in
  `apps/web/src/lib/fluxiq.ts` so it sees the same in-memory gateway state as
  the web API routes.
- Trusted-client state is stored under the framework program-data area in
  `programs/client-gateway/trusted-clients.json`. This location participates in
  the broader `.fluxiq` storage migration planned separately.
- The Node WebSocket adapter lives at
  `apps/web/src/server/client-gateway-websocket.ts`.
- Hosts can provide their own adapter as long as they attach accepted sockets to
  `ClientGatewayService.connect()` and forward text frames to `receiveRaw()`.

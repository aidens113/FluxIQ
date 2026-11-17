# Client Gateway WebSocket Integration

FluxIQ exposes a global WebSocket client gateway for browser extensions,
recorders, workers, and other clients that can speak JSON over WebSockets.
Automation Studio can use connected clients for recordings, snapshots, and
actions, but pairing is global to the signed-in web panel.

The gateway is also projected into the runtime kernel as a websocket transport.
Paired sessions appear as runtime clients with the capabilities they advertised
in `client.hello`, and runtime `execute_action` commands are delivered as
`server.execute_action` messages. The gateway still owns pairing and trust; the
runtime kernel owns dispatch selection, command attempts, run status, and
runtime traces.

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

With none of the hosted settings below, a `local` install on loopback behaves
as it always has: no Origin allowlist is needed, no hello deadline or rate
limit applies, and the address the socket came from is its peer's.

## Hosted Transport Settings

The transport (`apps/web/src/server/client-gateway-websocket.ts`, its helpers
under `apps/web/src/server/client-gateway-websocket/`) reads these through
`resolveFluxIQDeploymentSettings` (`fluxiq/platform/profile`), which the web
runtime passes to `startClientGatewayWebSocketServer` as `profile`,
`allowedOrigins`, `publicUrl`, `trustProxy` and `limits`:

```bash
FLUXIQ_PROFILE=service                      # local (default) | self-hosted | service
FLUXIQ_PUBLIC_CLIENT_WS_URL=wss://app.example.com/client
FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS=chrome-extension://<id>,moz-extension://*
FLUXIQ_TRUST_PROXY=true                     # only behind a proxy you run
FLUXIQ_CLIENT_GATEWAY_MAX_FRAME_BYTES=16777216
FLUXIQ_CLIENT_GATEWAY_HELLO_DEADLINE_MS=10000
FLUXIQ_CLIENT_GATEWAY_MESSAGES_PER_SECOND=50
FLUXIQ_CLIENT_GATEWAY_MESSAGE_BURST=200
FLUXIQ_CLIENT_GATEWAY_PENDING_PAIRINGS_PER_ADDRESS=5
FLUXIQ_CLIENT_GATEWAY_PENDING_PAIRINGS_TOTAL=1000
FLUXIQ_DRAIN_SECONDS=30
```

The values shown are the `self-hosted` and `service` defaults. The `local`
defaults are a 256 MiB frame cap, no hello deadline, no rate limit, no
per-address pairing cap and 1,000 pending pairings in all. An empty value keeps
the profile's default, and the hello deadline, rate, burst and per-address
pairing cap turn off with `0` or `off`.

### Origin allowlist

Each upgrade's `Origin` is judged by the platform contract's grammar
(`packages/contracts/src/platform/origin/`), not by string equality. An entry
is one of:

- an exact web origin in canonical form, such as `https://app.example.com` or
  `http://127.0.0.1:3000`;
- `chrome-extension://<32 letters a-p>` (Chrome and Edge ids differ, so list
  each);
- `moz-extension://<uuid>`, or `moz-extension://*` for every Firefox install,
  since Firefox gives each install its own id.

`*`, `null`, any other wildcard, a path, query or trailing slash, and any other
scheme are refused. The gateway is **public** under the `service` profile, or
under any profile bound beyond loopback. A public gateway refuses to start with
no rule, or with any refused entry; a non-public one warns about a refused
entry and drops it, and with no rule at all admits every Origin.

A missing or empty `Origin` (native clients send none) is admitted on a
non-public gateway and refused on a public one, allowlist or not. An Origin
that no rule admits gets `403 Forbidden`, audited as
`transport.origin_refused` with `reason` `missing_origin` or
`origin_not_allowed`.

### Limits

- **Frame size.** A frame whose declared payload length exceeds
  `maxFrameBytes` is refused from its header, before the payload is buffered;
  so is a fragmented message, or a pending buffer, that grows beyond it. The
  socket is closed with 1009 and destroyed (`transport.frame_too_large`).
- **Hello deadline.** Until a complete text message with
  `type: "client.hello"` arrives, the socket is closed with 1008 once
  `helloDeadlineMs` passes (`transport.hello_deadline`).
- **Rate.** Each socket has a token bucket of `messageBurst` messages refilled
  at `messagesPerSecond`; every complete data message and every ping or pong
  takes one. Over it, the socket is closed with 1008
  (`transport.rate_limited`). A burst left unset is one second's worth.
- **Pending pairings.** At start the transport calls
  `ClientGatewayService.setPairingLimits({ perAddress, total })` from
  `pendingPairingsPerAddress` and `pendingPairingsTotal`.

Every refusal is a security event (`ClientGatewayService.recordTransportEvent`),
so `onSecurityEvent` listeners see it as well as the audit ring.

### Client address

The address a connection counts as is the socket's peer, or, with
`FLUXIQ_TRUST_PROXY=true`, the rightmost `X-Forwarded-For` entry: the one the
trusted proxy appended, so a client cannot choose it by sending its own header.
Set it only when every connection arrives through a proxy you run, such as
Caddy terminating TLS for `wss://`. The full address goes only to the
gateway's own session record, for the per-address pairing cap; the audit,
events and snapshot carry its network prefix (`clientAddressPrefix`: IPv4
`/24`, IPv6 `/48`).

### Drain

The server handle has `beginDrain({ retryAfterMs, reason })`, `reason` being
`restart` (the default) or `shutdown`. From then on a new upgrade gets
`503 Service Unavailable` with `Retry-After` in whole seconds, and every open
socket is sent `server.going_away` once:

```json
{
  "type": "server.going_away",
  "payload": { "reason": "restart", "retryAfterMs": 30000 }
}
```

The client keeps its credential and reconnects after `retryAfterMs`; open
sockets are left for their clients to close. `openConnectionCount()` says how
many are still open, so a shutdown can wait up to `FLUXIQ_DRAIN_SECONDS` for it
to reach zero before closing the listener. The health response
(`GET /`) reports `draining`.

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
- `client.focus_project`
- `client.error`

### Project Focus

A session's project decides which `server.activity` reaches it: Core pushes a
build's or run's activity to the ready sessions that advertised
`fluxiq.activity` and are bound to that project or to none. Pairing binds the
pairing's project, and a reconnect binds none. A client that lets the person
choose a project sends the choice, so the activity of the project the person is
working in reaches it as it happens:

```json
{ "type": "client.focus_project", "payload": { "projectId": "project-id" } }
```

Core accepts it only from a ready session a person paired (never a managed
host's or a channel-scoped stand-in), and only for a project the approving
person may read in the domain the session declared at `client.hello`. It is
decided as reading that one project through the person's own paired program
calls is (`programs/automation-studio/api/project-focus/`): the person is read
from the identity source the paired program route reads (on a hosted tenant,
the host's platform identity, not the tenant instance's own), must be enabled
and have a role, and is narrowed to `programs.read` on the `paired-client`
channel; the project must exist and its domain must be the session's; and the
registry's IAM must allow the `projects` listing's action on the workspace and
on that project, the two decisions a listing makes before it keeps a project.
Another tenant's project is unknown to the instance and is refused the same
way. `"projectId": null` returns the session to the project it was bound to
when it became ready.

Core answers `server.project_focused` with `{ "projectId": ... }`, or
`server.error` with one of `CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES` and the
session's project unchanged: `project_focus.invalid`, `project_focus.not_paired`,
`project_focus.refused` (the person may not read it there, or it does not exist)
and `project_focus.unavailable` (Core could not decide). Both carry the
request's `id` as `correlationId`. A refusal is about the project, not the
connection: the session stays ready. Only the latest request a session sent is
applied and answered. The new project is also the one a token call naming no
project reaches, and the one a recording started without one is created in.

Send it only over a ready session, never from an offline queue, and again after
every `server.session_ready` while a choice is held, since each new session
starts at its pairing's project. An older Core ignores the message.

#### Activity follows current access

Only an instance's own projects' activity reaches its gateway. The activity
hub is process-wide, and a hosted process runs a runtime per tenant, so each
runtime hands its gateway an activity only when its own project catalogue lists
the activity's project (`programs/automation-studio/api/project-focus/own-project-activity.ts`):
another tenant's activity never reaches its gateway or its access check. Each
project id is read from the catalogue once (ids are minted unique), and a
deleted project's id is read again.

A session a person paired then hears a project's activity only while that
person may read it, asked with the focus question
(`client-gateway/service/project-focus/activity-delivery.ts`). The answer is
asked once per session and project (a focus's allowed answer counts) and
reused for every later activity, because it changes only when what it is
decided from changes. Core installs the focus authority again at each such
change, which voids every reused answer and re-decides each paired session's
own project at that moment, so losing access takes effect at the change, not
at the next activity and not on a timer. The changes are:

- an IAM store write in the instance's workspace or at the platform level
  (`iamStoreChanges`, announced by every `IamStore` write beside its
  `iam-change` audit record), which covers policies and hosted membership;
- a change of a person's role or enabled flag, a person removed, or a role's
  permissions, in the identity source the focus reads people from
  (`IdentityAccessService.directoryChanges`; a login is not one);
- a registration added to the program registry;
- a project removed from the catalogue (`AutomationStudioProjectRemovals`).

An answer whose question was still running when access changed is void and
asked again. Reused answers are decided without an IAM audit row
(`GlobalProgramApiRegistry.decideUnrecorded`, as a list decides its items under
one row): the gateway audits the events instead, `project_focus.access_ended`
and `project_focus.delivery_check_failed`. Each session's activity is
delivered in publish order; while anything waits on a session, later activity
waits behind it, and what waited during one question is decided together with
one question per project not yet decided. A session bound to no project hears
only the projects its person may read. Managed hosts and channel-scoped
stand-ins have no person to ask and are sent activity as before.

These change signals are in-process: a write made by another process (a
second web host process sharing the stores) is not announced, and the
identity directory announces only changes this process stores.

When the refused project is the session's own (focused, or bound at pairing),
the person's access has ended: their policy, membership or sharing was removed,
they were disabled, or the project was deleted. At that change Core stops that
project's activity, moves the session where a focus of `null` would take it (its
pairing's project, or none when that is the project lost), and sends once,
unprompted:

```json
{ "type": "server.project_access_ended", "payload": { "projectId": "lost-project", "currentProjectId": null, "message": "..." } }
```

A client that chose `projectId` drops the choice, falls back as it does for a
cleared choice, and shows `message`. When Core cannot decide (its IAM policies
are unavailable) it sends nothing and moves nothing: an outage never ends
access.

#### Chats that changed

A session a person paired is told, unprompted, when a chat that person may read
changed (a turn written, a reply finished, an ask raised, answered or expired,
a thread opened, renamed or deleted), so its chat reads the thread again on
the push instead of on a timer:

```json
{ "type": "server.conversation_changed", "payload": { "conversationId": "conversation-id", "projectId": "project-id" } }
```

It names the chat and its project and carries nothing that was said: the
client reads the chat through its existing reads (`list-conversations`,
`get-conversation`). It goes to every ready person-paired session whose person
may read the chat, whichever project the session is focused on, because a
paired client reads any project of its bound domain. A project's chat is
decided as `get-conversation` decides it for that person on the
`paired-client` channel: the person read and narrowed as for a focus, the
project in the session's domain, and the registry's IAM allowing
`get-conversation`'s action on that project
(`programs/automation-studio/api/project-focus/authority.ts`). The answer is
asked once per session and project and reused until access changes, at the
same changes that void the activity answers above. A change is sent only once
an answer allows it and discarded only on a denial or when the session goes
away or speaks for someone else. An answer that could not be made (an outage,
not a denial) or a delivery that failed keeps the change waiting in the
session's lane, and it is asked again after a wait of one second that doubles to
thirty, back to one once everything waiting is decided; a chat that changes
again meanwhile waits once. Each outage is audited once per session by kind
only (`conversation_push.check_failed`, `conversation_push.delivery_failed`).
No wait runs while nothing is undecided. A person's
panel thread (`"projectId": null` in the contract) is never sent: no paired
client may read one. Managed hosts and channel-scoped stand-ins hear none.

Only an instance's own chats reach its gateway: each runtime hands it the
committed changes of its own threads (`AutomationStudioConversations.signals`,
one per runtime, so one per tenant on a hosted process). The message skips the
session's outbound queue, is dropped on a closed socket, is not recorded in a
trace, and is never replayed after a reconnect: read the chats again once the
session is ready. The signals are in-process, so a write made by another
process serving the same workspace is not announced. A client that does not
know the type ignores it (Core's websocket client and older extension builds
both do), so it is sent without a capability.

A paired client's program call binds its project once, from its first
authentication (the body's `projectId`, or the session's project then) and
domain-gates it. On a guarded (hosted) server the caller is authenticated
again before dispatch; a focus that moved the session in between does not fail
the call, which still acts only on the project it was bound to, and the
registry's IAM decides it for the refreshed caller.

Clients may stream `client.snapshot` state frames at screenshot cadence when a
recording is active. FluxIQ batches those recording appends internally and
flushes the batch before finalizing the recording. Raw checkpoints remain
available for State View reconstruction, while proposal generation and importer
recording mappers receive compacted action-context state entries, including
`client.state_snapshot` observations, instead of every background frame.

Host UIs should use recording-summary listing for sidebars, project refreshes,
and proposal polling, then fetch one full recording only when a timeline,
inspector, or State View needs raw entries. Full recording payloads can include
many visual frame references and should not be part of routine refresh loops.

FluxIQ may send:

- `server.start_recording`
- `server.stop_recording`
- `server.capture_snapshot`
- `server.execute_action`
- `server.set_active_tab`
- `server.ping`
- `server.disconnect`
- `server.activity` (to a session that advertised `fluxiq.activity`)
- `server.project_focused` (the answer to `client.focus_project`)
- `server.project_access_ended` (the person lost the session's project; see Project Focus)
- `server.conversation_changed` (a chat the session's person may read changed; see Project Focus)
- `server.error`

## Typed WebSocket Client Package

Framework clients can use the workspace package. It exposes a low-level gateway
transport and an Automation Studio facade. The facade imports Automation Studio
request types from `fluxiq/automation`, so websocket clients compile
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
request types from `fluxiq/automation`. It does not contain browser,
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
import { AutomationStudioService } from "fluxiq/automation";

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
2. If a project is open, the web panel publishes that active project to the
   shared gateway runtime under the signed-in operator's identity. It publishes
   on load, on a project or flow change, on window focus, and on every
   visibility change — including the change to hidden, which is the user
   switching to the tab they mean to record. It does not publish on a timer.
3. A paired client calls `createRecording(...)` on
   `FluxIQAutomationStudioWebSocketClient`, which sends `client.start_recording`.
4. FluxIQ resolves an optional operator+client project override first and then
   that operator's default project. It cannot use another operator's context.
   FluxIQ creates the recording there, marks the client session as recording,
   and the web panel opens the recording timeline in the main workspace area.
   Once the recording is open, FluxIQ acknowledges the start by sending the
   client `server.start_recording` with its `recordingId`, unless a
   `client.stop_recording` for that recording has already arrived. Messages the
   client sends while the start is still being handled wait for it, so they
   reach the recording that start opens. A message that arrives when no
   recording is open is discarded and audited under the recording id it names.
5. If Automation Studio has no open project, FluxIQ rejects the request,
   sends `server.error` with code `recording.project_required`, and the web
   panel shows a modal telling the user to open a project first.

A published context also carries a lease, `AUTOMATION_STUDIO_CONTEXT_LEASE_MS`
in `apps/web/src/lib/automation-studio-context.ts`, currently five minutes. A
request that arrives after it expires is refused with the same
`recording.project_required` code. The lease bounds how long a Studio page that
vanished without warning can keep directing recordings into the project it last
held; it is not a limit on how long the operator's decision stays usable. A page
that closes normally clears its context immediately, through
`navigator.sendBeacon` so the clearing survives the teardown, so a lease only
ever runs out for a browser that crashed, was killed, or lost its machine.

The refusal separates the two cases in its metadata. `activeProjectId` is null
when nobody has a project open, which no retry can fix. It names the project
when the context merely lapsed, which the next publication does fix — returning
to the Studio tab republishes on focus.

## Web Panel APIs

The global web shell uses these authenticated endpoints:

- `GET /api/client-gateway/snapshot`
- `GET /api/panel/changes`, the panel's one change stream (Server-Sent
  Events; t920, which replaced t916's `GET /api/client-gateway/changes`). Its
  `gateway` event, `{ "version": n }`, is sent each time this caller's own
  filtered view of pairings and clients changed, only to a caller the snapshot
  route would serve, and never carries a kind, a code, a token or which client
  it was. The same stream carries the panel's `conversation` and `activity`
  events ([client gateway architecture](../architecture/automation-studio/client-gateway.md#how-the-panel-hears-pairing-and-client-changes)).
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
  A hosted adapter should also pass `peer` to `connect()`, call
  `setPairingLimits()` at start, and report its own refusals through
  `recordTransportEvent()`, as the Node adapter does.
- The transport's checks are covered by
  `apps/web/src/server/tests/client-gateway-websocket.test.ts` (Origin rule,
  limits, drain over loopback) and
  `apps/web/src/server/tests/client-gateway-websocket-wss.test.ts` (`wss://`
  through a Node TLS proxy standing in for Caddy, under the `service`
  profile, with a self-signed certificate made by `openssl` at test time).

## Web Pairing Queue

The global web pairing surface uses the shared Modal and presents one active
request at a time. Multiple pending requests remain queued and advance only
after the current server action succeeds. Approve and reject are not optimistic:
a network or server failure keeps the request visible with its error.

The panel reads the snapshot when its change stream (`GET /api/panel/changes`)
opens or reopens and once per `gateway` change it signals; it reads on no timer. A visible
pending request shows a live expiration countdown from a local one-second tick
that reads nothing. While the stream is down the prompt says so. Dismissed codes
are locally bounded to prevent an already rejected snapshot from flashing back
before gateway persistence catches up.
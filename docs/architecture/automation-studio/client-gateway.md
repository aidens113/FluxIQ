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
- A `client.recording_event` or `client.state_update` whose metadata names an
  `inputId` registered for the domain goes through `AutomationStudioIoRecorder`
  instead. An action input with an output binding becomes an `action` entry;
  any other input becomes an `input.<role>` observation. The entry's metadata
  is `domainId`, `inputId`, `inputRole`, `envelopeId` and `policyEligible`,
  plus two keys naming the event it came from. `eventId` is the recording
  event's own top-level `eventId`; an event without one gives the entry none,
  even when the client's metadata names an `eventId`. A state update has no
  `eventId` of its own, so its entry has one only when its metadata names one.
  `sourceId` is the event's
  `sourceId`, or `client.<clientId>.events` (`.observations` for a state
  update); a `sourceId` in the client's own metadata takes precedence. Each is
  kept verbatim and only as a non-blank string, and nothing else from the
  client's metadata reaches the entry. The entry's top-level `sourceId` stays
  `input.<inputId>`, and a recording mapper is not shown top-level fields, so
  a mapper that links an entry to a later event reads `metadata.eventId` and
  `metadata.sourceId`.
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
  `server.start_recording` also acknowledges a start the client asked for, as
  described below.

A client's start is ordered with the messages that follow it, and the bridge
does that ordering rather than the host. The WebSocket host handles one
socket's frames concurrently. Opening a recording takes two awaits: the
operator's project context, then `createRecording`, which writes the session
to the store and the project. Under load, a recording event sent right after
`client.start_recording` could otherwise reach the bridge before the recording
exists and be discarded, taking the earliest actions of the recording with it.
So the bridge registers a pending start for that client before its first
await. Every `client.recording_entry`, `client.recording_event`,
`client.snapshot`, `client.state_update`, `client.error` and
`client.stop_recording` from the same client waits for that start to settle
before it looks for an open recording:

- **The start opens the recording.** Core acknowledges it with
  `server.start_recording`, carrying the recording ID, project, task and
  domain, so a client can hold its first messages until Core can take them.
  The acknowledgement is sent only after the recording is open. It is not sent
  to a client that has already sent `client.stop_recording` for that
  recording, because telling it to start would restart a recording it has
  ended.
- **The start is refused or throws.** What waited is discarded and audited like
  any other discard, under the refused recording's ID. The refusal itself still
  reaches the client as `server.error`.

Serializing the host instead would hold every message behind slow appends and
leave other hosts and in-process callers racing, so the rule lives beside the
"open before append" rule it protects.

A client's recording messages are stored in the order the gateway received
them from that client, and the bridge keeps that order for the same reason.
Every `client.recording_entry`, `client.recording_event`, `client.snapshot`,
`client.state_update` and `client.error` joins one chain per client before the
bridge's first await. It is stored only once every message that client sent
before it has been handled:

- **A failed append** fails that message's own receive. The next message is
  still stored.
- **Different clients** do not wait for one another.
- **A start**, from the client or from the web panel, opens its recording only
  once every message that client sent before it has been handled. A message
  received before a start is never stored in the recording that start opens.
- **Stop**, from the client or from the web panel, waits for the chain as it
  stands when the post-stop drain ends. A message received before then is stored,
  not discarded. One received later still races finalization, and is counted as
  discarded if it loses. Stop closes only the recording it stopped: one started
  while it drains or finalizes stays open.

The bridge buffers high-frequency recording timeline writes before persisting
them. State snapshots captured at screenshot cadence are flushed in bounded
batches and are synchronously drained before recording finalization, so Stop
Recording does not wait on one read/append/write cycle per frame. The queue is
written before anything is appended directly: a `client.recording_event`, a
`client.state_update` naming a registered input, the marker for a
`client.error`, or a resolved action result. A snapshot is therefore never
stored after an entry that arrived after it, and the timeline's order is the
order of arrival.

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
discarded `client.recording_event`, `client.recording_entry`,
`client.snapshot` and `client.state_update` is counted against the recording
it was meant for and written to the gateway audit log, which the Connected
Clients view already surfaces. A message that names its own recording, as a
recording event or entry can, is attributed to that recording. Otherwise it is
attributed to the last recording the client had closed or had refused. A
`client.state_update` that says `recording: false` is page state from a client
that is not recording, so dropping it loses nothing and is not counted:

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
connection. Any other append failure still fails the receive.

Both entries carry the recording ID, the event type and the input ID. When the
recording is the one the client last closed, they also carry the project and
how long after finalization the message arrived. Nothing is sent back to
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
frames to `receiveRaw()` without waiting for one frame to be handled before the
next, and relies on the service to serialize outbound
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

A paired client's credential is also an HTTP bearer token, on two routes only.
`GET /api/recordings` accepts it for the extension's recordings list. The
program route, `/api/programs/<programId>/<endpoint>`, accepts it on exactly
these endpoints, which are what the extension's panel needs to talk to FluxIQ,
stop a run, and use its automation and recording controls:

- Automation Studio: `list-conversations`, `open-conversation`,
  `get-conversation`, `append-turn`, `answer-ask`
- Automation Studio: `list-runtime-sessions`, `cancel-runtime-session`
- Automation Studio, automation panel: `list-flow-summaries`, `list-flow-runs`,
  `get-flow-run-detail`, `list-flow-adaptations`, `export-run-dataset`,
  `run-runtime-session`, `generate-recording-proposal`,
  `review-recording-flow-proposal`, `remove-recording-entry`
- Secret Keys: `snapshot`, projected (below)

The allowlist lives in `apps/web/src/lib/program-route.ts`, and four rules
bound it:

- A token call runs as the person who approved the pairing
  (`operatorUserId` on the ready session), with that person's role permissions
  narrowed to `programs.read`, `programs.write`, `runtime.control` and
  `flows.write`. `flows.write` is there only because
  `generate-recording-proposal` and `review-recording-flow-proposal` require it.
  A disabled or deleted person's clients reach nothing.
- It is scoped to the domain the client declared in `client.hello`
  (`metadata.domainId`). A URL that names another domain is refused with 403.
- The route refuses any endpoint the registry classifies as other than `read`
  or `authoring`, so a mistaken allowlist entry still cannot reach a delete, a
  payment or a program-gated credential check. Deletes and money movement keep
  asking the person for their PIN in the web panel. Answering an ask is
  `authoring`: it is the person answering in their own thread, and the act it
  answers is still gated where it happens.
- No auth session is injected into a token call's payload, and one the caller
  names is removed, so a PIN check a handler runs fails closed.

A token call's request is also narrowed (`narrowPairedClientRequest`), and a
refusal is 403 with a sentence naming the field, never its value:

- `run-runtime-session` must name a saved Flow by `flowId`, and may not carry an
  inline `flow`, `inputs`, `runIntent`, `permittedConsequences`, `dryRunLlm`,
  `useReusableContext`, or `authorizedExternalSideEffects` other than `false`.
  Its `adaptiveMode` must be `no_llm_intervention` or `deterministic`; an absent
  mode, which would mean fully adaptive, is set to `no_llm_intervention`. A
  paired token therefore never asks the model into a run, and never allows a
  consequence on the person's behalf. One LLM call remains
  possible: a Flow's standing result check, which the person authorized on
  that Flow in the web panel, runs on a token run as on any other.
- `generate-recording-proposal` may not be `llm_assisted` and may not carry
  `instructions` or `constraints`.
- `review-recording-flow-proposal` may only approve, and may not carry
  `policyOverride`, `reviewerId` or `destination`.

And a token call's answer is projected (`projectPairedClientResponse`): Secret
Keys' `snapshot` answers `{ keys: [{ kind, provider, enabled }] }`, with no key
name, id, description, metadata or value.

`remove-recording-entry` (`runtime.control`, `authoring`) takes
`{ projectId, recordingId, eventId }` and removes every entry of a recording
that is still open whose `metadata.eventId` is `eventId` -- the id the IO
recorder copies from the gateway envelope -- answering
`{ removedCount, recording }` with the recording as a summary. A finalized
recording refuses it. Entries appended as domain events carry the event id as
their entry id and correlation id instead, so they are not matched. Run
summaries (`list-flow-runs`) carry `durableBehaviorChanged`, computed by the
same helper as `run-runtime-session`'s answer (`runtime/durable-behavior/`).

Every other program endpoint refuses the token with 403 before the token is
looked up. A valid login cookie always takes precedence over a bearer header.
The token is never logged or echoed, and the actor's session ID names the
gateway session (`client-gateway:<sessionId>`), never the token.

### The chat runs capabilities in Core (conversation commands)

`append-turn` with `capabilities` reads the person's message and writes Core's
answer into the thread. When the decision is to run one of the capabilities
Core itself executes, the handler also runs it, for whichever client sent the
message (`runtime/conversations/commands/`). This is how the extension's chat
builds and runs automations. It is also how the web panel's chat now runs the
same capabilities. The ids are:

| Id | What Core does |
| --- | --- |
| `flow.createHere` | `create-flow`, `save-flow-generation-instruction`, then `generate-flow-bootstrap-adaptation` (evidence-guided, `startLocation` = the page on screen), then `review-flow-adaptation` `approve` and `apply`. The new Flow is blank, so applying replaces nothing. |
| `flow.describe` | `save-flow-generation-instruction` |
| `flow.explore` | Saves an instruction if one is given, then builds. It applies only a create build onto a blank Flow. |
| `flow.improve` | `save-flow-instruction`, then an `extend` build, then a confirm ask (`conversation-command.<uuid>`, attachment `conversation-command`) asking to apply it. A grant on `answer-ask` applies the change (`adaptation.apply`). A deny rejects it (`adaptation.reject`), because a change left waiting would refuse the Flow's next build with `flow_bootstrap.pending_adaptation_exists`. |
| `run.execute` | `run-runtime-session` |
| `ask.answer` | Answers the thread's pending ask from the person's words (grant, deny, choice or text) through `answer-ask`. |

- **Descriptors.** For these ids, Core's descriptor replaces whatever the client
  sent, so a client may send ids only. The extension does.
- **A described job is a build** (2026-10-01, downstream t227). A person on a
  site who types what they want done -- "Find every pair of wireless earbuds
  under $50 ..." -- has asked for an automation without saying "automate".
  Three rules make that message start `flow.createHere`:
  - The model is told so, when a page is open and the capability is offered
    (`instructions/prompt.ts`).
  - A required `instruction` that nothing supplied is the message itself
    (`instructions/invocation.ts`), unless the message is only the
    capability's own name or phrases ("automate this page"), which is still
    asked about.
  - Read without the model -- none is connected, or it did not answer within
    the 24 s reading deadline -- a message that matches no capability, with a
    page open, and that is a job (at least 6 words, filler left out, not a
    question) is built from that page (`instructions/fallback.ts`). The thread
    still says it was read without the model.

  The first chat-driven live Lab run (`run-muq2dlhq-96bffb09`) showed the gap:
  its typed task was answered "I could not tell what you wanted done" while
  the model was slow, and nothing was built.
- **Calls are made in process.** The command calls the registry with the
  request's own actor and scope, so each endpoint's permission and handler
  checks apply as they would to the same call from a control. It reaches only
  endpoints classified `read` or `authoring`: deletes and payments keep their
  PIN. A token still cannot call a build endpoint directly, because the HTTP
  allowlist above is unchanged. Only Core's own command, building its own
  payload, reaches one.
- **Long commands run in the background.** These are create-here, explore,
  improve and run. The answer carries
  `response.execution = { capabilityId, status: "started", summary }` at once.
  The result arrives later as an automation turn with attachment
  `panel-capability-result` (ref = the capability id).
  - A failed result says why it stopped and which steps had already landed.
  - While the command runs, an ambient conversation context
    (`runtime/conversations/context/`) makes any ask the build or run raises
    land in the chat thread instead of the Flow's own. It also stamps the
    thread's id on activity events, so the chat refreshes.
  - A quick command answers `done` or `failed` in the same response.
  - `execution` is null when Core does not execute the chosen id; the client
    then runs it itself, as the web panel still does for its other capabilities.
- **The page is the start.** `onScreen.pageUrl` (http or https, at most 2048
  characters, no whitespace or control characters) becomes the build's
  `startLocation`. The chat model is shown only its origin and path.
- **A Flow's thread means that Flow.** With no `onScreen.flowId`, a thread whose
  subject is a Flow supplies it. So "run it" in an automation's own chat runs
  that automation.
- **A paired client spends its person's key.** A `client-gateway:` caller is
  mapped to the approving person's live unlocked session
  (`SecretKeysService.unlockedSessionFor`: the latest-expiring unlock that
  opens at least one key). That mapping applies to the chat model and to every
  registry call a command makes. Permissions stay the paired set. With no
  unlocked session, a model call fails and the thread says the key is locked
  and how far the command got.
  - This deliberately changes the rule above that a token never reaches the
    model. The product direction is that the extension's chat builds and runs
    automations (2026-09-30, t198).

## Per-step activity and resolved asks

Core emits each explained model decision as a `thought` with its human action
and screened reason in `detail.text`; repairs and result checks have their own
activity messages (`runtime/activity/observer.ts`, `wording/reason-text.ts`).
The model's required one-sentence `summary` is held beside the decision, not
inside its trace or the next model context. Activity can carry these screened
words about the page; retained diagnostic traces remain content-free.

Both chats render each explained decision as its own assistant message, with
the resulting action cards under it. They share the browser-safe `fluxiq/ui`
activity-action map: `ActivityActionKind`, `ACTIVITY_ACTION_ICONS`,
`ACTIVITY_ACTION_NAMES`, `activityActionOf` and `activityActionKey`. Cards cover
click, type, navigate, read, look, wait, person_check, permission, draft, test,
repair and other; the extension draws shared lucide paths and the Core panel
uses lucide-react with the same kind/icon mapping. Internal bookkeeping reads
stay out of the chat. The extension has Chat and Automations tabs, Settings and
Open FluxIQ; the old Simple/Advanced split is removed.

A decision Core declined before doing it is a card under that decision, never
prose appended to the model's sentence (t193 round 1003). `activityActionRefusal`
reads the loop's refusal codes (`llm_evidence_loop.repeat_refused`,
`.draft_amendments_refused`, `.draft_amendment_undone`) into
`ActivityAction.refused: { all, because }`: `because` is at most two reasons in
Core's words (`ACTIVITY_ACTION_REFUSAL_WORDS`), never a code. A refused action
is `failed` when nothing of it was done and `done` when part of an edit landed
(the record's `Applied: <n>`). An edit to the draft gets a card whether it
landed or not ("Editing the Flow -- done / partly done / not done",
`runtime/activity/wording/draft-edit-card.ts`; the kind is named "Edit the
Flow"), and a call refused as a repeat gets its own card once the loop answers
it (`runtime/activity/decision-answer/refused-call.ts`). The model's sentence is
only the decision's reason, said as what was tried. Inside a build, a split
judge's card closes with the build's sentence ("the build cannot finish on this
test") rather than the run's ("the run is not marked as failed for it",
`runtime/result-verification/unsettled/unsettled-words.ts`, `check-activity.ts`).

A wait opens an ask activity row and settles through another ask row with the
same `ref` and `detail.resolution`. The closed resolutions are:

| Resolution | Meaning | Card outcome |
| --- | --- | --- |
| `waited_out` | A check cleared itself; `clearedWait` carries its elapsed time | done |
| `answered` | The person continued after the check | done |
| `allowed` | Permission was granted | done |
| `declined` | The person declined or stopped | failed |
| `timed_out` | The answer window expired | failed |
| `cancelled` | Work ended before an answer | failed |

`activityActionKey` keys a card by ask reference, so settlement updates the
same card in place. A check's intervention-tool event and its ask share one
card. Both surfaces wait for Core's explicit resolution: later work, a final
message or a failed unit cannot imply that the ask succeeded. An unresolved
card keeps its waiting state. A cancelled parked runtime session explicitly
settles its ask; expiry/removal and cleared-wait propagation gaps are separate
pending work outside this baseline.

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

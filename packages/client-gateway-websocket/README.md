# @fluxiq/client-gateway-websocket

Browser-safe client for the FluxIQ client gateway. It holds the client half of
the gateway: the WebSocket transport, a reconnecting connection, an offline
outbox, in-flight command reconciliation, host-lease fencing, and the rule for
which client session a host may drive. Anything particular to one kind of
client (what its hello says, how a command is carried out, where a token and
the queue are kept, how its process stays alive) belongs to the host and is
handed in through options and ports. The FluxIQ web extension is one such host.

The package depends only on `@fluxiq/contracts`. It does not install the FluxIQ
Node runtime, SQLite, QR generation, TypeDoc, or React.

## Transport

`FluxIQClientGatewayWebSocketClient` is one socket. It opens the socket within
an open deadline (`CLIENT_GATEWAY_OPEN_TIMEOUT_MS`, 10 s, unless
`openTimeoutMs` says otherwise), sends the hello, sends typed client messages
and emits events. A socket that never opens rejects with
`FluxIQClientGatewayOpenError`, whose `code` is `open_timeout`, `open_failed`
or `closed_before_open`. `FluxIQAutomationStudioWebSocketClient` mirrors the
Automation Studio recording methods (`createRecording`,
`appendRecordingEvent`, `appendRecordingDomainEvent`, `finalizeRecording`) over
that transport.

```ts
import { FluxIQClientGatewayWebSocketClient } from "@fluxiq/client-gateway-websocket";

const client = new FluxIQClientGatewayWebSocketClient({
  client: {
    clientId: "example.client",
    clientType: "custom",
    name: "Example client"
  }
});

await client.connect();
```

## Reconnecting connection

`FluxIQClientGatewayConnection` keeps a client connected across sockets. It
opens a new transport for each attempt and reports where it stands as a
`ClientGatewayConnectionState`: `connecting`, `pairing`, `connected`,
`reconnecting`, `error` or `disconnected`. `statusFields()` returns the state
together with the queue size, the time of the last message and any pairing
reference code.

- When a socket drops or fails to open, the connection schedules a retry if
  `autoReconnect()` says so. The delay comes from
  `clientGatewayReconnectDelay`: the base delay (default 1,000 ms) doubled for
  each earlier attempt, capped at the maximum (default 30,000 ms). `retryNow()`
  skips a pending backoff when the host learns the way may be open again, and
  `stopReconnecting()` ends retrying.
- A timer ticks every `heartbeatIntervalMs` (default 20,000 ms). While the
  connection is `connected` it calls the host's `onHeartbeat`. While the socket
  is open but `pairing` or `connecting` it calls `keepAlive`, which sends
  nothing on the socket; it exists so a host whose process is stopped when idle
  can keep itself alive.
- `on(type, handler)` subscribes to a transport event on every socket the
  connection opens, so the subscription survives reconnects.
- A socket that never opened is reported through `reportError` in words a
  person can read (`clientGatewayOpenFailureMessage`), naming which of the
  three open failures it was.
- `send(type, payload)` sends on the open socket, or queues the message in the
  outbox while the socket is down. After `server.session_ready` the host calls
  `flushQueue()`.

```ts
const connection = new FluxIQClientGatewayConnection({
  url: () => "ws://127.0.0.1:4777/client",
  hello: () => ({ clientId: "example.client", clientType: "custom", name: "Example client" }),
  tokenStorage,
  autoReconnect: () => true,
  outbox: new ClientGatewayOutbox(clientGatewayMemoryOutboxStore()),
  context: () => ({ projectId: currentProjectId, recordingId: currentRecordingId }),
  clientId: () => "example.client",
  emitStatus: () => publish(connection.statusFields()),
  reportError: (message) => showError(message),
  clearError: () => showError(undefined),
  handlers: {
    onSessionReady: () => {
      connection.markSessionReady();
      void connection.flushQueue();
    }
  }
});

await connection.connect();
```

## Outbox

`ClientGatewayOutbox` is the offline queue. Each entry is a client message with
the `ClientGatewayOutboxBinding` it was queued under:

- `session` is the client's trust lineage, not the wire `sessionId`. Core mints
  a new `sessionId` for every socket, but a socket that resumes by token
  resumes the same trusted client, and Core files a client's recording under
  that trusted client. Binding entries to the wire `sessionId` would drop the
  whole queue on every reconnect. The connection decides the lineage at each
  `server.session_ready` (`clientGatewayLineageAfterReady`). A socket whose
  hello carried a token and that saw no `server.pairing_required` keeps the
  stored lineage. Any other socket starts a new one, and so does an outbox
  whose lineage cannot be read, so nothing queued under an old trust reaches a
  new one.
- `projectId` is the client's project when the message was queued, or `null`.
- `recordingId` is the recording the payload names, else the recording in
  progress, else `null` (`clientGatewayOutboxBinding`).

A flush (`clientGatewayOutboxDeliverable`) delivers, in queue order, the
entries whose lineage and project equal the current ones and whose recording
is none, the current one, or one whose own `client.stop_recording` is queued
under the same lineage and project (that recording ended while the socket was
down). Every other entry is dropped. If a send fails mid-flush, the outbox
writes back only the undelivered matching tail and rethrows.

The queue is bounded by a count (`limit`, default 1,000) and, when one is
given, a byte budget (`byteBudget`, measured by
`clientGatewayOutboxEntryBytes` unless `measure` says otherwise). The newest
entries that fit both are kept (`clientGatewayOutboxKeep`). Nothing is dropped
silently: every drop is counted in a loss record (`ClientGatewayOutboxLoss`)
by reason, which is `count_limit`, `byte_budget` or `write_failed`. The next
flush first sends the gateway one `client.error` marker with the code
`client.outbox.entries_lost` (`clientGatewayOutboxLossMarker`). The marker
carries the counts and nothing of what was lost. The host hears of the loss
through `onQueueLoss`.

When the store refuses a write, `enqueue` does not throw. It drops the oldest
half of what it would keep, counts them as `write_failed`, and tries again,
down to no entries. If even that is refused, the store keeps what it had, the
new entry is counted as lost, and the loss is held until a write succeeds.

The host supplies the store (`ClientGatewayOutboxStore`, a `read` and a `write`
of the whole `ClientGatewayOutboxState`) and so chooses the queue's lifetime. A
browser keeps it for the browser session and no longer, so queued page data
does not outlive the session that recorded it. `clientGatewayMemoryOutboxStore`
lives as long as its process.

`actionResult(commandId, session)` returns a command's result while it is
still queued under the given lineage; a queued `interrupted` reads as
`unknown`.

## Command reconciliation

`ClientGatewayCommandReconciliation` is the client half of in-flight command
reconciliation. A committing act that was in flight when the client's worker
restarted or the socket dropped never reads as "did not happen", and is never
made twice blindly.

- `begin` writes a record before a command is carried out, `placed` names
  where it was sent (a `ClientGatewayCommandPlace`, opaque to Core), and
  `settled` clears the record once the result is sent or queued. `release`
  stops tracking a command that ended without a result and leaves its record.
- After the next `session_ready`, `reportLeftovers` reports each record that no
  running command owns as the host's interrupted result, and clears it.
- `answerRepeat` answers a command id that arrives again from what the client
  already has (still running, the result just sent, the result in the outbox,
  or a leftover record) instead of acting again.
- `reconcile` answers Core's `server.reconcile_command` as `running`, `landed`,
  `unknown` or `not_seen` (`clientGatewayReconcileAnswer`), never by acting. An
  id answered `not_seen` is refused from then on with the host's
  `notSeenResult`.

Which acts commit, and what an interrupted or refused command reports, are the
host's facts, passed in as `commits`, `interruptedResult` and `notSeenResult`.
Records live in `ClientGatewayInFlightRecordStore` (one key per command,
default prefix `fluxiq.inFlight.`) and received ids in
`ClientGatewaySeenCommandStore` (default prefix `fluxiq.commandSeen.`, the
newest 64), both over a storage area.

## Host-lease fencing

Core's gateway stamps a command with the host lease it was issued under.
`ClientGatewayHostLeaseLedger` keeps the highest lease the client has seen for
each resource key (default prefix `fluxiq.hostLease.`) and judges each
command's lease against it (`clientGatewayHostLeaseJudgement`). A higher epoch
is adopted, the same epoch and holder is current, a lower epoch is stale, and
the same epoch with another holder is a mismatch.

`verdict(commandId, lease)` reads the lease off the wire
(`clientGatewayHostLeaseReading`). A command with no lease runs. An unreadable
lease is refused as `host_lease.missing`, and a stale or mismatched one as
`host_lease.stale` or `host_lease.holder_mismatch`. The refusal
(`clientGatewayHostLeaseRefusal`) is a failed, non-retryable
`client.action_result` whose effect is `unacted`. Judgements run one at a time,
and a storage fault is handed back for the host to report without losing a
lease already seen.

## Storage area

`ClientGatewayStorageArea` is the key-value port that the reconciliation stores
and the host-lease ledger keep their entries in: `get(null)`, `set(items)` and
`remove(key)`. In a browser it is session storage, which outlives the
background worker that wrote it and is forgotten when the browser closes.
`clientGatewayMemoryArea` lives as long as its process. It still answers a
repeated command id, but cannot report a command that a restarted client lost.

## Session pick

`clientGatewaySessionEligible` is the one rule for which client session a host
may drive. The session must be `ready`, not disconnected, of the host's client
type, not recording, declaring a capability the host's actions are carried by
(`serves`), and declaring `alsoDeclaring` when one is named. Core refuses
commands to a session that is not `ready`, so a looser rule would only pick
sessions that then fail. `pickClientGatewaySession` returns the requested
session when it is eligible, otherwise the only eligible session. With two
eligible sessions and none requested it returns `undefined`, leaving the choice
to the host.

```ts
const session = pickClientGatewaySession(gatewayView.sessions, {
  clientType: "extension",
  serves: (capability) => capability.id.startsWith("web."),
  requestedSessionId
});
```

## License

Source-available under the FluxIQ license included with this package.
Commercial rights outside its community terms are available from
[license@getfluxiq.com](mailto:license@getfluxiq.com).

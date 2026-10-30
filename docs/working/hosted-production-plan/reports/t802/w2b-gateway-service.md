# t802 W2b: client-gateway service hardening (hosted lane A)

Worker report. Tree `fxwork/t802/!FluxIQ`, branch `task/t802-hosted-gateway-hardening`. Nothing
committed.

## Outcome

Done. All five goals are implemented with tests. The acceptance tests and `pnpm check` pass.
`pnpm structure:check` reports no client-gateway finding; it still fails on two findings in
another worker's untracked `platform/profile/` files (see Open questions 5).

## What changed and why

All under `packages/fluxiq/src/client-gateway/`.

**New module `service/security/`** (barrel `index.ts`). It is a subdirectory because
`service/` already has 22 files, past the advisory threshold of 15 and close to the limit of 25.
- `peer.ts`: `ClientGatewayPeer` (`{ address; prefix; source }`), `normalizeClientGatewayPeer`
  (a defensive copy), `clientGatewayPeerAuditFields` (gives `{ clientAddressPrefix }`, or `{}`
  with no peer), and `withoutClientGatewayAddresses` (drops full-address keys from transport
  metadata and turns a `peer` object into its prefix).
- `security-events.ts`: `CLIENT_GATEWAY_SECURITY_EVENT_TYPES`, which is `session.paired`
  (approved), `pairing.refused`, `pairing.dismissed`, `pairing.client_submit_rejected`,
  `pairing.withdrawn`, `pairing.refused_capacity`, `trust.revoked`,
  `session.credential_rejected`, `session.domain_rejected`, `session.protocol_version_refused`
  and `session.replaced`. Also `CLIENT_GATEWAY_TRANSPORT_EVENT_TYPES`, the suggested names
  `transport.origin_refused`, `transport.frame_too_large`, `transport.hello_deadline` and
  `transport.rate_limited`; any type is accepted. Also the listener type and
  `isClientGatewaySecurityEventType`.
- `pairing-limits.ts`: `ClientGatewayPairingLimits`, the defaults `{ perAddress: null, total:
  1000 }`, and a validator that throws `client_gateway.pairing_limits_invalid`.
- `pairing-capacity-error.ts`: `ClientGatewayPairingCapacityError`, with `code:
  "pairing.capacity_reached"` and `scope: "total" | "per_address"`.

**Owned files**
- `sessions.ts`: `create` accepts `peer`, stored as a copy on the InternalSession. `toPublic`
  strips `peer`. Ended sessions are bounded by `ClientGatewaySessionRetention` (`limit` default
  1000, `maxAgeMs` default `null` = off), dropping the oldest-disconnected first. The queue
  follows insertion order, and a session is added to it when `replace` records `disconnectedAt`.
  Pruning runs in `create`, `replace` and `list`, and costs O(1) when nothing is due. A pruned id
  is remembered (at most 10,000, oldest forgotten first), so `require` and `requireReady` still
  throw `Client session is disconnected.` for it. Live sessions are never pruned.
- `pairings.ts`: `nextCode` uses `crypto.randomInt(100000, 1000000)`, so the six-digit format is
  unchanged. The constructor takes an injected `addressOf(sessionId)` lookup. New methods
  `setLimits`, `getLimits` and `capacityRefusal(requestedBySessionId?)` count only waiting
  challenges (unconsumed, unexpired, after `pruneExpired`). A challenge whose session has no
  known address counts toward `total` only. An operator-created challenge has no session and is
  checked against `total` only.
- `audit-log.ts`: a ring of `limit` entries (default 10,000, option `auditLimit`) with O(1)
  append. `recent(n)` returns entries oldest first. `recordSecurity` always notifies;
  `onSecurityEvent(listener) => unsubscribe`. A listener that throws or rejects is recorded as
  `audit.security_listener_failed`, which is not itself a security event, so it cannot loop.
  Listeners receive a copy of the entry **without `metadata.pairingCode`**, because they persist
  durably and `pairing.refused` (`not_waiting`) can name a code that is still pending. The ring
  and snapshot keep the code as before. This is a decision I made; reverse it if the web layer
  needs the code.

**Minimal edits outside the owned files, each justified**
- `service.ts` (facade): `connect` gains `peer`. New methods `setPairingLimits`,
  `onSecurityEvent` and `recordTransportEvent(type, message, metadata?)`, which runs
  `withoutClientGatewayAddresses` and then `audit.recordSecurity`, and throws on an empty type.
  The facade has to keep the pairing registry to forward `setPairingLimits`. Wiring: the audit
  gets `auditLimit`, the sessions get their retention, and the pairing registry gets
  `addressOf = sessions.get(id)?.peer?.address ?? null`. The new types, the event-type lists and
  the error class are re-exported, so they reach the `fluxiq/client-gateway` barrel through the
  existing `export * from "./service.ts"`. `client-gateway/index.ts` is unchanged. The class now
  has 38 methods: the advisory threshold is 25 and the failure limit is 40.
- `service/lifecycle.ts`: `connect` passes `peer` and audits `clientAddressPrefix`.
  `handleHello` catches `ClientGatewayPairingCapacityError`, sends `server.error {code:
  "pairing.capacity_reached", message}` and then `server.disconnect`, and disconnects the session
  with reason `pairing capacity reached`. This mirrors the protocol-mismatch path, so an unpaired
  socket does not sit open. `resumeTrustedSession` now audits `session.replaced` for each older
  session it closes, because no audit entry for this existed.
- `service/pairing-flow.ts`: `create` checks `capacityRefusal`; over the cap it audits
  `pairing.refused_capacity` (sessionId, clientId, scope, prefix) and throws. `pairing.created`,
  `pairing.dismissed`, `pairing.withdrawn`, `pairing.refused` and `session.paired` carry the
  requesting session's `clientAddressPrefix` when it has a peer. The public API is not widened.
- `service/types.ts`: the options `pairingLimits`, `endedSessionLimit`, `endedSessionMaxAgeMs`
  and `auditLimit`; `InternalSession.peer`.
- `service/config.ts`: resolves those options (`pairingLimits`, `sessionRetention`,
  `auditLimit`).
- `service/index.ts`: `export * from "./security/index.ts"`.

**Local default behaviour.** With no options and no `peer`, the audit metadata for
`session.connected` and the pairing events is unchanged; a test asserts the exact
`session.connected` metadata. Pairing is never refused: the per-address cap is off, and the total
of 1000 waiting is out of reach for one user. One test runs 60 loopback hellos; another proves
the 1000th is admitted and the 1001st is refused. Ended sessions are dropped only beyond 1000
(previously unbounded). The audit keeps 10,000 entries (previously unbounded); the snapshot still
reads the last 100. The one addition is the new `session.replaced` audit entry on a trusted
reconnect.

**Session-id lookups checked before pruning** (what a pruned id now gets):
- `commands.ts` `startRecording`, `stopRecording`, `captureSnapshot`, `executeAction` and
  `markActiveRecording` use `requireReady`: they throw "Client session is disconnected." as
  before.
- `sendPing`, `sendError`, `answerReconcile`, `settleLate`, `transport.send`, `inbound.handle`
  and `admitProtocolVersion` use `require`. They now throw "Client session is disconnected."
  where they previously acted on the dead record: a closed socket and an outbound queue nobody
  reads.
- `command-ledger/dispatch.ts` uses `requireReady` (throws as before). Its settle uses
  `require`, which only follows a `pending` hit, and a pruned session cannot send a message.
- `executeDurable`: `get` returns undefined, so the channel-scope check is skipped and
  `durable.execute` then fails in `requireReady` as disconnected. This is the same outcome, but a
  pruned session no longer yields the channel-scope refusal code. Previously a disconnected
  scoped session crossing scopes got `channel_scope` first.
- Reconciler `sessionFor`: when `get` misses it falls back to `list()` by clientId, as for a
  session that is gone.
- Command history keeps sessionId and clientId itself and does not look them up.
- Access (`trust.revoked`, `authorizeToken`) uses `findReady`/`listReadyByTrustedClient`, which
  only match `ready` sessions, so disconnected ones were never included.
- Views, summaries and the activity publisher use `list()`, so pruned sessions are simply absent.
- `lifecycle.disconnect` returns `null` for a pruned id (previously it re-disconnected the record
  and returned it). `isScoped` returns false. `transport.outbound` returns `[]`. `clearOutbound`
  is a no-op.
- Pairing-flow `dismiss` and `complete` use `get`. `complete` throws
  `pairing.client_disconnected`, and its pairings were already withdrawn at disconnect.
- Trace tap `clientIdOf` and `sessionViewOf` return undefined, so nothing is claimed or recorded
  for a pruned id.
- Outside client-gateway, `programs/automation-studio/client-gateway/bridge.ts` `session(id)`
  looks up `snapshot().sessions`, so for a pruned id it throws its own "Unknown client gateway
  session". I did not change it (`programs/**` is must-not-touch); only sessions beyond the
  1000 newest ended ones are affected.

## Commands run and observed results

- `tsc --noEmit -p .` (packages/fluxiq, before the tests): no output, clean.
- Narrow vitest runs while iterating: the first run had 1 failure, my test passing a session
  object as an id. After the fix, 5 files and 37 tests passed. After the listener pairing-code
  change, `service-hardening` and `audit-log` re-ran with 17/17 passed.
- Acceptance, from packages/fluxiq, in the shared lock (`L=.../heavy-check.lock; until mkdir $L
  ...; pnpm test src/client-gateway; pnpm check; rmdir $L`). It queued at 11:28:33, took the lock
  at 11:29:13 and released it at 11:30:27.
  - `pnpm test src/client-gateway` exited 0. Parallel group: `Test Files 53 passed (53)`,
    `Tests 334 passed (334)`, including `service-hardening.test.ts (11)`, `sessions.test.ts (10)`,
    `pairings.test.ts (5)` and `audit-log.test.ts (6)`. Real-sql group: `No test files found,
    exiting with code 0`, because no client-gateway test is in that group. Then `[vitest-groups]
    all groups passed: parallel, real-sql`.
  - `pnpm check` exited 0: build-cache `fluxiq:check` ran tsc (`reason: no stamp`, 56.9 s).
- A consumer check I added, in the lock: `pnpm test src/programs/automation-studio/client-gateway`
  exited 0. Parallel: 3 files and 11 tests passed. Real-sql: 2 files and 29 tests passed (the
  bridge tests).
- `pnpm structure:check` (Core root, after the final edit): `structure-audit: 2 violation(s)
  across 1 rule(s)`. Both are `web-vocabulary` "cookie" in `platform/profile/`, which is not
  mine. There are no client-gateway findings. Remaining advisories: `ClientGatewayService` has 38
  methods (advisory 25, limit 40), and `service/` still has 22 files.
- One abandoned run: my first acceptance job was stopped while still queued for the lock, before
  acquiring it. Its scratch log name collided with another task's file in the shared scratchpad,
  so I requeued it with names unique to this brief (`t802-w2b-gw-*`).

**New tests** cover each acceptance item:
- Peer stored and not public: `sessions.test.ts` "stores a copy…", and `service-hardening`
  "keeps the peer off every public surface…". The latter covers snapshot, summaries, events and
  outbound, and checks the full address is absent.
- Prefix-only audit: the same `service-hardening` test (`session.connected` and `pairing.created`
  carry `clientAddressPrefix`), plus "audits a session connected without a peer exactly as
  before".
- Crypto code format: `pairings.test.ts`. 300 codes all match `^[1-9]\d{5}$` and are unique, and
  `Math.random` is never called.
- Both caps: `pairings.test.ts` covers total (consumed and expired challenges free a slot),
  per-address (an unknown address and an operator challenge are exempt) and validation.
  `service-hardening` covers the hello refused with `server.error` `pairing.capacity_reached`
  then `server.disconnect`, the audit entry and the listener, plus another address still pairing
  and the operator total cap.
- Defaults never refuse a local client: `service-hardening` runs 60 loopback hellos, and
  `pairings.test.ts` checks 1000 waiting are admitted and the 1001st is refused.
- Pruning: `sessions.test.ts` covers the count bound with oldest-disconnected order, live
  sessions never pruned, the age bound, no age bound by default, and a pruned id refused as
  disconnected. `service-hardening` checks `executeAction` and `startRecording` to a pruned id
  throw "Client session is disconnected.", the live session is unaffected, and 1,005 reconnects
  keep 1,000.
- Ring cap: `audit-log.test.ts` (limit 3, default 10,000, order), and `service-hardening`
  `auditLimit: 5`.
- Security listener and unsubscribe: `audit-log.test.ts` (delivery, unsubscribe, throw/reject
  audited). `service-hardening` covers `recordTransportEvent`, with addresses stripped and `peer`
  turned into its prefix, and pairing approved, dismissed, withdrawn, `trust.revoked` and
  `session.replaced` reaching the listener with no pairing code.

## Not verified

- I did not exercise the WebSocket transport passing `peer`, calling `setPairingLimits` at start,
  or calling `recordTransportEvent`: that is the other worker's code.
- No browser or live run.
- The full Core suite (`pnpm test` at the root) and `pnpm build` were not run. Per the
  repository's rule they belong to the twice-daily sweep.
- The age bound (`endedSessionMaxAgeMs`) is tested at the registry level only.
- No authored documentation was updated: docs were not in my owned paths. Core's client-gateway
  architecture doc should gain the new options, `connect({ peer })`, `setPairingLimits`,
  `onSecurityEvent`, `recordTransportEvent`, and the `pairing.capacity_reached` error the client
  can now receive.

## Open questions or contradictions found

1. **Per-address key.** The cap is keyed on the full `peer.address`. For IPv6 a client controls a
   whole /64, so the transport may want to key on the prefix. If so, change `addressOf` in
   `service.ts` to return `peer.prefix` (one line).
2. **Age pruning is off by default** to keep local behaviour identical. Hosted profiles should
   pass `endedSessionMaxAgeMs: 3_600_000`. There is no runtime setter for it; add one if the
   transport must set it at start as it does the pairing limits.
3. **Consumed pairings are never removed** from the pairing registry: `pruneExpired` keeps
   consumed entries. Growth is small (one per approval), but it is unbounded. I left it because it
   is outside this brief's caps and the snapshot lists them.
4. **Pairing codes in the audit.** `pairing.created` and the others still carry `pairingCode` in
   the ring and snapshot, as today. Listeners never receive it (see audit-log above).
5. **`structure:check` fails on code that is not mine.** Two `web-vocabulary` ("cookie")
   findings in `packages/fluxiq/src/platform/profile/{resolve/deployment-settings.ts,types.ts}`,
   untracked files from another worker. Before my edits a third (`naming`) finding was there too,
   since fixed by its owner. No finding is in client-gateway.
6. No contract change was needed; `packages/contracts` is untouched.

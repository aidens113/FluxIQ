# Credential persistence failure transition

Outcome: Done. Bounded transport and reconnecting-connection changes are source-stable for independent lead acceptance. No wire protocol, public event/type contract, kernel, contracts, extension, web route, build/dist or git mutation was performed.

## Changes and behavior

- `packages/client-gateway-websocket/src/transport.ts`: all incoming messages serialize in socket order. A `server.session_ready` write is therefore a barrier for later raw messages, commands, activity and session-id changes too. The transport adopts the new credential/session, acknowledges receipt and publishes readiness only after storage succeeds. Every socket callback and asynchronous persistence/read continuation is bound to its actual socket. Late close/error/message events and late storage resolve/reject from a replaced socket cannot change or publish the current session. Explicit close publishes one safe close event immediately and suppresses its later native duplicate.
- `packages/client-gateway-websocket/src/credential-persistence-error.ts`: internal, fixed-message error carried by the existing `error` event, distinguishing reading from saving through fixed safe text. The original rejection is never retained in a message, cause, close reason, log or host event. Active read/write failure closes the affected socket with a safe reason and publishes one error/close transition; failed reads send no hello, and failed writes publish or acknowledge no readiness. Best-effort socket close cannot suppress the terminal transition if the socket implementation throws.
- `packages/client-gateway-websocket/src/connection/connection.ts`: host credential writes serialize across transport records, and later reads wait for pending writes. Recognized persistence failure stops reconnects and heartbeats, clears record readiness and retains the error state. Ordinary WebSocket errors and dropped connections retain their automatic-reconnect behavior. Readiness/lineage continuations check record ownership after asynchronous work. Connect-attempt generation prevents a slow or failed older `beforeConnect` from replacing a newer ready connection; deliberate close/stop invalidates pending attempts. The current record is retired before deliberate close so its public event cannot schedule a spurious reconnect. A person can explicitly reconnect after storage recovers, using the previously committed credential and existing outbox lineage.
- Owning tests: `src/tests/{transport,index}.test.ts`, `src/connection/tests/connection.test.ts`, and its `fake-socket.ts` fixture. Cases cover synchronous throws and asynchronous read/write rejection, no raw/typed ready or receipt acknowledgement before commit, queued commands/activity on commit success/failure, sanitized rejection, late storage resolve/reject and socket events after replacement, write ordering, single explicit close, delayed connection attempts, committed-credential recovery after a lost acknowledgement, preserved outbox contents and later lineage recovery, and recoverable generic network errors. Existing fixtures now await actual transport events; the send-envelope fixture includes the ordinary acknowledgement.

The approved ownership expansion to `connection/connection.ts` and its adjacent tests was necessary because the existing generic close handler would otherwise automatically reconnect after a transport storage failure. The internal error class is not a new server message or public wire failure code.

## Validation

- `pnpm.cmd --dir packages/client-gateway-websocket exec vitest run src/tests/transport.test.ts src/tests/index.test.ts src/connection/tests/connection.test.ts src/connection/tests/queue-loss.test.ts` → first diagnostic run: 63 passed, 2 failed. Both failures were existing envelope-fixture assumptions that session id adoption occurred synchronously with frame delivery. The corrected fixture passed all 65. Lead review then identified following-frame ordering, read failure, close compatibility and delayed-attempt gaps; those were fixed with regressions. Final run: **4 files passed, 77 tests passed** (transport 23, index 4, connection 47, queue-loss 3).
- `pnpm.cmd --dir packages/client-gateway-websocket exec tsc --noEmit --incremental false` → **exit 0** on the final source, as on the earlier diagnostic runs.
- `git diff --check -- packages/client-gateway-websocket` → **exit 0** at source review; no whitespace errors.

No package build, dist write, real server/browser/provider execution, whole suite or shared-document edit was run. The lead still owns independent acceptance and coordinated build/release.

## Concrete limits

An external storage write already started cannot be undone by retiring its socket. Serialization prevents it from finishing after a newer write in the same transport/reconnecting connection; generation checks prevent stale adoption, acknowledgement, publication or terminal failure. A never-settling host write keeps later serialized credential work waiting; this change does not invent cancellation or a storage timeout. Separate independent connection objects sharing a store must still coordinate that store through their owning host. The host storage port remains responsible for durable completion semantics and secret custody.

The current/previous credential rules remain server-owned and unchanged. Lost acknowledgement still recovers by the next use of the committed credential; failed persistence never sends that acknowledgement. No second authentication, default lock or key-unlock ceremony was introduced.

Outcome: Done
Changed: Core client-gateway-websocket transport, internal persistence error, reconnecting connection, four adjacent test/fixture files; this report.
Validation: focused Vitest command above → 77/77 passed; no-emit TypeScript → exit 0.
Not verified: independent lead rerun, package build/dist, real server/browser/provider behavior, cross-object host storage coordination.
Report: `docs/working/hosted-platform-launch-plan/reports/credential-persistence-failure.md`
Notes: No wire contract change. Storage rejection is terminal until explicit reconnect. Build/dist untouched.

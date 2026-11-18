# Durable SDK key sessions

Outcome: Done for the owned authentication capability, 2026-11-14.

## Implemented

- `packages/fluxiq/src/platform/keys/` owns trusted enrolled public keys, strict SDK proof validation, digest-only bearer sessions and dedicated real-SQLite storage. No private keys are accepted or persisted. A public key arriving with a proof never enrolls a key.
- Proof bytes match the existing SDK: `FLUXIQ1-ED25519`, SPKI-derived `fxk_` ID, seven newline-separated fields, exact session purpose and `"{}"` payload. Validation requires canonical base64url, 16-byte nonce, 64-byte signature, canonical 44-byte Ed25519 SPKI, valid UTC proof time within +/-300 seconds, and the exact configured audience. Extra/missing fields, CR/LF, other algorithms and malformed dates are refused.
- SQLite uses a new connection per operation, explicit `journal_mode=DELETE`, `synchronous=FULL` and `BEGIN IMMEDIATE`; nonce consumption, digest-only session insertion and key last-use update share one durable transaction. Nonces remain consumed for 600 seconds. Enrollment cannot rebind or reactivate an existing revoked key. Session/key revocation persists across reopen. Sessions persist their audience, preventing a different origin or instance sharing the database from accepting their bearers.
- Native SQLite busy waits originally starved libuv's worker pool during the eight-connection regression. Blocking native busy waits are disabled; asynchronous `SQLITE_BUSY` waits allow the lock holder's statements to run. A subsequent independent rerun exposed a separate WAL initialization race: SQL-only diagnostic instrumentation found `SQLITE_PROTOCOL` inside `pragma journal_mode = WAL` before `BEGIN`, after approximately 10.8/21.7 seconds. The final implementation uses rollback journals, removing WAL shared-memory initialization/last-close cleanup from this short-transaction store. SQLite documents the [WAL protocol race](https://www.sqlite.org/rescode.html#protocol) and its [connection-close cleanup](https://www.sqlite.org/wal.html). No contender count or deadline was reduced/increased, no error suppressed, and no existing user database was opened or migrated.
- SQLite remains the cross-process serialization authority. Each contended SQL statement retains the existing repository infrastructure's ten-second lock deadline; expiry propagates a storage failure, and HTTP maps it to a safe unavailable response.
- Required trusted eligibility callback checks enabled account and active membership at enrollment, issuance, management listing and every authentication. False, missing, non-true or thrown results fail closed. Authentication reads active state again after eligibility IO to catch intervening revocation/expiry. Returned IAM principals identify the enrolled user/workspace; downstream operations still need resource authorization.
- `packages/fluxiq/src/server/keys-api/` is an injected Node handler only. It accepts `POST /api/keys/session`, JSON and `FluxIQ-Client: sdk`, limits the fixed proof body's buffered size, and returns safe uncached JSON. It starts no listener and provides no enrollment route or remote open-mode fallback.

## Integration API

Import platform exports from `fluxiq/platform`, the handler from `fluxiq/server`:

```ts
const store = createSQLiteKeyStore({ filePath: "/configured/platform/keys.sqlite" });
const service = createKeySessionService({
  store,
  origin: "https://app.example.com",
  instanceId: "stable-operator-configured-instance",
  eligible: async ({ userId, workspaceId }) => enabledAccountAndActiveMembership(userId, workspaceId)
});
const nodeHandler = keysApiHandler(service);
```

- `origin` must be an exact HTTPS origin, or HTTP on loopback. Never derive it from Host or forwarded headers. Instance IDs match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and must match stable discovery configuration.
- `sessionLifetimeMs` defaults to 3,600,000; accepted integer range is 900,000 through 43,200,000. `now?: () => number` is the injectable clock.
- `service.enrollKey({ publicKey, userId, workspaceId })` returns `EnrolledKeyRecord { keyId, publicKey, userId, workspaceId, createdAtMs, revokedAtMs, lastUsedAtMs }`. `publicKey` is canonical base64url SPKI DER. This is an **already-authorized in-process enrollment port**, not authorization or trust-on-first-use.
- `service.listKeys({ userId, workspaceId })` returns those binding-scoped records, including revoked records. Caller must authorize the requested binding.
- `service.exchange(proof: unknown)` returns `{ sessionToken, expiresAt, serverTime }`, with epoch-millisecond times and an `fxs1.` bearer.
- `service.authenticate(rawBearerToken)` returns `{ principal: IamPrincipal, keyId, createdAtMs, expiresAtMs }`. Pass the raw token, without the `Bearer ` prefix. There is no unkeyed authentication path.
- `service.revokeKey(keyId)` and `service.revokeSession(rawBearerToken)` are trusted administrative ports returning booleans. Their HTTP callers must be separately authorized.
- `store.close()` drains in-flight operations and rejects new operations. Connections already close after every operation; reopen by constructing a new store.
- Public `KeySessionError` exposes fixed safe `message`, `code`, `status` and optional `serverTime`. Bad proof/enrollment is 400; authentication refusals are 401. Unknown internal errors must map to 503 `key.unavailable`, without serializing the underlying exception.

## Validation

- Initial `pnpm --filter fluxiq exec vitest run ...` launch failed before running tests because PowerShell blocked `pnpm.ps1`; invoking `pnpm.cmd` resolved the shell issue.
- Initial proof/storage run: 31 passed, one concurrent-replay regression failed with `SQLITE_BUSY` after about ten seconds. The failure demonstrated the native worker-pool starvation above; the asynchronous contention fix resolved it.
- The first complete 45-test run passed, but the lead's independent rerun failed its connection race. A diagnostic run reproduced `SQLITE_PROTOCOL` on WAL initialization. These superseded results are not acceptance.
- After the rollback-journal fix, `pnpm.cmd --filter fluxiq exec vitest run src/platform/keys src/server/keys-api` -> **4 files and 58 tests passed**, duration 7.92 seconds, including SQL-only diagnostic instrumentation.
- After removing that instrumentation, the same complete command ran **twice consecutively: 58/58 passed in 6.40 seconds, then 58/58 passed in 6.76 seconds** (observed 2026-11-14). Exact repeated invocation: `1..2 | ForEach-Object { & pnpm.cmd --filter fluxiq exec vitest run src/platform/keys src/server/keys-api; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }`.
- Each final run includes twelve separate rounds of eight simultaneous independent connections; a fresh database initialized concurrently by eight connections with explicit journal-mode checks before/after reopen; and eight actual Node child processes released behind an IPC ready barrier, proving exactly one session issue and seven replay refusals. Child processes receive only synthetic database path, public key ID and clock; no private keys or bearers are sent or logged.
- Other tests exercise SDK-signed proof bytes; malformed/foreign proofs; exact timestamp limits; Ed25519-only SPKI; real SQLite persistence/reopen; transactional rollback; 600-second nonce retention; digest-only disk contents; key/session revocation; cross-origin/instance shared-database refusal; enabled-account/membership checks and callback failure; revocation after eligibility IO; expiration; real loopback HTTP SDK exchange, discovery, cache, renewal, invalidation and skew correction; safe HTTP refusal and internal errors.

Not run by this worker: package-wide builds/typechecks, full suites or structure audit while peers edited; lead owns coordinated checks. No browser, model, cloud, email, paid service or live user data was used.

## Limits and ownership

Headless/web mounts, deployment composition, authenticated enrollment/revocation UI routes, resource IAM enforcement and stable discovery configuration belong to the lead/other workers. This capability does not change FluxNode or automation execution and does not claim hosted runs are enabled. Existing SDK/contracts source and package metadata were unchanged by this worker. No new dependency was needed.

## Return contract

Outcome: Done
Changed: packages/fluxiq/src/platform/keys/**; packages/fluxiq/src/server/keys-api/**; packages/fluxiq/src/platform/index.ts; packages/fluxiq/src/server/index.ts; docs/working/hosted-platform-launch-plan/reports/key-sessions.md
Validation: `pnpm.cmd --filter fluxiq exec vitest run src/platform/keys src/server/keys-api` -> 4 test files and 58 tests passed twice consecutively, 6.40s and 6.76s; twelve 8-connection rounds plus eight real competing processes per run.
Not verified: package-wide typechecks/builds/structure audit (lead-owned coordinated checks), deployment mounts, hosted execution, live browser/cloud/model behavior.
Report: docs/working/hosted-platform-launch-plan/reports/key-sessions.md
Notes: Required trusted eligibility and already-authorized enrollment; audience-bound sessions, SQLite-atomic nonce use and digest-only bearer persistence. Rollback journal removes reproduced WAL protocol race. No commits or pushes by worker.

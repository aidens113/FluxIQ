# t802 W2a: client gateway WebSocket transport hardening

## Outcome

Partial. All seven transport items and the lane validation test are written and
pass (28/28) once the Origin grammar can be loaded. One change outside this
brief's ownership is still needed: **`fluxiq/platform/profile` must re-export the
contract's Origin grammar**, and Core's dist must be rebuilt after it. Until
then, `tsc` reports 4 missing exports, and every test that starts a server
fails with `parseClientGatewayOriginAllowlist is not a function`.

### The blocker, and the one-line fix

The brief says to use `@fluxiq/contracts/platform`. The web app cannot load
that specifier:

- `apps/web` does not depend on `@fluxiq/contracts`, so Node and vitest cannot
  resolve it. Observed:
  `import.meta.resolve("@fluxiq/contracts/platform")` -> `ERR_MODULE_NOT_FOUND`
  from `apps/web/src/server/`. `apps/web/src/features/automation-studio/datasets/types.ts`
  records the same rule: the web app reaches contracts only through a `fluxiq`
  subpath.
- Bundling the contracts source into the gateway server instead (a relative
  import or the tsconfig path) is refused by the build's identity stamp.
  Observed: `Error: Server bundle reached an undeclared source: packages/contracts/src/platform/origin/origin-admission.ts`.
  Its inventory is `apps/web/scripts/gateway-server-identity/inventory.mjs`,
  which this brief does not own.
- Importing contracts `dist/` by relative path (as `lib/request-guard/platform-contracts.ts`
  does) fails both that same stamp and the `package-exports` audit rule.

So the transport takes the grammar from `fluxiq/platform/profile`. The bundle
keeps that subpath external, and it already holds the profile helpers the
transport uses. The one place that names it is
`apps/web/src/server/client-gateway-websocket/origin-grammar.ts`. The Core change
that makes everything resolve, in `packages/fluxiq/src/platform/profile/index.ts`:

```ts
export { admitClientGatewayOrigin, clientGatewayOriginStartRefusal, isPublicClientGatewayBind, parseClientGatewayOriginAllowlist } from "@fluxiq/contracts/platform";
```

After that, Core's libraries need a rebuild
(`pnpm --filter @fluxiq/contracts --filter fluxiq build`) so the dist has the
re-export.

To check the behaviour itself, I temporarily pointed `origin-grammar.ts` at
`../../../../../packages/contracts/src/platform/origin/index.ts`, ran the tests
(28/28 passed), then put the final version back. The final version is what is
on disk now.

## What changed and why

Entry `apps/web/src/server/client-gateway-websocket.ts` (same path; it still
exports `startClientGatewayWebSocketServer`, `parseAllowedOrigins` and
`isLoopbackHost`; `isOriginAllowed` is removed):

- New options: `profile?` (default `local`), `publicUrl?`, `trustProxy?` and
  `limits?: Partial<FluxIQDeploymentSettings["gateway"]["limits"]>`.
  `allowedOrigins?: string[]` stays, as raw entries.
- New handle methods: `beginDrain({ retryAfterMs, reason? })` and
  `openConnectionCount()`. The input type is exported as
  `ClientGatewayDrainInput`, with `reason` being
  `ClientGatewayGoingAwayNotice["reason"]` (`"shutdown" | "restart"`).
- The health JSON gains `draining`.
- Upgrades are checked in this order: path (404), drain (503 with
  `Retry-After`), Origin (403, audited), gateway disabled (503), then accept.

New folder `apps/web/src/server/client-gateway-websocket/`, one thing per file,
with a barrel:

- `origin-grammar.ts`: the single bridge to the contract's grammar (see above).
  It is not in the barrel.
- `origin-policy.ts`: parses the allowlist with the contract grammar and fixes
  the rule at start.
  - On a public gateway, a refused entry throws.
  - On a non-public one, a refused entry is warned about and dropped.
  - `clientGatewayOriginStartRefusal` throws when there are no rules.
  - Per upgrade, `admitClientGatewayOrigin` decides. This replaces the old
    beyond-loopback check.
- `transport-limits.ts`: fills in omitted limits with Core's `local` values
  (256 MiB frame cap, all else off, 1,000 pending pairings in total) and
  validates them.
- `read-frame.ts`: judges a frame by its declared length, before the payload is
  buffered (`too_large` comes straight from the header).
  `encode-frame.ts` writes server frames.
- `native-connection.ts`: the RFC 6455 connection.
  - A frame cap, a pending-buffer cap and a fragmented-message cap each close
    the socket with 1009 and destroy it.
  - The token bucket closes it with 1008.
  - It also fixes a half-open leak: the HTTP server's sockets allow half-open,
    so a client that left without a close frame kept the upgraded socket, its
    session and `server.close()` waiting forever. This showed up as hanging
    tests. The socket is now destroyed on the peer's `end`.
- `token-bucket.ts` and `rate-limit.ts`: one bucket per socket. An unset burst
  means one second's worth. Data messages and ping/pong each take a token.
- `is-client-hello.ts` and `accept-socket.ts`: the handshake, plus
  `gateway.connect({ socket, peer })`.
  - The hello deadline stops at the first complete text message whose `type` is
    `client.hello`; if it fires, the socket is closed with 1008.
  - Every refusal is reported through `gateway.recordTransportEvent`
    (`transport.frame_too_large`, `transport.hello_deadline`,
    `transport.rate_limited`) with `clientAddressPrefix` only.
  - The session is disconnected with the refusal's reason.
- `client-peer.ts`: `resolveClientAddress` + `clientAddressPrefix` build the
  `ClientGatewayPeer`. `X-Forwarded-For` is read only with `trustProxy`.
- `server-envelope.ts` (for `server.error` and `server.going_away`) and
  `reject-upgrade.ts`.
- Pairing limits: when `limits` is given, start calls
  `gateway.setPairingLimits({ perAddress, total })`. Without `limits`, nothing
  is called, so a gateway constructed with its own `pairingLimits` keeps them.
- Origin refusals are audited as `transport.origin_refused`, with `reason`, the
  `origin` (at most 200 characters) and `clientAddressPrefix`.

Tests:

- `apps/web/src/server/tests/client-gateway-websocket.test.ts` (updated).
  - The old exact-match test ("missing Origin refused when an allowlist is set")
    is replaced by the N7 table: missing or empty is admitted on local and
    self-hosted loopback, and refused on service and on a `0.0.0.0` bind.
  - It also covers grammar admission (exact, `moz-extension://*`, a web origin
    refused), the start refusals, and the warn-and-drop.
  - Over loopback, it covers: a local install with no deadline or rate limit,
    the rate limit (1008 plus audit), a fragmented message past the cap (1009
    plus audit metadata), a hello in time being kept, and drain (one
    `server.going_away` per socket, 503 with `Retry-After: 3`, the count
    falling as a socket closes). It also checks `setPairingLimits` at start.
- New `client-gateway-websocket/tests/` with read-frame, token-bucket and
  transport-limits tests, and `raw-websocket-client.ts`: test support that sends
  any Origin or headers, masks its frames, and can declare a length it never
  sends.
- New lane validation `apps/web/src/server/tests/client-gateway-websocket-wss.test.ts`.
  - A self-signed certificate is made at test time with `openssl` (found on
    PATH or under Git for Windows) in an `mkdtemp` directory, which is removed
    in `afterAll`. Nothing is committed.
  - A Node TLS proxy terminates TLS and appends `X-Forwarded-For` to a real
    `ClientGatewayService` behind the server, under `profile: "service"` with
    `trustProxy`.
  - What it proves:
    - a wss hello reaches `server.pairing_required`;
    - a web Origin and a missing Origin get 403 and are audited with the
      forwarded prefix;
    - a frame declaring 1 MiB against a 64 KiB cap closes with 1009 after 16
      bytes;
    - a silent socket is closed with 1008 at a 300 ms deadline;
    - the session's `session.connected` audit prefix is `198.51.100.0/24`, the
      proxy-appended address, not the client's spoofed `10.9.9.9`;
    - neither full address appears in the snapshot.
  - Caddy itself was not run (it is not installed).

Doc `docs/integrations/client-gateway-websocket.md`: a new "Hosted Transport
Settings" section covering the env names, the Origin grammar and the N7 rule,
the limits and their audit types, the client address and trust proxy, and drain
with the `server.going_away` shape. The Notes now say what a custom adapter must
also do, and where the tests are.

## Commands run and observed results

- `pnpm exec vitest run src/server/tests src/server/client-gateway-websocket/tests`
  (from `apps/web`):
  - First run, interim bridge: 3 tests and the wss suite's hook timed out,
    because `close()` waited on half-open sockets. Fixed in
    `native-connection.ts`.
  - With the interim bridge, after the fix (run twice, the second after the
    last edits): `Test Files 5 passed (5)`, `Tests 28 passed (28)`. The wss
    suite ran (5 tests, not skipped).
  - With the final bridge, before the Core re-export: the server-starting tests
    fail with `TypeError: parseClientGatewayOriginAllowlist is not a function`
    (13 failed in the loopback file, the wss suite failed in `beforeAll`). The
    3 unit files pass.
- `node scripts/build-client-gateway-server.mjs` (from `apps/web`):
  - Interim bridge: `Error: Server bundle reached an undeclared source: packages/contracts/src/platform/origin/origin-admission.ts`.
  - Final bridge: `Native client gateway server artifact and companion generated.`,
    exit 0. The bundle imports only `fluxiq/client-gateway` and
    `fluxiq/platform/profile`.
- `(cd apps/web && pnpm exec tsc --noEmit)`, in the lock:
  - Run 1, interim bridge: two errors. One was mine
    (`native-connection.ts(56,5)` Buffer generic), now fixed. The other was
    `src/lib/fluxiq.ts(375,25)`.
  - Run 2, final bridge: `src/lib/fluxiq.ts(375,25)`, four errors in
    `origin-grammar.ts` (`Module '"fluxiq/platform/profile"' has no exported member ...`)
    for the missing re-export, and one implicit-any in `origin-policy.ts(32)`
    that followed from them. I gave that parameter an explicit type, so it no
    longer depends on the re-export.
- `pnpm structure:check` (Core root, in the lock):
  - Run 1: 3 violations. One was mine (`statement-packing` in
    `client-gateway-websocket/tests/raw-websocket-client.ts:98`), now fixed. The
    other two are outside my ownership:
    - `failure-as-empty` in `apps/web/src/app/reset/request/route.ts:22`;
    - `package-exports` in `apps/web/src/lib/request-guard/platform-contracts.ts`
      (relative loads of contracts `dist/`).
  - Run 2, final bridge, after my fix: `structure-audit: 1 violation(s) across 1 rule(s).` The one left is `package-exports` in `apps/web/src/lib/request-guard/platform-contracts.ts`, which is not mine. The `failure-as-empty` one in `app/reset/request/route.ts` had been fixed by its owner in the meantime. No finding names a `client-gateway-websocket` path. One advisory warning does:
    `apps/web/src/server/client-gateway-websocket/: 16 source files is past the 15-file advisory threshold`
    (the fail limit is 25).
- Temp-directory cleanup. The first, hanging run left one throwaway
  certificate directory in the system temp directory. Its `afterAll` hung on
  `close()` before `rmSync`. I deleted it, and the test now removes the
  certificate directory first in `afterAll`. Final rerun with the interim
  bridge: `Tests 28 passed (28)`, and 0 `fluxiq-wss-*` directories were left.
  The final bridge was then restored and the bundle rebuilt (exit 0).

## Not verified

- Nothing has run against the final bridge with the Core re-export in place,
  because that change is in `packages/**`. It was verified with the identical
  grammar loaded from source (28/28).
- Caddy itself was not run (not installed); a Node TLS proxy stood in for it.
- No live browser extension connected through it.
- I did not check whether Next's production build (`pnpm build`) compiles the
  entry through `lib/fluxiq.ts`. It imports `fluxiq/platform/profile`, which is
  already a public subpath.
- The full suites were not run.

## Open questions or contradictions found

1. The brief names `@fluxiq/contracts/platform`, but the web app cannot load it
   (see Outcome). It needs the re-export above, or a decision to add
   `@fluxiq/contracts` to the web app's dependencies, to `external` in
   `build-client-gateway-server.mjs` and to the identity inventory.
2. The other worker's `apps/web/src/server/drain/drain-gateway.ts` declares
   `DrainableGateway.beginDrain(options: { retryAfterMs: number; reason: string })`,
   with `reason` required and any string. The brief fixes
   `reason?: "shutdown" | "restart"`. The handle implements the brief, which is
   why `src/lib/fluxiq.ts(375,25)` does not typecheck. The fix belongs in
   `drain-gateway.ts`: `reason?: "shutdown" | "restart"`.
3. `beginDrain` sends `server.going_away` once per socket. Later calls only
   update the `Retry-After` for new upgrades. Sockets are left for clients to
   close: the drain worker's own loop polls `openConnectionCount()` and then
   closes the listener.

# Browser credential binding discovery

Outcome: Done (read-only discovery; implementation and runtime acceptance not claimed).

## What exists versus what discovery advertises

`apps/web/src/app/api/discovery/build-discovery-document.ts` advertises `/connect/authorize`, `/connect`, `/api/connect/token` and `/api/connect/revoke` unconditionally. The Core checkout has **no corresponding web page/API handlers**, no PKCE authorization-code service and no runtime consumers of `connectAuthorizeRequestSchema`, `connectTokenRequestSchema` or `ConnectedClientRecord`. These are contracts, not a working connect flow:

- `packages/contracts/src/platform/connect/authorize-request.ts`: client id, fixed redirect, S256 challenge, state, install id and label.
- `token/{request,response}.ts`: one-use authorization-code exchange bound to install/redirect/verifier, returning credential/user/workspace/gateway URL. Client sends returned credential as `client.hello.token`.
- `connected-client.ts`: public persisted-shape contract with workspace/user, current/previous SHA-256, expiry/revocation and approving **session digest** for audit. It has no implementation store.
- `pkce.ts` validates string shapes only; it does not hash/compare verifiers, mint codes or redeem them atomically.

The working consumer trust path is older reference-code pairing, plus managed-host enrollment. Do not report hosted connect as completed from discovery/schema tests.

## Actual token lifecycle

1. `server/client-gateway-websocket/accept-socket.ts` accepts HTTP upgrade, constructs `NativeWebSocketConnection` and immediately calls the single supplied gateway's `connect` before seeing hello. Frame/rate/hello limits work, but a tenant cannot be chosen there today.
2. `client-gateway/service/lifecycle.ts:handleHello` applies untrusted hello metadata. An `enrolmentTicket` goes exclusively to managed-host enrollment. Otherwise a token is resumed, or the session becomes `pairing_required` and gets a reference code.
3. Web `app/api/client-gateway/approve-pairing/route.ts` authenticates the panel cookie, evaluates IAM and optionally validates password/TOTP, then calls `gateway.approvePairing`. It currently uses primary for all data. `pairing-flow.ts` requires the challenge's still-connected waiting session; it cannot enroll a future socket.
4. `trust-grant.ts:grant` calls `trustedClients.register`, persists trust, verifies late disconnect/refusal, ends earlier trust for the same client+approver, binds the session, calls key custody, and sends the one-time token in `server.session_ready`.
5. `trusted-clients.ts` stores a random trustedClientId, approver user id, declared domain, current SHA-256 token hash and optional prior hash/grace, expiry, revocation and a private per-client `reuseKey`. Modern token format is `<trustedClientId>.<random-secret>.<HMAC-prefix>`; no raw token is stored. The id is an untrusted lookup hint until credential proof is checked. Old records/tokens without the signed format are supported by current digest lookup.
6. Reconnect verifies active trust, matching clientId and matching declared domain, rotates and persists the credential before sending it. A lost rotation reply preserves the previous credential for the existing confirmation window; confirmation removes it. Old signed credentials outside allowed windows detect reuse and revoke trust. `trusted-clients.ts:rotateToken` rolls memory back when `trustedClientStore.save` fails.
7. `access.ts:authorizeToken` validates the tenant registry token, active trust, **a live ready session**, and declared domain; it handles reuse, confirmation, renewal and key-custody presentation. HTTP callers cannot currently authenticate a trusted browser with no live ready socket. `forgetByCredential` deliberately also works while disconnected. Revocation persists first, then forgets custody and disconnects matching live sessions.
8. `programs/_shared/runtime.ts:createClientGatewayTrustedClientStore` persists a whole gateway's trust list in `ProgramJsonStore` at `programDataFile(paths.data, "client-gateway", "trusted-clients.json")`. Each workspace therefore has its own credential lookup; primary has no index across tenants.

**Mandatory persistence must not use credential custody.** `ClientGatewayCredentialCustodian.guarded` catches/audits every hook failure and explicitly leaves trust unaffected. Adding a binding in `issued`, `rotating` or `forgotten` custody callbacks can hand out a credential without its route, or leave revoked routes active. Routing persistence belongs in the authoritative trusted-client store transaction (or an equally mandatory awaited grant operation), not the best-effort key-custody observer.

## Smallest safe credential-to-workspace contract

Recommended store ownership: one platform-root browser-trust repository, with each record containing **trusted server workspace binding plus the existing complete trusted-client state**. A workspace-scoped `ClientGatewayTrustedClientStore` adapter loads/saves only that workspace's records; a platform credential verifier reads the same authoritative records without opening a workspace. This preserves one credential scheme and existing rotation/reuse state. Do not maintain an independently updated `hash -> workspace` cache beside tenant JSON as the authority.

The existing `ConnectedClientRecord` is useful for public views/audit, but is not a drop-in replacement: strict schema lacks `reuseKey`, managed-host binding and last-move metadata used by the current registry. Derive views from the private authoritative record; do not expose that private record through PlatformStore's public account/membership JSON contracts or log it. Do not discard signature/reuse detection to fit the older contract.

Minimum repository operations: scoped load/replace, lookup by trusted id, lookup by current/eligible previous digest for legacy tokens, and atomic revoke/update. Scoped replace must never overwrite another workspace's records; ownership cannot be reassigned by a save. Persist credential generation/rotation/confirmation/revocation and its workspace binding atomically, with a version/serialization strategy for any independent writer. If the platform verifier can revoke directly, loaded tenant registries need invalidation/current-state checking so they cannot revive a revoked row from stale memory. Prefer a single trust mutation owner with a platform read/verify facade in the first unit.

Pre-hello resolution:

- Boundedly parse and validate the **first** `client.hello` before creating a gateway session; never select by URL/body/hello workspace or arbitrary client id. Maintain frame/rate/deadline protection while unresolved, and serialize later frames behind resolution.
- For a modern token, use id prefix only to read one platform record, then verify digest/current-previous state or authentic signature/reuse classification using a shared primitive extracted from `trusted-clients.ts`. For legacy tokens, indexed digest lookup selects the record. No scan/open of tenant gateways.
- Validate active trust, stored owner identity enabled/not deleted, active membership and existing nonprimary workspace before `manager.acquire`. Validate hello clientId/domain against the stored binding. Expired/revoked/forged/unknown credentials acquire nothing. Platform lookup failures fail closed and never become “no clients.”
- A genuinely issued obsolete credential still needs existing reuse handling; refusing every unknown digest before signed-reuse classification would remove detection. An authentic signed obsolete token may identify its one tenant for **revocation**, but must never become an authorized socket/HTTP actor. Share existing request-in-flight versus hello semantics.
- Acquire exactly one tenant lease after proof; bind the transport build identity, limits and tenant security audit; connect/dispatch the already validated first hello to that gateway. Release once on every close, rejected/racing handshake, resolution error and server shutdown. If close happens during async lookup/acquire, never attach a late live session; release any lease obtained afterward.
- Recheck owner/membership/current authority on subsequent authenticated operations and wire disable/member-removal/account-deletion to persisted revoke plus live socket/key release. A socket must not keep authority merely because the first hello passed.

HTTP bearer resolution uses this same platform proof/binding, then acquires the matching tenant and calls its existing `authorizeToken` to preserve live-session/domain/custody restrictions. A platform row alone is never a ready gateway session. Cookie precedence remains the web route's contract; service `acceptBearer` becomes true only after this resolver exists.

## First complete bounded code unit and dependent public flow

**First unit: platform authoritative browser-trust store + gateway injection + real lifecycle tests.** This can be fully implemented/tested without pretending the absent connect UI exists. It must drive the real gateway through grant, rotate, confirm, revoke and restart using the platform scoped adapter, prove direct platform token lookup resolves the same workspace throughout, and prove save failure cannot issue an unrouteable token. Inject the store through FluxIQ/runtime construction instead of hardcoding a second trust database. This is a complete persistence/verification capability; it is not the hosted browser-connection acceptance.

**Smallest complete public connection path also requires new authenticated issuance.** The current pairing cannot bootstrap a tenant on an unbound service socket. Implement existing PKCE connect contract: authenticated consent resolves workspace from platform session; issue a short-lived single-use authorization code bound to user/workspace/approving-session digest/install/client/redirect/challenge; token exchange atomically consumes it, checks verifier and current identity/membership/workspace, and invokes a new **server-only ordinary-browser trust issuance operation** returning a credential before the socket exists. Current `approvePairing` cannot do this because it requires an existing pending session; current managed-host enrollment is not an ordinary browser enrollment API. Token exchange returns the existing `ConnectTokenResponse`, and hello then routes by that credential. Add consent/done/code-entry pages deliberately; none currently exists to wire. Never substitute the generic API-key service or a request-supplied actor.

## Exact implementation partitions

Paths below are relative to Core. All include owner-local `tests/` and barrels. Shared runtime/composition edits are serial lead integration points, not parallel ownership.

1. **Browser trust persistence/verifier worker:** new `packages/fluxiq/src/platform/browser-trust/{model,storage,runtime}/` modules; public `platform/browser-trust/index.ts` and platform barrel/public export as appropriate; `client-gateway/service/trusted-clients.ts` plus focused extracted credential-signature module and tests (reuse the signing primitive, never copy it). Keep platform API-key directories out of scope. Freeze a workspace-scoped trusted-store factory and lookup/proof result contracts before listener/HTTP workers.
2. **Gateway construction integration owner (serial):** `packages/fluxiq/src/framework/index.ts` (`FluxIQOptions`, constructor's `createGlobalProgramRuntime` call at line 203), `programs/_shared/runtime.ts` (`GlobalProgramRuntimeOptions`, gateway constructor and current JSON store factory), and web `lib/workspaces/create-tenant.ts` / `lib/fluxiq.ts` / platform composition. `createTenantFluxIQ` currently forwards only root/loadEnv/heldKeys/iam to instantiate; carry the explicitly scoped trust-store port there too. The stable dependency is an optional injected `ClientGatewayTrustedClientStore`; unset preserves current local JSON behavior. Require it for service composition. No observer-only binding implementation.
3. **Listener worker:** `packages/fluxiq/src/server/client-gateway-websocket/{start-server.ts,accept-socket.ts,index.ts}` plus new focused routed-hello coordinator and tests; `native-connection.ts` only if its first-message/queue/close contract requires a change. Web gateway router under `apps/web/src/lib/workspaces/`; integration with `lib/fluxiq.ts` is serial owner work. One listener, tenant-independent pre-hello audit, mandatory proof resolver, no primary holding gateway.
4. **Connect service worker:** new `packages/fluxiq/src/platform/connect/{model,storage,runtime}/` and server handler adapters, using existing `@fluxiq/contracts/platform` schemas; new ordinary-browser issuance module in `client-gateway/service/` and facade method on `client-gateway/service.ts`. Authority must be server-injected and revalidated at code redemption. Persist only authorization-code digest, S256 challenge and session digest; no raw cookie/code/verifier. Coordinate store ownership with worker 1. Register IAM and middleware route contracts explicitly; new paths must not bypass CSRF/origin/auth guards.
5. **Connect web/UI worker after service seam is frozen:** new `apps/web/src/app/connect/{page.tsx,authorize/page.tsx,done/page.tsx}` thin endpoints/views and feature-owned `apps/web/src/features/connect/`; `app/api/connect/{token,revoke}/route.ts`; thin server composition under `apps/web/src/server/connect/`; discovery tests must verify advertised endpoints exist and work. Cookie forms stay authenticated/origin-guarded; public PKCE exchange/revoke get explicit bounded-body and origin policy. Revoke returns the contract's indistinguishable response without exposing token validity.
6. **HTTP/upload/download adapter worker after resolver:** `app/api/client-gateway/{snapshot,first-project,forget-pairing}/route.ts`, `trace-artifacts/[sha256]/route.ts`; `app/api/recordings/route.ts`; `app/api/programs/[programId]/[endpoint]/route.ts` and `lib/workspaces/program-context.ts`; `app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts`; cookie-only `run-datasets/[projectId]/[runId]/[datasetId]/route.ts`. Key/session routes remain their existing owner. Preserve managed-host authority and upload `stillAuthorized` callbacks.

## Managed hosts are a separate trust path

Managed `issueHostEnrolment` is in-process only and currently synchronous. `host-enrolment-tickets.ts` stores only ticket SHA-256 in a gateway-local memory map; one live ticket per host, consumed even on failed redemption; bound to host/domain/profile, **not workspace or person**. `host-enrolment.ts` grants `FLUXIQ_MANAGED_HOST_PRINCIPAL`, and `server/managed-hosts/client-authority.ts` additionally derives narrow HTTP permissions from a current run/lease. Ordinary platform user/membership validation must not reject or convert this principal into a human.

For shared-listener first-hello routing, register a server-owned ticket-digest -> workspace/host binding **when the tenant engine issues the ticket**. This can be a process registry because tickets are already ephemeral; do not infer workspace from hello's domain/host metadata. Preserve the synchronous `takeEnrolmentTicket(): string` launcher seam unless deliberately migrating all consumers; an async durable registration silently inserted there would break it. Global proof only selects the tenant; tenant ticket redemption still consumes/verifies exactly once, and errors close without pairing fallback. Managed trust reconnects use the same authoritative trust store with explicit managed binding. Revoking a fresh host revokes ticket and trust; HTTP keeps current run/lease/project constraints. Include late-close and double-redemption tests.

## Migration/stream consumers

- State asset GET is currently cookie-only and buffers the asset; PUT admits bearer and calls `uploadStateAsset` with reauthorization callback. Hold the selected tenant through the **whole request body read and commit**, and make its callback recheck platform membership/owner as well as tenant gateway session.
- Trace artifact PUT is bearer-only and likewise needs the selected lease through upload and reauthorization.
- Run dataset GET constructs a `ReadableStream` over an async row iterator. Its lease must last until iterator completion, cancellation and error (including an abandoned consumer), not merely `new Response` return. Preserve its current download guards.
- Program JSON routes are buffered and already release in finally; switch service bearer policy only when this resolver is installed. Snapshot/context presentation must be scoped per workspace; redacting paths alone does not isolate the primary context map.

## Contract drift to resolve explicitly

The old `FLUXIQ_CONNECT_LIMITS.previousCredentialGraceMs` says two minutes/once. Current tested gateway uses a 14-day unconfirmed lost-reply window, current-token confirmation and a separate two-minute in-flight HTTP request reuse tolerance. Preserve the implemented lifecycle while routing; do not accidentally replace it with an older schema comment or cap the lost-reply behavior. `ConnectedClientRecord` also omits newer signing/managed state. Public contract migration needs synchronized tests/docs rather than a second token engine.

## Recommended narrow checks (not run)

```text
pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/service/tests/credential-lifetime.test.ts src/client-gateway/service/tests/credential-reuse.test.ts src/client-gateway/service/tests/credential-custody.test.ts src/client-gateway/service/tests/pairing-flow.test.ts
pnpm.cmd --filter fluxiq exec vitest run src/server/client-gateway-websocket/tests/start-server.test.ts src/server/client-gateway-websocket/tests/start-server-wss.test.ts src/server/program-route/tests/identity-authority.test.ts
pnpm.cmd --filter @fluxiq/web exec vitest run src/app/api/discovery/tests src/lib/workspaces/tests/program-context.test.ts
```

Add the new store/code-exchange/listener tests to these by exact owned path. Mandatory cases: cross-workspace same client/project ids, malformed/forged/id-only token before acquire, signature reuse, legacy digest, rotation lost reply and save failure/restart, disabled/deleted owner, removed membership, credential revoke during lookup/upload/socket open, unbound unknown hello, pending close during acquisition, managed ticket replay and lease cleanup, PKCE replay/expiry/wrong install/redirect/verifier, and tenant stream cancellation.

Outcome: Done
Changed: docs/working/hosted-platform-launch-plan/reports/browser-binding-discovery.md
Validation: read-only targeted source searches -> actual pairing/rotation/enrollment lifecycle and absent connect handlers established; no tests/builds permitted by brief.
Not verified: downstream extension connect implementation, runtime/deployment behavior, proposed changes.
Report: docs/working/hosted-platform-launch-plan/reports/browser-binding-discovery.md
Notes: No source/git/shared-doc changes. Use existing browser trust scheme; keep API keys separate. Custody observers are unsuitable for mandatory routing persistence.

# Hosted HTTP authority discovery

The next safe implementation unit is the **buffered generic program route**
and its workspace context, using the existing browser-trust proof repository
and the selected gateway's normal token authorizer. Do not replace every
`getFluxIQ()` at once: upload, runtime-context and streamed-download mounts
have different authority and lease requirements.

This was source-only inspection of the current t914 checkout. No tests,
servers, build outputs, runtime data, provider calls or git operations were
used. Transport source remained frozen.

## Current routing and precedence

| Entry | Observed behavior |
| --- | --- |
| `apps/web/src/lib/workspaces/program-context.ts` | Single tenancy acquires primary and permits existing cookie/bearer handling. Multi tenancy requires a panel cookie, resolves its default active membership, acquires that tenant and supplies primary Identity Access separately. Bearer-only and invalid-cookie-plus-bearer service requests currently refuse before acquiring anything. |
| `apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts` | Passes only cookies into the workspace selector; service selection strips Authorization before calling Core. Holds the workspace through the fully buffered Core answer and Response construction, then releases in finally. |
| `packages/fluxiq/src/server/program-route/handle-program-request.ts` | Valid platform cookie wins; without a valid cookie, Core's legacy single-root path tries the bearer. A token endpoint's name and registry classification are checked before `authorizeToken`. Ordinary token actors use primary identity directory and reduced permissions, while data/API/domain checks use `context.fluxiq`. |
| Browser HTTP mounts | Recordings, gateway snapshot/first-project, trace/state uploads and state/dataset downloads still call `getFluxIQ()` directly. They are not wired to the new service browser binding. Primary-owned identity does not make primary-owned data correct. |

Preserve the service selector's current refusal for a present invalid cookie
even if a bearer is supplied. Preserve single/local/self-hosted behavior:
Core prefers a valid cookie and otherwise can fall back to its local gateway
token. The new service bearer branch should apply when there is no panel
cookie, and return an explicit selected channel rather than relying on a
second mutable choice later. A valid cookie for A plus a token for B must not
look up or open B. Account/membership failure for the cookie also must not
switch the request to its bearer.

The selected channel should determine the exact `sessionId`/`authorization`
passed into Core: cookie selection forwards only the cookie; browser-token
selection forwards only the token. This freezes authority choice while Core
still performs actual authentication. Never forward a caller's workspace id
from URL/body/header or scan `workspaceIds()` for a token.

## Credential proof is routing, not command authorization

The needed public seam already exists:
`ClientTrustRepository.lookupCredential(token, { request: true })` from
`fluxiq/platform`. Its proved `binding.workspaceId` is the sole browser
workspace selector. `ClientTrustBinding` also carries trusted-client id,
approving user, client id/type, domain and optional managed-host ownership.
The repository validates candidate signatures/hashes; decoding a credential
id without that proof is insufficient.

`apps/web/src/server/browser-trust/resolve-route.ts` already demonstrates the
right ownership pattern for WebSockets: proof, eligible immutable binding,
acquire only that tenant, eligibility again after acquire, release on refusal
or exception. Its WebSocket-only hello comparisons and default reconnect
proof mode should not be fabricated/reused for HTTP. It returns only a
gateway, whereas an HTTP context needs the complete workspace lease and
primary identity authority.

HTTP proof handling must preserve these exact gateway semantics:

- `invalid`/forged/unknown or `inactive`/revoked/expired: refuse before opening
  any tenant. A proved binding to primary is also refused in multi tenancy.
- `current`: route to its owner; gateway `authorizeToken` still requires active
  trust, an existing ready session and matching bound/declared domain. It
  confirms rotation and renews current use through existing gateway logic.
- `previous`: only the unconfirmed previous hash within its recorded validity
  window can authorize; it confirms/renews nothing. Do not create a new HTTP
  grace policy.
- Signed `obsolete`: route only to its proved owner so the gateway's
  `refuseReuse(token, { request: true })` can enforce reuse. The existing
  two-minute `request-in-flight` classification avoids revocation; it **does
  not authorize** that obsolete credential. `resolveByToken` still refuses an
  obsolete hash. Beyond that exception, genuine reuse revokes trust and ready
  sessions. Root lookup must not preempt this enforcement or grant from proof.
- No live ready gateway session: program/data HTTP authorization remains refused even if
  root proof is current. Do not invent a socket/session from an HTTP token.

Evidence owners are `client-gateway/service/access.ts`,
`trusted-clients.ts`, `lifecycle.ts` and
`credentials/classify-credential.ts`. Current browser proof lookup is read
only; it neither renews credentials nor revokes reused trust by itself.

The ordinary browser HTTP resolver should initially refuse
`binding.managedHost`. Managed hosts need current host/run/lease authority and
their dedicated narrow endpoint path, not human membership invented from a
ticket. A one-use `enrolmentTicket` is not an HTTP bearer. Signed SDK key
sessions are also a separate channel: do not add the key-session broker as a
fallback when browser proof fails. Existing program-route channels are panel
and paired-client; a generic SDK execution path is separate work.

## Revalidate the selected authority

`workspaceProgramContext` currently checks session/default membership before
`manager.acquire`, then returns. Core later revalidates the platform session,
but its primary identity authority does not revalidate selected workspace
membership/account state. Acquisition can await storage initialization, so
the pre-acquire decision must not survive revoked membership, disabled/deleting
account, missing workspace, or a changed cookie/default-workspace binding.

Use the existing eligibility rules in
`apps/web/src/server/key-sessions/eligibility.ts`: enabled primary user,
active non-deleting account, existing non-primary workspace and active exact
membership. Sharing that policy does not interchange SDK/browser credentials.
Recheck after acquire and release on every changed/refused/throwing result.
For a token, compare the current proved binding to the originally selected
binding; never silently reacquire a different root. The owning gateway remains
the token/session/domain/reuse authorizer.

There is one useful missing **public Core context seam**: a trusted optional
`ProgramRouteContext.revalidateAuthority?: () => Promise<boolean>` (or an
equivalent explicit binding guard). Core can call it at entry and after
awaited request-body/project-domain work immediately before dispatch. It must
be supplied by server composition, never request data. In the same bounded
change, refresh/recheck Core caller authority before dispatch: a cached role
snapshot from before a slow body is not a current grant. A channel, user,
session or bound-domain change should refuse rather than switch caller;
use fresh permissions for an otherwise unchanged caller. Managed run-lease
checks must remain in place. A pre-selection proof alone is not this guard.

Preserve token preflight order too. Before root proof lookup or tenant acquire,
reject unavailable paired endpoint names/classifications using existing
`isPairedClientEndpoint`/`isPairedClientClassification` exports and trusted
catalog metadata. Reading primary/global **catalog metadata** for rejection
is not executing against primary data. Keep the selected tenant's registry
classification/IAM check as the final decision. Otherwise a forbidden endpoint
could distinguish invalid token (401) from valid token (403), contrary to the
current Core handler's explicit order, and valid tokens would open tenants
for endpoints they cannot call.

## Exact first implementation partition

Freeze the optional context guard and the web selector's explicit channel
return contract before dispatching parallel owners.

1. **Core program-route owner:**
   `packages/fluxiq/src/server/program-route/handle-program-request.ts`,
   adjacent `tests/handle-program-request.test.ts` and
   `tests/identity-authority.test.ts` (or a focused new adjacent revalidation
   test), plus its barrel only if a new exported declaration needs it. Add
   the trusted binding guard and final caller refresh/refusal without changing
   allowlists, narrowing, projections, managed-host scope or local defaults.
2. **Web proof/composition owner:** new
   `apps/web/src/server/browser-trust/resolve-http-route.ts` and `http-route.ts`,
   their `tests/`, and `index.ts`. These return/hold the full exact workspace
   lease plus binding/channel context, call root proof in HTTP request mode,
   and check live account/membership before/after acquisition. If extracting
   shared binding eligibility, own new `authorize-binding.ts` and the existing
   `service-route.ts` together; no other worker may edit that shared file.
3. **Lead integration, serial after those ports stabilize:**
   `apps/web/src/lib/workspaces/program-context.ts`, its
   `tests/program-context.test.ts`, and
   `apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts` with its
   adjacent `tests/route.test.ts`. Pass real headers and cookies to selection,
   freeze the selected auth channel, attach primary identity plus tenant data
   and guard, keep service runtime presenter absent, and release buffered
   responses exactly once. `lib/program-route.ts` only changes if it needs to
   re-export a newly introduced public helper; existing preflight exports exist.

This first unit is complete for buffered generic program requests; it does
not claim the dedicated mounts or global runtime state have been migrated.

## Dedicated mounts and streaming boundaries

Keep these as subsequent file-owned units against the stable HTTP selector:

- **Gateway/recording mounts:** `app/api/recordings/route.ts`,
  `app/api/client-gateway/{snapshot,first-project,approve-pairing,dismiss-pairing,forget-pairing}/route.ts`
  and adjacent tests. Preserve each route's current credential precedence.
  For example recordings tries a valid bearer first then cookie fallback;
  snapshot and state PUT refuse an invalid present bearer instead of using
  the cookie. Cookie-only management must stay cookie-only. Actor identity
  comes from primary while gateway/recordings/projects come from the tenant.
  Snapshot and `automation-studio-context/route.ts` also use the global
  `getFluxIQWebRuntimeStatus`/`setAutomationStudioWebContext`; replacing data
  selection without workspace/user-scoping those helpers is incomplete.
  `forget-pairing` is a specific exception to ready-session/data authorization:
  it is bearer-only, calls owning `gateway.access.forgetByCredential`, needs
  no socket, and unknown credentials answer success with `forgotten: false`.
  Do not put an `authorizeToken` ready-session gate in front of that cleanup
  operation or switch it to cookie authority. Preserve its existing reuse
  handling (the forget path calls `refuseReuse` without HTTP in-flight mode).
- **Trace upload:**
  `app/api/client-gateway/trace-artifacts/[sha256]/route.ts` and adjacent tests.
  Keep its bearer-only, domain, actor/IAM and exact-session recheck, with a
  tenant lease held through body read and Core intake completion.
- **State assets:**
  `app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts`
  owns both GET and PUT; never assign the methods to separate workers. GET
  stays cookie-only. PUT keeps bearer-first behavior, project/domain/recording
  restrictions and post-body reauthorization. Its existing callback only
  checks `.ok`; the migrated callback must retain the originally selected
  channel/tenant/session binding, not silently accept another newly valid
  caller. Hold its lease through the read/copy or upload write. Core's existing
  `uploadStateAsset` and `uploadTraceArtifact` already recheck after body input;
  reuse them rather than duplicating upload/storage logic.
- **Dataset export:**
  `app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`
  and its tests, plus a focused web-owned leased-stream helper if needed.
  Preserve cookie-only auth, IAM/project-domain checks, no-store and iterator
  cleanup. This stream defers opening data until pull; releasing the workspace
  in a route-return finally would allow eviction before or during consumption.

A stream owns its workspace until iterator completion, iteration error,
consumer cancel or request abort. Finalize once, await iterator `return()`
where required, then release the workspace; also release on setup failure.
Cover abort-before-first-pull, cancel racing an outstanding pull, error,
normal exhaustion and HEAD/never-consumed-body handling. A Response object
being returned is not stream completion. Buffered generic JSON and copied
state-asset ArrayBuffers can release after their data is fully materialized.

## Required narrow acceptance

Core: `pnpm.cmd exec vitest run src/server/program-route/tests` in
`packages/fluxiq`. Web: the affected browser-trust tests,
`src/lib/workspaces/tests/program-context.test.ts` and the generic route's
adjacent tests in `apps/web`; include existing app-route IAM parity/service
tests when dedicated mounts change. These commands were **not run** here.

Essential cases: real independent tenant roots and colliding client ids;
no primary/scanning/caller-workspace selection; cookie A plus bearer B;
invalid service cookie plus bearer; local fallback compatibility; forbidden
endpoint/classification before lookup/body/acquire; current/previous/obsolete
proof and actual gateway reuse effects; missing ready session; SDK/managed
ticket/channel confusion; removed membership/user/account/workspace during
acquire and body awaits; role change before dispatch; guard exception release;
no-op/throwing/duplicate release paths; and actual lease retention through
stream finish/error/cancel/abort, not just Response construction. Dedicated
mount coverage must include offline credential-only self-forget and its
idempotent unknown-token answer, separately from ready-session data access.

Outcome: Done
Changed: This discovery report only.
Validation: Read-only `rg` discovery and named source/adjacent-test inspection -> concrete partitions and authority/lifetime constraints recorded; no checks or runtime calls run per brief.
Not verified: Runtime behavior, tests, new context guard or HTTP composition; this is an implementation recommendation, not completed routing.
Report: `docs/working/hosted-platform-launch-plan/reports/http-routing-discovery.md`
Notes: Transport remains frozen. No source/shared-document/build/git/provider changes. Root proof never substitutes for owning-gateway authorization.

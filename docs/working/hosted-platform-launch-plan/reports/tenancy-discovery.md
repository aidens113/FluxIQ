# Tenancy discovery

Outcome: Done (read-only discovery; no implementation or acceptance claimed)

## Findings that change the implementation order

- C1 exists, but production callers still predominantly use the primary. `apps/web/src/lib/workspaces/workspace-fluxiq.ts` is a cookie-only lease resolver; `session-workspace.ts` validates the primary Identity Access session then picks the oldest active membership. It does **not** verify that a workspace row exists. The current web-workspaces test deliberately inserts membership rows without workspace rows, so that test is not a security-complete routing acceptance.
- `apps/web/src/server/provisioning-listener/platform-services.ts:composePlatformServices` explicitly passes `{ mode: "single", workspaceId: primaryWorkspaceId() }` in every profile. Multi provisioning, `deleteWorkspaceData`, and `revokeConnectedClients` are not wired there. Changing route calls alone cannot give a new hosted account a personal workspace.
- Identity remains platform-owned. `lib/auth.ts`, login/logout and platform composition correctly reach primary Identity Access. Tenant instances have their own Identity Access and do not hold platform sessions/users. `packages/fluxiq/src/server/program-route/handle-program-request.ts:authenticate` validates through the supplied data instance and `authenticatePairedClient` reads its identity snapshot. Passing a tenant instance to this unchanged function would reject valid platform users; copying their sessions into tenant stores is the wrong fix.
- `present-panel-session.ts` presents the cookie to the supplied instance's Secret Keys. Once routed, this must target the selected tenant's key store while validating the cookie through platform identity. Returning platform auth from `currentFluxIQUser()` does not itself select tenant data.
- WebSocket transport is already generic Core code: web's `server/client-gateway-websocket.ts` delegates to `fluxiq/server`. Core `server/client-gateway-websocket/start-server.ts` takes exactly one `gateway`; `accept-socket.ts` owns hello handling. Routing must extend that seam rather than run one listener per tenant.
- `runtime/client-gateway-transport.ts:selectSession` filters readiness and command compatibility but not `operatorUserId`. Preferred session/client ids do not establish ownership.
- C3 leakage is real: `runtime/activity/default-hub.ts` exports one hub; `programs/_shared/runtime.ts:196` subscribes every instance and republishes activity filtered only by project id. Same project ids in different roots are therefore not an isolation key. `runtime/recording/gateway-trace/installation.ts` has a process `installed` slot. `runtime/project-agents/host-resources/lease-scope.ts` has module-wide `strictlyHeld`; a lease without session id affects every gateway through its static source. Web `lib/fluxiq.ts` holds one `automationStudioContexts` map keyed only by user/client; root paths are exposed by runtime status today.

## Freeze this request contract before route workers

1. Platform identity authenticates cookies and account status. Multi requests select only an existing workspace reached by the authenticated user's active membership. Retain the current deterministic oldest-membership/id-tie default until explicit workspace selection exists. Never accept workspace identity from arbitrary body/query/header text, never fall back to primary on service, never silently reinterpret a malformed credential as another channel.
2. Resolve an authenticated request context containing the authoritative actor/session, workspace id, selected FluxIQ lease and release callback. Authorization and all project/key/recording/data IO execute on that lease. Platform account/security operations remain on their platform services and use explicit workspace IAM where necessary. A revoked session, inactive membership, absent workspace or platform lookup failure opens no tenant root.
3. Cookie versus bearer precedence must be consistent. Existing program route prefers a valid cookie; snapshot prefers a bearer and recordings falls back to a cookie after invalid bearer. Adopt valid-cookie precedence, then explicit bearer-only authentication when no valid cookie exists, across migrated routes. A valid cookie for A plus bearer for B never routes to B. Endpoint allowlisting and domain/project narrowing remain mandatory after tenant selection.
4. Bearer/hello routing requires a platform credential-to-workspace binding; do not scan every workspace/gateway, trust `hello.metadata.workspaceId`, or authorize through primary. Bind credential to workspace, user/browser and domain; verify revocation and active membership before acquiring the tenant. Token/credential storage must retain only digest/secure existing representation. The current PlatformStore has no browser/credential records: this is a real missing persistence seam, not a ready helper.
5. Release the request lease in `finally` for JSON/buffered responses; streaming responses hold it through stream completion/cancel/error. A connected socket retains a lease until close and releases on every failed/racing handshake. Listener drain, audit, pairing limits and immutable transport build identity apply to each routed gateway and retain process-wide connection admission.
6. Actor identity is trusted only from the authenticated platform context, never a request payload. IAM still resolves policy attachments in the selected workspace; platform role permissions alone cannot bypass service policy. Keys are presented/released only in that workspace. Browser dispatch requires a ready session with operatorUserId equal to the run actor on every preferred/fallback branch; absent actor is denied unless a separately authenticated managed-host authority owns that execution.

## Smallest first complete implementation unit

Harden the existing **panel workspace resolver**, with direct positive/negative integration coverage, before widening public routes. This is a real existing production seam, not an unused abstraction.

Owned files:

- `apps/web/src/lib/workspaces/session-workspace.ts`
- `apps/web/src/lib/workspaces/workspace-fluxiq.ts` (only if needed to preserve typed refusal and no-acquire behavior)
- `apps/web/src/lib/workspaces/tests/web-workspaces.test.ts`
- optional focused `apps/web/src/lib/workspaces/tests/session-workspace.test.ts`

Acceptance: local/self-hosted single tenancy still resolves valid primary sessions without requiring platform membership/account rows; service requires a valid primary session, active membership and existing workspace row, refuses primary-workspace resolution, missing/deleted workspace, removed membership and platform lookup errors without calling acquire; deterministic sorting remains unchanged among valid memberships. Use real membership **and workspace** rows for positive cases. Do not require an account fixture unless the implementation explicitly makes account status part of this seam; then cover disabled/deleting accounts and align createAccount fixtures. No source tenant roots may be created from dangling membership data.

This unit can land without claiming C2 complete or exposing hosted data. It does not need the lead-owned email adapter.

## Exact subsequent file partitions

### A. Platform composition and lifecycle (serial before hosted signup acceptance)

Own `apps/web/src/server/provisioning-listener/platform-services.ts` and new tests under that directory's `tests/`; `apps/web/src/lib/workspaces/tests/web-workspaces.test.ts` only after the first unit is done. Read `platform/provisioning/context/types.ts`, `service/create-platform-services.ts`, `operations/complete-account-deletion.ts` and manager `deleteWorkspace` as existing contracts.

Pass profile-derived tenancy, attach deletion to manager.deleteWorkspace, attach revocation once credential routing exists, and run workspace-created hooks against the new workspace instance under a lease. `deleteWorkspace` currently rejects busy workspaces; deletion must revoke/stop/drain before removing storage and must remain retryable on failure. Do not report data deleted if the optional no-op deletion port was used. Platform/identity repositories must remain on the platform root, not tenant roots; verify actual layout initialization before changing locations. This partition does **not** own `resolve-email-sender.ts` or `platform/provisioning/email/` (lead-owned).

### B. Authentication/data split and program HTTP seam (serial interface change)

Own `packages/fluxiq/src/server/program-route/{handle-program-request.ts,present-panel-session.ts,index.ts}` and their `tests/`; new focused auth-context types/files in that same directory; `apps/web/src/lib/workspaces/{index.ts,workspace-fluxiq.ts}` and new authenticated-context module/tests; `apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts`. Introduce an explicit trusted authority port in ProgramRouteContext (default current single-instance behavior for existing consumers), not a public raw actor override taken from HTTP input. This port must validate both panel and paired identities while data/domain/project checks and secret presentation remain on context.fluxiq. Existing non-Next consumers keep their current default behavior. New web path acquires a verified workspace and passes the authority deliberately. Verify valid/revoked cookie, tenant A/B project/key isolation, cookie+bearer precedence, allowlist and domain narrowing.

### C. Independent web route adapters (parallel only after B's API is frozen)

- Framework/recording adapter owns `app/api/framework/io/route.ts`, `app/api/framework/io/validate/route.ts`, `app/api/recordings/route.ts` and focused colocated tests. `framework/setup` is local/owner configuration and needs profile gating rather than blind tenant substitution; include `app/api/framework/setup/route.ts` only with that explicit behavior.
- Gateway HTTP adapter owns `app/api/client-gateway/{snapshot,approve-pairing,dismiss-pairing,forget-pairing,first-project,automation-studio-context}/route.ts`, `trace-artifacts/[sha256]/route.ts` and their tests. Waiting on bearer credential router is mandatory for routes admitting paired clients. Approve pairing must unlock tenant keys using platform identity and preserve consent checks.
- Program assets/catalog adapter owns `app/api/programs/route.ts`, `app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts`, `run-datasets/[projectId]/[runId]/[datasetId]/route.ts` and tests. File/asset streams hold a lease to stream end.
- Shell/account adapter owns `lib/auth.ts`, `app/api/auth/{login,logout}/route.ts`, `app/api/accounts/server/deps-for-request.ts`, `app/api/security/server/deps-for-request.ts`, `app/product/server/OnboardingCards.tsx` and focused tests. Auth/login/logout remain platform identity; tenant IAM/key lookups are explicitly leased. Server layouts/settings/security pages calling currentFluxIQUser need no mechanical edit if that return contract is preserved. Welcome/setup owner flows are platform/local entrypoints, not tenant data APIs.

### D. C3 credential router/listener (one coherent unit, not parallel transport/data edits)

Own new platform credential binding storage/model/service modules under `packages/fluxiq/src/platform/` (coordinate with API-key worker: separate browser credentials from API keys), `server/client-gateway-websocket/{start-server.ts,accept-socket.ts,index.ts}` and tests, `apps/web/src/lib/fluxiq.ts`, plus new web workspace gateway-router module/tests. Web native wrapper changes only if the shared option type requires it. Extend one listener with a verified hello gateway resolver and lease lifetime; do not use the primary gateway as an unauthenticated holding pen for tenant sessions. Also provide HTTP bearer resolution through the same binding. Existing local pairing path stays intact. Exact existing storage candidate: PlatformStore currently only exposes account/workspace/member/link/idempotency records, so a new browser credential repository is required; do not claim an existing platform credential table is available.

### E. C3 browser owner (can be parallel with A/B; narrow contract investigation first)

Own `packages/fluxiq/src/runtime/client-gateway-transport.ts` and `runtime/tests/client-gateway-transport.test.ts` (both confirmed). Trace dispatch context to the authoritative run actor before changing types; preferred client/session remains a hint inside that actor's ready sessions. Add two-user, wrong preferred id, no actor, reconnect and managed-host cases. The paired downstream domain must enforce the same invariant under its own worker brief.

### F. C3 process state (must coordinate through one runtime owner)

Own `runtime/activity/{default-hub.ts,hub.ts}`, `runtime/recording/gateway-trace/installation.ts`, `framework/automation-service/service/offline-first/installation.ts`, `runtime/project-agents/host-resources/lease-scope.ts`, `runtime/llm/step-log/directory.ts`, `programs/_shared/runtime.ts` and owner-local tests; web context/status integration belongs to D's `lib/fluxiq.ts` owner and must be applied serially. Make hub publication/subscription and both installation slots instance-scoped; lease scopes must be scoped by gateway/runtime as well as async context. Both installations currently explicitly replace the prior runtime's installed host. Inventory their callers before changing defaults. Step-log directory currently reads one process `FLUXIQ_LLM_STEP_LOG_DIR`; service must not expose a process directory shared by all tenants. Do not label F complete from fixing only one static slot.

## Validation commands (recommended, not run)

From Core root after source editors settle and Core libraries are current:

```text
pnpm --filter @fluxiq/web exec vitest run src/lib/workspaces/tests/web-workspaces.test.ts src/lib/workspaces/tests/workspace-manager.test.ts src/lib/workspaces/tests/tenant-eviction.test.ts
pnpm --filter @fluxiq/web check
pnpm exec node scripts/structure-audit.mjs
pnpm --filter fluxiq exec vitest run src/server/program-route/tests/handle-program-request.test.ts src/server/program-route/tests/program-route.test.ts
pnpm --filter fluxiq check
```

Package selectors were confirmed against package.json; root packages have independent build-cache prerequisites. Run only the relevant owner-local tests for later partitions. No full sweep, browser/server, build or paid call was run for this discovery. Production acceptance remains: two accounts with equal project ids, simultaneous sockets, revoked sessions/memberships/credentials, account deletion while busy and restarts, service root-path redaction, local/self-hosted compatibility, and no cross-workspace activity/key/trace/lease effects.

## Return contract

Outcome: Done
Changed: docs/working/hosted-platform-launch-plan/reports/tenancy-discovery.md
Validation: read-only source inspection -> existing routing, identity ownership, missing credential seam and file partitions recorded; no tests run (discovery brief forbids builds/servers).
Not verified: runtime behavior, actual layout-v3 platform repository location, actor propagation path for dispatch, hosted deployment.
Report: docs/working/hosted-platform-launch-plan/reports/tenancy-discovery.md
Notes: C2 must split platform authentication from tenant data; service never falls back to primary. Composition file ownership is separate from lead-owned mail adapter. No source or git changes.

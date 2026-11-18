# Dedicated tenant route completion

Outcome: Done as read-only discovery. No source, build, dist, test, server or git changes.

## Smallest complete next unit

Add one small **dedicated-route actor/lease adapter over the existing `workspaceProgramContext`**, then migrate **`GET /api/programs`** through it. Prove an authorized primary-authenticated service user reads their selected tenant's program directory, never the primary's, and that its lease is released after response serialization and on every refusal/error. Keep this directory route panel-only. This is an independently reviewable route correction with a concrete production caller; it does not claim the other dedicated routes are finished.

Freeze the adapter's returned actor/binding/revalidation/release contract before dispatching the framework/recording, gateway and asset/dataset lanes below. They can then edit disjoint route files in parallel. No new browser credential store, protocol, generic program handler, account-login flow or key-unlock mechanism is needed.

## Existing foundation to reuse

`apps/web/src/lib/workspaces/program-context.ts` already selects service tenants from primary identity or durable client proof, holds a workspace lease, rejects primary as customer data, checks account/membership/workspace eligibility and exposes `revalidateAuthority`. `app/api/programs/[programId]/[endpoint]/route.ts` already uses it and releases buffered responses in `finally`. Core `server/program-route/handle-program-request.ts` already authenticates through its trusted identity authority, preserves the selected channel, narrows paired requests, applies project/domain checks, refreshes the actor/binding before dispatch and uses the tenant registry. Do not rebuild those mechanisms in this unit.

Important actual precedence: **under service/multi, a present nonempty cookie freezes selection to that panel session**. An invalid cookie plus a valid bearer is refused, not retried as a different identity; `lib/workspaces/tests/program-context.test.ts` explicitly asserts this. Valid cookie A plus bearer B selects only A's tenant. Single-root hosts retain Core's existing valid-cookie-first behavior. The old discovery report's broader fallback wording is superseded by this implemented contract.

The existing selected context does not expose `workspaceId` in its result even though the acquired lease knows it. Add that trusted return field if the dedicated adapter/context presenter needs it; this is an additive selection-result change, not another resolver. Never infer it from request JSON, headers, URL parameters, project ids or host paths.

During this discovery the generic paired response projector was found still dropping new availability/ownership metadata. The lead independently confirmed and patched that in the **current access integration unit**, with projector tests scheduled there. It is not deferred work or a new partition in this report. This worker did not validate that patch.

## Remaining route map

All thirteen tenant-data route files below currently use `getFluxIQ()` directly, which returns the primary. They therefore bypass the completed tenant-selection seam. Paths in this table are beneath `apps/web/src/app/api/`.

| Route/method | Accepted channel today | Constraints to carry into the selected tenant |
| --- | --- | --- |
| `framework/io/route.ts` GET | Panel only | `ops:InspectFrameworkIo`, framework program resource; preserves `domain` query parameter and selected instance's `ioSnapshot`. Service guardrail currently denies `ops:*`. Routing does not silently enable it. |
| `framework/io/validate/route.ts` POST | Panel only | `ops:ValidateFrameworkIo`; existing camel/snake-case domain/input/output body aliases; pure validation. Recheck authority after reading JSON. Service remains denied by current guardrail. |
| `recordings/route.ts` GET | Panel or paired | `studio:ListRecordingSummaries`; paired URL domain must equal approved domain, including null-domain meaning; page/pageSize shape unchanged. Current implementation tries bearer first and falls back to cookie, so normalize to the implemented selection contract. |
| `client-gateway/snapshot/route.ts` GET | Panel or paired | `gateway:Snapshot` workspace IAM; paired token currently wins over cookie. Project lookup/name must use the selected registry, same person and bound domain. The existing global presenter/context map is an additional dependency, described below. |
| `client-gateway/approve-pairing/route.ts` POST | Panel only | `gateway:ApprovePairing` on the caller's own user. Preserve primary identity and raw actual approving-session provenance, pairing-refusal codes and persistence ordering. No password/TOTP/unlock setup is reintroduced. |
| `client-gateway/dismiss-pairing/route.ts` POST | Panel only | `gateway:DismissPairing` workspace IAM; dismiss only the selected gateway's pending reference. Do not scan gateways by reference. |
| `client-gateway/forget-pairing/route.ts` POST | Credential-only teardown | Token may have no live socket. It can end only its own trust; missing token is 401, unknown/already inactive token returns 200 with `forgotten: false`. This deliberately does not need a panel session or content permission. |
| `client-gateway/first-project/route.ts` POST | Paired only | `gateway:CreateFirstProject`, then `automationStudioPersonProject` through the selected registry as the real approving user and approved domain. It may return an existing own project or create one; no arbitrary workspace/project hint is authority. |
| `client-gateway/automation-studio-context/route.ts` POST | Panel only | `gateway:SetAutomationStudioContext` on actual project/Flow, or self user when clearing. `clientId` is a preference within the caller's tenant/identity, not an owner grant. Must stop using the global user/client context key alone. |
| `client-gateway/trace-artifacts/[sha256]/route.ts` PUT | Paired only | `gateway:PutTraceArtifact` on its own trusted client; approved domain; existing digest/media/body limits and zero-open-traces success. Intake must target the same selected gateway/session. Recheck full immutable binding after body consumption. |
| `programs/route.ts` GET | Panel only | `studio:ListPrograms`; selected instance's domain-scoped directory, existing `domain` query and `programDirectorySchema` validation. Recommended first migrated caller. This is the program directory, not the planned marketplace catalog. |
| `programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts` GET/PUT | GET panel only; PUT panel or paired | GET `studio:ReadStateAsset`, immutable private buffered asset response. PUT `studio:WriteStateAsset`, project/domain/session/active-recording binding and shared `uploadStateAsset` checks. Current PUT prioritizes bearer. Preserve media/digest/recording/trace semantics. |
| `programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts` GET | Panel only | `studio:StreamRunDataset` on dataset under its project; domain assertion before reading any row; invalid identifiers/formats and 404 non-disclosure behavior; private no-store/nosniff and attachment sanitation. The body is genuinely lazy/streamed. |

`framework/setup/route.ts` GET/POST is the fourteenth inspected route file but **is not customer tenant data**. It exposes host paths/storage and can setup/migrate/rollback/reload the host. Keep it platform/host-operated and panel-only, denied on service by the existing `ops:*` guardrail. Do not mechanically replace it with a tenant instance or let a tenant administrator migrate the host. Preserve local/self-hosted IAM and unsupported-action 400 behavior. If a separate hosted tenant diagnostics API is wanted, that is a different safe DTO/action, not enabling this endpoint.

The route table in `lib/app-route-iam/contracts.ts:91-108` is authoritative for allowed channels/actions/resources. Preserve it; authentication-only (`none`) in that table is **not** a service IAM bypass. In particular ordinary `FluxIQUserAccess` does not generally grant workspace-wide gateway snapshots, program-directory or recording-summary lists, and service explicitly denies operator `ops:*`. Tenant selection must not broaden policy or add unfiltered list grants. Existing whole-workspace admin permissions and narrower ordinary-user refusals need tests.

## Minimal adapter contract

Keep this in web request adaptation, for example `apps/web/src/lib/workspaces/routes/`, with a barrel and focused types/context/buffered-response files. Consume existing public Core actors, `readBearerToken`, `pairedClientDomainScope` and project-domain helpers. `lib/app-route-iam/paired-client-route-actor.ts` already accepts the narrow `{ snapshot() }` identity directory, so it can consume the trusted primary authority without a Core type cast or new identity API.

Proposed server-only result:

```ts
type SelectedAppRoute = {
  workspaceId: string;             // Returned by the trusted lease selector.
  fluxiq: FluxIQ;                  // Customer IO always remains on this lease.
  caller: PanelRouteCaller | PairedRouteCaller;
  revalidate(input?: AppRouteResourceInput): Promise<
    PanelRouteCaller | PairedRouteCaller | null
  >;                              // Refreshes role/IAM without changing binding.
  release(): void;                // Idempotent, request-owned.
};
```

Panel caller data includes actual primary user/session/current actor. Paired caller data includes actual selected-gateway session, actor built using primary identity, approved domain and immutable trusted-client binding. Freeze the initial channel/user/workspace/client/domain and operation-specific target; revalidation may refresh role permissions but must not select a new tenant, switch cookie to bearer, or accept a new client/recording target after an await. Obtain current primary authority through the trusted host accessor during refresh; do not authorize through a tenant-local identity store or reuse an old role snapshot across primary reload.

Use `AppRouteIamContract.callers` to reject unsupported channels before bearer proof lookup or tenant acquisition. A paired token never makes panel-only framework/catalog/GET-download routes available. For mixed routes use cookie precedence exactly as above. Recommended service behavior on a cookie-bearing request to a paired-only content route is refusal rather than falling through to another identity; normal extension bearer requests omit panel cookies. Keep self-forget's deliberate credential-only teardown policy explicit rather than accidentally treating its token as a content grant.

Buffered adapters own the lease in `try/finally` through all awaited work, final authorization checks and JSON/buffer serialization. A route-specific exception/refusal releases it once. Body parsing/resource derivation remains route-local; after parsing, decide the real route resource with fresh authority before touching tenant data. Selection/authority/storage lookup failures must return a controlled refusal/503 and expose no private exception text or tenant-root hint. No service primary-data fallback on failure.

### Stream ownership

The dataset `streamRunDataset` result opens its store only on the first iterator pull. A `finally` around returning `new Response(stream)` would therefore release the tenant before data access starts. Transfer ownership to a stream wrapper and release exactly once on EOF, iterator error, cancel or request abort, including abort before the first pull. Always call/await the iterator's `return()` when abandoning it so its own store lease and audit finish. Preserve backpressure and the existing CSV/JSON encoder; do not buffer the dataset just to release a lease sooner.

Check current frozen authority/IAM/domain before and after each awaited `iterator.next()`; discard a newly fetched chunk if authority ended during the await. Once headers/earlier rows were sent, close/error the stream safely rather than pretending to change its HTTP status. Already delivered bytes cannot be recalled. State-asset GET is currently fully buffered, so ordinary `finally` release after its authorized buffer is built is sufficient.

## Required binding and drain checks

- Existing `uploadStateAsset` and `uploadTraceArtifact` already invoke `stillAuthorized` after `arrayBuffer()`. Pass a callback that rechecks selected-workspace authority, fresh IAM, user/client/domain and the initial operation target. State PUT currently re-runs a helper and checks only `.ok`: it could accept a different project/active-recording/session binding after the body arrives. Compare the initial project/client-session/recording binding explicitly; do not silently substitute the new one. Trace PUT currently compares only session id; include immutable trust/user/domain and selected tenant binding while preserving a trace that closes normally returning zero intake.
- Recheck after route params/body reads, project/domain probes and helper reads before any mutation or sensitive response. A membership removal/default-workspace change must refuse, never reacquire a different tenant. Deletion/revocation/lookup failure while acquiring must release without touching primary customer data.
- Existing Core `programDrainRefusal` gates seven Automation Studio start operations, not arbitrary dedicated routes. Read-only directory/IO/recordings/download operations and existing stream completion remain reads; teardown/dismiss/forget must remain usable. Do not make all authenticated reads fail merely because draining began.
- New pairing grants/first-project creation/context-changing admission need an explicit drain decision before dispatch and again after awaited preparation. In particular `first-project` may await an own-project read before creating; enforce at its actual create call, using a request-bound guarded registry call or an explicit supported callback, rather than checking only before its initial read. Existing in-flight trace/state artifact completion may still be needed while work drains; keep it authorized and scoped rather than treating every upload as a new run. Use the existing `server.draining`/Retry-After contract for denied starts.

## Two gateway-specific dependencies

1. `lib/fluxiq.ts:133-167` builds web status from `primaryOf(state)` and a single `automationStudioContexts` record keyed only by user/client. `getWebRuntimeState:279` installs its recording-context provider only on the primary. Gateway snapshot/context migration needs a workspace-aware context key and a presenter taking the already-leased tenant instance; tenant recording-context providers must be bound at tenant construction too. Do not reacquire a tenant just to present status or send a service caller the primary's native/model readiness, other-workspace context count or host paths/module path. Preserve single-root defaults. This is a bounded web composition dependency, not completion of every process-state issue in the earlier C3 audit.
2. Service WebSocket routing (`server/browser-trust/resolve-route.ts`) requires an existing token and rejects tokenless hello/enrolment-ticket routing. Hosted initial connection therefore uses existing PKCE consent. Panel reference approve/dismiss routes must not scan tenants or use primary as an unauthenticated waiting room. Preserve local/self-hosted reference pairing; in service, operate only on a request genuinely pending in the selected tenant or return its existing unavailable/not-found refusal. No new unlock/password step.

Self-forget needs its own narrow routing policy: `ClientTrustRepository.lookupCredential` already supplies verified bindings for current/previous/obsolete/**inactive** credentials. The normal active-content HTTP resolver intentionally rejects inactive credentials and ineligible accounts. Reusing it unchanged would turn an idempotent cleanup into repeated authentication failures. Unknown/inactive proofs can finish with `forgotten: false` without opening data; a proved active credential selects only its existing non-primary workspace and reaches that gateway's existing `access.forgetByCredential`. It may reduce its own authority even when content access/account membership is no longer eligible. Validate that the workspace still exists before acquisition; never recreate a deleted root, accept caller-selected ids or grant content access through this teardown exception. Preserve reuse handling and disconnect/revoke behavior through the owning gateway; do not add another credential format/store.

## File-owned implementation partitions

| Order/owner | Exact production ownership and adjacent tests |
| --- | --- |
| A: shared adapter + first directory caller, serial foundation | New `apps/web/src/lib/workspaces/routes/{types,context,buffered-response,index}.ts` and `routes/tests/`; `lib/workspaces/program-context.ts` only to return trusted workspace id; `lib/workspaces/index.ts`; extend `lib/workspaces/tests/program-context.test.ts`. Migrate `app/api/programs/route.ts`, add `app/api/programs/tests/route.test.ts`. Freeze context/revalidation/release API. Lead owns any final shared-barrel integration while lanes run. |
| B: framework/recordings | `app/api/framework/{io/route.ts,io/validate/route.ts,setup/route.ts}`; `app/api/framework/tests/operational-routes.test.ts`; new colocated IO route behavior tests; `app/api/recordings/route.ts` and `recordings/tests/route.test.ts`. Preserve service ops denial/host setup; make recordings use mixed-channel selected context and immutable domain. No gateway presenter, asset or shared adapter edits. |
| C: gateway + scoped web context, one coherent owner | `app/api/client-gateway/{snapshot,approve-pairing,dismiss-pairing,forget-pairing,first-project,automation-studio-context}/route.ts`, `trace-artifacts/[sha256]/route.ts` and their tests; `lib/fluxiq.ts`, `lib/automation-studio-context.ts` and adjacent tests; tenant-construction/context-provider glue in `lib/workspaces/create-tenant.ts` only if necessary. Own any new teardown adapter file. This lane must not overlap a separate composition/global-context editor. Consume existing browser-trust ports, not its repository implementation or WebSocket transport. |
| D: assets/datasets | `app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts`, existing `tests/{route,route-trace}.test.ts`; `run-datasets/[projectId]/[runId]/[datasetId]/route.ts` and `tests/route.test.ts`; new `lib/workspaces/routes/leased-stream.ts` and its tests, with shared-barrel export integrated serially by lead. Preserve Core upload validators and callbacks; no new general Core upload/auth framework. |

If the first A adapter's streamed-handoff type must change, freeze it before D starts. Do not have B/C/D independently alter `program-context.ts`, app-route IAM contracts, `lib/fluxiq.ts` or the same helper barrel. A route migration must not quietly loosen service policy; any desired new ordinary-user grant needs a separately explicit owner-filtered action/resource contract and its own IAM tests.

## Acceptance and narrow commands

Every lane needs local/self-hosted positive cases and real service fixtures with two existing accounts/workspaces and matching project ids. Assert which instance/registry/data collaborator was called; a mocked successful auth alone cannot prove routing. Add cookie A + bearer B, invalid service cookie + valid bearer, panel-only bearer rejection before proof/acquire, revoked/disabled account, removed/default-changed membership, foreign project/domain and authority lookup failure. Assert release on successful serialization, all refusals, thrown data work and request abort. No foreign tenant/project data or primary fallback.

Gateway cases include token-bound first project, service PKCE/reference limitations, exact upload binding across delayed bodies, self-forget without a socket/with inactive credentials, and workspace-scoped status/recording contexts. Dataset cases include completion, cancel, pull failure, abort before first pull, authority loss during a blocked pull, preserved iterator cleanup/audit and no late chunks after denial. Drain tests distinguish read/completion/teardown from newly admitted work, and flip draining between awaits.

Recommended commands from Core root **after the next unit's source editors settle and dependencies are current**; none was run for this discovery:

```text
pnpm.cmd --filter @fluxiq/web exec vitest run src/lib/workspaces/tests/program-context.test.ts src/lib/workspaces/routes/tests src/app/api/programs/tests
pnpm.cmd --filter @fluxiq/web exec vitest run src/app/api/framework src/app/api/recordings/tests
pnpm.cmd --filter @fluxiq/web exec vitest run src/app/api/client-gateway
pnpm.cmd --filter @fluxiq/web exec vitest run 'src/app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/tests' 'src/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/tests' src/lib/workspaces/routes/tests
pnpm.cmd --filter @fluxiq/web check
node scripts/structure-audit.mjs
```

The first command includes proposed new test directories; create them with the subject implementation. Run focused existing generic program/HTTP-binding tests as integration sentinels, without implementing that completed route again. No whole-suite sweep, deployment, live browser/server, provider call or package build is needed for this report.

Outcome: Done
Changed: `docs/working/hosted-platform-launch-plan/reports/tenant-route-completion-discovery.md` only.
Validation: targeted `Get-Content`/`rg` source and adjacent-test inspection -> thirteen dedicated tenant route files, host setup exception, precedence/IAM/lease/stream dependencies and bounded partitions recorded; tests/builds not run (read-only brief).
Not verified: runtime routing behavior, proposed adapter implementation, live browser/stream shutdown, or the lead's current projector patch.
Report: `docs/working/hosted-platform-launch-plan/reports/tenant-route-completion-discovery.md`
Notes: Reuses completed generic routing/browser trust. Preserves independent authenticated-client access. No source/dist/artifact/git changes.

# Selected gateway snapshot and context routes

Outcome: Done. Source/tests are complete and frozen for lead acceptance. Own only the snapshot/context route trees and this report, plus the explicitly approved presentation caller-channel companion described below.

## Selected authority and lifecycle

Snapshot now acquires `workspaceRouteContext` once and uses its exact workspace/instance plus current trusted caller for `getWorkspaceWebPresentation`. Cookie precedence, selected browser proof, tenant membership, current user/session, and IAM come from the shared owner. It holds the lease through gateway readiness, project/name reads, explicit response projection, JSON serialization, and final current-authority/project validation. Every route-owned success/refusal/error path releases in `finally`; failed shared selection releases inside the shared owner. It does not call a primary data/presentation fallback or create projects.

Context uses the root-owned deferred resource resolver on `workspaceRouteContext`: one selected lease and trusted caller exist before body reading, and only the normalized actual target is frozen for route IAM. There is no preliminary self/workspace grant. The resolver performs data preparation only. The selected gateway is ready before body parsing; immediately after the slot is known, synchronous active-trust ownership validation precedes `beginContextWrite`. No asynchronous project/Flow validation sits between that known-slot intent and ticket creation. Commit occurs only after admission and current selected project/domain/Flow/client checks. User/workspace body fields never grant authority. Body clientId is only a requested slot and must match an active trusted client approved by the trusted user in this gateway. Paired POST remains explicitly unsupported before proof/lease lookup.

The manual snapshot project/Flow decision compares the refreshed caller with the exact actor that made that decision through the existing shared `sameWorkspaceRouteAuthority`, exported by root. A real local-IAM regression first reproduced a 200 after role permissions were removed during the last target authorization; the comparison now refuses 403. Both routes synchronously call the bound presentation's context guard after their final awaited validation, so tenant/runtime retirement during that wait discards already serialized data. They then call the root-owned synchronous route `current()` immediately before returning, with no intervening await; false returns 401. POST also checks current() immediately before the ticket commit. This is lifecycle/primary-generation currentness, not a substitute for the awaited target IAM checks. A tenant presentation deliberately survives primary identity reload; primary currentness is not a reason to retire tenant context. Two final handoff tests flip the primary-current port during the last bound presentation check and verify 401 while preserving the tenant owner and any previously authorized context commit.

Malformed JSON/non-object/invalid identifier types refuse without a clear/write. Null/absent/blank project selection deliberately clears project and Flow. Context normalization and user/client namespace semantics remain in the presentation foundation. A late older ticket returns a fixed 409 rather than restoring its previous selection; retired runtime tickets refuse. A fresh response check cannot undo an already authorized committed context change if authority is revoked after the commit; it discards the response.

## Response projection

Service panel sessions require the server-bound operatorUserId to equal the current user, and trust rows require approvedByUserId equality. Paired callers on every profile additionally require exact sessionId/clientId/clientType/trustedClientId/user/domain and no managed-host identity; their trust row must match the exact bound trust/client/type/domain. Unknown owners are omitted. There is no service administrator bypass.

Explicit session/trust allowlists retain required browser identity/status/timestamps, recording id, safe capability id/kind/label/actionTypes, approved/expiry status, and the validated selected project id. Arbitrary session/state/capability metadata, trust recovery/previous-proof fields and raw revocation reason are omitted. Session projectId survives only when equal to the freshly validated project being presented. Service/paired `pairings` and `auditLog` are empty because their pending/challenge and arbitrary metadata fields do not carry sufficient trusted caller ownership evidence. Local/self-hosted authenticated panel operators deliberately retain the selected gateway's existing snapshot visibility; paired callers remain restricted there.

Stored context is a preference, not proof. Selected project/domain/resource visibility is checked before exposing an id/name, around the existing read-only own-project/name helpers, and before/following serialization. An explicit paired project binding wins over a different preference. A paired caller with no selected project uses the existing latest-own lookup without `create`; this never becomes a latest-foreign fallback. A visible project with a blank name remains usable without a fabricated label. An initially unavailable preference is omitted; authority loss during lookup/final validation refuses instead of returning stale names.

The selected presentation foundation supplies tenant readiness and service path/error omission. During route review, root authorized one bounded foundation companion: optional trusted `WorkspacePresentationCaller.channel` is captured immutably, defaults to panel, and reuses the existing safe status/readiness projection for paired callers on every profile. Routes pass only the actual trusted channel. This prevents a local/self-hosted paired caller from receiving operator paths, raw gateway causes, or content-protection provider identifiers, without duplicating the readiness projector in a route. Explicit local/self-hosted panel behavior remains unchanged.

This route does not claim to fix program-API gateway endpoints or other pending pairing/first-project/trace routes. Those require their own authority/privacy review. Existing local operator visibility is intentional compatibility, not a claim of service-safe global data.

## Validation

Initial owner run: **58 failures, 0 passes**. All routes refused at admission before gateway/body/project validation because the new lib/fluxiq test mocks omitted the still-exported legacy `getFluxIQWebRuntimeStatus`. The shared selector destructures that export even in multi tenancy; Vitest's strict missing-export proxy threw and the selector safely returned 503 before acquiring a lease. Consequently race tests waited for validation gates that were never reached. This was test setup, not tenant behavior acceptance. The run ended naturally (280s, including 89s collection); no timeout setting was changed. The mocks now explicitly export the legacy function and throw if it is ever called, plus the root's new exact-primary-current port. Gate helpers now fail directly if HTTP finishes before the expected wait, rather than hanging on an unopened gate.

Corrected combined owner run:

```powershell
pnpm.cmd --dir apps/web exec vitest run src/app/api/client-gateway/snapshot/tests src/app/api/client-gateway/automation-studio-context/tests src/lib/workspaces/presentation/tests src/lib/tests/automation-studio-context.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **79 passed, 0 failed**, eight files: snapshot 28, context 30, foundation plus unchanged resolver 21. This proved the mock fix and the caller-channel companion. The subsequent single final-target role-change regression reproduced the stale decision before its fix: expected 403, got 200 (one failed, 16 skipped).

After adding the actor comparison and final bound-owner guards:

```powershell
pnpm.cmd --dir apps/web exec vitest run src/app/api/client-gateway/snapshot/tests src/app/api/client-gateway/automation-studio-context/tests --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **61 passed, 0 failed**, four files: snapshot route 12/races 18, context route 16/races 15, duration 138.27s. This includes the reproduced role-change refusal and snapshot/POST retirement during final publication validation. No result overlaps library output mutation.

Tests use the actual shared route selection/IAM owner and real isolated IdentityAccessService sessions, plus the actual presentation owner. Instance/gateway/storage views are provider-free fixture ports. No primary data fallback is accepted. The root owns shared route/manager/runtime fixtures and parity matrix; this worker does not edit them.

Initial scoped TypeScript compiler API probe: two route roots plus four adjacent owner test roots, existing web tsconfig, noEmit/nonincremental: **6 roots, 0 diagnostics**. Initial owner structure probe: **17 rules, 16 files, 0 findings**. After the caller-channel and final target/tenant liveness fixes, the combined entry/test probe passed **10 roots, 0 diagnostics** and the combined foundation/routes structure probe passed **17 rules, 28 files, 0 findings**. Full file membership is retained for import checks while audited subjects/findings stay within the owned trees. No baseline expansion. `git diff --check` on the three source trees exited 0 with no output.

The root-owned synchronous route current() companion is consumed in the frozen source. The final owner run repeated the same four route files and observed **63 passed, 0 failed**: snapshot route 12/races 19, context route 16/races 16, duration 171.50s. Both new primary-stale publication tests returned 401 and preserved the tenant presentation owner; POST preserved the authorized context commit. The final combined no-emit probe again passed **10 roots, 0 diagnostics**; final combined structure again passed **17 rules, 28 files, 0 findings**. No source edits or test runs remain active. Root separately reported 112/112 shared context/stream cases; that is the lead's verification, not this worker's run.

Not verified: real sockets/browser recording, HTTP deployment, actual full gateway persistence, or live policy/data store changes. No build/dist mutation, whole web suite/typecheck, network/provider call, or mutating git by this worker. Root owns composed runtime and shared matrix acceptance.

Outcome: Done
Changed: `apps/web/src/app/api/client-gateway/{snapshot,automation-studio-context}/**`; approved caller-channel companion in `lib/workspaces/presentation/{model,owner,status}.ts` and adjacent status test; own reports only.
Validation: Final four-route-file command above -> 63/63; unchanged companion foundation -> 21/21 in the earlier combined run; final no-emit -> 10 roots/0 diagnostics; scoped structure -> 17 rules/28 files/0 findings; owned diff check -> exit 0.
Not verified: Live browser/socket/HTTP deployment or full gateway persistence; root integration/matrix is independently owned.
Report: `docs/working/hosted-platform-launch-plan/reports/gateway-presentation-routes.md`
Notes: Source frozen. No primary fallback or added preliminary self grant. Lead alone commits/pushes.

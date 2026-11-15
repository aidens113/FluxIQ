# Tenant member and audit reads

Outcome: implementation authored; focused validation pending.

## Scope and approved API

This worker owns the member/audit GET routes, new read owner and assembly subtrees, extraction-only changes to `list-members.ts` and `read-activity.ts`, bounded pinned factories in `server/provisioning-listener/platform-services.ts`, the explicitly granted account view/parser/UI companions and their tests. Existing mutation dependency builders, authorizers, member/invite actions, provisioning operations and multi-remove501 remain unchanged. Shared matrix/fixtures and shared context changes are lead-owned.

`withWorkspaceAccountRead(request, contract, read)` selects `workspaceRouteContext` once and holds the selected tenant plus a primary identity lease (reusing the selected lease when it is primary). Its immutable view exposes only workspace/user/profile/tenancy, identity snapshot, audit read and workspace-bound read-store methods. Workspace IDs cannot be supplied to those store methods. The private owner pins manager, primary object, identity object and selected tenant object.

All data operations run between actual selected-context revalidations and synchronous primary/manager/tenant/request-signal checks. Checks also follow module import and store-resolution awaits before invoking a physical source. The owner tracks checked reads so a rejected `Promise.all` cannot release a tenant while another name lookup remains pending. Error cleanup drains outstanding work. Successful responses serialize into a private buffered response, drain data work before final validation, and finish with a synchronous continuation check and synchronous idempotent release; the success path has no additional await before return.

Current auth/policy refusals preserve 401/403/503 in an account-compatible safe body. Invalid audit cursor remains 400. Operational failures are fixed sanitized 503 responses. Cleanup attempts both leases, reports only a fixed failure code, and cannot turn a failure response into a persistence-success claim. No timeout or global lock was introduced.

## Pinned platform read sources

`platformReadStoreFor(primary)` returns only the four needed read methods from the existing composition WeakMap for that exact primary. `getPlatformServices()` retains its old active-primary selector and full authority for existing mutation callers. The composition cache/service/store is reused, not duplicated.

`platformIamAuditReaderFor(primary)` captures that primary/root's existing shared `PlatformAudit` promise/store/sink once. It preserves the shared sink's documented best-effort flush behavior and never resolves a replacement primary between batches. Only a read port leaves the factory; neither factory exposes provisioning authority.

The lead supplied `isCurrentFluxIQPrimary` and fixed the existing program-context guard to capture its platform services before acquiring the tenant lease, reuse them, and check exact primary identity around proof awaits. These shared changes are dependencies of this unit, not worker changes.

## Read assembly and client capability

Existing authorized `listMembers` and `readActivity` wrappers retain their actual authorizers and delegate to extracted read-only assembly. New GET routes authorize using the selected tenant's IAM, never a primary-customer-data fallback or successful dummy authorizer.

Member rows remain field allowlists. Membership rows must match the exact workspace/user and be active, including a fresh subject membership check after account lookup. Missing/deleted accounts do not become global identity fallback rows in multi tenancy. Single-root legacy users, role choices and valid removal behavior remain. Service/multi views explicitly set `readOnly:true` and `canRemove:false`.

Audit uses the existing workspace predicate and field/name projection. Subject names require an exact active membership checked again after account lookup. The existing page size, batch size, scan cursor and busy-second continuation algorithm were moved intact; no new cap or skipped-record behavior was added.

`MembersView.readOnly?:boolean` is additive. The parser preserves legacy absence and fails closed for a malformed present flag. Member actions, invite form, resend and cancel-invite controls are hidden in a read-only view while member/invite data remains visible. Existing local workflows and server-side mutation decisions remain unchanged.

## Validation plan and results

Focused tests are authored for actual selector/IAM behavior, the same user in two workspaces, foreign row/name filtering, missing accounts, local/self-hosted compatibility, pending source/import/factory/parallel-read retirement, session/member/account/selection/workspace/policy/runtime changes, final validation continuation gaps, cursor coverage, fixed errors, cleanup and read-only UI. Existing authorized-wrapper, cursor and mutation tests will be included in the affected filter.

- First affected filter (`pnpm.cmd exec vitest run --pool=forks --maxWorkers=1 --minWorkers=1` with the new account owner/member/audit/factory/UI tests plus existing list/read-activity/registry/mutation tests) -> **71/118 passed** across 14 files. All 47 failures were in fixture setup before the new owner/route assertions: every synthetic account had the same non-null `externalId`, and the actual memory store correctly enforced its uniqueness. Fixed the fixture to use a distinct synthetic external ID per user; no store behavior changed.
- Passed files in that run: existing readActivity13, audit registry3, member wrapper5, changeMember10, inviteMember6, revokeInvite3, model11, account UI16 and pinned factories4. Those already-passing checks will not be repeated without a relevant source change.
- The lead's first whole-web typecheck reported one owned fixture diagnostic: the synthetic audit origin used a string outside the actual union. Changed it to valid `extension-chat` while retaining the assertion that origin does not reach the response. No production diagnostics were reported in that run; final type acceptance remains lead-owned.
- The selected structure audit stopped with ENOENT while reading an already-removed Vite `vitest.config.ts.timestamp-*.mjs` file enumerated during concurrent test startup. It emitted no owned rule failure. The audit will be rerun after consumers stop; no shared audit script or baseline was edited.
- The lead's matrix reported 97 passes and three audit503 failures; member reads passed. A short owner-store/empty-audit probe is running after the fixture fix to diagnose that remaining path before a wider rerun.

No builds, guard bypass, server or provider run was performed. Whole-web type acceptance and shared matrix rerun remain lead-owned.

## Concrete limits

Manager leases prevent normal tenant eviction and account for ownership, but they do not prevent forced primary reload. The owner checks the exact primary synchronously before/after awaits and refuses stale work instead of following a new root or awaiting reload under a held identity lease. Already-started external reads cannot be undone; their leases remain until they settle.

Authority checks across identity, membership, IAM and source stores do not form an atomic multi-store transaction. The final serialized publication boundary is guarded; it does not roll back independent committed changes. Global disable/enable/revoke-invite semantics were not changed or newly granted by this read unit.

No live server, browser, provider, deployment, real-user-data test or dist/build mutation has been performed.

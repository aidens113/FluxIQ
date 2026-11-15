# Account lifecycle composition discovery

Outcome: Done — read-only design. No source, frozen teardown acceptance state, build output or existing report changed.

Web `server/provisioning-listener/platform-services.ts:134` supplies neither `revokeConnectedClients` nor `deleteWorkspaceData` to `createPlatformServices`. Core `provisioning/context/create-provisioning-context.ts` explicitly defaults them to zero/no-op. Wiring real callbacks is required, but wiring alone cannot provide honest completion: cold authority needs an owning repository seam, and the existing successful-response cache has no partial-operation resume state.

## Actual operation and retry ownership

`service/run-provisioning-operation.ts` parses and authorizes the invocation, then runs mutations through the context's `SerialQueue`. `idempotency/run-idempotent.ts` checks `(operation, requestId)` and input digest, executes if absent, and persists **only successful responses after execution**. Unexpected callback failures propagate to the listener's generic failure; they are not cached. A recorded success replays without executing again. `create-platform-provisioning.ts` also puts due-deletion sweeps through that same context queue. Each composition creates its own queue today.

| Operation | Current order / retry behavior |
| --- | --- |
| Disable | `disable-account.ts`: identity disabled → account status disabled → sessions revoked → connected-client callback → success/cache. There is no already-disabled early return; `requireAccount` accepts disabled accounts, so callback failure retries. A cache-write failure after effects still leaves no operation completion record. |
| Rotate | `rotate-credentials.ts`: session revocation if requested → browser revocation if requested → optional reset mail → result/cache. No early state return. A partial retry repeats completed scopes and recomputes counts; it can include clients/sessions created between attempts. A completed cache replays correctly, but a failed cache write cannot reconstruct the earlier counts or cohort. Password-only and sessions-only scopes must not start revoking independent clients. |
| Scheduled delete | `delete-account.ts`: disable identity → persist deletion/status/receipt → revoke sessions → revoke clients → success/cache. If cleanup fails after the receipt is saved, a repeated scheduled request returns that existing receipt **before retrying cleanup**, even when the outer success cache is absent. |
| Immediate/due delete | `complete-account-deletion.ts`: delete identity → revoke sessions/clients → detach membership policies → enumerate personal workspaces → for each, delete data then catalog row → delete account → outer success/cache (immediate only). A failure before account deletion can generally retry; deleting the identity again answers false. But if account deletion succeeds and the final idempotency write fails, immediate retry sees no account and returns not-found instead of reconstructing its receipt. Due deletion keeps failed accounts scheduled and aggregates failures; deleted accounts disappear from the sweep. |

Last-administrator refusal occurs at the first identity change, before cleanup or row changes; preserve that invariant. `enableAccount` cannot enable scheduled deletion and does not restore revoked sessions/clients. `setPassword` revokes sessions, not independent clients; do not broaden its policy. Personal workspace enumeration is by `kind === personal` and `ownerUserId`, not current membership. Organisation/single workspaces lose the departing account's membership, not their shared data.

Source evidence is the named operations, `require-account.ts`, `personal-workspace-ids.ts`, and the idempotency/service owners. Existing refusal/idempotency tests prove ordinary refusal and success replay, not these partial-effect/cache-write windows. These failure windows were inspected, not executed in this discovery.

## Durable authority versus live cleanup

The browser-trust repository is the inventory authority. Current `ClientTrustRepository` exposes credential lookup, scoped load/save and active-client count, but **no owner-reference enumeration or owner revocation port**. `countActiveForUser` excludes revoked/expired/removed rows and returns no identities, so it cannot drive retry cleanup. `storage/records.ts` retains proved revoked tombstones, including `present = 0`; immutable owner/workspace bindings and generation-CAS replacement already exist.

Required private additions, using that same records/transaction engine:

```ts
listOwnedTrusts(userId: string): Promise<Array<{
  binding: ClientTrustBinding; revoked: boolean;
}>>;
revokeOwnedInWorkspace(input: {
  workspaceId: string; userId: string; reason: string;
  trustedClientIds: readonly string[];
}): Promise<{ changed: number }>;
```

Enumeration must include already revoked/removed references for required cleanup and never depend on identity existence, memberships, catalog presence or physical roots. Return references, never credentials, reuse keys or approval-session digests. Ownership is exact `approvedByUserId`; foreign clients and system-owned managed hosts are not selected merely because they share a workspace. Deliberately handle any genuine user-owned historical primary trust through the exact held primary owner, never by falling back a tenant binding to primary.

The conditional write must recheck each reference's user/workspace and immutable binding, and use existing `ClientTrustRecords.load/replace`, validation, SQLite transaction and generation advancement. Preserve prior revocation reasons on repeat. This is a **cold-owner-only** port, not a competing SQL writer to use while a gateway is loaded. Loaded gateway state otherwise stays active and its next scoped save conflicts with the externally advanced generation. Independent active-active gateways remain unsupported.

For a loaded/openable workspace, use its actual gateway revoker, whose queued-decision repair is being independently implemented in the credential teardown unit. It owns persistence and session retirement. Do not count an informational custody notification as strict completion: `ClientGatewayCredentialCustodian` deliberately catches hook failures. The public existing `fluxiq.programs.secretKeys.credentialUnlocks.forget(secretKeyPairedHolderId(id))` is an idempotent, awaitable strict cleanup port; the lifecycle callback can await it directly after the owning revoker. Transport/custody failure after durable revocation must still be retried using revoked references, not filtered out as already done. Attempt the other owned references and report fixed aggregate failure after all admitted work settles.

Custody also outlives eviction in the manager's private `custody` map. A missing runtime is not evidence that it holds no key material. `HeldKeys` has session/all revocation and paired handle allocation/reverse lookup, but no lookup-only paired-holder revoke. Add `revokePairedHolder(holderId): void` using its existing private map and `revokeSession`, zeroing buffers/derived reveal authorizations without allocating a fresh handle. A manager-owned cleanup callback can use that for evicted custody when the physical tenant cannot be opened. Do not revoke every holder in an organisation for a browser-only rotation. Existing host-protected model-use authority independently checks live user/membership/trust; cleanup does not add a model lock or a second unlock ceremony. Normal panel logout is not an account lifecycle callback.

## Manager ownership and pinned composition

`acquireExisting` is useful when a catalog and root exist, but returning null and then doing a direct repository write leaves a new opening/deletion race. Introduce a narrow trusted manager scope, for example:

```ts
withClientTrustOwner<T>(workspaceId, {
  current(): boolean,
  use(lease: WorkspaceLease): Promise<T>,
  absent(custody: HeldKeys | undefined): Promise<T>
}): Promise<T>;
```

It must hold the **existing opening/deletion reservation for the entire choice and callback**. Warm owner: hold exact lease and call `use`, including an orphaned warm owner after catalog removal. Cold root that can be safely opened: use the same existing-only factory, then the owner. Absent catalog/root or unopenable missing root: invoke `absent` under that reservation, without constructing FluxIQ, initializing layout, mkdir or allocating custody. Ordinary opening/deletion waits until the cold conditional CAS and targeted held-key cleanup settle. Propagate storage/invalid-layout/operational failures; do not classify every construction exception as absence. An explicit known primary branch uses the held primary rather than the tenant factory.

`deleteWorkspaceData` calls `manager.deleteWorkspace(id)` after trust cleanup scopes have released, never while holding a target lease that makes its own deletion busy. The manager waits for opening/closing, retires the instance, revokes custody, and invokes the real `removeTenantRoot`. Its Core root-removal helper treats verified absence idempotently. Reject primary; require actual removal composition under multi-tenancy. A failed close/removal/busy check propagates, so the catalog/account rows remain for resume. Active attempts/background work are not forcibly timed out or abandoned; deletion can remain operationally pending until they settle.

Compose callbacks in a new `server/provisioning-listener/lifecycle/**` owner. Capture the exact primary, manager and browser-trust repository in `platform-services.ts` before awaited composition; use `isCurrentFluxIQPrimary` plus exact manager identity, and a primary lease. Capture the resulting services/store through an explicit composition closure; **never call ambient `getPlatformServices`/`getFluxIQAfterReload` inside a callback holding its operation or tenant ownership**. Recheck currentness after awaits and before each new physical operation. Shutdown closes the manager before platform services, but forced primary reload currently closes/replaces primary without respecting outstanding primary lease counts; report refusal/resume rather than promising that a lease prevents forced reload.

## Smallest coherent completion prerequisite

Fixing only scheduled deletion would leave the immediate-delete/cache failure and rotate replay problems. Add one **lifecycle-specific completion/resume owner** for disable/rotate/delete, used also by due deletion. Persist its records with the existing `PlatformRecords`/`PlatformStore` repository; do not create a second queue, timer or persistence service. Existing store methods are individually durable, last-writer-wins, with completed-idempotency get/put only; there is no multi-effect transaction or pending-stage receipt to reuse unchanged.

Add typed get/put of a completion record keyed by operation/requestId, containing input digest, user, admitted scope, fixed target references, personal workspace ids, prepared receipt/result and completed stages. Resume must be reachable before requiring an account that an earlier attempt already removed. Save the plan before destructive cleanup; for disable/delete preserve identity's first refusal check, with no cleanup or success receipt on refusal. Persist a recoverable deletion receipt/target plan before removing the final account row. Only return/cache completed success after required effects finish. A scheduled receipt describes scheduling, not proof that required immediate cleanup completed; both repeated scheduling and due sweep resume the same owner.

Browser targets should stay bound to the admitted operation instead of selecting newly consented clients again on every retry. Pass a stable completion identity/target context to the callback, or keep that target plan in this same completion owner. A plan can count the originally live cohort whose authority is now ended; that is not proof of how many writes this particular retry caused. Exact replay of native changed-count results requires the trust owner to persist an operation-keyed result with its existing revocation transaction, including when a loaded gateway initiates it. The current `PlatformIdentityPort` similarly offers only bulk `revokeUserSessions`, not session inventory/selective revocation, and no primitive atomically records a step result with the outer completion row. A progress row alone cannot promise exactly-once rotation counts or snapshot-specific session rotation across a crash/write failure. Add result-bearing operation-keyed revocation where that guarantee is required, using non-secret digests/opaque target ids rather than raw session credentials; do not claim it from web retries. Keep reset mail's existing optional-delivery policy separate from required client/data completion.

Share the existing provisioning queue by platform root across primary compositions (optional injected `SerialQueue`/admission guard), rather than allowing old/new per-instance queues to mutate the same progress row during reload. A synchronous currentness/admission check must happen inside the queued lifecycle owner before identity/store effects, not only in the later callbacks. No atomic cross-store rollback or multi-process ownership is implied. Previously cached successes created while callbacks were no-op cannot retroactively prove cleanup; reconciliation needs an explicit policy, especially for active accounts whose later clients must not be indiscriminately revoked by replaying an old rotation.

## Concrete partitions and acceptance

1. **Core lifecycle completion:** `platform/provisioning/{idempotency,service,context,operations}` and `platform/store/{types,repository,memory}` plus owning tests. Shared resume semantics for all three operations/sweeper; fail after each identity/status/client/data/catalog/account/cache stage, restart/retry same id, digest conflict, correct counts/receipt, last-admin refusal unchanged, no skip from scheduled status, no accidental rerotation of new consent.
2. **Core trust/custody prerequisites:** browser-trust model/storage owner-reference and cold conditional APIs, gateway access committed owner enumeration if needed for single-profile local stores, `programs/secret-keys/runtime/held-keys.ts` targeted non-allocating holder cleanup. Test removed memberships/identity, revoked tombstones, foreign users, CAS rollback/stale writer refusal, buffers/reveal cleanup and no panel-holder loss for browser-only rotation. Local primary uses its existing gateway store; hosted SQL inventory does not replace local persistence.
3. **Web ownership scope:** workspace manager/options/existing-only factory companions and owning tests for one reservation across warm/cold/absent choice, direct-write versus constructor/delete/reload races, custody retained across eviction and zeroed without recreation, failure drain/exact-once lease release. Keep completed route context untouched.
4. **Web composition:** new lifecycle subtree, `platform-services.ts`, narrow `lib/fluxiq.ts` forwarding only if needed, owning real-composition tests. Exercise disable, browser/all/session/password rotation, scheduled/immediate/due deletion, unavailable/absent physical roots, orphaned records, loaded sessions, strict custody failure, busy work and partial deletion. Assert callbacks are actually installed, data precedes catalog removal, no default locks/logout coupling, no raw proof/path data in errors. No browser/provider calls are needed.

Validation: read-only `rg --files`, `rg -n` and `Get-Content` inspection of the live owners named above. No test consumer, build, dist mutation, browser/network/provider/account/email operation ran for this discovery. The frozen credential teardown report/source/tests and their pending acceptance were preserved.

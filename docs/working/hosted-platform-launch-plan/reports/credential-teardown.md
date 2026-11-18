# Credential-only hosted teardown

Outcome: Partial — web implementation and owning tests authored; final acceptance awaits the separately owned Core revocation fix and coordinated fresh libraries.

## Owned changes

- `apps/web/src/lib/workspaces/workspace-manager.ts`, `create-tenant.ts`, granted `WorkspaceManagerOptions.ts`, and new owning `existing-acquisition.test.ts` / `create-tenant.test.ts`.
- New `apps/web/src/server/browser-trust/teardown/**`, including public `forgetClientCredential(token, {hostedOnly?})`, exact-primary runtime ownership, hosted credential routing and owning unit/durable tests.
- `server/connect/revoke.ts` and its adapter test retain the existing `Promise<void>` / hosted-only API while delegating to the result-bearing helper.
- `app/api/client-gateway/forget-pairing/route.ts` and owning tests preserve bearer-only local/hosted cleanup and the boolean response, with fixed 503 on operational failure.

Root owns `lib/fluxiq.ts` composition, its new `existing-workspace-composition.test.ts`, exact proof classification/matrix and authored architecture documentation. Core revocation implementation/tests belong to a separate worker; no Core package source or dist was changed here. Existing discovery/account/stream reports remain frozen.

## No-create and lifetime contract

The additive manager method is `acquireExisting(workspaceId, {exists(): Promise<boolean>, current(): boolean}): Promise<WorkspaceLease|null>`. Known catalog/physical absence returns null; a deletion generation change, retired runtime, shutdown, failed read or factory failure rejects rather than masquerading as successful cleanup. The creating factory is never a fallback. A missing existing-only factory is an operational refusal on a cold tenant.

`WorkspaceManagerOptions.openExistingTenant({workspaceId, heldKeys, primary, beforeOpen}): Promise<FluxIQ|null>` is optional and separate from ordinary creation. The constructor's `existingOnly:true` overload requires synchronous `beforeOpen` and returns nullable; normal calls still return `Promise<FluxIQ>`. Existing-only construction reads the host layout and stats the validated tenant directory, never initializes layout or calls mkdir, and checks literal synchronous permission before and after the awaited stat.

The manager captures a per-workspace deletion generation before existence lookup; every new managed deletion attempt advances it. A deletion that finishes while lookup waits therefore remains visible after the transient deletion promise disappears. The opening promise is installed before any factory can execute synchronously or reentrantly. Deletion waits for that promise before removing the root; an in-flight constructor receives no lease after deletion starts. A published lease holds deletion out until work/read guards settle. Null/failed construction drops empty unowned custody, and nullable openings never become a null result from ordinary `acquire`. Ordinary acquire retains its existing ability to recreate an ID deliberately.

The helper holds the exact primary lease, manager and current-primary predicate across credential lookup, pinned `platformReadStoreFor(primary)`, catalog checks and tenant revocation. It never selects ambient platform services during those waits. The tenant lease is released in finally, including the promise continuation immediately after acquisition. The primary lease outlives that work. Once revocation is admitted, the helper waits for its actual result and cleanup; it does not report success while persistence is pending.

## Proof and response policy

The existing repository's cryptographic proof supplies workspace/trusted-client identity. Current, previous and obsolete proofs retain intentional own-trust revocation semantics. Proved inactive/revoked bindings also reach the same owner to finish required post-commit session cleanup; inactive/expired and invalid proof remain no-op false. Managed/primary bindings remain excluded. No caller-supplied workspace hint, cookie, active account, membership, IAM content grant or socket is used for hosted cleanup.

The actual gateway revoker and scoped SQLite store own persistence. The helper returns their boolean result, never synthesizes true from the void connect adapter, and sanitizes operational errors. Local behavior continues through `gateway.ready()` / `gateway.access.forgetByCredential`, including old-credential reuse handling. Cookie-only requests get 401. Processed cleanup keeps `{ok:true,payload:{forgotten:boolean}}`; operational failure is fixed 503 with no proof/binding/path/cause data. No credential values are logged or recorded here.

## Discovered Core race and coordinated fix

The first real-gateway/SQLite probe passed own-only durable revocation and save rollback/retry, but failed the concurrent case: a second teardown returned false from tentative `revokedAt` while the first write was pending. The first save was then rejected and drained; authoritative credential proof remained current. This was observed behavior, not a timing assumption.

Root assigned the owning Core fix to the registry/access worker: the decision must be inside the existing mutation queue without changing the old internal revoke contract. No web polling, duplicate revoker or new persistence engine was added. The durable fixture now covers a blocked first save, a queued second request, first rollback followed by second success, and two failed saves; finally always drains both requests. Another case tests actual post-save socket-send failure followed by proved inactive/revoked cleanup, preserving a foreign ready client.

## Validation so far

- Worker command: `pnpm.cmd exec vitest run --pool=forks --maxWorkers=1 --minWorkers=1 'src/server/browser-trust/teardown/tests/durable.test.ts'` from `apps/web` → **2 passed / 1 failed**, 62.96 seconds. Failure: second request resolved false before the first durable save settled. The fixture drained pending work and both leases. This was the pre-fix reproduction; the later queued fixture is not yet accepted.
- Root reported independent composition 2 + contract 7 + IAM matrix 42 → **51 passed** (76.71 seconds), proving actual cold reopen and absent/deleted physical roots with the earlier frozen web source.
- Root reported unchanged manager 22 + real eviction 2 → **24 passed** (66.74 seconds). Those existing test files were not edited here.
- New final owning test filter, final web types and structure acceptance: pending fresh coordinated Core output. No stale-dist guard bypass or extra consumer was started after Core source editing began.

No build, full suite, browser, panel, network, account operation or provider call ran in this worker unit.

## Explicit limits

This no-create guarantee covers this process's managed deletion and catalog/physical absence; it does not lock out arbitrary external filesystem removal or promise active-active runtime coherence. Core provisioning orders `deleteWorkspaceData` before deleting the catalog workspace row, then deletes the account. Actual web `composePlatformServices` currently omits that data-deletion callback and connected-client revocation callback, whose defaults are no-op. Root recorded a separate completion unit. This work does not claim to finish that provisioning lifecycle. It checks catalog presence again while holding the selected tenant and does not grant content authority.

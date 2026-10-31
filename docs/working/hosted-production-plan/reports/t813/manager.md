# t813-manager report (lane C1, workspace manager)

## Outcome
Done. `apps/web/src/lib/workspaces/` holds the manager. `globalThis.__fluxiqWebRuntime` now holds a
`FluxIQWorkspaceManager` instead of one `instance`. `getFluxIQ()`, `lib/auth.ts`, `instrumentation.ts`
and every S4 call site work unchanged. `lib/auth.ts` and `instrumentation.ts` were not edited, and no
S4 call site was migrated.

## What changed and why

### Design (apps/web/src/lib/workspaces/)
- `workspace-manager.ts` (`FluxIQWorkspaceManager`) keeps the primary entry plus a map from workspace id
  to an `OpenWorkspace` with `{fluxiq, gateway, heldKeys, lastUsedAt, leases, busy}`. Its methods are
  `primary()`, `replacePrimary()` (reload), `get()`, `workspaceIds()`, `acquire()`, `withWorkspace()`,
  `sweep()`, `deleteWorkspace()` and `close()`. The clock, idle time, cap, sweep interval, busy probe and
  warn sink are injectable.
  - Primary: built synchronously by `createPrimary` on first use and never evicted. Under `single` it is
    the only entry, and any other id is refused (`workspaces.unknown_workspace`).
  - Tenants (`multi`): one create per id (concurrent `acquire` calls share the promise). A failed create
    is not cached, and a custody it brought in that holds nothing is dropped. An `acquire` that meets an
    eviction in progress awaits that close before creating again on the same root. A loop bound of 5
    attempts guards against constant cap pressure.
  - Custody: one `HeldKeys` per tenant id lives in the manager. It survives `close({mode:"evict"})` and is
    handed to the recreated instance. It is revoked by `deleteWorkspace` (which closes with `shutdown`,
    then `revokeAll()`, then `removeTenantRoot`) and by `close()`, which closes tenants with `shutdown`,
    revokes every custody, then closes the primary last.
  - Eviction: an idle tenant is evicted after `idleMs` (15 min; `FLUXIQ_WORKSPACE_IDLE_MS`). The cap is
    `FLUXIQ_WORKSPACE_CACHE_MAX` (default 100, primary included) and evicts least-recently-used first.
    The sweep timer is unref'd and only exists under `multi`. A busy entry is never evicted. When busy
    entries alone exceed the cap, the manager keeps them all and warns once per episode. A busy entry's
    `lastUsedAt` is refreshed at each sweep, so idle time counts from when its work ended. The cap is
    also enforced on each lease, after the lease is counted.
  - Delete versus lease: a delete is refused (`workspaces.busy`) while the entry is busy. Every
    `acquire` is refused (`workspaces.deleting`) while a delete runs.
- `create-tenant.ts`: initializes layout v3 under the primary's `paths.root` (idempotent), uses
  `fluxiqWorkspaceRootDir` for the id, then `mkdir`, then `instantiate({rootDir, loadEnv:false, heldKeys, iam})`,
  then `initializeFluxIQWebStorage`. On a storage failure it closes the instance with `evict`. It refuses
  any `FLUXIQ_*_DIR` / `FLUXIQ_DIR` env value that resolves outside the tenant root, which every tenant
  would otherwise share.
- `lib/fluxiq.ts`:
  - `createWebRuntimeState()` picks the tenancy with `workspaceTenancyOfProfile(resolveFluxIQProfile(env))`.
  - The primary is `createFluxIQWebInstance(iam?)`: the same options as before, plus `iam` under
    `service` only.
  - Tenants are built by `createTenantFluxIQInstance`, which applies the host module and the same
    sole-domain pick. It closes the probe instance before building the second one on the same root.
  - `removeTenantRoot` uses `removeFluxIQWorkspaceRoot`.
  - New export `getFluxIQWorkspaces()`.
  - `closeFluxIQWebRuntime` keeps today's order (provisioning listener, audit detach, gateway server),
    then flushes the deferred IAM audit, then `workspaces.close()`. The same SIGINT/SIGTERM hooks and
    drain apply.
  - `reloadFluxIQWebInstance` replaces the primary only.
  - `initializeFluxIQWebStorage` moved to `workspaces/initialize-storage.ts`, unchanged.
- IAM under `service`. Every entry, the primary included, gets
  `{profile:"service", workspaceId, source, audit}`:
  - `service-iam.ts`: `source` is lazy and delegates each decision to
    `(await getPlatformServices()).workspaceIam(id)`.
  - `deferred-audit-sink.ts`: one process-wide `DeferredIamAuditSink` delegating to the platform's
    `BufferedIamAuditSink`. Records made before that sink opens are bounded (default 1000; drop-oldest,
    counted in `droppedRecords`). A failed open is retried. `flush()` opens nothing when nothing was
    recorded.
  - `local` and `self-hosted` pass no `iam`.
- Request lookup:
  - `workspace-fluxiq.ts`: `workspaceFluxIQ(Request | {headers, cookies})` returns the lease
    `{workspaceId, fluxiq, release}`, or null when there is no live session.
  - `session-id-of.ts`: reads parsed cookies first, then the `cookie` header.
  - `session-workspace.ts`: the primary's `identityAccess.validateSession`; under `single` the answer is
    the primary id; under `multi` it is the first active membership from `store.listMembershipsOfUser`.
  - `lib/fluxiq` and the provisioning listener are reached by dynamic `import()` (no module cycle).
- `server/provisioning-listener/platform-services.ts`: the constant became
  `primaryWorkspaceId()` (`lib/workspaces/primary-workspace-id.ts`). It is now read at compose time
  rather than at module load. New export `getPlatformIamAuditSink()` returns the same composition's
  `BufferedIamAuditSink`.

### Busy probes used
- In-flight leases (`acquire`/`withWorkspace`/`workspaceFluxIQ`).
- New Core probe `fluxiq.programs.activity()`, read through `workspaces/instance-busy.ts`:
  - `openProjectDatabases`: the Automation Studio runtime project pool's `stats().openProjects`, via the
    existing `AutomationStudioGatewayTraceServicePools.of(automationStudio)`. Every build
    (`generateFlowBootstrapAdaptation`) and run (`runRuntimeSession`) holds its project's lease for its
    whole length (`withAutomationStudioProjectDatabaseHeld`). Any other project operation also counts,
    and an entry closes about 1 s after its last use.
  - `backgroundTasksRunning` and `backgroundTasksScheduled`: counted by a subclass that overrides
    `run`, `setEnabled` and `saveSchedule`. The scheduled count covers non-`maintenance` tasks a person
    turned on with an interval. This deliberately avoids `snapshot()`, which loads storage and starts
    the scheduler interval.
  - `openGatewaySessions`: `clientGateway.snapshot().sessions` whose status is not `disconnected`.
- A probe that throws counts as busy and is reported with a warning.

### Core edit (one file: `packages/fluxiq/src/programs/_shared/runtime.ts`)
- Exported type `GlobalProgramRuntimeActivity`.
- `GlobalProgramRuntime.activity()`.
- Non-exported class `ObservedBackgroundTasksService extends BackgroundTasksService`, constructed in
  place of the base class. Its behaviour is the same plus the counters.
- `docs/reference/framework-reference.md` and its package copy were regenerated with
  `pnpm docs:reference`. They were already stale for the layout-v3 exports, and they gained
  `GlobalProgramRuntimeActivity`. These two generated files are outside the brief's owned list.

### Tests (apps/web/src/lib/workspaces/tests/)
- `tenant-eviction.test.ts` (real instances; fake manager clock; stubbed `fetch`; no network):
  1. Tenants alpha and beta are open; alpha has a user, a key and an unlock, then is released; beta is
     leased. After the idle time, alpha is evicted, and a WeakRef proves it was collected.
  2. Beta, and gamma (held by an open gateway session), stay past the idle time. With alpha recreated
     there are 4 entries over a cap of 3, all busy, so all are kept and one warning is given.
  3. With no new unlock, alpha resolves `unlockedSessionFor` to the old session. `respondToPersonTurn`
     sends `Authorization: Bearer <key>` to the stubbed DeepSeek URL and gets `source: "model"`.
  4. Gamma is evicted after its session disconnects.
  5. Deleting alpha revokes its unlock and removes its root. After `close()` every custody holds 0
     sessions.
  6. Bite check: with the evict close replaced by `Promise.resolve()`, the WeakRef assertion fails
     ("expected false to be true"). The file was then restored.
  7. A second case: a shared-storage env value and an invalid id are both refused.
- `workspace-manager.test.ts` (12, fakes): dedupe, failed create not cached, idle versus busy (lease
  and probe), LRU cap with a single warning, primary never evicted, eviction-close wait, custody reuse,
  delete refused while leased then revokes and removes, delete of an evicted workspace, shutdown order,
  single tenancy, unreadable probe counted as busy.
- `web-workspaces.test.ts` (8, through `lib/fluxiq`):
  - Under unset, `local` and `self-hosted` there is exactly one entry, `FluxIQ.create` is called with
    only `{modelProvidersEnabled, rootDir}`, and `workspaceFluxIQ` returns the primary.
  - A request with no session, or a dead one, gets null.
  - `FLUXIQ_WORKSPACE_ID` names the primary.
  - Under `service`: the primary gets `iam`. A hand-written membership routes the person to
    `<root>/workspaces/ws-tenant`, which gets `loadEnv:false`, its custody and its own `iam`; the lazy
    source reaches the store; the audit sink is shared. Shutdown closes the tenant (`shutdown`) before
    the primary and revokes its custody.
  - Session-cookie parsing and the env limits.
- `deferred-audit-sink.test.ts` (4) and `instance-busy.test.ts` (1, real instance: background task
  running or scheduled by a person pins it; `docs.rebuild` does not).

## Commands run and observed results
- Core build plus Core tsc under the lock (script `t813-manager-build.sh`): lock acquired 01:46:16 after
  a 40 s wait, released 01:48:27. Output: `packages/fluxiq build: {"build-cache":"build",...}`,
  `build-exit=0`, `tsc-exit=0` (no tsc output). Core source did not change after this build.
- `npx tsc --noEmit -p tsconfig.json` (apps/web): no output, exit 0 (run twice, last after every edit).
- `npx vitest run src/lib src/server src/instrumentation*` (apps/web):
  `Test Files 43 passed (43)`, `Tests 297 passed (297)`, exit 0.
- `pnpm structure:check` (root): `structure-audit: passed (470 warning(s), 1152 baselined).`
  - The first run failed on two of my lines (a `.catch` collector and a packed test line). I fixed both.
  - New warnings: `apps/web/src/lib/fluxiq.ts` is 542 lines and has 13 exported values;
    `programs/_shared/runtime.ts` is 426 lines.
- `pnpm docs:check` (root): failed as stale before regeneration; after `pnpm docs:reference` it printed
  "Deterministic framework reference is current."
- Core, beside the edit (not in the brief):
  `pnpm test src/programs/_shared src/programs/background-tasks src/framework/tests/instance-leak.test.ts`
  gave parallel 22 files / 162 tests passed, real-sql 6 / 24 passed, and "all groups passed".

## Not verified
- No live or browser run, no Next build, no real WebSocket listener.
- Tenants get no gateway sockets until C3's single listener. The open-socket pin was exercised through
  `clientGateway.connect()` only.
- Under load, one run of `src/lib/tests/fluxiq.test.ts` timed out at the 5 s default on "starts the
  provisioning listener on the service profile". That case pays the cold dynamic import of the
  provisioning listener. It passed alone (2.3 s) and in the full run above. I did not raise its timeout.
- Parked (`waiting`) runs do not pin a workspace. Their expiry timers are cleared by `close()`, and I
  did not check when they are re-armed after re-creation. Expiry may therefore be late while the
  workspace is evicted.
- POSIX path behaviour; a host module (`FLUXIQ_HOST_MODULE`) applied to tenants (the code path exists;
  no test loads a host for a tenant).

## Open questions or contradictions found
1. **Leak that defeats eviction, outside my files.** `BackgroundTasksService` starts an unref'd 5 s
   `setInterval` on its first `load()`. That happens on any background-tasks API call or docs
   generation (`docs-generators.ts` calls `backgroundTasks.snapshot()`). `FluxIQ.close()` never stops
   it. An evicted tenant whose tasks were ever loaded therefore stays reachable through the timer, and
   it keeps running due tasks (docs.rebuild every 24 h) on a closed instance. It needs a non-persisting
   `dispose()` on `BackgroundTasksService` called from `FluxIQ.close()`/`detach`.
   `background-tasks/runtime/service.ts` was not in my allowed Core files, so I did not fix it.
2. The platform composition's `IamAuditStore` is never closed: not at shutdown, and not when the
   primary is reloaded, which builds a second composition. On Windows the file stays locked, which is
   why the service test tolerates EBUSY when it cleans up its temp root. After a reload the deferred
   sink keeps writing through the first composition's sink.
3. `createFluxIQWebInstance` (primary, unchanged by design) still drops its domain-probe instance
   without closing it. That is one leaked hub subscriber per process and per reload. Tenants close
   theirs.
4. Membership order: "first active membership" uses the store's listing order. That order is
   unspecified and fine while provisioning is single-tenancy, but it needs a rule (default workspace)
   before organisation workspaces.
5. `docs/architecture/platform.md` ("Not yet wired") and `docs/operations/data-and-state.md` do not yet
   describe the manager. They were not in my owned list.

# Workspace presentation foundation

Outcome: Done; source and tests stable for lead integration.

## Boundary and API

Only the new `apps/web/src/lib/workspaces/presentation/**` subtree implements this unit. Existing context helpers remain unchanged. The subtree barrel exports `createWorkspacePresentations`, fixed `WorkspacePresentationError`, and narrow binding/caller/status types. No shared runtime, route, manager, Core library, extension, package, or existing barrel was edited by this worker.

`createWorkspacePresentations({ now? })` owns exact instance bindings through a WeakMap and current workspace owners through a Map. `bind({ workspaceId, instance, runtimeId, profile, isCurrent? })` permanently binds that object to its immutable construction identity; `forInstance(workspaceId, instance)` never selects a default. `invalidate(workspaceId, instance)` retires only that exact owner, and `close()` retires every current owner. Retired objects cannot be bound again. A new runtime object can replace the current owner for the same workspace.

An owner exposes `forCaller({ userId, clientId? })`, `recordingContextProvider`, and explicit local/self-hosted `operatorStatus`. The caller identity/client scope must already come from trusted server authority; these fields are not request payload authority. Caller views provide `context()`, `present(hostFacts)`, and `beginContextWrite().commit(selection)`. Begin the intent before asynchronous selection validation. A later intent for the same user/client slot supersedes an earlier one even when the earlier request finishes last. Tickets commit once and check runtime currentness immediately before and after mutation.

The optional construction-owned `isCurrent` callback is deliberately not evaluated during bind, before a tenant has been published into the manager. Every public read/write/provider operation checks it. False or a thrown predicate permanently invalidates the owner and clears context; turning the callback true later cannot revive it. The root-owned synchronous manager retirement observer must call `invalidate` on eviction/delete/replacement/shutdown so inactive owners release their strong active-map reference even if never accessed again. The predicate remains a second check.

## Context and presentation behavior

Each exact runtime owns a separate namespace of the existing `AutomationStudioWebContext` record. The original `setAutomationStudioContext`, `resolveAutomationStudioContext`, and `resolveClientRecordingProject` helpers retain client-specific/default preference, flow clearing, mismatch codes, and the existing five-minute freshness boundary. No polling interval, new timeout, durable store, or project creation was introduced. Context results and nested status results are detached values. Context caller IDs are captured, not kept as mutable request objects.

Status counts include only the current user's rows. A client-scoped caller sees its own row plus its user's default row; a panel user without a client restriction sees that user's rows. Foreign users and other client rows do not enter a restricted count. A local operator status without a caller reports no selected project/count instead of aggregating other users.

Readiness is read from the selected instance's actual active-domain native summary, generation runtime readiness, and reusable-context status. Values are explicitly projected and validated. These facts describe runtime capabilities/configuration, not whether a model credential is configured or usable, and do not block deterministic execution. No provider call runs.

Service status omits `hostRoot`, `fluxiqDir`, and `hostModulePath`; the path only becomes a loaded boolean. Raw gateway errors become a fixed unavailable message. Arbitrary content-protection provider identifiers become available/unavailable, and only the known reusable-context blocker code survives. Runtime method failures become a fixed `runtime_unavailable` error without raw cause. Local/self-hosted operator status deliberately retains the selected instance's paths, configured host-module path, raw operator gateway diagnostic, and actual content-protection identifier.

Root-approved companion during gateway route integration: trusted caller inputs may include `channel: "panel" | "paired-client"`, captured immutably with default panel for compatibility. Paired callers use the same safe service projection on every profile; local/self-hosted panel diagnostics remain deliberate. The gateway routes supply the actual trusted channel, never a body field. Two new status cases cover local/self-hosted paired omission and input mutation. The companion passed the coordinated combined 79-test run: **21 foundation/resolver cases** (status 9, context 5, lifecycle 5, unchanged resolver 2). The combined no-emit probe passed **10 roots, 0 diagnostics**; combined structure passed **17 rules, 28 source files, 0 findings**. The original 19-test acceptance below predates that companion. A tenant owner's lifetime is independent of primary identity reload; route currentness is a separate root-owned guard.

Final route integration retained this foundation unchanged and passed 63/63 owning route cases, including stale-primary handoff refusal without tenant-owner invalidation. Final combined no-emit and structure probes repeated the same 10 roots/0 diagnostics and 17 rules/28 files/0 findings. Exact route checks, reproduced authorization race, final route API, and limitations are recorded in [gateway-presentation-routes.md](./gateway-presentation-routes.md).

## Required root composition

Root owns `lib/fluxiq.ts` and the manager lifecycle. Construct one registry per web runtime. Bind each successfully constructed primary/tenant instance with a unique runtimeId and a lazy predicate checking the exact manager instance plus shutdown state. Bind tenants only after storage initialization succeeds. Install that exact owner's recording provider on both primary and every tenant gateway. Invalidate the old primary before reload close; use the exact retirement observer for tenants; close the registry during web shutdown. A detached old callback never falls back to the new primary.

The approved root wrapper is `getWorkspaceWebPresentation(workspaceId, exactFluxIQ, trustedCaller)` returning `context()`, `beginContextWrite()`, and `present()` with host facts supplied inside root. It is compatible with this foundation. Customer routes must use their held selected workspace/instance and fresh trusted caller. Legacy primary-only helpers are explicitly local/single-tenant operator compatibility, not a service fallback.

Gateway snapshot filtering is separate required work: filter own sessions/trusted clients for service users and exact bound session/client/trust for paired callers; omit foreign pending pairings, arbitrary audit metadata, host paths/errors, and unauthorized project names. Stored context is a preference and must pass current selected project/domain visibility again. A lease alone does not make an entire gateway snapshot safe. The next written `gateway-presentation-routes.md` brief owns that integration.

## Observed validation

From Core root:

```powershell
pnpm.cmd --dir apps/web exec vitest run src/lib/workspaces/presentation/tests src/lib/tests/automation-studio-context.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **19 passed, 0 failed**, four files: status 7, context 5, lifecycle 5, unchanged existing resolver 2. Tests use injected clocks and instance fakes; no server, browser, network, provider, or user state. They prove same IDs in two tenants; caller/default preference and counts; normalized and detached context; older write refusal; original recording freshness/mismatch behavior; exact object/workspace/generation binding; no early constructor predicate; permanent invalidation/rebind refusal; replacement/close/late callback refusal; selected dynamic readiness; service omission and fixed errors; local/self-hosted compatibility; detached nested status; and retirement during a readiness read.

Owner-scoped structure probe: **17 rules, 12 files, 0 findings**. Rules: file-lines, directory-files, class-methods, exported-values, statement-packing, swallowed-failure, failure-as-empty, as-never, test-placement, naming, import-cycles, imports, contract-spread, facade-dispatch, regexp-template-escapes, restricted-references, shared-temp-root. Full repository file membership is retained for import graph checks; findings/subjects are limited to the owned subtree. No baseline changed.

Scoped TypeScript compiler API probe rooted at the new entry plus three owner test files, using the existing web tsconfig and noEmit/nonincremental options: **4 roots, 0 diagnostics**. The first run found only TS7022/TS7024 for the registry owner's self-referential initializer; an explicit `WorkspacePresentationOwner` annotation fixed inference without behavior change. Root's in-flight integration run ended before that annotation was applied. No build or output emission. `git diff --check -- apps/web/src/lib/workspaces/presentation docs/working/hosted-platform-launch-plan/reports/workspace-presentation.md` exited 0 with no output.

The lead separately reported 57/57 runtime integration tests, including real tenant presentation and deletion/shutdown behavior; that is the lead's verification, not a worker run.

Not verified: composed runtime/manager callbacks, authorization of real HTTP routes, gateway snapshot privacy, real recording transport, real browser behavior, or provider credentials. Root independently owns integration tests. This foundation alone does not establish tenant-safe gateway responses. No whole web suite/typecheck, library build, dist mutation, live service, or git mutation was run by this worker.

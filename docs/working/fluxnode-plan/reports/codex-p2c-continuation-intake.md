# P2c multi-runtime continuation intake

Role: read-only discovery worker. Date: 2026-11-12.

## Outcome

P2c remains design-only in Core. I found no P2c or multi-runtime branch/worktree and no runtime-bundle implementation on Core `dev`. The next small independent unit is design phase 1: implement the runtime-bundle registry in `packages/fluxiq/src/runtime/automation-runtimes/`, its local tests/barrel, and the runtime-ownership architecture row. It does not need the t905 service integration seam.

## Pointers and current lanes

- Core main checkout: `C:/Users/osrs_/FluxStuff/!FluxIQ`, branch `dev`, HEAD `6c0692f39974f862d52ed5842aceebbee929238b` (`origin/dev`).
- P2c branch/worktree: none found. `git branch --all --list '*p2c*' '*multi-runtime*'` returned no refs; the filtered `git worktree list --porcelain` had no P2c/multi-runtime worktree. The design is `docs/working/fluxnode-plan/reports/p2c-multi-runtime-design.md` (design commit `fbdbe61bb`).
- t905: worktree `C:/Users/osrs_/FluxStuff/fxwork/t905/!FluxIQ`, branch `task/t905-result-ledger`, HEAD `006ea8104090f1e96042a104487f51c9191eb06a`. Its named checkpoint `docs/working/answer-first-plan/reports/codex-t905-source-checkpoint.md` says local checkpoint only; browser/lane acceptance remains open, and the owning library rebuild is in progress. Its branch has nine commits not on dev and lacks one dev-only commit (`git rev-list --left-right --count dev...task/t905-result-ledger` -> `1 9`). It changes `framework/automation-service/service.ts` and the Answer First/result-verification paths. Phase 4a/4b also own `service.ts` and runtime-session call sites, so keep those phases serial until t905 is integrated. The checkpoint still lists input/secret-frame authority and fresh post-clearance effect evidence as open.
- t907: worktree `C:/Users/osrs_/FluxStuff/fxwork/t907/!FluxIQ`, detached HEAD `91ffd4273cba99ba3c1dfdd3c58469e2bad88895`; `git branch --contains` showed Core `dev` contains that commit. The plan records t907/P5 merged at `a47f7dcf0`; final proof pointer: downstream `docs/working/mvp-launch-plan/reports/codex-t907-final-source-proof.md`. Phase 2's multi-domain lease rule is still a separate P2c requirement; t907's managed-host acceptance does not claim it.
- t909: worktree `C:/Users/osrs_/FluxStuff/fxwork/t909/!FluxIQ`, detached HEAD `595bb2b712112a8bead1d00e6e046bdcf414c8c1`, which is contained in Core `dev`. Its downstream lead-acceptance report is `docs/working/mvp-launch-plan/reports/codex-t909-lead-acceptance.md`. Durable source/target binding is integrated; P2c phase 6 can use the settled create/run seam, preserving t907 shutdown and t905 result wiring.

## Implemented versus unverified

The P2c design and its lead decisions are recorded in the plan: one runtime per project; add `runtime: "web"` to the web manifest; refuse a FluxNode whose runtime is not served; and prove two runtimes on one Core engine plus a simulation-only proof, with web plus Android at phase 9.

Core `dev` has no `AutomationStudioRuntimeBundles`, `registerAutomationRuntime`, `runtimeFor`, or cross-domain runtime-bundle guard (`rg` over `packages/fluxiq/src` returned no matches). The current `AutomationStudioService` still stores one IO runtime/domain and one native-node, host, and evidence binding. `DomainManifest` has no `runtime` field, and `FluxIQ` binds its IO to one `activeDomainId`. Runtime-session graph options filter authorized domains to the single bound IO domain. The page-held admission reader reads the one host resource port. These are inspected source facts, not multi-runtime behavior acceptance.

The current lease scope still holds strict leases in a process-level map; `requiresLease` treats a lease without `sessionId` as applying to every session. P2c phase 2's domain-isolation acceptance is therefore unverified and remains needed even though t907 is integrated.

The P2c conflict map says phases 4a/4b wait on t898, t902 and t885 integration; phase 5's `apps/web` loaders wait on t901; phase 7 waits on t902; and phase V waits on t905 and t885. I did not inspect those lanes' source or private reports. The design marks phases 0, 1, 2, 3 and the non-`apps/web` portion of 5 as startable.

## Recommended next unit

Phase 1 has the smallest clean ownership boundary: new `runtime/automation-runtimes/` files, local tests and barrel, plus the documented runtime-ownership row. The design's acceptance covers duplicate runtime/domain refusals, evidence/node domain mismatches, shared-object rejection, fallback object identity, `forRuntime` compatibility and strict modes, and cross-domain fallback guarding. Run its focused tests, `pnpm --filter fluxiq check`, and `pnpm structure:check` when implemented. This unit does not edit t905's `service.ts` or t907's host/lease work.

## Read-only commands observed

- `git worktree list --porcelain` -> Core dev and t905/t907/t909 worktrees identified; no P2c worktree (large listing filtered by these lane names).
- `git branch --all --list '*p2c*' '*multi-runtime*'` -> no output.
- `git log -1 --oneline --decorate dev` -> `6c0692f39 (HEAD -> dev, origin/dev) Record remaining result and simulation acceptance after host integration`.
- Source searches and reads covered the service binding methods, `domains/index.ts`, `framework/index.ts`, `service/runtime-session/{graph-options,page-held}.ts`, and `runtime/project-agents/host-resources/lease-scope.ts` only.
- No tests/builds, source changes, shared-document changes, git mutations, agents, model calls, browser/runtime-state access or external-service calls.

Outcome: Done
Changed: `docs/working/fluxnode-plan/reports/codex-p2c-continuation-intake.md`
Validation: Read-only repository/source/report inspection only; no tests or build run because this was a discovery brief.
Not verified: Current t905 acceptance after the checkpoint's reported integration/typecheck/audit; P2c runtime behavior; private t898/t902/t885/t901 lane state; phase 2 lease isolation; no P2c lane existed to resume.
Report: `docs/working/fluxnode-plan/reports/codex-p2c-continuation-intake.md`
Notes: Phase 1 is recommended as the next separate brief. Keep service-routing phases 4a/4b behind t905 and the other design-listed owners.

## Follow-up: phase 2 lease authority boundary (after t910)

This follow-up supersedes the earlier phase-1 status above: the Core `dev` checkout now reports HEAD `5e704b497` (`Record integrated runtime registry and contract acceptance`), and `runtime/automation-runtimes/` contains the phase-1 registry and tests. This review remains read-only; no phase-2 implementation or tests were run.

### Finding

Phase 2 cannot be made sound by adding only a domain comparison to the current process-global map. `runtime/project-agents/host-resources/lease-scope.ts` has a module-level `strictlyHeld` map and a static `AutomationStudioHostLeaseScope.gatewaySource`. That source's `current()` reads the module's ambient `AsyncLocalStorage` frame, `isCurrent()` checks that frame, and `requiresLease(sessionId)` scans every scope in the process. In `programs/_shared/runtime.ts`, every call to `createGlobalProgramRuntime()` creates a new `ClientGatewayService` but passes it the same `AutomationStudioHostLeaseScope.gatewaySource` object. Thus a session-less lease in Core instance A makes `requiresLease` true for commands sent by independent instance B, regardless of domain. A domain-only key would still make two independent Core instances with the same domain interfere.

There is a related ambient-stamping boundary: if a command is dispatched through a different `ClientGatewayService` while an unrelated lease's async context is active, the shared source's `current()` can return that lease to the other service. The exact source path is present (`programs/_shared/runtime.ts` injects the shared source; `client-gateway/service/commands.ts` stamps through it), but I did not find a normal product call path that dispatches across two independent instances inside one lease scope. Treat that as an authority leak the implementation must prevent and regression-test, not as an observed user-flow failure.

The resource contract has `resourceKey`, `epoch`, optional `sessionId`, and holder (`runtime/automation-host/resources.ts`); it carries neither `domainId` nor a Core/gateway owner. `dispatch/host-lease.ts` caches schedulers by host-port object in a process-wide `WeakMap`, which is useful for sharing one physical port's capacity but is not an engine-instance authority. Do not infer instance/domain from the resource key or port identity.

### Trusted target domain and owner paths

- **Per-instance owner exists as an object boundary, but is not passed to lease code.** `programs/_shared/runtime.ts:createGlobalProgramRuntime()` constructs one `AutomationStudioService` and one `ClientGatewayService` per program runtime. `client-gateway/service.ts:106-131` constructs that gateway's private session registry, trusted-client registry, and commands collaborator. The gateway instance or an opaque owner capability created beside it is a sound in-process owner token; there is no `instanceId` field in the lease source/contract or session schema.
- **The target domain has a server-owned trust path.** The initial `client.hello` metadata is client-declared (`service/sessions.ts:create`). `service/trust-grant.ts:grant` copies `declaredDomainId(session.metadata)` into the trusted-client record when pairing or host enrollment grants trust. `service/lifecycle.ts` rejects reconnects whose declaration differs from that record, and `service/access.ts:authorizeToken` checks the same binding. The ready `InternalSession` carries a server-assigned `trustedClientId` (`service/sessions.ts:attachTrustedClient`), and `ClientGatewayTrustedClientRegistry.get(id)` returns the bound record. Therefore the trusted record reached through the ready session's `trustedClientId` is the appropriate domain authority; do not use arbitrary client metadata as the source of truth.
- **The lease-stamp target boundary must expose that authority.** Non-durable `ClientGatewayCommands.executeAction` already calls `sessions.requireReady(sessionId)` before stamping, but `ClientGatewayCommands` receives only `sessions`, not the trusted-client resolver. Durable `ClientGatewayCommandLedgerDispatch.execute` stamps before `sessions.requireReady(sessionId)`, so it must resolve the ready session and trusted domain before lease admission/stamping (while still refusing before ledger claim or send). `client-gateway/service.ts` is the constructor that can pass the same per-gateway owner and trusted-domain resolver into both `service/commands.ts` and `service/command-ledger/dispatch.ts`.
- **Runtime domain must reach lease acquisition.** The new `runtime/automation-runtimes/bundle.ts` associates `domainId` with `host`; `registry.ts:forDomain()` returns the selected bundle. Current lease factories/callers discard that association: `runtime/project-agents/dispatch/dispatcher.ts` calls `automationStudioProjectHostLeaseScope(input.host)`, `service/project-parts/run/driving-gate.ts` passes only `hostResources`, `service/project-build/run.ts` passes only `host`, and `service/runtime-session/page-held.ts` passes only `hostResources`. The current `framework/automation-service/service.ts` still has the service slots, and phase-4 service selection is not present yet. Thread the selected bundle's `domainId` and per-instance owner through these callers into the lease scope; do not guess them from the port.
- **Other static-source consumers must use the same authority.** `framework/automation-service/service/runtime-session/admission.ts` checks static `current()`, `isCurrent()` and `requiresLease()` to decide whether an already-held lease permits immediate admission. `service/candidate-trial/run.ts` checks static `isCurrent()`. Both need the same owner/domain-aware source as the gateway, or phase 2 can fix command dispatch while leaving admission decisions ambient.

### Smallest sound phase-2 boundary

The P2c design's four phase-2 files (`host-resources/lease-scope.ts`, `dispatch/host-lease.ts`, `client-gateway/service/host-lease/source.ts`, `.../stamp.ts`) are not enough for the same-domain/multi-instance case. A bounded implementation brief must also own the actual authority wiring and every consumer of the static source:

- `packages/fluxiq/src/programs/_shared/runtime.ts` and `packages/fluxiq/src/client-gateway/service.ts` to create/pass one opaque owner capability per Core gateway instance, plus the trusted-domain resolver;
- `packages/fluxiq/src/client-gateway/service/commands.ts` and `service/command-ledger/dispatch.ts` to resolve the ready session's server-bound domain before both normal and durable stamping;
- `packages/fluxiq/src/runtime/project-agents/dispatch/host-lease.ts` and `runtime/project-agents/host-resources/lease-scope.ts` to track strict leases by owner and runtime domain while preserving the existing per-port scheduler sharing;
- `packages/fluxiq/src/client-gateway/service/host-lease/{source,stamp}.ts` to make target owner/domain explicit at the stamp decision;
- `packages/fluxiq/src/runtime/project-agents/dispatch/dispatcher.ts`, `framework/automation-service/service/{project-parts/run/driving-gate.ts,project-build/run.ts,runtime-session/page-held.ts,runtime-session/admission.ts,candidate-trial/run.ts}` to thread the selected owner/domain and remove the static ambient checks.

Keep the actual source edits file-owned and coordinated with phase-4 runtime selection: the registry has the domain-to-host mapping now, but no service runtime selector yet. The instance owner is an opaque in-process capability from the gateway/program-runtime constructor, not a public or wire ID. The trusted target domain comes from the ready session's trusted-client record, not the session's raw declaration.

### Regressions to require

1. Two separate `createGlobalProgramRuntime()`/gateway instances with the **same trusted domain** and separate session/host ports: while A holds a strict grant with no `sessionId`, A's unleased command is refused and B's is sent. Releasing A restores both. This specifically rejects a domain-only fix.
2. One owner with two registered runtime domains: a session-less strict lease acquired for domain A refuses A's unleased command but permits B's. A command for B dispatched inside A's async scope must not be stamped with A's lease.
3. Preserve explicit-session legacy behavior within the owning gateway: a lease for session A refuses an unleased A command and lets session B through; stale/reissued leases remain refused.
4. Exercise both `ClientGatewayCommands.executeAction` and durable `ClientGatewayCommandLedgerDispatch.execute`: wrong owner/domain must be refused before transport send, and durable refusal must occur before claim/ledger write.
5. Prove the domain source is trusted: a ready session's server-bound trusted record selects the domain; a changed/unbound declaration cannot acquire authority. No raw `metadata.domainId` from an arbitrary session may scope a lease.
6. Retain the existing focused groups: `runtime/project-agents/host-resources/tests/lease-scope.test.ts`, `client-gateway/service/host-lease/tests/stamp.test.ts`, `client-gateway/service/tests/commands-host-lease.test.ts`, and `client-gateway/service/command-ledger/tests/dispatch-host-lease.test.ts`, adding the cross-instance cases at the owner-wiring layer.

Outcome: Done
Changed: `docs/working/fluxnode-plan/reports/codex-p2c-continuation-intake.md` only
Validation: Read-only source and call-site inspection; no tests/builds run, as directed.
Not verified: No phase-2 code or cross-instance regression exists yet; no normal product path was found that dispatches across independent Core instances inside one lease scope; actual phase-4 runtime selection is not implemented.
Report: `docs/working/fluxnode-plan/reports/codex-p2c-continuation-intake.md`
Notes: Domain-only filtering is insufficient. Scope leases by both an opaque gateway/Core owner and a runtime domain, and derive the command's target domain from the server-bound trusted-client record.

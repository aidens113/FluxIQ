# Held tenant trace artifact upload

Outcome: Done. Core companion and owned trace route/tests are accepted by focused owner checks and frozen for lead integration. Earlier presentation/snapshot/context and shared source remain untouched.

## Precise public seam

Initial inspection found that `uploadTraceArtifact` awaited stillAuthorized immediately before synchronous receiveTraceArtifact, with no additional guard at the await continuation. A queued primary-reload/abort/binding change could run between callback resolution and that continuation. An earlier route check or callback check did not close that gap.

`ClientGatewayService.receiveTraceArtifact` delegates directly to `ClientGatewayTraceTap.artifact`. The tap checks the digest and routes immutable bytes into open trace claimants; it does not reauthenticate the caller or the pinned workspace/session/trust/user/domain/project/recording target. Its zero-trace success and sink-owned failure semantics are intentional and must remain unchanged.

After checkpoint c564c2b3a pushed, the lead explicitly released the bounded Core companion in the brief. Only `packages/fluxiq/src/server/client-gateway-routes/trace-artifact-upload.ts` and its new adjacent test changed in Core. No proxy FluxIQ, temporary production gateway replacement, or duplicated intake/body validator is used.

Frozen additive contract, now implemented:

```ts
beforeIntake?: () => boolean;
```

The helper invokes this only after successful existing body validation and full awaited stillAuthorized, synchronously immediately before receiveTraceArtifact with no intervening await. Undefined preserves existing callers. When supplied, only literal true admits; nonboolean and resolved-Promise results refuse. False preserves the existing stale-upload403/body. A throwing hook returns fixed503 `Trace artifact authorization could not be verified.`; the catch surrounds only the hook, so unrelated body/async-authority/intake exceptions retain their existing propagation.

This callback is an additional refusal condition, not a replacement for asynchronous IAM/account/proof validation. It cannot turn a synchronous snapshot into new authority or promise an atomic transaction with external IAM changes.

## Owned route adaptation

Use the frozen paired-only PUT contract through `workspaceRouteContext(request, ROUTE, selection => ({ trustedClientId: selection.caller.binding.channel === "paired-client" ? selection.caller.binding.trustedClientId : undefined }))`. The trusted route callback resolves the browser resource from the proved binding, with no preliminary self grant and no body-controlled authority. A nonempty cookie selects the unsupported panel channel and is refused before bearer proof lookup. No primary data or tokenless fallback.

Acquire before awaiting params, then keep one exact instance lease through params, body, validation, hashing/intake, serialization and final response checks. SHA/media/20 MiB/empty/hash rules and statuses continue to come from actual uploadTraceArtifact and the actual gateway intake; do not reimplement them. Unexpected params/body/intake errors get fixed route text and once-only finally release after the awaited helper settles.

The asynchronous stillAuthorized callback calls the same owner's revalidate, which already enforces the frozen session/trust/client/type/user/domain/project/recording binding and current tenant/IAM. The synchronous beforeIntake then checks owner.current() and the selected gateway's matching live session/trust fields against that immutable binding. Public session/trust views are only additional refusal evidence after the full authoritative check. Missing, disconnected, managed, expired, revoked or mismatched views refuse; the route never selects a new gateway/session. The core gateway's freshly computed active/expired status remains authoritative rather than inventing a different route clock/expiry policy.

Preserve existing stale-upload403 on callback refusal; distinguish known authority outage503 safely. Positive buffered responses need a final full revalidation and synchronous current() before publication. An artifact accepted before a later refusal may already be copied/queued in a trace; neither a refused response nor lease release rolls that side effect back. The count describes traces that took the artifact, not proved durable flush.

Drain is not a blanket upload denial. Existing in-flight trace artifact completion may be necessary while work drains. Keep it authorized/scoped and retain zero-open-traces200; do not add a new-start drain gate.

## Provider-free coverage

| Boundary | Concrete acceptance |
| --- | --- |
| Core companion | Optional omission preserves old behavior. Valid body -> awaited auth -> one synchronous hook -> exact intake. Auth false skips hook/intake. Hook false returns existing403; throw is fixed/safe. Malformed digest/media/empty/declared or actual oversized body never reaches hook/intake. |
| Await continuation | stillAuthorized queues a microtask changing currentness before its true result resumes; beforeIntake observes false and intake is untouched. Conversely a microtask queued inside a true synchronous hook must not run before intake, proving no new await. |
| Selection | Actual shared selector/IdentityAccessService/tenant IAM, tenant A/B with colliding session/client/trust/project/recording ids; exact selected gateway receives bytes and primary/other tenant never does. Local/self-hosted single-root compatibility stays deliberate. |
| Channel/domain | No token/unknown token, cookie+bearer and invalid-cookie precedence, paired-only refusal, managed-host refusal, foreign URL domain. Resources come only from trusted binding, not query/body ids. |
| Body races | Pause arrayBuffer, then alter session/trust/client/type/user/domain/project/recording; remove membership/account or policy; revoke proof; abort or make primary stale. No intake, no tenant reacquisition, release once after the body/helper settles. Gates fail directly if the route returns before entering the expected wait. |
| Intake boundary | Change current primary/abort/live session/trust after async auth but before synchronous intake guard. All refuse without receiveTraceArtifact; no fabricated successful probe or duplicate intake. |
| Existing wire | Uppercase digest normalizes; HTML/CSS/image/font accepted; unsupported media415; malformed digest400; empty400; declared/actual >20 MiB413; digest mismatch409; zero traces200; exact media/bytes/session/count; safe exceptions. |
| Completion | Accepted intake followed by final authority loss discards success without claiming rollback. Response construction/params/body failures and authority outage release once. Draining alone keeps an authorized in-flight upload usable. |

Observed Core companion command:

```powershell
pnpm.cmd --dir packages/fluxiq exec vitest run src/server/client-gateway-routes/tests/trace-artifact-upload.test.ts src/server/client-gateway-routes/tests/managed-request.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

**27 passed, 0 failed** (22 new helper cases plus 5 unchanged managed-request cases), duration9.33s. This includes actual Core digest verification, zero-trace behavior, an actual normally approved client, two real recorder/memory-store claimants containing exact uploaded bytes, ordering, strict booleans, await-gap refusal and no new await. Scoped Core compiler API probe: **2 roots, 0 diagnostics**; helper structure: **17 rules, 2 files, 0 findings**. Helper production/test source is frozen. Root separately reported independent27/27, package check, fluxiq0.50.1 bump and fluxiq-only build104.274s; those are lead-owned actions/results.

Web route tests are authored: real shared selector/IdentityAccessService/IAM with two colliding tenant bindings, actual Core helper/default digest intake, and separate real paired gateway/recorder stores proving positive upload and a persisted in-memory artifact after late response refusal. The test-only guard wrapper calls through the actual async guard, then changes facts at the adversarial intake boundary; the Core upload helper/intake is not replaced by a dummy engine. New web source is `route.ts`, `guard.ts`, `current.ts`, with four adjacent test files and three local support files.

After root's full dependency freshness release (including UI and a passing downstream currency guard), the owner ran:

```powershell
pnpm.cmd --dir apps/web exec vitest run 'src/app/api/client-gateway/trace-artifacts/[sha256]/tests' --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **52 passed, 3 failed**, duration171.80s: route19, body races20 and intake-boundary13 passed; real-intake3 failed while constructing its fixture because required recorder options were omitted. The source-local type probe found exactly that options error and a vi.spyOn overload annotation error in test support; no production diagnostics. After the run naturally ended, only the test recorder clock/buffer options and a MockInstance annotation changed. Production and all52 passing cases stayed unchanged.

The affected-file rerun was:

```powershell
pnpm.cmd --dir apps/web exec vitest run 'src/app/api/client-gateway/trace-artifacts/[sha256]/tests/real-intake.test.ts' --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **3 passed, 0 failed**, duration73.51s. Real public Core ordinary pairing/gateway/recorder/memory-store tests prove exact bytes in two tenant stores with colliding trace/client/project/recording ids, one trace closed normally returning200/traces0, and stored artifact bytes surviving a late401 response refusal. This is split acceptance (52 unchanged cases plus the corrected3), not a claim that one final55-case invocation ran.

Final source-local TypeScript compiler API probe, using web tsconfig with noEmit/nonincremental roots at the route plus four owning test files: **5 roots, 0 diagnostics**. Final combined Core/web owner structure: **17 rules, 12 files, 0 findings**. Full repository file membership is retained for import checks while audited subjects/findings are owned paths only. No baseline changes. Owned git diff check exited0; informational LF-to-CRLF warnings were emitted for the existing rewritten test/report. No web consumer started before/during the dependent-library refresh, and no owner consumers remain active.

No worker build/dist writes, provider/browser/server calls, shared helper edits or mutating git. The Core continuation gap and composed route intake guards are covered by provider-free behavioral tests. Disk persistence and live browser/network behavior remain unverified; an in-memory store flush is not a durable-host acceptance claim. Root owns independent shared matrix/package checks and final git integration.

Outcome: Done
Changed: Authorized Core helper/new test, owned trace route tree and this report only.
Validation: Core27/27; web52 unchanged passing cases plus corrected real-intake3/3; scoped Core2roots/0diagnostics and web5roots/0diagnostics; structure17rules/12files/0findings; diff-check0.
Not verified: Live browser/network/HTTP deployment, durable disk storage, root-owned shared matrix/package acceptance.
Report: `docs/working/hosted-platform-launch-plan/reports/tenant-trace-upload.md`
Notes: All owned source/tests frozen. Previous owned/shared source untouched. Lead alone owns version/build/shared integration/git.

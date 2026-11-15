# Held tenant trace artifact upload

Outcome: Partial — discovery/contract preparation complete; production trace edits are explicitly held by the lead until the preceding web checkpoint passes/pushes and the Core companion is authorized. Only this report changed. Earlier presentation/snapshot/context and shared source remain frozen.

## Precise public seam

The current public `uploadTraceArtifact` input is `{ fluxiq, request: Pick<Request, "headers" | "arrayBuffer">, sha256, sessionId, stillAuthorized(): boolean | Promise<boolean> }`. In `packages/fluxiq/src/server/client-gateway-routes/trace-artifact-upload.ts:22`, it awaits `stillAuthorized()`; the next statement invokes synchronous `fluxiq.programs.clientGateway.receiveTraceArtifact(...)`. A queued primary-reload/abort/binding change can run between callback resolution and that await continuation. There is no public synchronous guard at intake. An earlier route check or callback check does not close this gap.

`ClientGatewayService.receiveTraceArtifact` delegates directly to `ClientGatewayTraceTap.artifact`. The tap checks the digest and routes immutable bytes into open trace claimants; it does not reauthenticate the caller or the pinned workspace/session/trust/user/domain/project/recording target. Its zero-trace success and sink-owned failure semantics are intentional and must remain unchanged.

No proxy FluxIQ, temporary gateway method replacement, manually duplicated intake/body validator, or library edit was made. The lead agreed that a bounded Core companion is required before route implementation.

Proposed additive contract, pending the lead's final freeze:

```ts
beforeIntake?: () => boolean;
```

The helper invokes this only after successful existing body validation and full awaited stillAuthorized, synchronously immediately before receiveTraceArtifact with no intervening await. Undefined preserves existing callers. False preserves the existing stale-upload 403/body. A throwing callback must produce fixed safe failure text without exposing its cause; suggested unavailable status 503 is a proposal for the lead to freeze. A nonboolean/Promise returned by an untyped caller must never be implicitly awaited or treated as a successful synchronous guard.

This callback is an additional refusal condition, not a replacement for asynchronous IAM/account/proof validation. It cannot turn a synchronous snapshot into new authority or promise an atomic transaction with external IAM changes.

## Concrete owned route adaptation

Use the frozen paired-only PUT contract through `workspaceRouteContext(request, ROUTE, selection => ({ trustedClientId: selection.caller.binding.channel === "paired-client" ? selection.caller.binding.trustedClientId : undefined }))`. The trusted route callback resolves the browser resource from the proved binding, with no preliminary self grant and no body-controlled authority. A nonempty cookie selects the unsupported panel channel and is refused before bearer proof lookup. No primary data or tokenless fallback.

Acquire before awaiting params, then keep one exact instance lease through params, body, validation, hashing/intake, serialization and final response checks. SHA/media/20 MiB/empty/hash rules and statuses continue to come from actual uploadTraceArtifact and the actual gateway intake; do not reimplement them. Unexpected params/body/intake errors get fixed route text and once-only finally release after the awaited helper settles.

The asynchronous stillAuthorized callback calls the same owner's revalidate, which already enforces the frozen session/trust/client/type/user/domain/project/recording binding and current tenant/IAM. The proposed synchronous beforeIntake then checks owner.current() and the selected gateway's matching live session/trust fields against that immutable binding. Public session/trust views are only additional refusal evidence after the full authoritative check. Missing, disconnected, managed, expired, revoked or mismatched views refuse; the route never selects a new gateway/session.

Preserve existing stale-upload403 on callback refusal; distinguish known authority outage503 safely. Positive buffered responses need a final full revalidation and synchronous current() before publication. An artifact accepted before a later refusal may already be copied/queued in a trace; neither a refused response nor lease release rolls that side effect back. The count describes traces that took the artifact, not proved durable flush.

Drain is not a blanket upload denial. Existing in-flight trace artifact completion may be necessary while work drains. Keep it authorized/scoped and retain zero-open-traces200; do not add a new-start drain gate.

## Required provider-free cases

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

The focused future command is `pnpm.cmd --dir apps/web exec vitest run 'src/app/api/client-gateway/trace-artifacts/[sha256]/tests' --pool=forks --maxWorkers=1 --minWorkers=1`, followed by only entry/adjacent-test no-emit roots and the owned structure scope once source is stable. Core helper tests/version/build belong to the lead/companion owner; web tests must wait for its fresh library outputs.

Validation so far: read-only route, Core helper/body/intake/tap, shared authority/current types, existing trace tests, drain and written discovery inspection. No tests, build/dist writes, provider/browser/server calls, production edits, or git mutation. The continuation gap is source-level evidence at this checkpoint; no runtime repro or fixed behavior is claimed yet.

Outcome: Partial
Changed: This report only.
Validation: Named source/contract reads; tests not run during the lead's frozen checkpoint.
Not verified: Proposed hook, migrated route, actual intake race behavior, browser/network/persistence.
Report: `docs/working/hosted-platform-launch-plan/reports/tenant-trace-upload.md`
Notes: Await explicit companion/API/library-ready release. Previous owned source stays frozen. Lead alone edits Core helper/shared integration/git.

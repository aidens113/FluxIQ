# Server-authored session-ready metadata

Outcome: Done. Both actual gateway ready paths now publish validated server identity and committed credential expiry. Provider failures refuse before readiness; ordinary credential authority remains independent of panel-session/key state. Only the approved gateway source/tests and this report changed. No contracts, client transport, extension, framework/web composition, package metadata, shared working state, builds/dist, real browser/server/provider or git mutation was performed by this worker.

## Public interface and composition

`ClientGatewayServiceOptions.sessionMetadata?: ClientGatewaySessionMetadataProvider` uses the frozen provider signature:

```ts
type ClientGatewaySessionMetadata = {
  user: ConnectUserSummary;
  workspace: ConnectWorkspaceSummary;
};
type ClientGatewaySessionMetadataProvider = (input: Readonly<{
  trustedClientId: string;
  userId: string;
  clientType: ClientGatewayClientType;
}>) => Promise<ClientGatewaySessionMetadata | null>;
```

The types are exported through `service/session-metadata/index.ts`, the existing service barrel, and owned `client-gateway/service.ts`, which the public client-gateway barrel already exports. Root owns framework/runtime forwarding and tenant-bound web composition; this worker did not edit those files.

Provider input is a frozen allowlist from the authoritative trusted record, with no token, client-supplied tenant, approving panel session/digest or provider TTL. Shared Connect summary schemas validate and detach output; user id must equal the bound trusted owner. Extra provider fields never reach the frame. Absent provider preserves generic local identity omission. Only actual server-enrolled `trustedClient.managedHost` bypasses the ordinary-human provider; hello claims do not select that exception.

## Ready ordering and authority

The shared `ClientGatewaySessionMetadataResolver` captures the actual session/trust object plus owner/client/type/domain/managed binding. It checks current registry object identity, live session/trust, binding, accepted proof/current hash and committed expiry around asynchronous work. External metadata and custody callbacks run outside the registry mutation queue; a provider can await real revocation without deadlocking it.

Resume checks current eligibility before credential confirmation/rotation/custody. After custody and prior-socket replacement, it resolves fresh metadata and validates exact current delivered-token proof before attaching trust or sending ready. A configured null/throw/malformed/owner mismatch sends only fixed unavailable error/disconnect feedback and is handled without falling back to tokenless pairing. Existing actual invalid-token/revocation behavior remains separate. An established reconnect's metadata outage does not revoke its trust or claim credential reuse; current/previous lost-reply recovery remains usable.

Grant registers first to obtain the real authoritative trusted-client id; the lead approved this necessary ordering. The first provider check precedes custody and ending older trust. Pairing bind, session-ready state, frame and ready event are deferred until custody and final refreshed validation succeed. A refused fresh undelivered grant is revoked and custody forgotten. Late refusal is normalized to the granting path's existing error identity, preserving managed-enrolment abandonment during new asynchronous waits.

Initial metadata denial during a reapproval leaves established trust untouched. Once the new approval passes initial eligibility, the existing same-browser reapproval rule may retire older trust before final metadata/custody completes. A later failure retires the fresh undelivered trust too; the prior reapproval retirement is not rolled back or mislabelled as proof reuse. Fresh approval can be retried. Established reconnects do not take this replacement path.

## Committed expiry race and bounded registry seam

Before production edits, an adjacent regression reproduced the mutable-view hazard: a held renewal exposed expiry **17000**, its failed persistence rolled stored expiry back to **11000**, and a naive captured delivery value remained 17000. The focused run observed **1 failed / 2 passed**, with `expected 17000 to be 11000`.

The approved `trusted-clients.ts` addition is `readCommittedCredential(client)`, returning only detached readonly tokenHash/expiresAt proof through the existing mutation queue. It waits for an earlier save/rollback, introduces no new persistence or expiry calculation, and never holds the queue across identity callbacks. The final metadata resolver checks that proof against the same live record/token/expiry after the callback. A renewal beginning during the callback cannot publish its tentative expiry; the attempt refuses safely. A pending save already ahead of the final barrier can fail and roll back, after which the frame publishes the actual committed expiry. Both races are covered through the actual service paths.

## Changed files

- New `packages/fluxiq/src/client-gateway/service/session-metadata/{types,resolver,unavailable-error,index}.ts` and adjacent `tests/{fixture,service-ready.test,races.test}.ts`.
- Existing `client-gateway/service.ts`, `service/{types,index,lifecycle,trust-grant,trusted-clients}.ts`, and `service/tests/trusted-clients.test.ts`.
- This report only; root owns all shared composition and integration work.

## Observed validation

- Final focused command: `pnpm.cmd --dir packages/fluxiq exec vitest run src/client-gateway/service/session-metadata/tests/service-ready.test.ts src/client-gateway/service/session-metadata/tests/races.test.ts src/client-gateway/service/tests/trusted-clients.test.ts src/client-gateway/service/tests/credential-lifetime.test.ts src/client-gateway/service/tests/credential-reuse.test.ts src/client-gateway/service/tests/credential-custody.test.ts src/client-gateway/service/tests/pairing-flow.test.ts src/client-gateway/tests/host-enrolment.test.ts` -> **8 files passed, 102 tests passed**. This includes all **35 metadata-specific tests**, the committed-read rollback regression and existing credential/pairing/managed coverage.
- Earlier frozen checkpoint included the same eight subject files before the final two regressions plus root's `src/framework/tests/browser-trust-store.test.ts`: **9 files passed, 103 tests passed**, including all 3 actual-constructor forwarding cases. The final production change only normalized existing grant late-refusal identity; final metadata/managed tests cover it.
- From `packages/fluxiq`: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false` -> **exit 0** on final source. The first direct `pnpm ... tsc` diagnostic command had omitted the package's documented Node heap setting and exhausted its default approximately 2 GB heap before returning diagnostics; the documented command passed both subsequent checkpoints.
- `node scripts/structure-audit.mjs --rule statement-packing --rule failure-as-empty --rule swallowed-failure --rule imports` -> **passed, 0 warnings, 491 baselined**; one baseline entry can be lowered by the lead. No baseline was edited.
- `git diff --check -- packages/fluxiq/src/client-gateway` -> **exit 0**, with only Git's existing line-ending normalization notice for the registry test file.

No source/type/test process remains running. Source is frozen for independent lead acceptance and coordinated rebuild. No shared outputs were built by this worker.

## Concrete limits

The generic provider cannot independently infer tenant membership from a gateway trusted record; root's tenant-closed provider remains authoritative for current primary identity/account/workspace/membership and must be injected for ordinary service clients. No old panel session, approval password, provider-key state or default lock is required by this implementation.

If persistence also refuses fresh-grant cleanup, durable revocation cannot be claimed: the implementation records a fixed `trust.undelivered_cleanup_failed`, refuses/closes safely and publishes no credential/readiness. The active orphan record may remain until server-side cleanup or same-client reapproval; its token was not published by this attempt. This failure is tested and no raw storage/provider error is exposed.

Checks precede ready registry/frame publication. A transport send already started cannot be retracted; after its awaited completion, stale authority suppresses the ready event/audit rather than publishing late success. Actual web tenant integration, independent lead rerun, coordinated package build, real browser delivery/privacy and provider execution remain outside this worker's verification.

Outcome: Done
Changed: Approved gateway metadata subtree, service options/composition, both send sites, bounded registry proof seam/regression, this report.
Validation: Final focused 102/102 passed; earlier constructor-inclusive 103/103 passed; final no-emit types and selected structure rules passed.
Not verified: Independent lead acceptance, coordinated build, web integration/browser delivery/privacy; no real provider runs.
Report: `docs/working/hosted-platform-launch-plan/reports/session-ready-server-metadata.md`
Notes: Source frozen. No wire/TTL engine or default lock. Root owns forwarding, web identity and shared builds.

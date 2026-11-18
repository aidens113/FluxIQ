# Durable revocation owner fix

Outcome: Done for the authorized Core owner unit. Source and tests are frozen for lead verification/build; no worker version/build/dist/git changes.

## Cause and change

The trusted-client registry deliberately applies an in-memory revocation and removes token indexes before awaiting its persistence owner, then restores them if that save fails. `ClientGatewayAccess.revokeTrustedClient` previously read the live `revokedAt` outside the registry queue and returned false for that tentative value. `forgetByCredential` could likewise observe the temporarily removed token index. A second request could therefore finish as an idempotent absence while the preceding failed save left the persisted credential current.

The registry now owns two additive internal decisions:

- `revokeById(id, reason)` reads the current registry-owned record inside its existing mutation queue, decides unknown/already revoked there, and persists an actual revocation through the same private commit/rollback implementation. It returns the owned record plus a detached `changed` boolean. A repeated durably revoked record is returned with `changed:false`, allowing required cleanup to run.
- `resolveForgetCredential(token)` classifies the credential inside that same queue, after earlier saves commit or roll back. Its detached result contains only matching trusted-client ID, client ID and closed proof status. The subsequent ID revocation is independently queued; this proof can reduce that matching trust and grants no content authority.

The focused `service/revocation/credential.ts` helper reuses the existing digest/signature classifier. Current and unconfirmed previous credentials retain ordinary forget behavior. Obsolete signed credentials retain refusal plus reuse audit and the existing facade revoker. Invalid/named-forged proof and expired active trust remain false without a revocation write. A proved already-revoked credential can retry cleanup even though its token index was removed, including legacy digest credentials. No raw credential is put into an audit/result.

Direct registry `revoke(client, reason)` still attempts a save when repeated and preserves its existing rollback contract for `updatedAt`, `revokedAt`, reason and active token indexes. It now refuses a detached/stale object before mutation. The ID method obtains its actual current record only after acquiring queue ownership. Timestamp zero is correctly recognized as an existing revocation (`!== undefined`). No second store, polling, separate settled-then-read check or persistence suppression was introduced.

Access uses the committed ID decision, then runs custody/session cleanup **outside** the registry queue for known newly or already durably revoked trust. A prior send/disconnect failure is retried on the next call before that call returns false. Durable revocation is audited before cleanup, so a failed send does not lose the commit event. The existing custodian contract remains unchanged: hook failures are audited by step/error name and are nonfatal. Repeated teardown retries that hook; this unit does not claim hook failures propagate.

## Changed paths

Under `packages/fluxiq/src/client-gateway/service/`:

- `access.ts`, `trusted-clients.ts`.
- New `revocation/{credential,index}.ts`.
- New `tests/durable-revocation/tests/{decision,cleanup,credential,registry}.test.ts` and sibling `tests/durable-revocation/{fixture,store,index}.ts` support.

Only this report accompanies those owner files. Existing credential suites were run unchanged. Web teardown/routes/manager, lifecycle/custody implementation, previous trace/first-project/presentation source and shared documents were not edited. Root owns package version 0.50.2 and dependent-library rebuilds.

## Observed checks

The initial two real gateway/explicit persistence-barrier regressions were run against the old owner before the fix:

```powershell
pnpm.cmd --dir packages/fluxiq exec vitest run src/client-gateway/service/tests/durable-revocation.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **2 failed / 0 passed**, duration 5.71s: both operator revoke and local credential forget had already completed before the first held save was released to reject. Tests then moved into the focused directory named below. This reproduced the owner race without relying on a web fixture or paid/live action.

After the owner fix, an initial focused run passed 75/75. The first scoped type probe caught one test-store import from contracts instead of Core's owning service types; that fixture-only type import was corrected. Two further credential compatibility cases were added before the final freeze.

Final command from the paired Core root:

```powershell
pnpm.cmd --dir packages/fluxiq exec vitest run src/client-gateway/service/tests/durable-revocation src/client-gateway/service/tests/trusted-clients.test.ts src/client-gateway/service/tests/credential-reuse.test.ts src/client-gateway/service/tests/credential-custody.test.ts src/client-gateway/service/tests/credential-lifetime.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **77 passed / 0 failed, eight files**, duration 9.03s before the placement correction; the same command passed **77/77, eight files, 10.75s** after the four test moves/import updates. New owner tests comprise decisions 9, cleanup 5, credential 9 and registry 6; unchanged suites comprise trusted-client rollback 3, credential reuse 19, custody 9 and lifetime 17.

The new cases cover pending save commit/rollback, second retry success and failure, both public teardown paths, unknown/pending-registration decisions, unrelated-client isolation, revocation at time zero, direct repeat-save rollback, stale object refusal, token index removal during pending confirmation and rotation, current/previous/obsolete/forged/expired/legacy proof, send/disconnect cleanup retries, audited custody retry and custody-triggered revocation of another client without deadlock. Every save failure remains observable to its requesting caller. Explicit barriers control concurrency; no polling or elapsed-time inference is used.

Final source-local TypeScript compiler API probe used package tsconfig with noEmit/nonincremental options, roots at the three production subjects and four owner test files in their corrected `tests/` directory: **7 roots / 0 diagnostics**. It read source/dependencies without writing dist or a build cache. The fixture/support imports were checked through those roots.

The lead's subsequent full repository audit found a test-placement failure missed by the initial scoped audit: four test files sat beside fixture/store source in `tests/durable-revocation/`. The initial filter accepted descendant file paths but accidentally excluded findings whose path was the directory itself. Its earlier zero-failure output was therefore incomplete structural evidence.

After the lead's library build naturally ended, only those four tests moved into `tests/durable-revocation/tests/` and their relative imports changed. Production and fixture/store/index implementations stayed unchanged. The corrected scoped audit includes exact directory paths as well as descendant paths. It used the repository's **24 rules**, full repository membership for import resolution and **11 owned source/test subjects**, followed by the unchanged ratchet: **0 failures, 0 suppressions**. It reported the same two advisory warnings on the existing registry: 441 lines against 400 advisory, and 29 methods against 25 advisory (hard limits 800/40). No baseline was changed.

The full repository placement rule was also run without a scoped filter:

```powershell
node scripts/structure-audit.mjs --rule test-placement
```

Observed `structure-audit: passed (0 warning(s), 0 baselined).` Source/tests are frozen again after the corrected checks; no owner consumers remain active.

## Limits and integration

Owner persistence tests use copied in-memory durable snapshots with controlled save barriers and the actual gateway/registry. They do not claim independent SQLite generation-CAS or restart acceptance. The parent had already reproduced the corresponding real gateway + SQLite web failure; root owns rerunning that test after fresh 0.50.2 outputs and the downstream currency guard. No wrapper workaround is needed or implemented here.

Registry serialization remains per existing gateway instance. Cross-instance storage conflicts still belong to its actual persistence/CAS implementation and are propagated. Custody remains nonfatal/audited, transport failure propagates, and cleanup can be retried without another revocation write. No live browser/network/provider call, full suite, build, package publication or mutating git was run. First-project work remains report-only and separate.

Outcome: Done
Changed: Authorized access/registry, focused revocation helper/barrel, adjacent owner tests/support and this report.
Validation: After placement fix, 77/77 across 8 files; scoped types 7 roots / 0 diagnostics; structure 24 rules / 11 files / 0 failures with 2 advisories; full repository test-placement passed with 0 baselined.
Not verified: Root-owned package check/build, real SQLite web teardown acceptance, whole-web types/shared matrix or live browser behavior.
Report: `docs/working/hosted-platform-launch-plan/reports/durable-revocation.md`
Notes: Source/tests frozen and no owner consumers active. Lead alone owns version/build/integration/git. Existing custody error contract and raw registry repeat-save rollback are preserved.

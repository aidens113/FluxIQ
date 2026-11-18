# Tenant route adapter and program directory

Outcome: Done. Source/tests frozen; route behavior, repaired policy-unavailability cases, shared matrices, discovery regressions and scoped types passed through the documented incremental checks. Lead independent combined acceptance remains separate.

## Frozen server interface

The web workspace barrel exports:

```ts
workspaceRouteContext(
  request: Request,
  contract: AppRouteIamContract,
  resources: AppRouteResourceInput = {}
): Promise<WorkspaceRouteSelection>

withWorkspaceRouteJson(
  request: Request,
  contract: AppRouteIamContract,
  resources: AppRouteResourceInput,
  answer: (context: WorkspaceRouteContext, caller: WorkspaceRouteCaller)
    => unknown | Promise<unknown>
): Promise<NextResponse>
```

Selection is `{ ok: true, context }` or `{ ok: false, status: 401 | 403 | 503, error }`. A context has readonly `workspaceId`, `fluxiq`, `binding`, initial `caller`, request-bound `revalidate(): Promise<WorkspaceRouteValidation>`, and idempotent `release(): void`. Validation returns a fresh `{ ok: true, caller }` or the same refusal union. The initial caller is an immutable snapshot, not perpetual authorization. A callback must inspect a fresh successful revalidation result after any await and before its next sensitive operation; it may not switch identity, workspace or targets.

Panel bindings contain channel, acquired workspace id, primary user id and exact panel session id. Paired bindings additionally fix gateway session id, trusted client id, client id/type, approved domain, current project and recording. The caller and nested actor/permission array/binding are frozen. Resources are structured-cloned, recursively checked as plain data and frozen, retaining no mutable request references. Cycles and unsupported values are refused.

## Behavior and security boundaries

`workspaceProgramContext` remains the only tenancy selector; its successful result now includes the actual lease's `workspaceId`. The adapter rejects unsupported channels before identity/proof lookup or acquisition. A present panel cookie determines the channel, including invalid cookies and paired-only contracts; it never falls back to bearer. Service cookie selection retains existing active-account, membership, existing-workspace and deterministic default checks. It never acquires primary customer data as a fallback.

Each refresh asks the trusted current primary instance for identity authority, and the selected tenant registry for the declared IAM action/resource. A role can refresh between decisions; a role/permissions change while an IAM decision is awaiting requires another decision and cannot inherit the stale allow. Initial user/workspace/client/domain/project/recording bindings cannot change. Paired callers are derived from the selected gateway's actual current token authorization and the primary identity directory; managed hosts are refused. No alternate credential or token parser was introduced.

Selection, identity and policy-storage failures produce a controlled generic 503 without private exception text. Current authentication failures and IAM refusals remain 401/403. Policy-storage classification depends on the lead-owned additive `IamDecision.failure: 'policy_unavailable'`: previously Core deliberately normalized failed policy resolution/compilation to the same implicit deny metadata as a legitimate empty policy set, so the web adapter could not distinguish them. The adapter now inspects the explicit marker while retaining ordinary policy denials as 403. No IAM grant changed. GET `/api/programs` remains panel-only `studio:ListPrograms`, preserves `domain`, and validates with existing `programDirectorySchema`; ordinary service users retain the existing workspace-list refusal. Local and self-hosted authentication-only directory behavior stays unchanged.

The JSON owner keeps the lease through initial/fresh authority checks, awaited callback work, full JSON serialization and final authority validation. It discards buffered output after revocation or abort and releases in `finally`, including callback/serialization failures. Each asynchronous selector guard checks abort/release both before and after its awaited lookup. Callback/serialization errors return a sanitized 500. Selection failure releases any already-acquired lease. A raw context caller owns its lease and must use `finally`; releasing permanently invalidates that context. An outstanding awaited callback must unwind before its buffered owner can release; this adapter does not forcibly interrupt arbitrary application promises.

Stream handoff is unsupported: returning `Response` or `ReadableStream` through the JSON owner fails. It does not claim per-pull authorization, iterator cancellation or EOF/cancel/error lifecycle ownership. Dataset and other streaming routes remain a separate unit. A final buffered authorization check cannot recall already completed mutations; future mutation callbacks must revalidate before each operation after awaits. This unit migrates only the actual program directory, not gateway/assets/framework routes or external app authentication.

Resources are final when creating this context. A future route with body-derived IAM targets needs an explicit design that preserves its initial identity/tenant while binding the validated target; it must never authorize a placeholder/self resource and then use a different target. This unit does not add staged resource binding. The follow-up framework validation route has a constant operator-program resource, so it can safely revalidate that same authority after reading the body.

## Owned files

- `apps/web/src/lib/workspaces/routes/`: public context/JSON owner/types; focused internal caller, IAM decision, binding/authority comparison and resource snapshot modules; adjacent owner tests.
- `apps/web/src/lib/workspaces/program-context.ts`, `index.ts`, and existing selector test: trusted acquired workspace id and public exports.
- `apps/web/src/app/api/programs/route.ts` and adjacent route test: actual tenant directory migration.

## Validation

`node --input-type=module` (owned syntax/structure probe using repository `createContext` and rules `file-lines`, `exported-values`, `statement-packing`, `failure-as-empty`, `swallowed-failure`, `test-placement`, `imports`, `import-cycles`) -> `Owned syntax/structure: 19 files, 0 findings.` Imports/cycles used the full runtime graph, with findings restricted to the owned files; other rules and syntax parses were scoped to those files. The first run found one caught resource-validation error returned as null; the helper now returns an explicit refusal union, and the rerun passed. No baseline was changed.

Initial guarded combined command (listed in the framework/recordings report) -> **175 passed, 8 failed, 11 files, 123.63 seconds**. Directory/framework/recordings, paired binding, resource snapshot and existing selector tests passed. Two failures correctly found policy storage failure returned as 403 instead of 503 because Core's decision metadata had discarded the cause. Six shared parity failures found the four existing connect/key routes missing from the test calls/expectations; coverage enumeration and self-hosted iteration failed with them. The run finished naturally; an initial pause in reporter output was collection/fixture work, not a proven import deadlock. No process was terminated.

Isolated `pnpm.cmd exec vitest run src/lib/workspaces/routes/tests/resources.test.ts` -> **5 passed, 1 file, 646 ms**. These duplicate the resource cases already included in the combined run.

First targeted rebuilt rerun:

```text
pnpm.cmd exec vitest run src/lib/workspaces/routes/tests/context.test.ts src/lib/workspaces/routes/tests/json-response.test.ts src/app/api/tests/app-route-iam-parity.test.ts src/app/api/tests/app-route-iam-service.test.ts src/app/api/discovery/tests/build-discovery-document.test.ts src/app/api/discovery/tests/discovery.test.ts
```

Observed **124 passed, 2 failed, 6 files, 112.63 seconds**. Shared IAM parity (43), service matrix (23), discovery builder (20) and discovery route (8) passed. Both remaining failures were the same policy-unavailability cases. The initial trace missed `ProgramIamGate.compiledServiceSet`: it catches the resolver exception and compiles `NO_POLICIES`, so the new request-authorizer marker still saw an ordinary nonnull compiled policy set. `compiledMachineSet` and `compileOrDeny` have the same normalization. Source and actual loaded dist confirmed the path. A safe public-registry diagnostic with a synthetic throwing source reported only `{ allowed:false, decision:'deny', failure:null, reasons:['implicit-deny'], errorCode:'authorization.forbidden' }`; no private exception or credential was printed.

The lead preserved availability explicitly through the Core registry gate: failed preparation remains an explicit unavailable result and `open` supplies the request authorizer's unavailable state; legitimate empty policy sets and missing configured source remain ordinary denials. The web wrapper inspects the agreed nonsecret marker. No Core source/build was owned by this worker.

Scoped TypeScript program using the web tsconfig and the 29 owned root files initially found one nullable test-fixture diagnostic, zero dependency diagnostics. Fixed `paired-context.test.ts` to guard the current nullable browser reference. Final `node --input-type=module` no-emit probe (web tsconfig, only the 29 owned roots, all transitive diagnostics inspected) -> **29 owned files, 0 owned/global diagnostics, 0 dependency diagnostics**.

Final guarded diagnostic command against the rebuilt Core:

```text
pnpm.cmd exec vitest run src/lib/workspaces/routes/tests/context.test.ts src/lib/workspaces/routes/tests/json-response.test.ts -t "sanitizes iam storage|returns unavailable if final policy"
```

Observed **2 passed, 30 intentionally unmatched/skipped, 2 files, 98.93 seconds**. Initial policy storage failure and failure after response buffering now both return sanitized 503 and release once. Previously passing tests were intentionally not repeated by this diagnostic filter; the lead will run the combined acceptance against the final frozen tree.

No package build, full suite, server, browser, provider call or git mutation ran by this worker.

Final web fix-batch syntax/structure probe with the same repository rules -> **29 files, 0 failures, 0 existing baseline findings**. The scope now includes the explicitly released call/fixture/parity integration files and framework/recording routes. No baseline updates were made.

Owner tests cover two distinct tenant data fixtures with identical program/resource ids, real in-memory primary identity sessions and actual IAM registries; cookie/bearer precedence; unsupported-channel early refusal; current membership/default/account/session/user/IAM changes; role change while authorization waits; paired binding/domain/trust revocation; detached nested resources; abort during acquisition/work; callback/serialization failure; final output revocation; and local/self-hosted parity. The initial combined run passed all of these except unavailability classification; the final isolated rebuilt run now passes that classification as well.

Proposed narrow command (from `apps/web`):

```text
pnpm.cmd exec vitest run src/lib/workspaces/tests/program-context.test.ts src/lib/workspaces/routes/tests src/app/api/programs/tests/route.test.ts
```

## Return contract

Outcome: Done
Changed: owned web adapter/selector/directory source and adjacent tests; this report.
Validation: initial combined -> 175 passed, 8 failed; targeted -> 124 passed, 2 failed; final isolated metadata regressions -> 2 passed, 30 unmatched; scoped types -> 29 files, 0 diagnostics; syntax/structure fix-batch probe -> 29 files, 0 failures.
Not verified: lead's final combined acceptance/full web typecheck, remaining full structure rules, live HTTP/browser behavior, other tenant routes, staged body-derived targeting and streaming lifecycle.
Report: docs/working/hosted-platform-launch-plan/reports/tenant-route-adapter-implementation.md
Notes: Core failure-marker/gate correction owned by lead; no Core/contracts source, dist, shared documents or git touched by this worker; later route lanes consume the frozen server adapter.

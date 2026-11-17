# Tenant framework IO and recordings routes

Outcome: Done. Owned route behavior, shared matrix corrections and scoped types passed; source/tests frozen for lead independent combined acceptance.

GET `/api/framework/io` and GET `/api/recordings` now use the frozen `withWorkspaceRouteJson` owner. POST `/api/framework/io/validate` uses `workspaceRouteContext` directly, keeps its lease in `try/finally`, revalidates after reading the body before touching tenant IO, serializes the result, and revalidates before publishing. Authority refusals preserve their actual 401/403/503 status; handler and serialization errors return a generic 500 without private exception text.

Framework IO and validation remain panel-only and retain their existing `ops:InspectFrameworkIo` / `ops:ValidateFrameworkIo` actions and `programs.read` permission. The actual selected registry still denies these operator actions on service even to workspace administrators. Positive selected-A/B IO tests therefore use local-profile tenant registries; service tests explicitly prove both ordinary-user and administrator denial before tenant IO or body consumption. Host setup is untouched.

The IO `domain` query and validation's valid camel-case/snake-case aliases, precedence, domain-only branch, source handling, empty arrays and issue severity remain unchanged. Malformed JSON, non-object bodies and wrongly typed known fields now return an explicit 400 before any validation operation; they no longer become a successful empty request. Unknown extra fields remain ignored. Validation authority never comes from the JSON body. Membership/default/session/role changes or abort during body reading must stop validation before the tenant operation.

Recordings retains panel and paired channels, page/pageSize strings and the returned recording-summary page. Panel requests list only the selected tenant without an added domain filter. Paired requests use the selected gateway and current primary identity, forwarding only the binding's approved domain, including null. A nonempty panel cookie wins over a bearer, including refusal for an invalid cookie; there is no bearer-first or bearer-fallback identity substitution. Current IAM's ordinary-user workspace-list refusal is unchanged. Binding changes or revocation during the awaited list discard the buffered page and release the lease.

## Files and integration fixtures

- Owned routes: `framework/io/route.ts`, `framework/io/validate/route.ts`, `recordings/route.ts` and adjacent tests.
- By explicit lead release, updated `app/api/tests/app-route-fixture.ts` to supply actual request cookies, a workspace lease and gateway client type. Fixture `outcome` now fails on 5xx instead of calling server failure an allowed authorization result.
- By the same release, changed exactly three existing rows in `app-route-iam-parity.test.ts`: migrated panel-only GET `/api/programs`, GET `/api/framework/io` and POST `/api/framework/io/validate` now expect the shared adapter's intentional early 403 for bearer-only callers. Expectations for every other existing row are unchanged.
- After validation exposed missing table coverage, the lead additionally released `app-route-calls.ts` for actual connect/GET-POST-DELETE key handlers. Four missing rows now call those real handlers, with only code issuance/key persistence stubbed. Local/self-hosted connect's intentional 404 is explicitly unavailable. Added service cases exercise actual primary-cookie/default-tenant/self-resource IAM allow/deny and bearer-only refusal; account eligibility and digest-session records are synthetic fixture data, not mocked authorization outcomes. Request cookie names are checked. A compatibility presentation port avoids unrelated fixture warnings; no credential store or lock state is created.
- Adapter implementation, setup, Core/contracts, other route source and shared documents remain untouched by this follow-up unit.

## Validation

Initial combined guarded command below -> **175 passed, 8 failed in 11 files, 123.63 seconds**. All owned framework/directory/recording route tests passed, including explicit malformed-body 400/no validation and body-drain revocation. Two adapter tests found Core had discarded policy-storage failure metadata; the lead is adding the explicit failure marker. Six shared IAM parity failures found four existing connect/key routes absent from calls/expectations; their actual handler coverage is now authored. No expectation was weakened or skipped.

Owned syntax/structure probe after malformed-body correction -> **28 files, 0 failures, 0 existing baseline findings**. The previous probe before that correction reported 0 failures and one existing malformed-body failure-as-empty baseline finding; the correction removed the finding without editing the baseline. Final fix-batch probe -> **29 files, 0 failures, 0 existing baseline findings**. An initial fix-batch probe flagged the new connect call importing its route file past an existing barrel; corrected to the directory import, then reran successfully. All probes used the existing eight repository rules recorded in the adapter report, with no baseline updates.

Rebuilt targeted command in the adapter report -> **124 passed, 2 failed in 6 files, 112.63 seconds**: shared IAM parity (43) and service matrix (23) passed, including the four missing actual handlers and eight added service allow/deny cases; discovery builder (20) and route (8) also passed by explicit read-only validation assignment. Only two adapter unavailability cases remain, traced to Core's separate `ProgramIamGate` compiling a failed source as a normal empty set. The lead owns its repair. The initial route behavior passes remain valid; no production route source changed afterward.

Scoped TypeScript program over 29 owned web roots initially found one nullable browser-reference diagnostic in a paired-context test, zero dependency diagnostics. The corrected guard passed the final probe: **29 owned files, 0 owned/global diagnostics, 0 dependency diagnostics**. This is an owner-root program, not a claim of the full web package check.

After the lead corrected Core's registry preparation path and rebuilt, the adapter report's isolated two-case command passed **2 tests, 30 intentionally unmatched/skipped, 2 files, 98.93 seconds**. This closes the two remaining policy-storage 503 regressions without rerunning previously passing cases diagnostically. No builds/dist, full suites, server/browser/provider calls or git operations ran by this worker.

Authored regressions use real in-memory primary identity and actual tenant IAM registries behind separate A/B data instances with matching resource identifiers. They cover request query/pagination/aliases, channel precedence, domain-null/foreign-domain paired behavior, service ops/list denial, body-drain membership/default/session/role/abort changes, awaited-list binding/IAM revocation, sanitized errors/release and local/self-hosted single-root behavior. They do not replace the real selector with a route mock.

Combined narrow command from `apps/web` after dependency readiness:

```text
pnpm.cmd exec vitest run src/lib/workspaces/tests/program-context.test.ts src/lib/workspaces/routes/tests src/app/api/programs/tests/route.test.ts src/app/api/framework/io/tests src/app/api/framework/io/validate/tests src/app/api/recordings/tests src/app/api/tests/app-route-iam-parity.test.ts src/app/api/tests/app-route-iam-service.test.ts src/app/api/discovery/tests/build-discovery-document.test.ts src/app/api/discovery/tests/discovery.test.ts
```

## Return contract

Outcome: Done
Changed: three owned routes and adjacent tests; two explicitly released shared fixture/parity files; this report.
Validation: initial combined -> 175 passed, 8 failed; targeted -> 124 passed, 2 failed (only Core registry metadata), shared matrices/discovery passed; final two cases -> 2 passed; scoped types -> 29 files, 0 diagnostics; source probe -> 29 files, 0 failures.
Not verified: lead independent combined acceptance/full package types/remaining structure rules, live HTTP/browser behavior, other routes and streaming lifecycle.
Report: docs/working/hosted-platform-launch-plan/reports/tenant-framework-recordings.md
Notes: adapter remains frozen; no IAM grant widening or host setup migration; no source/build changes outside released ownership.

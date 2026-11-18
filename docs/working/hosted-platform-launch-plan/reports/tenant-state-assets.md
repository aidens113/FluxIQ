# Tenant state-asset route migration

Outcome: implementation and tests authored; source frozen; scoped syntax/structure/types passed. Guarded web acceptance waits for the lead's coordinated Core rebuild.

## Changed behavior

GET and PUT now obtain the existing `workspaceRouteContext` with the immutable URL project resource. The selected lease supplies every data operation; current primary identity supplies panel/client authority. Request bodies and bearer headers cannot replace a selected nonempty panel cookie. No primary customer-data fallback or tenant-local identity authorization remains in this route.

GET remains panel-only. It reads/copies the complete asset under the held tenant lease and checks current authority before publishing the buffered response. Read failures retain the non-disclosing 404; media, length and normalized digest headers remain unchanged. The lead explicitly changed the old immutable one-year caching requirement: successful authenticated asset responses now use **`Cache-Control: private, no-store`**, as do read 404 and route refusal responses. A private browser cache alone was not partitioned by signed-in account; reusing the same project/digest URL could otherwise bypass current authorization after logout/switch. This changes future response caching; it cannot recall bytes previously delivered to a browser.

PUT preserves Core `uploadStateAsset`, including its digest/media checks, declared/actual 20 MiB body limit, nonempty-body requirement and write-error status mapping. Before reading the body, paired uploads must match their bound project when one is set, their approved domain, and current project-domain access. The route revalidates the same context after the awaited domain check.

Core's post-body `stillAuthorized` callback refreshes that same request owner and current project-domain access, then revalidates again after the domain await. The owner fixes user/workspace/client/trust/session/type/domain/project/recording; it cannot become a newly selected client or tenant after the body arrives. Recording id and trace-intake session come only from the initial immutable binding, and the trace gateway is the selected tenant gateway. A panel upload supplies neither paired recording nor trace intake.

Core's ordinary stale-upload 403 remains its existing response. A specific project-domain refusal keeps `authorization.project_domain`, including after body consumption. An actual unavailable policy authority stays a sanitized 503 instead of becoming Core's generic stale 403. After Core finishes, the route checks authority before publishing the buffered result. A write that began while authorized may already have committed when later revocation is observed; the final check withholds its receipt and cannot undo a completed mutation.

Every retained lease is released in `finally`; aborted/failed selection retains no lease. GET copies bytes to an independent ArrayBuffer before release. No streaming handoff is introduced. Core still owns its existing write-validation/status/error-message contract; unexpected request-body/route exceptions are caught as a generic 500. No broad error-contract rewrite, managed-host support, IAM grant, key/access behavior or shared adapter change is included.

## Owned paths

- `apps/web/src/app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts`.
- Adjacent `tests/asset-runtime.ts`, rewritten `route.test.ts` / `route-trace.test.ts`, and new `read.test.ts` / `upload-validation.test.ts`.
- By explicit lead release, only the GET state-assets row in `apps/web/src/app/api/tests/app-route-iam-parity.test.ts` changes bearer-only expectation from the old401 to the shared adapter's early403. No other row or shared fixture was edited.

## Authored checks

Tests use the existing read-only workspace fixture module with real in-memory primary identity and actual tenant IAM registries; new asset-specific ports/maps live only in this route's tests. A/B use the same project ids and distinct valid content digests, and B cannot read A's digest through the same project URL. Primary data ports are never used. The Core upload helper is real; the underlying asset store is a controlled port fixture rather than a claimed filesystem/codec acceptance.

Coverage includes successful panel/paired uploads; cache/media/length/digest GET behavior; panel-only early refusal; invalid/mixed credentials; actual own-project IAM and foreign-owner/domain/nonexistent-project refusal; local/self-hosted parity; trace/recording argument provenance; all paired binding fields changing across a delayed body; panel membership/default/session/user/legacy-role/IAM/abort changes; project-domain changes; policy-store failure; revocation during pending reads/writes; Core400/409/413/415/503 mapping, empty/oversized bytes, normalization and unexpected body failure; and lease release throughout. Legacy-role loss is exercised under local permission semantics, while service tests use actual current IAM policy loss.

## Validation

No guarded web test has been attempted: Core metadata source is ahead of the current build, and the lead instructed all web consumers to wait for the coordinated fresh dependency signal. The guard is not bypassed. No package builds/dist mutation, full suites, server/browser/provider calls or git operations ran by this worker.

`node --input-type=module` (scoped syntax/structure probe using repository `createContext`, baseline ratchet and existing `file-lines`, `exported-values`, `statement-packing`, `failure-as-empty`, `swallowed-failure`, `test-placement`, `imports`, `import-cycles` rules) -> **7 files, 0 failures, 0 existing baseline findings**. Imports/cycles use the full graph while reporting only owned findings; other rules and syntax checks are scoped. No baseline was edited.

`node --input-type=module` (web-tsconfig no-emit program with only the6 asset files and released parity file as roots, transitive diagnostics inspected) -> **7 owned files, 0 owned/global diagnostics, 0 dependency diagnostics**. This does not claim a full package check. Both consumers finished; the lead was told shared artifact rebuilding is safe. Shared fixture/adapter source remains unchanged.

Exact owner/affected matrix filter from `apps/web` after fresh dependencies:

```text
pnpm.cmd exec vitest run src/app/api/programs/automation-studio/state-assets src/app/api/tests/app-route-iam-parity.test.ts src/app/api/tests/app-route-iam-service.test.ts
```

## Return contract (pending guarded acceptance)

Outcome: Partial
Changed: state-assets route and adjacent tests; approved single parity-row update; this report.
Validation: scoped syntax/structure -> 7 files, 0 failures; scoped TypeScript -> 7 owned files, 0 diagnostics; guarded tests not run because lead rebuild/acceptance is coordinated separately.
Not verified: guarded asset/parity/service tests, full package types/structure, actual filesystem/browser/HTTP behavior, legacy browser-cache eviction, already committed-write rollback and streamed ownership.
Report: docs/working/hosted-platform-launch-plan/reports/tenant-state-assets.md
Notes: source frozen; shared adapter/fixtures/Core/contracts/dist/git untouched; no active consumers remain and lead has the exact runtime filter.

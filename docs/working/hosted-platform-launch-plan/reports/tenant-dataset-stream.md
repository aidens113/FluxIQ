# Tenant-owned dataset streaming

Outcome: Done. Focused tests and structure checks passed; the lead independently accepted 115/115 related tests. Combined frozen web typecheck/checkpoint remain lead-owned.

## Owned changes

- Added `apps/web/src/lib/workspaces/routes/streams/` with the typed preparation port, response selector, stream lifetime owner, sanitized error and barrel. Tests are colocated in its `tests/` directory.
- Added only the stream exports to `routes/index.ts` and clarified the lease lifetime comment in `routes/types.ts`.
- Migrated the dataset route and its owned tests under `app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/`.
- Wrote this report. Shared IAM matrix, route fixtures, tenant context, libraries, build outputs and git remain outside worker ownership. The lead changed the dataset parity row and shared response disposal.

## API and lifetime

`withWorkspaceRouteStream(request, contract, resources, prepare, options?)` selects the existing `workspaceRouteContext` once. `prepare(context, caller)` returns a typed safe refusal or a descriptor containing one iterator, headers/status and fresh domain-validation callback. It cannot hand back an arbitrary response. The optional cleanup observer receives only `workspace_stream.cleanup_failed`.

The owner registers preparation before invoking callbacks and adopts a returned iterator before inspecting headers or awaiting further authority. It revalidates after preparation, including a negative dataset lookup. A `Response` is handed off only after context/domain/context validation and successful construction. Its body uses `highWaterMark: 0`; returning it does not read the producer or release the selected tenant.

Each demanded chunk checks current context and domain before `next()` and again after its awaited result. End-state checks follow every guard await and immediately precede enqueue. Chunks are UTF-8 encoded strings or copied bytes, with no row projection or buffering of the whole export.

EOF, cancel, request abort, refusal and failure share one terminal cleanup promise. It requests `iterator.return()` promptly, waits for outstanding preparation/read/domain/authority/return work to settle, then invokes the selected context's idempotent release exactly once. A late producer returned after abort is adopted and retired. A late read or guard cannot resume publication. No producer callback is held under a registry lock, and no timeout was introduced.

Setup, producer and abort causes are replaced with fixed safe errors. Existing safe authority/domain refusals retain their status before handoff; after handoff they terminate the body. Cleanup failure cannot replace the first safe failure and reaches the fixed-code observer (or a fixed-code default log), including abort paths with no awaiting consumer. A throwing observer is contained and reported with its own fixed log code. Cleanup-method getter/call/rejection and release exceptions do not expose their raw cause.

## Dataset behavior

The existing panel-only IAM declaration remains authoritative. Bearer-only requests receive the adapter's explicit channel refusal, mixed input keeps cookie authority, and an invalid cookie never falls back to a bearer. Immutable URL project/dataset IDs supply IAM resources; no primary/default re-selection occurs after admission.

The route uses the selected tenant's Automation Studio, authenticated actor ID and project-domain grant. It preserves valid ID/format behavior, makes malformed percent encoding a safe 400, hides domain mismatch and missing dataset behind the existing 404, and preserves CSV/JSON bytes, filename reduction, content type, `private, no-store` and `nosniff` headers. The selected producer descriptor is returned immediately after its asynchronous selection so ownership precedes further authorization awaits.

Service authorization is policy-based. Local and self-hosted authorization retain legacy permission-array behavior. The tests exercise both directly rather than adding an obsolete permission gate to service IAM.

## Validation recorded during work

- First four-file filter: `pnpm.cmd exec vitest run 'src/lib/workspaces/routes/streams/tests/owner.test.ts' 'src/lib/workspaces/routes/streams/tests/lifecycle.test.ts' 'src/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/tests/route.test.ts' 'src/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/tests/authority.test.ts'` in `apps/web` -> 68/70 passed. All 29 owner tests passed. The two failures expected a legacy role-permission loss to override the service fixture's explicit AdministratorAccess policy. Traced the registry's documented profile distinction and moved those assertions to actual single-root local/self-hosted registries; service policy-loss assertions remain intact.
- Concurrent/informational only: `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit --incremental false` in `apps/web` -> two owned diagnostics (optional headers and missing test actor session ID) plus two inference diagnostics in another worker's changing presentation source. Corrected only the owned diagnostics. This was not a frozen whole-web acceptance run; no repeat before the lead's combined freeze.
- `node scripts/structure-audit.mjs --rule statement-packing --rule swallowed-failure --rule failure-as-empty --rule module-reach --rule imports --rule exported-values --rule class-methods --rule file-lines --rule directory-files --rule naming --rule test-placement` -> passed, zero failures, 548 existing advisory warnings, 558 baselined findings. One baseline entry can be lowered; baseline is lead-owned. Final small fix batch still needs the focused rerun.
- `git diff --check` -> passed; git emitted line-ending notices only. No git mutation was performed.
- Final rerun of the exact four-file command above -> **75/75 passed in 4 files**, exit 0 (31 stream-owner tests and 44 actual route/tenant/IAM tests). This includes the final type fixture fixes, profile-correct legacy permission cases, cleanup accessor failure and abort during pending producer return.
- Final focused structure rerun, `node scripts/structure-audit.mjs --rule statement-packing --rule swallowed-failure --rule failure-as-empty --rule module-reach --rule imports --rule exported-values --rule test-placement` -> passed with zero failures, 104 existing advisory warnings and 534 baselined findings. One lead-owned baseline entry can be lowered. No baseline changes were made.
- Independent lead rerun after the shared deferred-resource adapter change -> 115/115 passed in seven files (the worker's 75, context 33 and resolver 7); lead accepted stream behavior. The lead later maintained the old stream test mocks for the new shared synchronous primary guard; no stream production change was required.

The final filter covers tenant isolation with identical IDs and primary data untouched, local/self-hosted behavior, actual selected IAM, malformed IDs, CSV/JSON/header compatibility, current session/member/account/user/selection/IAM/role loss during reads and setup, domain loss, negative lookup revalidation, no-prefetch, late producer adoption, pending read/guard/return cancellation and abort, async-generator finalization, invalid response construction, safe cleanup failures and exact-once release.

## Practical limits and unverified behavior

- Bytes already emitted cannot be recalled. The checks protect the next publication boundary; they are not an atomic transaction spanning the identity, IAM and project-domain stores.
- An async generator may queue `return()` behind an already-started `next()`. The tenant remains held until those external operations settle. A producer that never settles can therefore retain its lease; there is no timeout that falsely claims cleanup.
- A caller that keeps an unread response must consume/cancel it or abort the request. Garbage collection is not the lifecycle signal. The lead's shared route fixture now cancels unused successful bodies.
- Existing Core producer persistence/audit code was inspected, not changed. Its store opens lazily inside the generator, so cancel-before-first-pull retires the iterator without claiming an opened store or a completed export audit.
- No library build/dist replacement, full suite, panel/server launch, browser/network disconnect test, paid call or real-user-data test was run. Actual Next.js request-abort propagation and production network backpressure remain unverified live.

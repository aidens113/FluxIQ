# k8-0-export-audit-handler: register export-flow-run-audit

## Outcome

Done. The Export Audit endpoint that Runtime Debug calls now has a handler, so it
answers `{ audit }` instead of a 404. The only gate still red is the structure
audit's working-document index rule (`docs/working/README.md` out of date), a
shared file this brief does not own and my change does not touch.

## What changed and why

- `packages/fluxiq/src/programs/automation-studio/api/handlers/runs.ts`: registered
  `AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit` (`"export-flow-run-audit"`) with
  `permission: "programs.read"`, directly after `getFlowRunDetail`. The handler reads
  `projectId` and `runId` from the payload the way the neighbouring run handlers do
  (typed as the existing `FlowRunDetailRequest`, no new import), calls
  `service.exportFlowRunAudit(projectId, runId)`, and returns
  `{ ok: true, payload: { audit } }`. That matches the web client's
  `api.post<{ audit?: any }>("export-flow-run-audit", …)` at
  `apps/web/src/features/automation-studio/runtime/run-commands.ts:29`. An unknown run
  returns `{ audit: null }`, because `AutomationStudioFlowRunAudit.exportFlowRunAudit`
  returns `null` when there is no run detail. This is the same no-error behaviour
  `get-flow-run-detail` has. Fixes report C1 (K8.0).
- `packages/fluxiq/src/programs/automation-studio/api/handlers/tests/runs.test.ts`
  (new, 4 cases, using `test-service.ts` and `test-actor.ts` as `caches.test.ts` and
  `flows.test.ts` do):
  1. the endpoint is registered under `programs.read`;
  2. with a mocked service, `projectId` and `runId` are forwarded in that order and the
     response is exactly `{ ok: true, payload: { audit } }`;
  3. an actor holding `programs.write` and `flows.write` but not `programs.read` is refused
     with `authorization.forbidden`, and the service is never called;
  4. against a real `AutomationStudioService`, a deterministic
     start → constant → end run exports an audit with `schemaVersion`, `projectId`,
     `runId`, `manifest.adaptationCount: 0`, a 64-hex SHA-256 `runDetailHash`,
     `runDetail.summary.runId`, and the retention flags; an unknown run id answers
     `{ ok: true, payload: { audit: null } }`.

## Commands run and observed results

All commands ran alone, one at a time, from `F:\!FluxIQ`.

1. `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/api/handlers/tests/runs.test.ts --no-file-parallelism`
   → `Test Files 1 passed (1)`, `Tests 4 passed (4)`.
2. `pnpm --filter fluxiq exec vitest run src/programs/tests/permission-matrix.test.ts --no-file-parallelism`
   (file unchanged) → `Test Files 1 passed (1)`, `Tests 2 passed (2)`. It covers the new
   endpoint because it walks `createGlobalProgramRuntime().api.endpoints()`, and
   `_shared/runtime.ts:130` calls `registerAutomationStudioApi`.
3. Mutation, on real source (the permission classifier allowed the edit): replaced the
   whole new `registry.register({...exportFlowRunAudit...})` block with a comment, then
   reran command 1 → `Tests 4 failed (4)`. Case 1: `expected [ Array(153) ] to deep
   equally contain {...}`. Cases 2 and 3: `"errorCode": "endpoint.not_found"`. Case 4:
   `expected false to be true`. Reverted. `git diff` afterwards shows only the intended
   12-line addition.
4. Command 1 rerun after the revert → `Tests 4 passed (4)`.
5. `pnpm --filter fluxiq check` → `tsc --noEmit`, exit 0, no diagnostics. No errors in
   other workers' files at that moment, so no rerun was needed.
6. `pnpm structure:check` → exit 1:
   `FAIL [working-docs] docs/working/README.md is out of date with the documents' header
   blocks. Run "pnpm structure:baseline" to regenerate it.` and
   `structure-audit: 1 violation(s) across 1 rule(s).` All other output was advisory
   `warn [file-lines]` lines on files I did not touch. Neither of my files appears. The
   failure comes from the working-document header blocks, which the supervisor's
   uncommitted edit to `docs/working/first-class-data-extraction-plan.md` changed. I did
   not run `pnpm structure:baseline`, because it rewrites a shared document outside this
   brief.

## Not verified

- No live browser test of the Runtime Debug Export Audit button through the web route
  (`WEB/lib/program-route.ts`). The panel was not authorized and the brief did not ask
  for one.
- The web client's handling of `{ audit: null }` for an unknown run was not exercised.
- The handler does not check that the run belongs to a domain the caller may access. No
  sibling run handler in `runs.ts` does either, and the brief names no such check. K8's
  dataset endpoints add `assertProjectDomainAccess`; whether audit export should gain it
  too is a supervisor decision.
- Every result above rests on a single observation on this machine; nothing flaked.

## Open questions or contradictions found

- The structure audit fails on the working-document index. The supervisor needs to run
  `pnpm structure:baseline` (or regenerate the index) after its plan-document edits.
- The audit document contains the full run detail. With `programs.read` as the permission,
  any reader can export it. That matches the brief and report §4 K8.0, but it is broader
  than the domain-scoped dataset endpoints K8 plans (report §2.2).

# k8-dataset-endpoints: dataset endpoints, handler, and streaming route

## Outcome

**Done.** Six dataset endpoints are registered, `AS/api/contracts/dataset.ts` and
`AS/api/handlers/datasets.ts` are new, and the streaming GET route exists with
its full authentication, authorization, domain, and caching contract.

- Core acceptance: **13 files, 50 tests passed**, including the new
  `datasets.test.ts` (10 tests) and `permission-matrix.test.ts`, which picks up
  all six new endpoints with no edit.
- Web acceptance: **1 file, 10 tests passed** — the new route suite.
- `pnpm --filter fluxiq check` (`tsc --noEmit`) exits **0**.
- **9 of 9 mutations went red and every file was restored**, including all six
  security-critical ones.
- `pnpm structure:check` fails on **3 findings, none of them mine**; one of them
  needs the supervisor (below).

## What changed and why

Paths under `packages/fluxiq/src/programs/automation-studio/` (`AS/`) and
`apps/web/src/` (`WEB/`).

### `service.runDatasets` was absent at dispatch and landed mid-task

My brief said to write against K4c's contract and say plainly if it was not
present when my check ran. When I started, `grep -rn "runDatasets"` over
`runtime/service.ts` and `runtime/service/index.ts` returned **nothing**. By the
time my type check ran it was there: `service.ts:683` declares
`readonly runDatasets: AutomationStudioRunDatasets`, `:749` constructs it, and
`:3441` binds the record-batch hook. So `pnpm --filter fluxiq check` exiting 0 is
real evidence that my handlers and route compile **against the landed
collaborator**, not against a stub. I added nothing to `service.ts`.

### Endpoints: six, not three

`AS/api/contracts/endpoints.ts` gains `listRunDatasets`, `getRunDatasetPage`,
`exportRunDataset`, `deleteRunDatasets`, `listProjectDatasets`, and
`listDatasetRuns`. The brief's first sentence names three, but the same brief
then requires `delete-run-datasets` under `flows.write` with an optional
`datasetId` (CD16-CD17), and `k12-data-view.md` §4.2 — a required read — is
headed "**Endpoints (amend K8)**" and adds `list-project-datasets` and
`list-dataset-runs`. I implemented all six; see Open questions 1.

### `AS/api/contracts/dataset.ts` (new)

Six request types, each extending `FlowProjectRequest` as `run.ts:3-6` does, with
`runId` on the four run-scoped ones. `limit` stays `unknown` and `cursor`
`string | null` because the handler clamps and the store validates. Exported from
the contracts barrel.

### `AS/api/handlers/datasets.ts` (new), `registerRunDatasetEndpoints`

Called from `register.ts` immediately after `registerRunEndpoints`.

- **Every one of the six handlers calls
  `await service.assertProjectDomainAccess(projectId, request.scope.domainId)`
  before it touches the collaborator.** This is the whole point of CD16: rows are
  stored raw and never stripped, so the domain check cannot be a filter applied
  to an answer already read. The neighbouring run endpoints skip this check (C7),
  which is safe only because they expose no row content.
- `programs.read` guards the five reads; `flows.write` guards
  `delete-run-datasets`, which passes `request.actor!.userId` for the audit row
  and `datasetId` only when it is a string, so an absent one deletes the run's
  whole set (CD17).
- **Paging is clamped in the handler** with `automationStudioPageLimit` from
  `AS/storage/index.ts` — 1-200, default 50 (C11), never the Design's 1-500. The
  store clamps too; this is deliberate belt-and-braces, and it is what lets the
  two Data-window envelopes echo the *clamped* limit rather than the requested
  one. `api/handlers/client-gateway.ts:6` already imports that helper, and
  `importBoundaries` is empty, so this crosses no declared boundary.
- `export-run-dataset` passes `actorId: request.actor?.userId` per §2.2.

### Streaming route (new)

`WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`,
GET only, following state-assets and then going past it, in §2.6's order:
401 without a cookie or on an invalid session; 403 without `programs.read`; 400
for an id failing `^[A-Za-z0-9._:-]{1,200}$` or a format that is not `csv|json`;
**404 on a domain mismatch, asserted before any row is read**; 404 when the run
stored no such dataset. A domain mismatch and an unknown dataset answer
identically, so neither confirms that a project outside the caller's domain
exists. Headers: the encoder's content type, `Content-Disposition` with the file
name re-reduced to `[A-Za-z0-9._-]`, `Cache-Control: private, no-store` (not
`immutable` as at state-assets `:34`, because a `replace` write changes the
content), and `X-Content-Type-Options: nosniff`. `export const dynamic =
"force-dynamic"` states what reading cookies already implies, so no route-level
caching can be introduced later.

**It calls `return()` on the iterator when the client goes away**, in the
`ReadableStream`'s `cancel`. This is k4b's open question 4: without it the store
lease and the partial export's audit row are both lost. A test asserts it.

### `packages/contracts` record-sets: already done by K1, nothing added

`project-dataset-summary.ts` and `dataset-run-summary.ts` already exist, are
exported from the record-sets barrel, and have tests, and their fields match
§4.2 exactly. I added nothing and changed nothing there. They are still
**untracked**, so they land with the supervisor's commit.

## Commands run and observed results

Each ran alone, in `F:\!FluxIQ`, per the RAM rule.

1. `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/api/handlers/tests src/programs/tests/permission-matrix.test.ts --no-file-parallelism`
   — `Test Files 13 passed (13)`, `Tests 50 passed (50)`, 16.91 s. New
   `datasets.test.ts` contributed 10. Re-run after every mutation:
   `50 passed (50)` again — the restore check.
2. `pnpm --filter @fluxiq/web exec vitest run src/app/api/programs/automation-studio --no-file-parallelism`
   — `Test Files 1 passed (1)`, `Tests 10 passed (10)`. Re-run after mutations:
   `10 passed (10)`.
3. `pnpm --filter fluxiq check` — `exit=0`, no diagnostics, `fluxiq@0.5.0`.
4. `pnpm structure:check` — `exit=1`,
   `structure-audit: 3 violation(s) across 2 rule(s)`. **None is mine:**
   - `FAIL [file-lines] AS/runtime/service.ts: 6764 lines exceeds the 800-line
     limit. Baseline for this entry is 6759` — K4c grew a file I must not touch,
     past a **ratcheted** baseline. This fails `pnpm check` until it is offset or
     the baseline is legitimately re-cut. **Supervisor action; see Open
     questions 3.**
   - `FAIL [working-docs] docs/working/first-class-data-extraction-plan.md: 1075
     lines exceeds the 800-line compaction threshold`.
   - `FAIL [working-docs] docs/working/README.md is out of date`.
5. **The audit could not see my new files at all.** It takes its file list from
   `git ls-files` (`context.mjs:89-95`) and every new file here is untracked
   (`git ls-files` on them returns nothing), so command 4 is evidence only about
   files already tracked — k4b's open question 2, hitting me identically.
   `scratchpad\k8-audit-harness.mjs` therefore builds the real context, appends
   my 10 files (`1779 -> 1789`), and runs all 10 rules:
   `total findings: 384`, **`findings naming a K8 file: 2`**, both advisory and
   neither a FAIL:
   - `[directory-files] api/contracts/: 18 source files is past the 15-file
     advisory threshold` (hard cap 25);
   - `[directory-files] api/handlers/: 22 source files is past the 15-file
     advisory threshold` (hard cap 25).
   `findings on packages/contracts/src/record-sets: 0`.
6. Mutations via `scratchpad\k8-mutations.mjs`, which asserts each target is
   unique, backs up the exact bytes, runs the suite, restores in a `finally`, and
   throws if the restored bytes differ. **All nine red:**

   | # | Mutation | Result |
   | --- | --- | --- |
   | M1 | domain check removed from the `list-run-datasets` handler | red |
   | M2 | domain check removed from the `delete-run-datasets` handler | red |
   | M3 | page limit passed through unclamped | red |
   | M4 | domain check removed from the streaming route | red |
   | M5 | permission check removed from the streaming route | red |
   | M6 | `Cache-Control` switched to `immutable` | red |
   | M7 | formula escaping stripped from the streamed body | red |
   | M8 | attachment name used unsanitized | red |
   | M9 | identifier pattern check removed from the route | red |

   M1, M2, M4, M5, M6, M9 are the brief's security mutations; M1 and M2 fail only
   one of the six looped endpoints each, so the per-handler check is proven, not
   just that *some* handler checks.
7. `git diff --stat` over my owned paths after the mutation run: only
   `endpoints.ts +6`, `contracts/index.ts +1`, `register.ts +2`, and
   `runs.ts +12`. **`runs.ts` is K8.0's already-landed change, not mine** — it was
   already modified in the working tree when I started. I did not touch it.

## Not verified

- **Nothing ran against a real SQLite-backed project through these endpoints.**
  The handler tests stub the collaborator, so they pin the handler contract —
  domain check ordering, permission, clamping, envelopes, actor — not that the
  collaborator returns what a real run wrote. K4c.1-2 owns that.
- **The route was never exercised over a real stream.** Its test mocks
  `lib/fluxiq`, so the 200 path proves header and pass-through behaviour, not
  that a 256 MiB body or a real store lease behaves. Real caps at real size stay
  unverified here, as they were in K4b.
- **CSV formula escaping itself is K1's encoder**, tested there. M7 proves only
  that my route does not undo it; I own no encoder.
- **No live browser check**, and no Data-window or panel UI exists yet (K9, K12c).
- `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm docs:check` were not run:
  outside this brief's scope, and the RAM rule argues against stacking them.
  Note that `pnpm check` **will currently fail** on the `service.ts` baseline
  above, for a reason that is not mine.
- Concurrency: whether two exports of one dataset contend on the store lease.

## Open questions or contradictions found

1. **The brief says three endpoints; its own body and a required read need six.**
   The task line names `listRunDatasets`, `getRunDatasetPage`, and
   `exportRunDataset`, then requires `delete-run-datasets` under `flows.write`,
   and §4.2 amends K8 with `list-project-datasets` and `list-dataset-runs`. I
   built all six rather than leave the Data window (K12c) and the delete action
   (CD17) unreachable. If the supervisor wanted the two K12 endpoints deferred to
   a K12 worker, delete those two registrations and their contract types; nothing
   else depends on them here.
2. **Four response envelopes were unpinned and I chose them.** §4.2 fixes only
   `{ datasets, page: { nextCursor, limit } }` and `{ runs, page: {...} }`. I
   used `{ datasets }` for `list-run-datasets`, `{ dataset }` for
   `get-run-dataset-page` (the page object or `null`), `{ export }` for
   `export-run-dataset`, and `{ deleted }` for `delete-run-datasets`, following
   `runs.ts` and `caches.ts`. **K9 and K12c must read these exact keys**, and
   they are being written concurrently — this needs reconciling at integration.
3. **K4c pushed `AS/runtime/service.ts` past its ratcheted baseline** (6764 vs
   6759). The baseline may shrink, never grow, so `pnpm check` fails until the
   five lines are offset — C8 says every line added there must be offset in the
   same change, and K4c.0 was supposed to free about 45. It is not my file and I
   did not touch it.
4. **A dataset page's cursor is not owner-validated at the endpoint.** The store
   binds the cursor to `run-dataset:<runId>:<datasetId>` and throws on a
   mismatch, so a cursor from another dataset is refused — but the refusal
   surfaces as a generic 400-ish error string, not a typed code. Fine today;
   worth a typed code if the panel wants to distinguish a stale cursor.
5. **`export-run-dataset`'s `actorId` is optional in my call
   (`request.actor?.userId`)** while `delete-run-datasets` uses `actor!`. The
   registry already refuses an actorless request before any handler runs
   (`_shared/api.ts:59-65`), so both are safe; the inconsistency is cosmetic and I
   kept `?.` on the read path to avoid a non-null assertion where none is needed.

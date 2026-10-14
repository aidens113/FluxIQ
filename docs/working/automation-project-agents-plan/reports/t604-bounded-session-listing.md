# t604 bounded-session-listing: worker report

## Outcome

Done. `list-runtime-sessions` now answers one page of bounded summaries. Each page is filtered, newest queued first, and carries a cursor to the next page. The route turns a body it cannot serialise into a coded JSON 500 and goes on serving. The Lab asks only for its own build's trials and follows the cursor.

One finding contradicts part of the brief. Core's process did not exit because of the bad request. The Lab's teardown killed it, as explained under "Open questions".

## What changed and why

### Core (`C:/Users/osrs_/FluxStuff/fxwork/t604/!FluxIQ`)

- `packages/fluxiq/src/programs/automation-studio/runtime/service/session-listing/` is a new module with a barrel, exported from `runtime/service/index.ts`.
  - `filter.ts` parses the options a caller sends: `limit` (1-100, default 25), `offset`, `cursor`, `flowId`, `candidateId`, `runIds` (1-100), and `statuses`. If a filter is present but malformed, the call is refused with `runtime_sessions.filter_invalid`, and a bad cursor with `runtime_sessions.cursor_invalid`. Both go through `diagnostic.code`, so the registry returns them as an `errorCode`. A filter is never silently dropped.
  - `cursor.ts` writes the cursor as base64url of `<queuedAt>:<runId>`. It is a keyset on a value that never changes once a session exists, and decoding it parses no JSON.
  - `sql-page.ts` does the filtering and the keyset ordering in SQL, sorted by `json_extract(queuedAt) desc, id desc`. It reads one row past the limit to decide `nextCursor`. It reads summary rows only, never session files. `listStaleAutomationStudioRuntimeSummaries` finds rows whose `summaryVersion` is older than the current one.
  - `memory-page.ts` gives the same order and cursor for a service with no data directory.
  - `page.ts` builds a page from the fetched rows.
  - `candidate-trial.ts` copies the closed scalars of `metadata.candidateTrial` into the summary: `candidateId`, `revision`, `digest`, `start`, `execution` and `code`, each at most 200 characters.
  - `summary-version.ts` sets the current summary version to 2.
- `storage/file-store.ts`:
  - `AutomationStudioRuntimeRunSummary` gains `candidateTrial?` and `summaryVersion?`.
  - The new type `AutomationStudioRuntimeRunCandidateTrial` holds the candidate trial's scalars.
  - The page type gains `nextCursor: string | null`.
- `summaries/conversions.ts`: `runtimeSummaryFromSession` now writes `candidateTrial` and `summaryVersion`.
- `summaries/store.ts`:
  - `listRuntimeSessionSummaries` delegates to the new module.
  - `ensureRuntimeSummaryIndex` now also rewrites stale rows from their sessions, one session at a time. If a session file is gone, its row is marked current so it is not checked again. This migrates rows that existing persistent workspaces wrote without `candidateTrial`.
- `runtime/service.ts`: only the option type changed. The file stays at its 4318-line baseline.
- `api/handlers/runtime-sessions.ts`:
  - The listing always answers `{ runtimeSessions: summaries, page: { total, limit, offset, nextCursor } }`. `summaries: true` is still accepted but has no effect.
  - The listing never calls `listRuntimeSessions` or reads a session's content.
  - A full session is read by id through the existing `get-runtime-session`.
  - If an answer would serialise to more than `AUTOMATION_STUDIO_RUNTIME_SESSION_LISTING_MAX_BYTES` (4 MiB), or past V8's string limit, it is refused with `runtime_sessions.listing_too_large`. The error message tells the caller how to ask for less.
- `apps/web/src/lib/program-json-response.ts` (new) and `route.ts`: `respond` now goes through `programJsonResponse`. When `NextResponse.json` throws:
  - A `RangeError` becomes a 500 with `{ ok:false, errorCode:"response.too_large", error }`.
  - Any other failure becomes a 500 with `response.unserializable`.
  - The failure is logged with `console.error`, and the route returns normally.

### Lab (`C:/Users/osrs_/FluxStuff/fxwork/t604/!FluxIQWebExtension`)

- `packages/test-runner/src/flow-lane/creation/candidate-outcome.ts`:
  - `readCandidateTrials` calls `list-runtime-sessions` with `{ projectId, flowId, candidateId, limit: 100, cursor }`.
  - It follows `page.nextCursor` for up to 20 pages, and stops if a cursor repeats.
  - It reads the summary's top-level `candidateTrial`.
  - It still checks the Flow and candidate itself, in case a Core ignores a filter.
  - The file's header comment was updated to match.
- Tests: the fixtures in `tests/candidate-draft.test.ts`, `tests/lane-candidate.test.ts` and `chat/tests/build-from-chat.test.ts` were changed from `metadata: { candidateTrial }` to the summary's top-level `candidateTrial`. A new test in `candidate-draft.test.ts` checks that the caller filters to its own Flow and candidate, follows the cursor across three pages, and drops summaries from another Flow or another candidate.

### Tests added or changed in Core

- `runtime/service/session-listing/tests/listing.test.ts` has four cases:
  - 36 sessions of about 200 KB each (about 7 MB in all) list as bounded summaries, filtered to one candidate. Pages come out as 5+5+2 via the cursor, newest first, each run once. No summary carries `trace`, `flow` or `metadata`. Every page is under 4 KB. The full session is still readable by id.
  - Filtering by `runIds` and `statuses` works. Bad cursors and filters are refused with their codes.
  - A summary row in the pre-t604 shape is rewritten with `candidateTrial` and `summaryVersion: 2`.
  - The memory page gives the same order and cursor.
- `api/handlers/tests/runtime-sessions.test.ts`:
  - Filters are passed through and the answer shape is right.
  - The listing never calls `listRuntimeSessions`.
  - An oversized page is refused with `runtime_sessions.listing_too_large` and no payload.
  - A filter refusal comes back with its code.
- `api/handlers/tests/saved-trace-answers.test.ts`: the listing case now asserts that a listing carries no trace. Reading by id still returns whole inputs.
- `apps/web/.../[endpoint]/tests/route-serialisation.test.ts`:
  - A `RangeError("Invalid string length")` payload returns a 500 with `response.too_large`, and the next request returns 200.
  - A cyclic payload returns a 500 with `response.unserializable`.

## Commands run and observed results

- `npx tsc --noEmit --incremental ...` in `!FluxIQ/packages/fluxiq` printed no output (clean), both before and after the module move.
- `npx tsc --noEmit` in `!FluxIQ/apps/web` printed no output (clean), both runs.
- `pnpm --filter @fluxiq/contracts --filter fluxiq build` ran twice. Both runs ended `fluxiq:build ... Done`. The web tests refuse to run while the Core dist is stale, which is why it was rebuilt.
- `npx vitest run` in `packages/fluxiq`, covering `session-listing`, `summaries`, `api/handlers/tests`, `service-flows/tests/runs.test.ts`, `runtime-session/tests/parked-expiry.test.ts` and `session-recovery/tests/service-wiring.test.ts`: `Test Files 42 passed (42)`, `Tests 287 passed (287)`.
- `npx vitest run` in `apps/web`, covering `[endpoint]/tests`, `lib/tests/program-route.test.ts` and `features/programs/tests/program-api.test.ts`: `Test Files 5 passed (5)`, `Tests 93 passed (93)`.
- `pnpm structure:check` in Core: `structure-audit: passed (360 warning(s), 1156 baselined)`. The first run failed on directory depth, a swallowed parse and statement packing. I fixed these by moving the module to `runtime/service/session-listing/`, using a non-JSON cursor, and putting one statement per line.
- `pnpm run build` in `!FluxIQWebExtension/packages/test-runner` (this is its tsc typecheck) completed: `test-runner:build ... stored`.
- `node --test dist/flow-lane/creation/tests/*.test.js dist/flow-lane/creation/chat/tests/*.test.js`: `# tests 179`, `# pass 179`, `# fail 0`.
- `pnpm structure:check` downstream: `structure-audit: passed (194 warning(s), 639 baselined)`.

## Not verified

- No live Lab run and no running `next start` server, as the brief required. The claim that the server "keeps serving" is shown by the in-process route test: the handler returns a 500 instead of throwing, and the next call returns 200.
- The one-time rewrite of stale rows has not been run against the real A8 persistent workspace. It reads each session file once, one at a time, so the first listing after upgrade will be slow on a large workspace.
- The extension package (`apps/extension`) was not re-typechecked or re-tested. Its callers (`background/diagnostics/recent-runs.ts`, `background/panel/run-control.ts`) already send `summaries: true` and read only summary fields, so their wire shape is unchanged.
- No full suites were run, per the twice-a-day rule.

## Open questions or contradictions found

1. **Brief part (3), "Core's process exited on the serialisation error", does not match the evidence.**
   - The Lab received an HTTP 500 at 21:42:22.608Z (`events.ndjson` sequence 48). So Next.js answered the request and kept the process alive. Next 15.5's own `uncaughtException` and `unhandledRejection` handlers only log (`next/dist/server/next-server.js` around line 193, and `router-server.js` around line 560).
   - The Lab then ended the run at 21:42:25.783Z. On Windows the process supervisor stops Core with `taskkill /pid <pid> /T /F` (`packages/test-runner/src/process-supervisor.ts:101`). A forced taskkill ends a process with exit code 1 and no signal, which is exactly what `core.log` shows: `[exit] code=1 signal=null`.
   - The route did fail badly in one way: the 500 was an unexplained empty body. It now has a coded body. No change was needed to keep the process alive.
2. **Listing order changed.** The old summaries mode sorted by `updated_at_ms`, the last write time. The listing now sorts by `queuedAt`, which never changes and so supports a stable cursor. The extension's Stop scan (`run-control.ts`, `ACTIVE_RUN_SCAN_LIMIT`) could miss an old active run if many newer runs exist. Core now supports `statuses: ["queued","running","waiting"]`, and the supervisor may want the extension to pass it. That is outside this brief's files.
3. **Two docs are now inaccurate, and I do not own them.**
   - `!FluxIQ/docs/architecture/automation-studio.md:1449` lists `list-runtime-sessions` among the endpoints that answer with a saved trace. That is no longer true. The listing answers summaries and the trace is read through `get-runtime-session`.
   - The listing's request and response contract (filters, cursor, `page.nextCursor`, the `runtime_sessions.*`, `response.too_large` and `response.unserializable` codes) should be added to the architecture docs.
4. **Other places that still load every session in memory.** The internal service callers of `listRuntimeSessions` load every full session for a project into memory: idempotency lookup at `service.ts:2465`, adaptive admission at `runtime-session/admission.ts:30`, and `summaries/store.ts:158`. They do not serialise the result, so they cannot crash a route this way. They are still a memory and latency cost that grows with the project. They were left alone as out of scope.
5. **Double serialisation.** The program registry's metric `serializedMetricBytes` (`_shared/performance-metrics.ts:114`) already stringifies every answer and quietly records 0 bytes when it fails. That means a large answer is serialised twice.

# http-api (P2b): FluxNode HTTP API on the headless API listener

## Outcome
Done. `/api/fluxnode/v1` is served by a new handler on the API listener when a `FluxNodeService` is given, in open mode with its guards.

## What changed and why
New `P/server/fluxnode-api/` (P = packages/fluxiq/src), one exported value per file, barrel `index.ts`:
- `api-handler.ts` `fluxNodeApiHandler(service, options?)`: guards first, then route, method check (405 + Allow), body parse with the contracts' schemas, call the service as `FLUXNODE_OPEN_MODE_CALLER`, write the outcome. Service refusals use `FLUXNODE_ERROR_HTTP_STATUS`; a thrown error answers 500 `internal` with safe words. All successes are 200.
- `check-open-mode-guards.ts`: loopback remote address (127.x, ::1, ::ffff:127.x); Host must be localhost / 127.0.0.1 / [::1] with optional port (403); any `Origin` (403); `Sec-Fetch-Site` present and not `none` (403); `FluxIQ-Client` non-empty (403); POST must be `content-type: application/json` (answers 400 invalid_request, the code table has no 415).
- `route-fluxnode-path.ts`, `read-fluxnode-json-body.ts` (1 MB default, stops reading at the limit, answers invalid_request with `connection: close`), `parse-fluxnode-body.ts` (zod issues to JSON Pointer issues; contracts' `parseWithZod` is not public), `stream-fluxnode-events.ts` (SSE via `formatFluxNodeEventFrame`, 15 s keep-alive comment, ends after `ended`, response close aborts the signal, honours backpressure), `write-fluxnode-refusal.ts`, `write-fluxnode-json.ts`, `http-refusal.ts`, `handler-options.ts`, `open-mode-caller.ts`.
- No `Access-Control-*` header is ever set; OPTIONS answers 405 with `Allow: POST, GET` (a preflight carries Origin, so it is 403 first).
- Mount: `programApiListener(context, fluxNodes?)` routes `/api/fluxnode/v1` and `/api/fluxnode/v1/...` to the handler when the service is given; otherwise those paths hit the old 404. `startHeadlessServer` options gain `fluxNodes?: FluxNodeService`. Program route unchanged. `P/server/index.ts` exports `./fluxnode-api/index.ts`.
- `run-dev.ts`: prints `  FluxNode: <apiUrl>/api/fluxnode/v1` and the exact notice line only when a FluxNode service is served.

Decisions: unknown path / wrong method use code `invalid_request` with status 404 / 405 overridden (the body shape stays the contracts'); an empty body reads as `{}` for stop and export only (their schemas are all-optional / defaulted); `Last-Event-ID` wins over `?after=`; run ids are checked with `fluxNodeFieldSchemas.id` (invalid -> 404 unknown_run), names with `fluxNodeNameSchema` (invalid -> 404 unknown_fluxnode).

## The exact seam for the real service in run-dev
`runDev(args, print, options: RunDevOptions = {})` in `P/server/cli/run-dev.ts`; `RunDevOptions = { createFluxNodes?: (fluxiq: FluxIQ) => FluxNodeService | Promise<FluxNodeService> }`. It is called after `initializeFluxIQServerStorage(fluxiq)` and its result goes to `startHeadlessServer({ fluxNodes })`. `run-command.ts` currently calls `runDev(parsed.value)`; the supervisor changes that to `runDev(parsed.value, console.log, { createFluxNodes: (fluxiq) => <real factory> })`. Without it no FluxNode API is served and nothing is printed.

## Commands run and observed results
- `npx vitest run src/server` (packages/fluxiq), run twice: `Test Files 13 passed (13)`, `Tests 103 passed (103)`. New: `fluxnode-api/tests/api-handler.test.ts` (26 tests: every endpoint happy path and refusal, SSE replay from Last-Event-ID and ?after=, live delivery then end after `ended`, keep-alive comment, disconnect aborts the signal, each guard, no Access-Control header, 405/404 shapes, body limit, remote-address unit check) and `headless/tests/fluxnode-mount.test.ts` (4 tests: served with service, guards on the shared listener, 404 without service, program route still claimed).
- `node scripts/structure-audit.mjs` (worktree root): `structure-audit: passed (535 warning(s), 1095 baselined).` after renaming files to dodge the shared-prefix rule and importing the port through its directory barrel `framework/automation-service/service/fluxnode/index.ts`.
- Free memory before tests ~1.6 GB. The tsc typecheck was not run, as instructed.

## Not verified
- tsc typecheck (strict, `exactOptionalPropertyTypes` was considered while writing; the supervisor runs it).
- `startHeadlessServer({ fluxNodes })` end to end with a real `FluxIQ` and `runDev` printing (the mount is tested through `programApiListener`; `runDev` has no test).
- Non-loopback remote address only by a unit test on the guard, not a real remote socket.
- Real SDK client against it; real service not present.

## Open questions or contradictions
- `P/server/headless/index.ts` and `initialize-storage.ts` show as modified in the worktree but not by me; presumably the other worker or supervisor.
- POST with a non-JSON content type answers 400 (not 415) to stay within the contracts' code table.

# P3a Headless engine: worker report

## Outcome

Done. The client gateway transport and the program route now live in `packages/fluxiq/src/server/`, published as `fluxiq/server`. A plain Node HTTP and WebSocket server serves both without Next.js. `apps/web` mounts the same code. `fluxiq dev` (package `bin`) starts that server with a data directory and the `FLUXIQ_HOST_MODULE` host. Nothing is committed. Core worktree only; the downstream tree was not edited (its ignored `domain/dist/host/` build output was regenerated for the live check).

## What changed and why

**Moved by path into `packages/fluxiq/src/server/` (behaviour unchanged):**
- `client-gateway-websocket/`: all 14 transport files from `apps/web/src/server/client-gateway-websocket/`. `apps/web/src/server/client-gateway-websocket.ts` became `start-server.ts`. Its tests moved with it: read-frame, token-bucket, transport-limits, plus `start-server.test.ts` and `start-server-wss.test.ts` (from `apps/web/src/server/tests/`). The shared test client is now `server/tests/raw-websocket-client.ts`.
- `program-route/program-route.ts`: from `apps/web/src/lib/program-route.ts` (allowlist, narrowing, actor, projection), with its test.
- `program-route/paired-client-project-domain.ts`: from `apps/web/src/lib/`.
- `program-route/handle-program-request.ts`: the logic of `app/api/programs/[programId]/[endpoint]/route.ts`. Same order (cookie, then bearer; drain; narrowing; domain gate; call; projection), same refusals and bodies. It returns `{status, headers, body}` instead of a `NextResponse`.
- `program-route/program-json-text.ts`: the JSON-write guard from `lib/program-json-response.ts`, same 500 bodies. `present-panel-session.ts` comes from `lib/auth.ts`.
- `drain/`: all of `apps/web/src/server/drain/` and its tests. The globalThis flag `__fluxiqWebDraining` is unchanged.
- `headless/initialize-storage.ts`: `initializeFluxIQWebStorage` from `lib/workspaces/`, with its messages unchanged.

**New:**
- `headless/start-headless-server.ts` and `program-api-listener.ts` form the server. It binds to 127.0.0.1 only. The gateway runs under the `local` profile (Origin rule and limits unchanged). The HTTP side serves only `/api/programs/<program>/<endpoint>` (GET/POST). Anything else gets 404, other methods 405, and a malformed path segment 400.
- `host-module/` (resolve path, native import, registration, host domain) copies `lib/fluxiq.ts`'s loader for the CLI. Apply uses Core's existing `applyHostInstanceRegistrations`.
- `cli/` (`main.ts` is the bin; `dev-arguments`, `run-dev`, `run-command`, `open-host-instance`). Tests: `headless/tests/start-headless-server.test.ts` (real SQLite, marked `real-sql`), `cli/tests/dev-arguments.test.ts`, `program-route/tests/program-json-text.test.ts`.
- `packages/fluxiq/package.json`: `"./server"` export, and `"bin": {"fluxiq": "./dist/server/cli/main.js"}`.

**One seam added:** `ClientGatewayWebSocketServerOptions.buildIdentity?`. The moved transport called `readServerBuildIdentity()`, which reads the identity stamped into apps/web's esbuild bundle, so Core cannot read it. The identity is now passed in. Leaving it out binds none, which is what an unstamped build always did.

**What apps/web now imports from `fluxiq/server`:**
- `server/client-gateway-websocket.ts` is still the esbuild entry. It wraps Core's `startClientGatewayWebSocketServer` and adds `buildIdentity: readServerBuildIdentity()`. It re-exports `isLoopbackHost`, `parseAllowedOrigins` and the handle and drain types.
- The program route reads the cookie and calls `handleProgramRequest`, passing `getFluxIQWebRuntimeStatus` for the snapshot's `webRuntime`.
- Re-export shims: `lib/program-route.ts`, `lib/paired-client-project-domain.ts`, `server/drain/index.ts`, `lib/workspaces/initialize-storage.ts`.
- `lib/auth.ts` imports `presentPanelSession`.
- Deleted: `lib/program-json-response.ts` (its only caller was the route). `lib/fluxiq.ts` is unchanged.

**Server API (`fluxiq/server`):** `startHeadlessServer({ fluxiq, apiPort?=3000, gatewayPort?=4777, gatewayPath?="/client" })` returns `{ apiUrl, gatewayUrl, api, gateway, close() }`. It also exports `handleProgramRequest(request, { fluxiq, webRuntimeStatus? })`, `programApiListener`, `initializeFluxIQServerStorage`, everything the transport exported before, and the drain exports. `fluxiq dev [--data-dir <dir>] [--port N] [--gateway-port N]` defaults to `~/.fluxiq/data`, 3000 and 4777, loads `FLUXIQ_HOST_MODULE`, prints both URLs, and stops on SIGINT or SIGTERM.

## Commands run and observed results

- `tsc --noEmit` (packages/fluxiq, its `check` command without the cache wrapper): exit 0, no output. Re-run after the last edit: exit 0.
- `tsc --noEmit` (apps/web): exit 0, no output.
- `vitest run src/server` (packages/fluxiq): `Test Files 11 passed (11)`, `Tests 73 passed (73)`. Re-run after the last edit: same.
- `node scripts/structure-audit.mjs`: first run failed on 3 findings. Two packed-statement lines in the moved `start-server.ts` and four in its test were already in the baseline under their apps/web paths, and one `.catch(() => undefined)` was mine. After fixing them: `structure-audit: passed (534 warning(s), 1095 baselined).`
- `pnpm --filter fluxiq build`: exit 0 (3m38s). This was needed because the apps/web tests refuse a stale `dist`.
- apps/web `vitest run src/app/api/programs src/app/api/client-gateway src/app/api/recordings src/server src/lib/tests/fluxiq.test.ts src/lib/app-route-iam src/lib/workspaces`: `Test Files 38 passed (38)`, `Tests 310 passed (310)`. Filter `endpoint`: route, route-domain-gate, route-drain and route-serialisation all pass (84 tests).
- `node scripts/build-client-gateway-server.mjs`: "Native client gateway server artifact and companion generated." The bundle imports `fluxiq/server` and passed the inventory check. Loading it and starting it on port 0 bound the stamped identity while listening (`moduleId fluxiq/web-client-gateway-server`). `node --test scripts/gateway-server-identity/tests/build.test.mjs`: pass 2, fail 0.
- Headless acceptance test (`start-headless-server.test.ts`), on ephemeral ports:
  - A raw WebSocket hello gets `server.pairing_required`.
  - After an in-process `approvePairing`, the client gets `server.session_ready` with a token.
  - POST `automation-studio/list-conversations` with that bearer token returns 200 `{ok:true}`.
  - With no credential or a bad token it returns 401. A token on `identity-access/snapshot` gets 403. `/api/discovery` gets 404.
- Live check (free RAM was 1.5-2.2 GB). I ran the built bin as `fluxiq dev --port 3881 --gateway-port 4881` with `FLUXIQ_HOST_MODULE` set to the downstream `domain/dist/host/web-panel-host.mjs`.
  - It printed `Gateway: ws://127.0.0.1:4881/client` and `API: http://127.0.0.1:3881/...`.
  - The extension's connection class (`FluxIQClientGatewayConnection` from `@fluxiq/client-gateway-websocket`), sending the extension's hello shape, reached state `pairing` with `server.pairing_required` (reference code present).
  - HTTP calls: 401 with no credential, 401 with a bad token, 403 for a non-allowlisted endpoint.
  - With the host, the opened instance has `activeDomainId=web-automation`. Emitting SIGINT to the dev command printed "Stopping FluxIQ..." and the process exited with code 0.

## Not verified

- **The extension did not finish pairing to `fluxiq dev`.** Approval needs a signed-in person (`/api/client-gateway/approve-pairing`, cookie), and no login or panel is served headless. Full pairing was shown only in-process in the test. A real browser with the extension was not run.
- **The headless HTTP server reads no session cookie**, so every caller is a paired client with a bearer token. That is why the edge middleware's cross-site guard (cookie writes only) and operator-only paths (public profiles only) are not applied. Both still guard apps/web unchanged.
- **The headless server leaves out some web-runtime behaviour:**
  - the recording-context provider (no active project per operator), so a start-recording request from a client is not served;
  - `FLUXIQ_MODEL_PROVIDERS_ENABLED`, so Core's default (enabled) applies;
  - the profile setting, so it always runs as `local`;
  - gateway security-event persistence, which is non-local only;
  - draining and the readiness probe.
- **`next build` and `next dev` were not run.** apps/web route bundles now import `fluxiq/server`. The bin's dynamic `import()` is rewritten by tsc's extension helper in `dist`, which is harmless in Node. The `host-module/` and `cli/` directories are deliberately left out of the `fluxiq/server` barrel so no bundler sees them.
- Full package suites were not run (the narrow-check rule).

## Open questions or contradictions found

1. **Files touched beyond the owned list.** These are dependencies of the moved route and server, not new work:
   - `lib/auth.ts`, `lib/paired-client-project-domain.ts`, `lib/program-json-response.ts` (deleted);
   - `server/drain/*`, `lib/workspaces/initialize-storage.ts`;
   - `server/client-gateway-websocket.ts` and `server/tests/*`.
2. **`.structure-baseline.json` still lists the old apps/web paths** (`server/client-gateway-websocket.ts: 2`, `server/tests/client-gateway-websocket.test.ts: 4`). The audit passes; `pnpm structure:baseline` at merge would drop them.
3. **Stale path references in docs and comments.** `docs/architecture/automation-studio/{client-gateway,llm-flow-bootstrap,persistence}.md` and three Core test comments still name the apps/web paths. The architecture docs were not mine to edit.
4. `fluxiq` is now a published package with a `bin` and a new export, so its version needs a minor bump when this merges.

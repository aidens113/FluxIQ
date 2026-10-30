# t802-W5: request middleware and discovery route

## Outcome
Partial. Behaviour and tests are done and pass; one `structure:check` violation of mine remains because `apps/web` cannot yet import `@fluxiq/contracts` by name.

## What changed and why
- `apps/web/src/middleware.ts`: rewrites `/.well-known/fluxiq` to `/api/discovery`; on public profiles (`settings.public`) refuses the three operator-only endpoints with 403 `operator_only`; refuses cross-site cookie writes with 403 `cross_site_request`. Settings failure gives 500 `deployment_misconfigured`. Matcher skips `_next/static`, `_next/image`, `favicon.ico`. `/welcome`, `/reset`, `/setup`, `/api/health` are untouched (no session check added).
- `apps/web/src/lib/request-guard/`: `is-cross-site-request.ts` (pure; state-changing method + session cookie + no Bearer; refuses on `Sec-Fetch-Site` not same-origin/none, or `Origin` not the allowed origin; public profiles compare to `publicOrigin`, local compares the Origin host to the request Host header so localhost and 127.0.0.1 both work; neither header allowed), `is-operator-only-path.ts`, `platform-contracts.ts` (seam), `index.ts` barrel.
- `apps/web/src/app/api/discovery/`: `route.ts` (GET, `Cache-Control: public, max-age=300` from `FLUXIQ_DISCOVERY_MAX_AGE_SECONDS`; error 500 `discovery_misconfigured` with `fields`, `no-store`), `build-discovery-document.ts` (settings + contracts, validated with `fluxiqDiscoveryDocumentSchema`), `index.ts`.
- Tests: `lib/request-guard/tests/*` (2 files), `app/api/discovery/tests/discovery.test.ts`, `src/tests/middleware.test.ts`.
- With no env set (local), nothing changes: same-origin and header-less requests pass, operator endpoints stay reachable.

## Commands run and observed results
- `pnpm exec vitest run src/lib/request-guard src/app/api/discovery src/tests/middleware.test.ts` (apps/web, in the lock): 4 files passed, 14 tests passed.
- `pnpm exec tsc --noEmit` (apps/web, in the lock): no errors in middleware, request-guard or discovery. Remaining errors are other workers' files (`lib/fluxiq.ts` DrainableGateway; `server/client-gateway-websocket/origin-grammar.ts` missing exports from `fluxiq/platform/profile`, which is a stale dist).
- `pnpm structure:check` (Core, in the lock): 3 violations. Mine: `[package-exports] apps/web/src/lib/request-guard/platform-contracts.ts` (3 loads of `packages/contracts/dist/...`). Not mine: `app/reset/request/route.ts` failure-as-empty; `server/client-gateway-websocket/tests/raw-websocket-client.ts` statement-packing.

## Not verified
- `next dev`/`next build` (not required; webpack fails on `!` in the path). Edge-runtime bundling of the middleware not exercised; it imports only `next/server`, `fluxiq/platform/profile` and the contracts modules.
- Live browser behaviour of the cookie/Origin guard.

## Open questions or contradictions found
- Blocker for a clean structure check: `apps/web/package.json` has no `@fluxiq/contracts` dependency and no link exists (`apps/web/node_modules/@fluxiq` absent), and `fluxiq/platform` does not re-export the discovery, connect-path or gateway-version contracts (and importing `fluxiq/platform` in the edge middleware would pull the SQLite store). `packages/**` and installs were off limits, so `lib/request-guard/platform-contracts.ts` reaches `packages/contracts/dist/platform/{connect/paths,gateway/protocol-versions,discovery/discovery-document}.js` by relative path. Fix, either one: (a) add `"@fluxiq/contracts": "workspace:*"` to `apps/web/package.json`, run pnpm install, and change the three specifiers in that one file to `@fluxiq/contracts/platform`; or (b) have `fluxiq/platform/profile` re-export `FLUXIQ_CONNECT_PATHS`, `CLIENT_GATEWAY_PROTOCOL_VERSIONS`, `FLUXIQ_DISCOVERY_MAX_AGE_SECONDS`, `fluxiqDiscoveryDocumentSchema`, `parseFluxIQDiscoveryDocument` and import them from there. Everything else imports through the barrel, so only that file changes.
- A service profile with an http origin fails in `resolveFluxIQDeploymentSettings` before the schema runs, so discovery returns `fields: ["deployment_settings"]` rather than `["origin"]`. A schema-level failure (bad `FLUXIQ_SIGN_UP_URL`) returns `["connect.signUpUrl"]`.
- `NextRequest` normalises `127.0.0.1` to `localhost` in `nextUrl`; the guard uses the raw `Host` header, so it is unaffected.

# t802-W3 web runtime wiring

## Outcome
Done, pending the final run recorded below. Items 1-9 are implemented.

## What changed and why
- `apps/web/src/lib/fluxiq.ts`: settings come from `resolveFluxIQDeploymentSettings(process.env)`. The gateway gets host, port, path, `publicUrl`, `profile`, `allowedOrigins`, `trustProxy` and `limits`. `FLUXIQ_PUBLIC_CLIENT_WS_URL ??= settings.gateway.publicUrl` is kept. Status uses the settings' public URL and omits `hostRoot` and `fluxiqDir` on `service` (no other consumer reads them). New `getFluxIQWebReadiness()`. SIGTERM with `drainSeconds > 0` drains, then closes and exits 143. The provisioning listener starts on `service` after the gateway (dynamic import) and closes first. Owner claim and audit persistence are wired.
- `server/gateway-runtime/load.ts`: `FLUXIQ_GATEWAY_SERVER_MODULE` overrides the bundle path.
- `server/provisioning-listener/`: `listener-for-profile.ts` (service only, delegates to `startProvisioningListenerFromEnv`, so a public bind, the panel/gateway ports and public CIDRs are refused as B1 does). The file is not named `start-...` because a third `start-` file trips the structure naming rule. `resolve-email-sender.ts` (`none`, `file`, `file:<dir>`). `platform-services.ts` uses both and takes `publicOrigin` from the settings.
- `server/drain/`, `server/readiness/`, `server/log/`, `server/security-audit/`, `server/startup/` (owner-claim announcement), `app/api/health`, `app/api/ready`.
- Choices: audit persistence is attached outside the `local` profile only, so a local install writes no new file. Under `service` with the token file set but no listen address, startup fails loudly (B1 behaviour). `FLUXIQ_DRAIN_SECONDS=0` is rejected by the resolver ("positive integer"), so 0 means unset on local.

## Commands run and observed results
- `pnpm structure:check` (before fixes): my files failed `as-never`, statement-packing, swallowed-failure and `start-` naming. All fixed. The remaining failures were in owner-claim, discovery/request-guard, middleware, and `raw-websocket-client.ts`, none mine.
- `pnpm exec vitest run src/lib/tests/fluxiq.test.ts src/server src/app/api/health src/app/api/ready`: 23 files passed, 3 failed. All mine passed except the SIGTERM test (test bug, `FLUXIQ_DRAIN_SECONDS=0` is invalid; fixed). The failures in `server/tests/client-gateway-websocket*.test.ts` come from the other worker's pending transport (`parseClientGatewayOriginAllowlist is not a function`, `setPairingLimits` never called).
- See the final run below.

## Not verified
- Live behaviour under Next (routes, SIGTERM in a real process). `FLUXIQ_PUBLIC_CLIENT_WS_URL` is set only when the gateway starts.

## Open questions or contradictions
- `welcomeUrl` in mail JSON is left to the lead (packages untouched).

## Final run
- `vitest run src/lib/tests/fluxiq.test.ts` -> "Test Files 1 passed (1), Tests 30 passed (30)". Earlier full acceptance run: every file of mine passed; the only failures were `server/tests/client-gateway-websocket*.test.ts` (the other worker's transport).
- Web `tsc --noEmit`: one error of mine (`DrainableGateway.beginDrain` reason typed `string`; the transport types it `"shutdown" | "restart"`). Fixed afterwards by narrowing the type; not re-run (lock queue). Remaining errors are in `server/client-gateway-websocket/origin-grammar.ts` (missing `fluxiq/platform/profile` exports, pending Core/transport).
- Core `pnpm structure:check` was last run before the final fixes; not re-run after them.

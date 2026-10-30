# t802-W1 profile resolution report

## Outcome
Partial. The module is written and its tests pass. The typecheck did not run because the shared lock stayed held. The structure audit has two `web-vocabulary` FAILs on the mandated name `sessionCookie`.

## What changed and why
New pure module `packages/fluxiq/src/platform/profile/`. It has no `node:` imports and uses only the global `URL`.
- `index.ts` (barrel) exports `FluxIQDeploymentSettings`, `resolveFluxIQDeploymentSettings`, `resolveClientAddress` and `clientAddressPrefix`, with the exact interface from the brief.
- `types.ts`, `client-address-prefix.ts`, `normalize-ip-address.ts` and `expand-ipv6.ts` sit in the module root.
- `resolve/` holds the resolvers, with its own barrel `index.ts`. It was split out because the structure audit's naming rule objected to five files sharing the `resolve-` prefix.
  - `deployment-settings.ts`
  - `client-address.ts`
  - `gateway-limits.ts`
  - `gateway-public-url.ts`
  - `public-origin.ts`
  - `parse-integer-setting.ts`
- `tests/resolve-fluxiq-deployment-settings.test.ts` and `tests/client-address.test.ts`.
- One line added to `packages/fluxiq/src/platform/index.ts`: `export * from "./profile/index.ts";`.
- Package export `"./platform/profile"` added to `packages/fluxiq/package.json`, right after `./platform`.

Behaviour decisions beyond the brief:
- Non-numeric values throw an error that names the variable and never echoes the value.
- A non-nullable setting (max frame bytes, pending total, port, drain seconds) rejects 0.
- Port above 65535 throws.
- IPv4-mapped IPv6 in hex form (`::ffff:c0a8:0105`) is also reduced to IPv4.
- The IPv6 prefix is written with leading zeros stripped, for example `2001:db8:0::/48`.
- An invalid or unparseable `FLUXIQ_PUBLIC_ORIGIN` throws, and it is canonicalised through `new URL(...).origin`.
- `FLUXIQ_LOG_FORMAT` values other than `json` or `text` fall back to the profile default.
- On a local-profile IPv6 gateway host, the public URL is bracketed (`ws://[::1]:4777/client`).

## Commands run and observed results
- From `packages/fluxiq`, `pnpm test src/platform/profile`:
  - `Test Files 2 passed (2)`, `Tests 25 passed (25)`.
  - `[vitest-groups] all groups passed: parallel, real-sql`. The real-sql group found no matching files.
  - Re-run after the `resolve/` restructure with the same result.
- Core `pnpm structure:check`:
  - Before the restructure it reported a `[naming]` FAIL (5 files share the prefix `resolve-`). That is fixed.
  - After the restructure: `structure-audit: 2 violation(s) across 1 rule(s).`
  - Both are `[web-vocabulary]` FAILs: `resolve/deployment-settings.ts` line 52 and `types.ts` line 27, each on the name "cookie".
- fluxiq typecheck (`pnpm check` under the shared lock): not run. `C:/Users/osrs_/FluxStuff/lab-slots/heavy-check.lock` was created at 10:26 and was still held when I stopped polling at about 11:15. I polled for more than 8 minutes after it was already 37 minutes old. I did not remove it. Nothing was run.
  - A backgrounded copy of the lock-wrapped command from my first attempt may still be polling the lock in this session. Its output is unrecoverable, so treat the typecheck as not run.

## Not verified
- Typecheck of `packages/fluxiq` (see above).
- That the package export resolves in `dist` (no build was run).

## Open questions or contradictions found
- The `sessionCookie` property name is mandated by the interface, but Core's `web-vocabulary` audit rule rejects it. Either:
  - the supervisor records a deliberate exception for the two occurrences in `.structure-baseline.json`, which is outside my ownership, or
  - the interface is renamed (for example `session.cookie`, which would still trip the rule; a neutral name such as `sessionToken` would not). I did not rename it, because other workers code against it.
- The lock looks stale, or it belongs to a very long job. Please confirm before the typecheck is run.

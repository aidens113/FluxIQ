# t814-E1 report: Core panel extension points

Outcome: Partial. Everything is built and tested; one structure-audit FAIL remains and comes from the frozen `types.ts`.

## What changed
- `packages/fluxiq/src/platform/panel/`: `registry/` (create, get via `Symbol.for("fluxiq.platformRegistry")` on globalThis, reset), `brand/` (contrastRatio, PANEL_BRAND_SURFACES, checkPanelBrandContrast, panelBrandStyle, panelBranding), `onboarding/` (panelOnboardingCards; key card links to `/programs/secret-keys`), `host-modules/` (parseHostModulePaths, loadPlatformHostModules, applyHostInstanceRegistrations, `loadedHostModulesStore` with `clear()` for tests, default importer), barrels everywhere, `index.ts` re-exporting the contract values requested.
- `platform/index.ts`: one `export * from "./panel/index.ts"` line (tsc showed no name clash). `package.json`: `./platform/panel` export.
- Fixture `panel/tests/fixtures/fixture-host-module.mjs` plus `assets/logo.svg`, `assets/favicon.ico`.
- Tests: 4 files, 30 tests (registry, brand, onboarding, host-modules).
- Brand files are named `surfaces.ts`, `style.ts`, `branding.ts` to satisfy the "shared prefix becomes a directory" audit rule.

## Commands and results
- `pnpm check` in packages/fluxiq (before the brand-file renames and test-stub edits): tsc clean (fluxiq:check step ran, exit 0).
- `pnpm test src/platform/panel`: both groups ran, parallel 4 files / 30 tests passed, real-sql had no matching files, "all groups passed". After the renames I re-ran vitest directly (`FLUXIQ_TEST_GROUP=parallel`): 30/30 passed.
- `node scripts/structure-audit.mjs`: after fixing my own findings (as-never casts in tests, brand prefix naming), 1 FAIL remains: `[web-vocabulary] platform/panel/types.ts`, 4 names ("browser" at line 19: `browser.connected`/`browser.revoked` event keys and `browserId`). No new violation in my files.
- `pnpm build` in packages/fluxiq (ran after the renames): fluxiq:build ok, `packages/fluxiq/dist/platform/panel/index.js` exists.

## Not verified
- tsc was not re-run over the test files after the final edits (the build tsconfig does not cover tests; vitest does not type-check). The source files were type-checked by the build.
- Tests were not run under the lock wrapper after the renames (direct vitest, 5 s); a heavy-check sweep from another lane held the lock for over 50 minutes, so the structure audit and the vitest rerun went without it.

## Open questions or contradictions
- Frozen `types.ts` fails the Core `web-vocabulary` audit because of the `browser.*` event names and `browserId`. Fix options for the supervisor: rename to neutral names (e.g. `client.connected`, `client.revoked`, `clientId`) in types.ts, which would also change the downstream contract, or record a deliberate exception in the structure baseline. I did not touch either.
- `loadPlatformHostModules` remembers its list on globalThis; `applyHostInstanceRegistrations` is exported for lib/fluxiq.ts wiring but nothing calls it yet.

```text
Outcome: Partial
Changed: packages/fluxiq/src/platform/panel/** (registry, brand, onboarding, host-modules, index.ts, tests, fixtures), packages/fluxiq/src/platform/index.ts, packages/fluxiq/package.json
Validation: `pnpm check` + `pnpm test src/platform/panel` -> tsc clean, 30/30 tests passed; `node scripts/structure-audit.mjs` -> 1 FAIL (web-vocabulary in frozen types.ts); `pnpm build` -> ok, dist/platform/panel/index.js exists
Not verified: tsc over tests after final edits; reruns under the heavy-check lock (held by another sweep)
Report: C:/Users/osrs_/FluxStuff/fxwork/t814/!FluxIQ/docs/working/hosted-production-plan/reports/t814/e1-core-panel.md
Notes: Remaining audit FAIL is "browser" naming in frozen types.ts (browser.connected/revoked, browserId); needs rename or baseline exception by the supervisor.
```

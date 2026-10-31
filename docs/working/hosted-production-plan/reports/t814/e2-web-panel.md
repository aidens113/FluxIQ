# t814-E2 report: web panel wired to the PanelProduct registry

Outcome: Done. No forbidden file needed.

## What changed
- `apps/web/src/app/product/` (new): `server/` (`ensurePlatformModulesLoaded`, `currentPanelBranding`, `OnboardingCards`) and `client/` (`PanelBrandingProvider`, `usePanelBranding`, `BrandMark`, `LoginProductLinks`, stock branding constant), each with a barrel. Client code imports `./product/client` only, so the host module loader never reaches the browser bundle. `assets/[name]/route.ts` serves declared assets.
- `layout.tsx`: `generateMetadata` (title = shortName, favicon icon when set), provider around the body, `<html style>` only when the accent variables are non-empty. Imports `styles/product-branding.css` here (new file) rather than editing `globals.css`, which is not owned.
- `AuthShell.tsx`: topbar and login use `BrandMark` and the context name, sign-in title and message, sign-up link and footer links. Stock output is unchanged.
- `page.tsx`: `<OnboardingCards />` above the launcher. It renders nothing with no product registered (also when no key exists, so the stock panel is untouched).
- `tests/HomePage.test.tsx`: mocks `../product/server` (the sync static renderer cannot render the async card component).
- `docs/architecture/platform.md`: new section "Panel product manifest and platform hooks".

## Decisions
- Public route: the assets route is outside `/api`, and `middleware.ts` does not gate on auth (it only guards cross-site writes and operator-only paths), so it is reachable signed out with no registration. The IAM parity test only scans `app/api`, so no edit was needed there.
- `hasModelKey` = the workspace's secret-keys snapshot has any key (`getFluxIQ().programs.secretKeys.snapshot()`, redacted metadata, workspace level, not per user). If the read fails, it assumes true.
- `setProduct` validates that `assetsDir` exists and holds the declared assets, so the missing-file 404 test deletes the file after registering.

## Commands and results
- `vitest run src/app/product src/app/tests` (apps/web) -> 11 files, 87 tests passed (new: branding-ui 6, assets-route 4, OnboardingCards 5, layout 2).
- `npx tsc --noEmit` (apps/web) -> no output, clean.
- `node scripts/structure-audit.mjs` -> passed (0 violations; 469 warnings, all existing). Two earlier runs failed on my barrel imports and statement packing, both fixed.
- `pnpm docs:check` -> passed, "Deterministic framework reference is current."
- All run under the heavy-check lock. `next build` not run, as instructed.

## Not verified
- No browser or `next build` check: that the `"use client"` barrel and the server barrel split bundles cleanly under Next, and that `<html style>` shows no flash in a real render.
- `FLUXIQ_HOST_MODULE` loading was only exercised in vitest; instrumentation hookup is a later lane.
- Layout test renders `RootLayout` with its heavy children mocked.

## Open questions
- `globals.css` still does not import `product-branding.css`; layout imports it. Move the import if the supervisor prefers one place.

```text
Outcome: Done
Changed: apps/web/src/app/{layout.tsx,AuthShell.tsx,page.tsx}, apps/web/src/app/product/** (server/, client/, assets/[name]/route.ts, tests/), apps/web/src/app/styles/product-branding.css, apps/web/src/app/tests/HomePage.test.tsx, docs/architecture/platform.md
Validation: `vitest run src/app/product src/app/tests` -> 87/87 passed; `tsc --noEmit` -> clean; `node scripts/structure-audit.mjs` -> passed; `pnpm docs:check` -> passed
Not verified: next build and live browser render; bundle split of client/server barrels
Report: C:/Users/osrs_/FluxStuff/fxwork/t814/!FluxIQ/docs/working/hosted-production-plan/reports/t814/e2-web-panel.md
Notes: Assets route is public already (middleware does not gate on auth); cards show only when a product is registered.
```

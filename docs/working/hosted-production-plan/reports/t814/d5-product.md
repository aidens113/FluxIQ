# t814-D5 product host module

## Outcome
Done, with one Core gap (project owner, below). `apps/product` exists, builds, tests, type-checks. Nothing committed.

## What changed and why
- `apps/product/` (new, `@fluxiq-web-extension/product`, private, ESM, `fluxiqHostModule: ./dist/host/platform.mjs`). `fluxiq` linked as `domain` does (`link:../../../!FluxIQ/packages/fluxiq`). Core imported only from `fluxiq/platform/panel`.
- `src/manifest/`: split to one export per file (not one `manifest.ts`): `product-manifest.ts` (productManifest), `brand`, `links`, `auth`, `assets`, `extension-clients`, `email/{sender,templates,template-name}`, `allowed-placeholders`, barrels.
- `src/hooks/seed-default-project.ts`: `workspace.created` creates "My automations" via `payload.fluxiq.programs.automationStudio` (`listProjects` then `createProject`); skips if a project of that name exists; errors propagate.
- `src/host/platform.ts`: `registerFluxIQPlatform` = `setProduct(manifest, {assetsDir})` + `on("workspace.created", seedDefaultProject)`. assetsDir = `<dir of file>/../../assets`, same from `src/host` and `dist/host`.
- `assets/`: `fluxiq-mark.svg` (logo), `favicon.ico`, `fluxiq-icon.png` (copied from FluxIQWebsite `design/brand` and `src/app`; the png is not referenced by the manifest).
- `scripts/build-host.mjs` (esbuild, `fluxiq`/`fluxiq/*` external), `scripts/test-product.mjs` (bundles `src/**/tests/*.test.ts` to `.test-build/host/`, same depth as dist, runs `node --test`), `.gitignore` for `.test-build/`.
- `docs/architecture/repository-layout.md`: layout line + "Product Host Module" section.
- `pnpm-lock.yaml`: only the `apps/product` importer was added (16 lines, checked with git diff).

## Decisions
- Brand (ratios from `checkPanelBrandContrast`'s `contrastRatio`, printed by the test):
  - light: primary #8a5700 6.10 (surface), hover #6b4300 8.65, focus #b36b00 4.18 (surface) / 3.76 (background #f2f3f3).
  - dark: primary #f5b83d 10.04, hover #ffd27a 12.55, focus #f5b83d 10.04 / 10.80. Amber #f5b83d passes only in dark.
- `extensionStores` omitted: the plan names no listing URL and the item id is unknown. `extensionClients`: only Firefox `moz-extension://*`; no Chrome entry, because the extension manifests pin no `key`/id (plan: add it once D7 uploads the draft).
- Email sender: plan names none, so `FluxIQ <no-reply@getfluxiq.com>`. Templates: welcome, account-exists, password-reset, client-connected (placeholders match Core's list). credential-reused is left to Core's stock text.

## Commands run and observed
- `pnpm install` -> done; lockfile diff = the `apps/product` importer only.
- `pnpm test` (apps/product) -> `# tests 11 / # pass 11 / # fail 0`.
- `pnpm check` (core-build gate + `tsc --noEmit`) -> clean (no errors).
- `pnpm build` -> `dist/host/platform.mjs 4.2kb`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (234 warning(s), 616 baselined)` (one naming + one import violation of mine were found and fixed first; baseline untouched).
- `node scripts/check/model-text.mjs` -> `model-text: ok`.
- `pnpm docs:check`: no such script in this repo; not run.
- `pnpm install`'s root `prepare` re-ran `git config core.hooksPath .githooks` (existing repo behaviour).

## Not verified
- Loading `dist/host/platform.mjs` through Core's real host-module loader / a hosted server (only the registry test with `createPlatformRegistry`).
- The seed hook against a real `FluxIQ` instance: tests use an in-memory fake with the two service calls.
- Root `pnpm check` / full suites (not run, per the repo's validation rule).

## Open questions or contradictions
1. **Owner not set (Core gap).** `AutomationStudioProjectOwnerships` (`recordOwner`) is not exported through any public subpath, and `createProject` takes no owner. The seeded project is therefore ownerless until Core's migration gives it the workspace owner / first admin on first listing. Idempotence is by name within the workspace instance, not by owner. Needs a Core export (e.g. a `recordOwner`-style seam, or `ownerUserId` on `createProject`) to meet "owned by payload.ownerUserId". The hook is one file to change.
2. **Build-cache registration needed (scripts/ not edited).** `scripts/build-cache/steps.mjs` needs `product:build` (package `apps/product`, kind build, command `node scripts/build-host.mjs`, generated `dist`, required `dist/host/platform.mjs`) and optionally `product:check`, like `domain:host-build`/`domain:check`. Also check whether the Lab/launchers should read the new `fluxiqHostModule` field, and whether `.gitignore` should list `apps/product/.test-build/` at root (I used a package-local `.gitignore`).
3. `docs/working/**` untouched (supervisor owns the plan); D7 should add the Chrome entry and `extensionStores` once the item id exists.

```text
Outcome: Done
Changed: apps/product/** (new), pnpm-lock.yaml, docs/architecture/repository-layout.md
Validation: `pnpm test` (apps/product) -> 11 pass 0 fail; `pnpm check` clean; `pnpm build` -> dist/host/platform.mjs; structure-audit passed; model-text ok
Not verified: real host-module load in a hosted server; seed hook against a real FluxIQ; root pnpm check; docs:check absent
Report: C:/Users/osrs_/FluxStuff/fxwork/t814/!FluxIQ/docs/working/hosted-production-plan/reports/t814/d5-product.md
Notes: Owner cannot be set through Core's public API (ownership not exported); build-cache steps need registering by the supervisor.
```

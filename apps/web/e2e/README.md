# FluxIQ Web Browser Tests

The browser suite targets an already-running web panel. It never starts or
stops the application server.

## Prepare deterministic data

From the repository root:

```powershell
pnpm --filter @fluxiq/web fixture:e2e
```

The command resets only the marked `apps/web/.e2e-host` fixture directory and
writes `fixture-manifest.json` with generated project IDs.

The manifest includes `empty`, `small`, `scale1k`, and `scale10k` Automation
Studio projects. Older tests can still use `representative` for `small` and
`scale` for `scale1k`.

Phase 8 has an exact, separately versioned fixture contract. Materialize its
Ordinary and Scale profiles explicitly:

```powershell
$env:FLUXIQ_E2E_PHASE8_PROFILE = "all"
pnpm --filter @fluxiq/web fixture:e2e
pnpm --filter @fluxiq/web fixture:e2e:verify
```

The exact counts, production-host protocol, browser prerequisites, budgets,
and fail-closed policy are documented in
`docs/operations/web-panel-phase8-browser-scale-certification.md`.

Verify the seeded counts before running performance captures:

```powershell
pnpm --filter @fluxiq/web fixture:e2e:verify
```

## Start the panel manually

```powershell
$env:FLUXIQ_IMPORTER_ROOT = (Resolve-Path apps/web/.e2e-host)
$env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
pnpm --filter @fluxiq/web dev
```

## Run captures

In another shell:

```powershell
$env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:3000"
pnpm --filter @fluxiq/web test:e2e
```

Failure traces, video, screenshots, and baseline captures are written under
`apps/web/test-results/playwright`. Open the HTML report with
`pnpm --filter @fluxiq/web test:e2e:report`.

The Phase 7 matrix uses exact 1440x900, 768x500, 320x568, and
200-percent-equivalent projects. Deterministic shared-state goldens are stored
under `e2e/phase7-visual-fixture.spec.ts-snapshots/`; routed Studio and global
program captures remain test artifacts. See
`docs/operations/web-panel-responsive-visual-certification.md` for scroll
ownership, state coverage, and the release review checklist.

Automation Studio performance captures enforce the interaction budgets in
`apps/web/src/features/programs/ui-performance-budgets.ts` and write settled
duration, request-count, long-task, render-counter, DOM, and graph metrics into
the JSON artifacts.

Phase 8 expands that matrix to Chromium-compatible, Edge, and Firefox projects.
Use `test:e2e:phase8:chromium` for all four Chromium viewports and
`test:e2e:phase8:cross-browser` for desktop engine parity. Missing hosted-panel
or browser prerequisites remain unexecuted failures, never implicit passes.

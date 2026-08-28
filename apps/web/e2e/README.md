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

Automation Studio performance captures enforce the interaction budgets in
`apps/web/src/features/programs/ui-performance-budgets.ts` and write settled
duration, request-count, long-task, render-counter, DOM, and graph metrics into
the JSON artifacts.

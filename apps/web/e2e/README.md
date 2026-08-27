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

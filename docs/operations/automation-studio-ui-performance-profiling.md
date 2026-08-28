# Automation Studio UI Performance Profiling

This checklist turns a vague “Automation Studio is laggy” report into evidence
that can be compared against the local certification budgets.

## Fixture Setup

Generate deterministic local browser fixtures from the repository root:

```powershell
pnpm --filter @fluxiq/web fixture:e2e
pnpm --filter @fluxiq/web fixture:e2e:verify
```

The manifest is written to `apps/web/.e2e-host/fixture-manifest.json` unless
`FLUXIQ_E2E_FIXTURE_ROOT` is set. The fixture set includes:

- `empty`: no Studio artifacts beyond the project shell.
- `small`: representative flows, subflows, folders, instructions, runtime runs,
  adaptations, graph nodes, and recording events.
- `scale1k`: 1,000 graph nodes, 1,000 hierarchy folders, 1,000 recording events,
  plus paged Flow runtime data.
- `scale10k`: 10,000 graph nodes and 10,000 recording events with larger Flow,
  subflow, instruction, adaptation, and runtime-run catalogs.

`representative` aliases `small`, and `scale` aliases `scale1k` for older tests.

## Browser Capture

Start the web panel manually against the fixture root:

```powershell
$env:FLUXIQ_IMPORTER_ROOT = (Resolve-Path apps/web/.e2e-host)
$env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
pnpm --filter @fluxiq/web dev
```

In another shell, run the performance suite:

```powershell
$env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:3000"
pnpm --filter @fluxiq/web test:e2e -- performance-baseline.spec.ts
```

The suite records per-interaction settled duration, request counts, long-task
counts, DOM size, render counters, request metrics, and graph DOM counts. JSON
artifacts are written under `apps/web/test-results/playwright`.

## Interaction Budgets

Certification budgets are defined in
`apps/web/src/features/programs/ui-performance-budgets.ts`. The required named
interactions are:

- `projectOpen`
- `viewSwitch`
- `createFlow`
- `deleteFlow`
- `createFolder`
- `deleteFolder`
- `runtimeDebugOpen`
- `runLogOpen`
- `graphSelect`
- `graphDrag`
- `graphSave`

Every captured interaction should include settled duration, request count,
long-task count, and timeout status. A performance report is not actionable if
it only says that text eventually became visible.

## Chrome Trace Checklist

Use this when a user reports lag that the automated suite does not explain.

1. Start Chrome with the fixture web panel open.
2. Open DevTools, then Performance.
3. Enable screenshots and memory if the issue involves pauses after repeated
   view switches.
4. Record exactly one interaction: route, click target, project fixture, and
   expected view.
5. Stop recording after the Studio has visually settled.
6. Export the trace and attach the matching Playwright JSON artifact when one
   exists.

Capture these fields in the bug report:

- Route, including `project`, `flow`, `subflow`, `view`, and `detail` query
  values when present.
- Fixture name: `empty`, `small`, `scale1k`, or `scale10k`.
- Interaction name from the budget list.
- Click target selector or visible label.
- Settled duration, request count, long-task count, and timeout flag.
- Last active request names from the settled-interaction metrics.
- Render counters for `AutomationStudioLive` and the active view.
- DOM node count and graph DOM entity count.

## Reading A Failure

- A duration failure with zero requests usually points at React render work,
  graph work, JSON rendering, layout, or main-thread event handlers.
- A request-count failure usually points at broad invalidation, retry loops,
  project-wide reloads, or view activation doing persistence.
- A long-task failure usually points at synchronous parsing, stringify work,
  validation, graph diffing, or too many mounted DOM entities.
- A timeout failure means the Studio never became quiet enough after the click;
  inspect active requests, DOM samples, and repeating render counters first.

Do not treat a loading spinner as a pass. The pass condition is that the shell
becomes interactive quickly and heavy data continues through scoped loading.

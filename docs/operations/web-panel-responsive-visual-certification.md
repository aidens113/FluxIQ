# Web Panel Responsive And Visual Certification

This procedure certifies the FluxIQ web panel against short, narrow, enlarged,
and ordinary browser layouts. It covers Automation Studio and every global
program. Source and component tests are useful prerequisites, but they do not
replace rendering the real interface in a browser.

## Viewport Matrix

| Project | CSS viewport | Purpose |
| --- | --- | --- |
| `desktop-chromium` | 1440x900 | Ordinary desktop composition. |
| `short-tablet-chromium` | 768x500 | Short desktop and landscape tablet constraints. |
| `mobile-chromium` | 320x568 | Minimum supported narrow drawer composition. |
| `zoom-200-chromium` | 720x450 at device scale 2 | A 1440x900 display with a 200-percent-equivalent CSS viewport. |

At every size, the release check rejects document-level horizontal overflow
and interactive controls trapped behind a non-scrollable clipping ancestor.
Content below a deliberate scroll owner remains valid only when that owner can
actually scroll to it.

## Scroll Ownership

Automation Studio owns viewport height at the route shell. The shell, pane
grid, tab frame, and graph/timeline frames clip; the project gate, hierarchy,
ordinary active view, and preview sheet are deliberate vertical scroll owners.
Tables may own horizontal scrolling. Graph and timeline canvases own their
viewport and must not inherit ordinary document scrolling.

Global programs use page scrolling at narrow widths. Bounded explorers such as
Docs navigation, database grids, task history, and code/table regions may own
explicit inner scrolling. Fixed 520-720 pixel minimum workspace heights are
prohibited because they make short viewports hide actions.

## Golden States

`apps/web/e2e/phase7-visual-fixture.spec.ts` renders deterministic browser
goldens for these states:

- default;
- loading;
- empty;
- error;
- populated;
- menu open;
- modal open;
- collapsed shell.

The 32 Windows Chromium baselines live under
`apps/web/e2e/phase7-visual-fixture.spec.ts-snapshots/`. They use the same CSS
manifests as the application and run the clipping/overflow assertion before a
snapshot is accepted. They protect shared visual contracts while the live
matrix verifies the actual routed components.

## Live Matrix

The operator starts the panel. Repository automation does not start or stop it.

```bash
pnpm --filter @fluxiq/web dev
```

With the deterministic fixture host configured as described in
`apps/web/e2e/README.md`, run:

```bash
pnpm --filter @fluxiq/web exec playwright test e2e/surface-matrix.spec.ts e2e/phase7-responsive-states.spec.ts
```

The live matrix opens all nine global programs and all twelve canonical Studio
views. It captures routed screenshots under `apps/web/test-results/playwright`
and checks the same clipping and horizontal-overflow contract at every project
viewport.

## Production Performance Gate

Development-server measurements are diagnostic only. Accepted Phase 8
performance measurements must target a production `next start` host and must
record both `FLUXIQ_E2E_BUILD_MODE=production` and
`FLUXIQ_E2E_NORMALIZED=true` in the generated certification artifact.

Build and start the fixture-backed production host in one PowerShell terminal:

```powershell
$env:FLUXIQ_IMPORTER_ROOT = "F:\!FluxIQ\apps\web\.e2e-host"
$env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
$env:FLUXIQ_E2E_BUILD_MODE = "production"
$env:FLUXIQ_E2E_NORMALIZED = "true"
pnpm --filter @fluxiq/web build
pnpm --filter @fluxiq/web start
```

In a second PowerShell terminal, mark the Playwright process with the same
certification environment and run the pinned desktop-Chromium performance gate:

```powershell
$env:FLUXIQ_E2E_BUILD_MODE = "production"
$env:FLUXIQ_E2E_NORMALIZED = "true"
pnpm --filter @fluxiq/web test:e2e:phase8:performance
```

Set `FLUXIQ_E2E_BASE_URL` in both terminals when the production host does not
use `http://127.0.0.1:3000`. An optional `FLUXIQ_E2E_ACCEPTED_BASELINE` path may
be supplied to the Playwright process for regression comparison. A report with
`normalized: false`, or with a build mode other than `production`, is not an
accepted performance result.

## Review Checklist

1. Confirm every command remains reachable at 320x568 and 768x500.
2. Confirm menus remain inside the viewport and modals retain a top-right Close action.
3. Confirm modal actions reflow without covering fields or requiring an unexplained second scrollbar.
4. Confirm tables scroll horizontally inside their labelled table region rather than widening the page.
5. Confirm hierarchy icon, disclosure, selection, and depth remain distinguishable.
6. Confirm long project, Flow, subflow, tab, and list names truncate usefully and expose the full text through `title`, tooltip, or detail.
7. Confirm loading, empty, error, and populated states are visually distinct and do not shift the shell.
8. Confirm keyboard focus remains visible after responsive reflow.

Any failed golden, trapped action, unexplained nested vertical scroll owner,
overlap, or lost label blocks certification.

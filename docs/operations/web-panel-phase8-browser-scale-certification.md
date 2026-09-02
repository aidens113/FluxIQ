# Web Panel Phase 8 Browser And Scale Certification

## Purpose

Phase 8 is the web panel release gate. It exercises production routes and real
interaction code across the complete browser and viewport matrix, checks the
fixed storage fixtures, and emits machine-readable accessibility, performance,
and resource evidence. Deterministic `page.setContent` tests remain useful for
CSS primitives, but they do not satisfy this gate.

## Fixed Fixtures

The source of truth is
`apps/web/e2e/support/phase8-fixture-contract.json`.

| Profile | Flows | Subflows | Hierarchy | Active nodes | Routes | Run events | Problems | Docs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Empty | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| Ordinary | 25 | 250 | 5,000 | 1,000 | 2,500 | 10,000 | 5,000 | 5,000 |
| Scale | 250 | 5,000 | 50,000 | 5,000 | 10,000 | 250,000 | 100,000 | 100,000 |

The fixture command resets only the marked `.e2e-host` directory. It always
materializes the exact Empty profile. Ordinary and Scale are explicit because
they are release data, not routine unit-test setup:

```powershell
$env:FLUXIQ_E2E_PHASE8_PROFILE = "all"
pnpm --filter @fluxiq/web fixture:e2e
pnpm --filter @fluxiq/web fixture:e2e:verify
```

Use `ordinary` or `scale` instead of `all` for a focused run. Flow, Subflow,
Router, graph, hierarchy, and runtime-action data use Automation Studio storage.
Fixture creation persists each Subflow and its graph before any Router that
references it. This order is part of the fixture contract even though runtime
compatibility projection also enforces Subflow-before-Router dependencies.
The large Problems and Docs corpora use one bounded NDJSON file per corpus,
avoiding hundreds of thousands of tiny files. `verify-fixtures.mjs` checks real
persisted counts and streams the NDJSON count checks.

Recording IDs are qualified by their owning project and are listed in that
project's fixture manifest entry. Phase 8 recordings are persisted through the
same recording service used by the application; a declared recording count is
never manifest-only data.

Fixture verification does not accept manifest counts as storage evidence. It
enumerates persisted Flow artifacts and offset-paged subflows, runs, recordings,
and adaptations; reads every Flow graph and router; checks each run's
independently projected action total; reads hierarchy storage; and streams the
Problems and Docs corpora. Page totals must remain stable and every page must
advance. Verification must also query the SQL projections directly: every
persisted Subflow must have one SQL Subflow row, its `graph_flow_id` must
resolve to a persisted SQL Flow and readable canonical graph, and every
canonical Router must have a SQL Router projection whose route and fallback
targets resolve. Canonical reads or manifest totals cannot substitute for these
checks.

`phase8-corpus-workflows.spec.ts` installs those persisted corpora at the real
program API boundaries and drives the production Problems and Docs views. It
requires the exact 100,000-record Scale stores, verifies the reported totals,
and enforces bounded Problems paging and Docs tree virtualization. A storage
count without this routed workflow is fixture evidence only, not UI scale
certification.

No scale record is created through the UI.

## Hosted Panel

Playwright never starts or stops the panel. Start a production build manually
against the fixture root:

```powershell
pnpm --filter @fluxiq/web build
$env:FLUXIQ_IMPORTER_ROOT = (Resolve-Path apps/web/.e2e-host)
$env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
$env:FLUXIQ_E2E_BUILD_MODE = "production"
$env:FLUXIQ_E2E_NORMALIZED = "true"
pnpm --filter @fluxiq/web start
```

Set `FLUXIQ_E2E_BASE_URL` when the host is not `http://127.0.0.1:3000`.
Credentials and the security PIN can be overridden with
`FLUXIQ_E2E_USERNAME`, `FLUXIQ_E2E_PASSWORD`, and
`FLUXIQ_E2E_SECURITY_PIN`.

## Browser Matrix

The Playwright config defines Chromium-compatible, Microsoft Edge (`msedge`
channel), and Firefox projects at 1440x900, 768x500, 320x568, and the
720x450/device-scale-2 constrained profile. Install prerequisites before the
release run:

```powershell
pnpm --filter @fluxiq/web exec playwright install chromium firefox
pnpm --filter @fluxiq/web exec playwright install msedge
```

Missing browser executables fail the requested project. They are never turned
into skips or passes by configuration.

Run the complete routed gate or focused matrices with:

```powershell
pnpm --filter @fluxiq/web test:e2e:phase8
pnpm --filter @fluxiq/web test:e2e:phase8:chromium
pnpm --filter @fluxiq/web test:e2e:phase8:cross-browser
```

## Coverage

- `phase8-hierarchy-workflows.spec.ts`: roving focus, nested disclosure,
  selection preservation, and disclosure focus ownership.
- `phase8-workspace-workflows.spec.ts`: tabs, menu, modal, drawer, combobox,
  hierarchy resize, dirty close, and focus return.
- `phase8-resilience-workflows.spec.ts`: failure/Retry, stale detail response,
  duplicate-submit exclusion, filtering, local pairing dismissal versus
  explicit Reject, and delayed project hydration. The hydration workflow must
  interact with workspace tabs/layout and hierarchy selection/disclosure before
  delayed durable and cache responses complete, then prove that neither surface
  is reverted and that an untouched surface can still hydrate.
- `phase8-accessibility-matrix.spec.ts`: axe critical-violation gate, semantic
  inventories, responsive geometry, and screenshots for all twelve canonical
  Studio views and all nine global programs.
- `phase8-performance-certification.spec.ts`: Empty, Ordinary, and Scale
  interaction and resource budgets on normalized desktop Chromium.

## Measurement Protocol

Normalized performance uses two warm-ups and ten measured repetitions. The
resource soak cycles through the same ten views fifty times. The report records
median, p95, maximum, long tasks, animation-frame durations, React commit
events, DOM nodes, active listeners/subscriptions, retained heap, warm views,
browser-cache bounds, environment metadata, and any update-depth warning.

Input feedback is measured entirely in the browser from click capture to the
animation frame after the destination tab exposes `aria-selected=true`. The
tab chrome acknowledges selection before the durable workspace command and
cold content work. Every sample still waits afterward for the authoritative
selection, activation placeholder, requests, DOM, animation frames, long tasks,
and passive effects to become quiet before the next sample begins. This keeps
feedback user-visible while preventing background work from one sample from
contaminating the next.

All ten views contribute input-feedback evidence. Warm-switch and core-click
long-task evidence use the retained subset equal to the certified desktop
warm-view cap of six; deliberately evicted views are cold activations, not warm
switches. The fifty-cycle soak continues to traverse all ten views. Final
resources are collected only after pending selection and activation reach the
same fully idle state.

Listener telemetry counts retained listeners only on `window`, `document`, and
`visualViewport`. It distinguishes capture and bubble registrations, maps an
original listener to any one-shot wrapper, decrements `{ once: true }` handlers
when the browser invokes them, and preserves explicit removal. Element-local
listeners on garbage-collected DOM are not treated as retained globals.

`FLUXIQ_E2E_PERFORMANCE_PROFILE=empty|ordinary|scale` runs one profile for
diagnosis and writes `diagnostic` scope. It cannot close the release gate. Only
an unfiltered report containing all three profiles and `certification` scope can
do so.

The absolute budgets are defined in
`phase8-certification.ts`. An optional accepted baseline JSON can be supplied
through `FLUXIQ_E2E_ACCEPTED_BASELINE`; a regression greater than 20 percent
fails in addition to the absolute budget. Normalized runs require
`FLUXIQ_E2E_BUILD_MODE=production` and browser extensions disabled.

Browser cache ownership is explicit: 500,000 characters per entry, twenty
projects, and 2,000,000 characters globally. The cache backend evicts oldest
projects and entries to maintain those limits.

## Accepted Normalized Evidence

The accepted production desktop-Chromium run completed all three profiles in
7.4 minutes with zero violations:

| Profile | Input median/p95/max (ms) | Warm median/p95/max (ms) | Entry p95 (ms) | Shell max (ms) | Frame p95 (ms) | Listeners | Subscriptions | Final DOM | Heap growth |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Empty | 11.5 / 13.7 / 13.7 | 9.9 / 12.4 / 12.4 | 75.6 | 10.6 | 16.7 | 170 -> 170 | 81 -> 81 | 1,450 | 2.65 MiB |
| Ordinary | 8.8 / 11.9 / 11.9 | 11.7 / 12.9 / 12.9 | 77.3 | 13.1 | 16.8 | 170 -> 170 | 84 -> 84 | 2,032 | 2.20 MiB |
| Scale | 8.5 / 12.8 / 12.8 | 9.1 / 12.9 / 12.9 | 89.1 | 11.0 | 16.7 | 170 -> 170 | 84 -> 84 | 2,121 | 2.01 MiB |

Every profile also recorded four clean warm views at final collection, zero
core-interaction long tasks, and zero critical accessibility violations. The
machine-readable source remains the generated
`phase8-performance-certification.json` artifact; this table is the authored
accepted summary, not a substitute for rerunning the gate after relevant work.

## Evidence And Failure Policy

Playwright writes traces, screenshots, video on failure, accessibility JSON,
and `phase8-performance-certification.json` under its test-results directory.
The HTML report remains available through `test:e2e:report`.

An offline host, unmaterialized Ordinary/Scale fixture, missing or unresolved
SQL Subflow or Router projection, unresolved Subflow graph, failed late-hydration
interaction workflow, missing Edge/Firefox binary, non-production normalized
host, budget breach, critical axe violation, or unavailable live route is a
failed or unexecuted release gate. None may be reported as passed based on unit
tests, canonical manifest counts, or deterministic markup fixtures.

Close the release gate with:

```powershell
pnpm check
pnpm test
pnpm build
pnpm docs:check
```

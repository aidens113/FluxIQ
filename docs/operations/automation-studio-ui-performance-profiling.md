# Automation Studio UI Performance Profiling

This runbook turns an Automation Studio responsiveness report into repeatable
browser evidence. Unit tests, type checks, and production builds validate code
boundaries; they do not certify interaction latency, rendering, retained heap,
or query behavior.

## Preconditions

Record these before comparing results:

- commit SHA and whether the worktree is dirty;
- operating system, CPU, memory, and power mode;
- Node.js, pnpm, and browser versions;
- development or production build mode;
- viewport size and device scale factor;
- fixture name;
- enabled extensions and DevTools state.

Use a clean browser profile for the certification run. A second run with the
normal profile may help reproduce a user report, but it is not the baseline.

## Fixture Setup

Generate deterministic browser fixtures from the repository root:

```powershell
pnpm --filter @fluxiq/web fixture:e2e
pnpm --filter @fluxiq/web fixture:e2e:verify
```

The default manifest is
`apps/web/.e2e-host/fixture-manifest.json`; set
`FLUXIQ_E2E_FIXTURE_ROOT` to use another location. The browser fixtures are:

- `empty`: project shell with no meaningful Studio data;
- `small`: representative Flows, Subflows, folders, instructions, runs,
  adaptations, graph nodes, and recording events;
- `scale1k`: 1,000 graph nodes, hierarchy folders, and recording events plus
  paged runtime data;
- `scale10k`: 10,000 graph nodes and recording events with larger catalogs.

`representative` aliases `small`, and `scale` aliases `scale1k` for older
tests.

The in-process deterministic fixture under
`automation-studio/testing/large-project-fixture.ts` is separate. It exercises
models and bounded view behavior with 2,048 entities in most catalogs, 8,192
actions and State facts, and 4,096 hierarchy nodes. It does not replace the
browser fixtures or database certification.

## Start The Panel

Repository automation and coding agents must not start the web panel. The human
operator performing the inspection or certification starts it manually:

```powershell
$env:FLUXIQ_IMPORTER_ROOT = (Resolve-Path apps/web/.e2e-host)
$env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
pnpm --filter @fluxiq/web dev
```

Do not measure the first interaction while Next.js is compiling. Open each route
once, wait for compilation to finish, reload, and then begin the recorded run.
For release evidence, use the build mode required by the release checklist and
state that mode in the report.

## Automated Browser Capture

In another shell:

```powershell
$env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:3000"
pnpm --filter @fluxiq/web test:e2e -- performance-baseline.spec.ts
```

The suite captures settled duration, request count, long-task count, DOM size,
render counters, request timing and payload metadata, graph DOM counts, and the
repeated-switch heap scenario. JSON evidence is written below
`apps/web/test-results/playwright`.

A loading spinner is not settled. The visible selection/loading surface must
publish immediately, and the measured operation settles only when required work
is quiet according to the test harness.

The modular architecture can be verified by source and unit tests: the client
entry is a facade, stores notify narrow selectors, canonical view registrations
come from one typed definition object, and the host resolves a component during
render. Those checks can catch regressions such as duplicate registries, eager
host construction, broad aggregate props, or repeating publications. They do
not measure the browser main thread. A source test that passes while a click
takes two seconds is still a browser performance failure.

## Required Interaction Matrix

Run the automated scenario and manually inspect these paths on `empty`,
`small`, and the applicable scale fixture:

| Interaction | Required observation |
| --- | --- |
| Project open/close/switch | Shell appears synchronously; stale project data never flashes or commits. |
| Root folder toggle | Expansion is immediate and performs no detail request. |
| Folder load more | Requests only the selected parent's next SQL sibling page; other branches retain their rows and page state. |
| Flow and Nodes selection | Selected hierarchy row changes immediately; detail may hydrate behind loading UI. |
| Settings and Instructions | Warm switching preserves exact local view state. |
| Tab picker open/type | Overlay and typing remain responsive and do not hydrate domain detail. |
| State cold open | Tab/loading surface appears before State detail. |
| Warm Flow/State switch | Existing mounted slots activate without refetch or parent navigation. |
| Runtime Debug open | Run list is SQL-paged; opening the view does not fetch every run detail. |
| Run row open | Only selected run detail/actions/events load, under bounded limits. |
| Graph select/drag | Selection is local, drag is smooth, and no project summary reload occurs. |
| Recording timeline navigation | At most 200 timeline/action-preview entries are materialized; moving selection reuses the ordered preview index. |
| Hierarchy resize | Transient pointer work remains local; persistence occurs at commit. |
| Create/delete Flow or folder | UI transaction commits immediately and only affected scopes refresh. |

Also test keyboard navigation, narrow viewport scrolling, the tab strip with
overflow, and a modal taller than the available viewport.

## Source Budgets

The only source of truth is
`apps/web/src/features/programs/ui-performance-budgets.ts`. At the time of this
document, key budgets include:

| Metric | Limit |
| --- | ---: |
| Project open | 1,000 ms |
| View/Flow switch | 100 ms |
| Create/delete Flow | 700 ms |
| Create/delete folder | 400 ms |
| Runtime list open | 500 ms |
| Run log open | 600 ms |
| Graph select | 75 ms |
| Graph drag | 350 ms |
| Graph save | 1,000 ms |
| Long task | 50 ms |
| Summary/detail request | 500/1,000 ms |
| Run detail payload | 250 KiB |
| Scenario requests | 24 |
| Instrumented component renders | 40 |
| Graph DOM entities | 900 |
| Repeated-switch retained heap | 32 MiB |

Interaction-specific request and long-task limits are defined beside those
budgets. Do not copy this table into test assertions; import the source
constants. If code and this table differ, the code is authoritative and this
document must be corrected.

## Manual Trace Procedure

Use the following procedure when certifying a release or investigating a failure:

1. Start with the clean profile and documented fixture/build conditions.
2. Open DevTools Performance and enable screenshots. Enable memory for repeated
   switching or suspected retention.
3. Record exactly one named interaction from pointer/key input until the UI and
   required requests settle.
4. Export the trace and attach the matching Playwright JSON artifact.
5. Record route bootstrap parameters, fixture, click target, settled duration,
   request count, long-task count/duration, timeout state, DOM count, graph DOM
   count, and active request names.
6. Record render counters for `AutomationStudioLive`,
   `AutomationStudioWorkspaceBoundary`, `AutomationStudioHierarchyBoundary`,
   `AutomationStudioPaneBoundary`, `AutomationStudioOverlayBoundary`, and
   `AutomationStudioSelectionBoundary`.
7. For a SQL-backed list, attach the query plan and returned row/payload count.
8. Repeat a failed interaction with CPU profiling and inspect the longest task,
   its call tree, and the component/store notifications immediately before it.
9. Repeat the accepted matrix at narrow desktop and mobile widths to verify
   scrolling and non-overlap.
10. Store artifacts with the commit SHA and environment record; do not describe
    the gate as passed without those artifacts.

For hierarchy evidence, record the requested `parentId`, cursor, returned row
count, and `hasMore` value and confirm the SQL plan uses the exact-parent
ordering path. For Recording evidence, record the persisted event count and
mounted preview row count separately; a 10,000-event fixture must not create
10,000 timeline or action-preview elements.

## Diagnosing Failures

- Slow with zero requests: inspect render fanout, selectors returning new
  references, graph conversion, JSON serialization, layout, and event handlers.
- Excess requests: inspect broad invalidation, retry loops, duplicate hydration,
  project-summary refreshes, and view activation persistence.
- Repeating renders: inspect no-op store publication, unstable effect
  dependencies, selection feedback, and legacy aggregate host props.
- A long task: inspect synchronous parsing, validation, graph diff/layout,
  unbounded mapping, and storage serialization.
- A timeout: inspect requests that never settle, repeating store notifications,
  cache retry loops, and mounted hidden views.
- Heap growth: compare retained project snapshots, event/subscription teardown,
  warm-view policy, caches, and graph instances across switch cycles.

When evaluating cache behavior, distinguish three cases in the evidence:

- a warm mounted view, which may preserve component-local state without a read;
- a UI-cache hit, which may restore workspace/sidebar state in background; and
- a domain-data cache or cold detail read, which may hydrate data after the
  selected view and loading surface are already visible.

Do not report a UI-cache hit as proof that domain detail is cached. Also verify
that local fallback and program-API cache work is outside the measured click
handler and that stale project generations cannot commit.

## Acceptance

Browser certification remains pending until every required interaction is
captured under stated conditions, all source budgets pass, SQL/detail boundaries
are confirmed, and the evidence is attached to the scale-certification report.
Passing `pnpm check`, `pnpm test`, or `pnpm build` alone is not browser
performance acceptance.

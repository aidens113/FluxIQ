# Automation Studio UI Performance Profiling

This runbook turns an Automation Studio responsiveness report into repeatable
evidence. It covers the implemented runtime and the probes needed to show that
presentation remains responsive while project data, cache work, and lazy
preloads continue asynchronously.

Passing source tests, unit tests, type checks, or a production build is
**deterministic engineering evidence**. It is not proof of browser latency,
render cost, retained heap, or frame pacing. Only a trace captured from the
running application under recorded conditions is **real-browser
certification**.

## Runtime Contracts Under Test

| Runtime area | Implemented contract | Browser failure signal |
| --- | --- | --- |
| Runtime/bootstrap | One stable runtime owns the Studio stores, workspace render store, request coordinator, and project generation owner for the mounted session. Disposal cancels requests and invalidates the generation. | Owners are recreated during selection, an old project result commits, or interactions remount the shell. |
| Presentation | Selection, tab activation, and hierarchy navigation commit synchronously through one presentation transaction. No-op writes do not publish. | Selection waits for a request, a click exposes intermediate states, or the same state republishes. |
| Shell | Header, hierarchy, editor, inspector, and timeline are memoized regions with local Suspense/error boundaries. | A view load blanks or rerenders unrelated regions, or a local error replaces the Studio. |
| Project data | Entities are normalized by kind and ID. Entity, detail, page, and resource changes publish exact scopes. | One entity update rebuilds broad collections or unrelated views. |
| Project queries | Query identity includes project, scope, normalized filter, normalized sort, page, and page size. Readiness and freshness belong to that query. | Pages overwrite each other, one load marks unrelated views loading, or a list needs an unbounded aggregate. |
| View readiness | Each view has loading, empty, error, ready, and stale-ready states guarded by project-generation and request tokens. | A cold view delays tab activation, warm data disappears during refresh, or stale work commits. |
| Cache/preload | Cache and preload jobs queue after paint, yield to pending input and active foreground work, and are cancellable. | Serialization runs in a click task, work starts before paint, or obsolete work continues. |
| Flow canvas | Drag, marquee, hover, and viewport previews use an imperative controller and coalesce to animation frames; settled state publishes at gesture completion. | Pointer movement causes a React commit per event, concurrent frames queue, or settlement publishes twice. |

## Evidence Classes

Keep evidence labeled; do not substitute one class for another:

1. **Deterministic tests** prove controlled contracts such as stale-token
   rejection, transaction coalescing, exact selector notifications, scheduler
   cancellation/yielding, and one-frame canvas coalescing.
2. **Source and architecture checks** prove ownership and dependency rules.
3. **Automated browser evidence** measures interaction and settle duration,
   requests, long tasks, DOM size, render counters, graph entities, and
   supported Chromium heap usage.
4. **Manual browser traces** expose handler stacks, frame gaps, style/layout,
   paints, background work timing, and retained objects.

The first two classes may pass while a browser interaction is still slow.

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

The Playwright harness enables instrumentation before application code runs. In
a manual development session, enable it before reloading:

```js
window.__FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__ = true;
window.__FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__ = true;
```

The development Data Inspector exposes active requests, API timings, render
metrics, long tasks, cache estimates, graph counts, counters, subscriptions,
worker queues, and preload generations. Relevant development event channels are
`ui-render:metric`, `ui-long-task:metric`,
`automation-studio:performance-counter`,
`automation-studio:cache-metric`, `automation-studio:graph-metric`,
`automation-studio:background-work`,
`automation-studio:worker-queue-metric`, and
`automation-studio:subscription-metric`.

`automation-studio:background-work` is development-only. Its `queued`,
`yielded`, `started`, `finished`, and `cancelled` phases support scheduler
diagnosis; absence from a production trace is expected.

## Automated Browser Capture

In another shell:

```powershell
$env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:3000"
pnpm --filter @fluxiq/web test:e2e -- performance-baseline.spec.ts
```

The suite records operation duration separately from settle duration and
captures request count, last active request names, long-task count/duration,
DOM samples, render metrics, request timing and payload metadata, graph DOM
counts, and repeated-switch heap evidence. JSON evidence is written below
`apps/web/test-results/playwright`.

A loading spinner is not settled. The selected tab/row and its local loading or
stale-ready surface must publish immediately. Settled means relevant requests
are quiet, DOM samples are stable, and the configured animation-frame window
has elapsed.

Architecture tests can catch duplicate runtime owners, broad aggregate props,
unstable publications, or forbidden dependencies. They do not measure the
browser main thread. A source test that passes while a click takes two seconds
is still a browser performance failure.

## Concrete Runtime Probes

Run these probes on empty, small, and the applicable scale fixture.

### Stable Bootstrap And Project Generation

1. Record project open, switch, close, and same-project reopen.
2. Confirm ordinary selections do not recreate runtime/store owners or remount
   the shell.
3. Start a delayed detail read, switch projects, and retain its request and
   readiness diagnostics.
4. Confirm the obsolete result never changes the new project's hierarchy,
   active view, normalized entities, or query readiness.

Retain interaction metrics, shell-region render counts, the request
generation/token sequence, and a screenshot or trace marker showing the new
project before the old request resolves.

### Synchronous Presentation Transactions

Record a hierarchy-row click, tab click, tab close, and breadcrumb navigation.
For each input, the selected row/tab must change in the input task or next paint
without waiting for domain data. A transaction may notify multiple exact
scopes, but observers must see one coherent final presentation state.

Retain input-to-paint timing, render counts, and the event-task call tree.
Repeating publications, oscillating tabs, or effect-driven correction are
failures.

### Isolated Shell Regions

Capture render counters for header, hierarchy, editor, inspector, and timeline
while switching a view and updating one selection. Confirm unrelated regions
have zero commits where the certification scenario forbids them. In a
non-release environment, exercise a local loading and error state; the rest of
the shell must remain usable.

Retain per-region render counts and screenshots of local loading, empty,
stale-ready, and error surfaces. Do not inject failures into release data.

### Normalized Project And Query Stores

Open two pages or filters of the same collection, then update one entity.
Record each query's project, scope, filter, sort, page, and page size. Confirm
that IDs, total, loading, freshness, cursor, and error remain query-local and
that an entity update rerenders only exact entity/collection consumers.

For SQL-backed lists, retain the query plan, bind values, returned row count,
payload bytes, stable ordering, and cursor/offset. Browser-side slicing of an
unbounded response fails this probe.

### Local View Readiness

For a cold view, confirm immediate tab activation followed by a local loading,
empty, or ready surface. For a warm view, trigger refresh and confirm retained
data remains visible with data-view-state set to stale-ready. Switch away
during a read and confirm its project-generation/request token rejects
completion.

Retain state screenshots or DOM snapshots, interaction metrics, and the
generation/token sequence for the cancellation case.

### After-Paint Cache And Lazy Preload Scheduler

On project open, begin typing, dragging, or switching views while preload/cache
work is queued. Development diagnostics should show background work queued
after paint and yielded while input or active foreground work is pending.
Project switch or disposal must cancel obsolete work; active view reads have
priority.

In a Performance trace, cache serialization and preload must not be part of the
initiating click task. Work must begin after the selected surface paints,
remain bounded, and leave opportunities for input and frames. A UI-cache hit,
warm mounted view, domain-cache hit, and cold detail read are separate results.

Retain the development background-work phase sequence and a real-browser trace
showing input, first paint, background start, task duration, yield behavior, and
cancellation. The development event order does not establish production
timing.

### Imperative Frame-Coalesced Canvas

Record node selection, node drag, right-button marquee, hover, pan/zoom, and
save. Raw pointer moves may update the controller many times, but previews must
flush at most once per animation frame. Settled node or marquee state publishes
once at gesture completion.

Retain trace screenshots with frame boundaries, pointer-event and
animation-frame call stacks, graph/render counters, mounted graph entity count,
and save request count. A React render for every pointer event or duplicate
settlement fails this probe.

## Required Interaction Matrix

Run the automated scenario and manually inspect these paths on `empty`,
`small`, and the applicable scale fixture:

| Interaction | Required observation |
| --- | --- |
| Project open/close/switch | Stable shell appears synchronously; stale project data never flashes or commits. |
| Root folder toggle | Expansion is immediate and performs no detail request. |
| Folder load more | Requests only the selected parent's next SQL sibling page; other branches retain their rows and page state. |
| Flow and Nodes selection | Selected hierarchy row changes immediately; detail hydrates behind a local readiness boundary. |
| Settings and Instructions | Warm switching preserves exact local view state. |
| Tab picker open/type | Overlay and typing remain responsive and do not hydrate domain detail. |
| Cold view open | Tab activates before its local loading/empty/ready state resolves. |
| Warm view refresh | Existing data remains visible as stale-ready while refreshing. |
| Runtime Debug open | Run list is SQL-paged; opening the view does not fetch every run detail. |
| Run row open | Only selected run detail/actions/events load, under bounded limits. |
| Graph select/drag/marquee | Pointer previews are frame-coalesced and no project summary reload occurs. |
| Recording timeline navigation | At most 200 timeline/action-preview entries are materialized; moving selection reuses the ordered preview index. |
| Hierarchy resize | Transient pointer work remains local; persistence occurs at commit. |
| Create/delete Flow or folder | Presentation commits immediately and only affected data/query scopes refresh. |

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

1. Record the commit, environment, fixture counts, build mode, and clean-profile
   conditions.
2. Warm compilation/routes, reload, and wait for a quiet baseline.
3. Open DevTools Performance and enable screenshots. Enable memory only for
   repeated switching or retention work because collection affects timings.
4. Record one named interaction from pointer/key input through its first visual
   commit and settled state.
5. Export the trace and attach the matching Playwright JSON artifact.
6. Record operation duration, input-to-paint, settle duration, request count and
   names, long-task count/duration, timeout state, DOM delta, and graph DOM
   count.
7. Record render counters for `AutomationStudioLive`,
   `AutomationStudioWorkspaceBoundary`, `AutomationStudioHierarchyBoundary`,
   `AutomationStudioPaneBoundary`, `AutomationStudioOverlayBoundary`, and
   `AutomationStudioSelectionBoundary`.
8. Mark the presentation commit, readiness transition, background-work start,
   and settled data in the trace or accompanying timeline.
9. For a SQL-backed list, attach the query plan, bind values, returned rows,
   payload bytes, cursor, and total/hasMore metadata.
10. Repeat a failure with CPU profiling and inspect the longest task's call tree,
   bottom-up view, React commits, and store/diagnostic events before it.
11. Repeat the accepted matrix at narrow desktop and mobile widths to verify
   scrolling and non-overlap.
12. Store artifacts with the commit SHA and environment record; do not describe
    the gate as passed without those artifacts.

For hierarchy evidence, record the requested `parentId`, cursor, returned row
count, and `hasMore` value and confirm the SQL plan uses the exact-parent
ordering path. For Recording evidence, record the persisted event count and
mounted preview row count separately; a 10,000-event fixture must not create
10,000 timeline or action-preview elements.

## Diagnosing Failures

- Slow with zero requests: inspect presentation publication count, broad
  selectors, shell-region fanout, graph conversion, JSON serialization,
  layout, and the input handler's call tree.
- Selection waits for data: verify the input performs a synchronous
  presentation transaction and readiness belongs only to the selected view.
- Excess requests: inspect broad invalidation, retry loops, duplicate hydration,
  project-summary refreshes, and view activation persistence.
- Repeating renders: inspect no-op store publication, runtime owner recreation,
  unstable selector/effect identity, and cross-store selection feedback.
- A long task: inspect synchronous parsing, graph diff/layout, unbounded
  mapping, storage serialization, and whether cache/preload ran before paint.
- A timeout: inspect requests that never settle, repeating store notifications,
  cache retry loops, and mounted hidden views.
- Pointer lag: compare raw pointer events with animation-frame flushes and React
  commits; inspect forced layout and duplicate gesture settlement.
- Heap growth: compare retained runtime owners, project/query snapshots,
  subscriptions, readiness owners, warm views, caches, and graph instances.

When evaluating cache behavior, distinguish three cases in the evidence:

- a warm mounted view, which may preserve component-local state without a read;
- a UI-cache hit, which may restore workspace/sidebar state in background; and
- a domain-data cache or cold detail read, which may hydrate data after the
  selected view and loading surface are already visible.

Do not report a UI-cache hit as proof that domain detail is cached. Also verify
that local fallback and program-API cache work is outside the measured click
handler and that stale project generations cannot commit.

## Acceptance

Browser certification remains not-run or blocked until every required
interaction is captured under stated conditions, all source budgets pass,
SQL/detail boundaries are confirmed, and evidence is attached to the
scale-certification report.
Passing `pnpm check`, `pnpm test`, or `pnpm build` alone is not browser
performance acceptance.

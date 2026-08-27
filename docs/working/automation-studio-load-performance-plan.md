# Automation Studio Load Performance Plan

Automation Studio must treat project open, pane switching, runtime debug, and
Flow browsing as summary-first workflows. A normal UI refresh must not load every
recording, timeline, Flow, project artifact, publication, proposal, or runtime
trace in a project. Detail payloads are loaded only after the user opens the
specific inner view that needs them.

This plan captures the current load-path audit and the implementation sequence
for removing recurring browser stalls.

## Problem

The current workspace refresh path mixes lightweight summary endpoints with
full-artifact endpoints. `AutomationStudioLive.refreshProjectRuntimeState`
starts with `get-project-workspace-summary`, but it also immediately calls
`list-project-artifacts`, `list-flows`, `list-normalized-timelines`,
`list-native-node-definitions`, and `list-published-flow-nodes`. The summary
state can render quickly, then heavier promises settle and replace the summary
state with large payloads, causing the browser to parse, diff, stringify, and
render objects the active view may not need.

The backend has the same pattern in several places:

- broad repository `list()` calls followed by in-memory project filtering;
- full directory scans for project artifacts;
- full proposal and publication hydration during ordinary node/Flow listing;
- snapshot endpoints returning complete canonical stores;
- raw JSON rendering and graph signatures on the client over large nested
  objects.

Runtime debug run listing has already moved in the right direction: previous
runs are backed by a per-project SQLite summary index with SQL `limit`/`offset`
pagination, and full run traces are fetched only when a run log is opened. The
rest of Automation Studio should follow the same contract.

## Goals

- Project open is summary-only by default.
- Lists use SQL-level project scoping and pagination where data can grow.
- Detail views fetch one selected artifact, Flow, timeline, recording, or run.
- Runtime debug keeps its list/detail split and never renders all JSON eagerly.
- Expensive derived views are cached, scoped, or explicitly user-triggered.
- Client view models avoid stringifying large raw payloads during normal render.

## Non-Goals

- Do not remove legacy artifact compatibility in this plan.
- Do not move domain-specific importer behavior into FluxIQ.
- Do not replace the Automation Studio layout or view hierarchy.
- Do not make generated pipeline artifacts editable project source.

## Phase 1: Stop Broad Loads On Project Refresh

Change `AutomationStudioLive.refreshProjectRuntimeState` so the default refresh
path only requests summary data required by the visible workspace shell.

Status: in progress. The web refresh path no longer starts the full
`list-project-artifacts`, `list-flows`, `list-normalized-timelines`,
`list-native-node-definitions`, or `list-published-flow-nodes` calls during
ordinary project refresh. Flow details and editor node definitions are now
loaded from the relevant editor interaction path instead of being global cache
warmers.

Required changes:

- Keep `get-project-workspace-summary` as the primary project-open endpoint.
- Keep runtime run summaries paged through `list-runtime-sessions` with
  `summaries: true`, `limit`, and `offset`.
- Remove `list-project-artifacts` from default project refresh.
- Remove full `list-flows` from default project refresh once Flow summaries are
  available from the workspace summary.
- Remove `list-normalized-timelines` from default project refresh; introduce a
  timeline summary endpoint if a visible list needs it.
- Load native and published node definitions only when the Flow editor or node
  palette is visible.
- Preserve stale detail state until its owner view requests a refresh; do not
  use detail endpoints as global cache warmers.

Acceptance criteria:

- Opening a project does not call `list-project-artifacts`.
- Opening a project does not call full `list-flows`.
- Opening a project does not load full normalized timeline payloads.
- Runtime Debug still shows previous runs immediately from paged summaries.
- Existing project hierarchy and Flow selection can render from summaries.

## Phase 2: Add Summary/Detail API Contracts

Add explicit list/detail contracts for large Automation Studio resources. Broad
list endpoints may remain for compatibility and non-UI tools, but the web
workspace must prefer summary/page endpoints.

Status: in progress. Added `list-flow-summaries`,
`list-normalized-timeline-summaries`, and `get-normalized-timeline` contracts.
The web timeline view now discovers a recording's latest normalized timeline
through summaries and then fetches only that timeline detail. Existing
`get-flow` is now used by the Flow editor path to hydrate a selected summary
row.

Endpoints to add or formalize:

- `list-flow-summaries`: project-scoped, paged, sorted by `updatedAt`.
- `get-flow`: one canonical Flow detail by `projectId` and `flowId`.
- `list-normalized-timeline-summaries`: project-scoped, paged, sorted by
  `generatedAt` or recording time.
- `get-normalized-timeline`: one normalized timeline detail.
- `list-recording-summaries`: project-scoped, paged if recording count can grow.
- `get-recording-session`: one recording detail; timeline payload may need its
  own paged event endpoint later.
- `list-project-artifact-summaries`: legacy task/routine/config/flow inventory
  without embedded graphs or full documents.
- `get-project-artifact`: one legacy artifact detail.
- `list-flow-publication-summaries`: project/scope filtered without loading all
  project Flows.

Acceptance criteria:

- Every growable workspace list has a summary contract.
- Every summary row has a stable ID for a detail fetch.
- No summary endpoint embeds full graphs, timelines, traces, or raw object
  payloads.
- Detail endpoints are used only by inner views that are open.

## Phase 3: Move Growable Queries To SQL-Level Scope And Pagination

Replace repository `list().filter(...)` usage on growable stores with scoped
repository methods.

Status: in progress. Canonical Flow listing now reads the project Flow index and
hydrates only those Flow IDs instead of calling global `repositories.flows.list()`
and filtering by `projectId`. Publication and dependency paths that already have
a project ID now load project/same-scope Flow records instead of calling
`loadAllProjectFlows()` for ordinary project-scoped views.

Hotspots from the audit:

- `listCanonicalFlowArtifacts(projectId)` loads project flows, then calls
  `repositories.flows.list()` and filters by `projectId`.
- `listProjectNormalizedTimelines(projectId)` calls
  `repositories.normalizedTimelines.list()` and filters by
  `metadata.projectId` when object storage is enabled.
- `listFlowPublicationRecords()` calls `loadAllProjectFlows()` and then scans
  all persisted Flow records.
- The legacy service `snapshot()` can return complete canonical stores for
  controlled compatibility callers only. Automation Studio does not invoke it
  during browser bootstrap, and the HTTP snapshot handler always requests
  `includeCanonical: false`.

Repository work:

- Add indexed project fields for Flow, normalized timeline, recording, runtime,
  and publication records where missing.
- Add `listPageByProject(projectId, { limit, offset, orderBy })` or equivalent
  typed methods.
- Add count metadata to paged responses.
- Keep file/object-store fallback behavior, but prefer index summaries over
  full document reads.
- Preserve the lightweight bootstrap boundary: project chooser loads only
  project summaries, project open loads scoped workspace summaries, and no
  browser route may use a complete canonical snapshot as a cache warmer.

Acceptance criteria:

- Project-scoped Flow listing does not call global `repositories.flows.list()`.
- Project-scoped timeline listing does not call global
  `repositories.normalizedTimelines.list()`.
- Publication listing for one project/scope does not call `loadAllProjectFlows`.
- New paged methods have unit coverage for `limit`, `offset`, sorting, and
  project filtering.

## Phase 4: Make Detail Views Lazy And Virtualized

Each inner view should own its detail data.

Status: in progress. Runtime Debug already uses summary/detail split. The Flow
editor now hydrates the selected Flow through `get-flow`, and the timeline view
hydrates only the selected recording's latest normalized timeline. The State
View raw JSON panel now requires explicit expansion before `JSON.stringify`
runs.

Runtime Debug:

- Keep the previous-runs list as the first inner view.
- Keep a single row-click path as the only interaction that fetches a full runtime session.
- Keep action logs paged or virtualized.
- Keep detailed JSON behind per-entry expansion.

Flows:

- Flow list uses summaries.
- Opening a Flow fetches one detail payload.
- Flow dependency/publication info loads after the Flow detail is selected.

Recordings and timelines:

- Recording lists use summaries.
- Timeline/event lists use pages or virtualization.
- Raw event JSON is expandable per entry.

State view:

- `StateRawPanel` should not stringify `model.raw` during normal render.
- Raw state JSON should render only after the user opens the raw panel or
  expands a source.

Acceptance criteria:

- Large run logs, recordings, and timelines do not lock the browser on open.
- JSON detail expansion affects only the selected row/source.
- Switching panes does not trigger unrelated detail refetches.

## Phase 5: Reduce Client-Side Serialization And Diffing

Large backend payloads currently become worse when the client builds signatures
with `JSON.stringify`.

Status: in progress. Graph editor definition signatures now use concise IDs for
ports and parameters, and graph dirty signatures use a trimmed node-data shape
instead of serializing the full `data` object. Raw State View payloads are no
longer stringified during normal render.

Required changes:

- Replace graph dirty checks over full node `data` with stable structural
  signatures that include IDs, positions, edge endpoints, versions, and edited
  parameter values only.
- Memoize native node definition signatures from concise metadata.
- Avoid passing raw detail objects through global workspace state when an inner
  view can own them.
- Do not store full runtime sessions in the same state array used by run
  summaries.

Acceptance criteria:

- Graph editor render does not stringify full graph node payloads every render.
- State view render does not stringify raw payloads until requested.
- Runtime session summary state and runtime session detail state remain
  separate.

## Phase 6: Instrument And Guard Against Regression

Add lightweight instrumentation around Automation Studio API calls and render
hotspots so broad loads are visible in development and tests.

Status: pending. This pass validated the new summary/detail and scoped-load
work with existing typechecks, targeted service tests, web tests, builds, and
docs reference generation. Dedicated regression tests that assert project open
does not call broad detail endpoints still need to be added in a follow-up
slice.

Implementation options:

- Log endpoint name, response byte size, and elapsed time in development builds.
- Add tests that assert project open does not call banned full-detail endpoints.
- Add service tests proving summary endpoints do not read full artifacts.
- Add repository tests for scoped SQL pagination.
- Add fixture-based performance tests for large projects with many recordings,
  timelines, Flows, and runtime runs.

Acceptance criteria:

- A test fails if default project open calls `list-project-artifacts`.
- A test fails if default project open calls full `list-flows`.
- A test fails if runtime run list fetches full traces.
- Large fixture project open completes with only summary payloads.

## Implementation Order

1. Update `refreshProjectRuntimeState` to remove broad default calls.
2. Add missing summary/detail endpoints needed by visible inner views.
3. Move Flow and timeline list paths to SQL-level project-scoped pagination.
4. Scope publication/native node loading and cache immutable derived data.
5. Move detail payloads into inner view-owned state.
6. Remove eager JSON/string signatures from render paths.
7. Add regression tests and development instrumentation.

## Validation

For each phase with code changes, run the targeted package checks first, then
the broader validation when feasible:

```bash
pnpm --filter fluxiq check
pnpm --filter fluxiq test
pnpm --filter @fluxiq/web check
pnpm --filter @fluxiq/web test
pnpm --filter @fluxiq/web build
pnpm docs:check
```

Do not rely on manual UI feel alone. Each fixed path should have a test that
proves summaries stay summaries and project open does not call full-detail
endpoints.

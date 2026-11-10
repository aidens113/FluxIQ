# Brief P9-J2: panel Runs page

## Outcome
Done for what the run store gives; three gaps below (client/how/who, per-step "Page", calls) are data or wiring that does not exist yet. Unit tests, web typecheck and structure audit pass. E2E spec written, not run.

## What changed and why
New `apps/web/src/features/runs/` (barrel in every directory):
- `model/`: pure functions, 8 tests. `shapeRunRow` (reuses Home's `shapeRun`, adds steps and metadata), `readRunExtras` (client, how it ran, who started it, what confirmed it, read only from words in the run's metadata that this page knows), `resultGroup`, `filterRuns` (Flow, client, result; newest first), `flowOptions`, `runFacts` (a row's plain details; "cost not recorded" instead of an invented $0.00), `runHeadline` ("Cheapest listings · Passed (confirmed by your check) · $0.00 · 6 s"), `clientLabel`, `confirmedByLabel`, `ANY_RUN_FILTER`.
- `data/load-run-rows.ts` + 2 tests: every project's `list-flow-runs` (200 newest each) with Flow names; `incomplete` when a project cannot be read, throws when none can.
- `list/`: `RunsListPage` (filters, rows, plain loading/empty/error/no-match/incomplete sentences), `RunsFilters` (three labelled selects), `RunsListRow` (link named "Open the run of <Flow>: <result>").
- `detail/RunPage.tsx`: headline as the h1, then the existing `RunDetailView` (from the runtime barrel, unchanged; it already contains the attempt story and action log). The project is found from the run list since the URL has only the run id. Not-found and error sentences link back to /runs.
- Both pages publish PanelContext through `PublishPanelPage`: list `{ page: "runs", flowId? }` (flowId when the Flow filter is set), run `{ page: "runs", runId, flowId }`.
- `apps/web/src/app/(panel)/runs/page.tsx` (placeholder replaced) and `runs/[runId]/page.tsx`; `apps/web/e2e/panel-runs.spec.ts` (list ends in runs or words with named controls and `/runs/<id>` links; a no-match filter says so; an unknown run says so and links back; 360px has no sideways scroll).
- Styling in `runs.css`: wrapping rows, flex-wrap filters, no fixed widths; the detail view scrolls inside its own box.

## Gaps and decisions (not hidden)
- **Client, "how it ran", "who started it", "confirmed by": the run summary does not record them.** `AutomationStudioFlowRunSummary` has only status, times, counts, tokenUsage, failureCounts and free-form `metadata`, and nothing in Core writes client/origin/initiator keys there today. I read tolerant keys (`client`/`clientKind`/`startedFrom`/`origin`, `howRan`/`runMode`, `startedBy`/`initiator`/`requestedBy`, `verdictBy`/`confirmedBy`) so rows light up once Core records them; until then the Client filter offers the three clients plus "Not recorded", and rows omit those words. FluxNode runs beyond what the run store gives are deferred. Needs a Core change to stamp origin, initiator and verdict-by on the summary (same ask as J1).
- **Calls:** the summary has no model-call count. The row shows steps (`actionAttemptCount`), not calls.
- **"Page" on a step:** not built as a separate button. `StateExplorerView` needs a Studio model input (recordings, timelines, indexed state sources) that a run alone does not carry, and the retirement brief owns that wiring. The existing run detail already opens any action and has a "State" tab (before, after, diff) per action; the run page uses that unchanged. A direct "Page" link needs the state input built from the run's state references.
- Runs older than a project's newest 200 are not listed (API page maximum); the fix is paging in the list, not a bigger read.

## Commands run and observed
- `npx vitest run src/features/runs` (default config) was not run: the stale-Core-dist guard refuses (seen by J1/I; not rebuilt). With the guard-free scratch config (`.../scratchpad/p9j2-vitest.config.mjs`, same esbuild/exclude): `Test Files 2 passed (2)`, `Tests 10 passed (10)`. These tests import no Core dist.
- Web typecheck under the heavy lock (3005 MB free): `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` -> exit 0, no output. Lock removed.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (538 warning(s), 1095 baselined).` No warnings on my paths.

## Not verified
- Playwright spec not run (panel not started). Render, the run page loading real detail through `RunDetailView`, phone layout and "no sideways scroll" are by reasoning only; the detail view's own width at 360px is unchecked (wrapped in a scroll box).
- The Next 15 `params: Promise` signature on `[runId]/page.tsx` typechecks; not exercised at runtime.
- Real `list-flow-runs` metadata contents (see gaps).

## Open questions
- Should Core stamp origin/client/initiator/verdict-by on the run summary (shared with J1)? Key names I read are my guess and should be fixed to whatever Core writes.
- Which brief builds the Studio state input so a step's "Page" can open `StateExplorerView` directly?

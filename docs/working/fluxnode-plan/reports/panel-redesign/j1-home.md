# Brief P9-J1: panel Home page

## Outcome
Partial: code, unit tests and structure audit are done and pass; the web typecheck was not run (memory), and the e2e spec is written, not run.

## What changed and why
New `apps/web/src/features/home/` (barrel in every directory):
- `model/`: pure shaping, with `tests/home-model.test.ts` (12 tests). `shapeRun` (list-flow-runs row to `HomeRun`), `todaySummary` (runs since local midnight, passed, failed, spend), `recentRuns` (newest 10), `runResult`/`runDuration`/`agoText` (plain words), `readClients`/`connectedRows`, `readThreads`, `needsYouItems`. Rows without ids are dropped; nothing is invented.
- `data/`: `Resource<T>` (loading | error | ready), `useResource` (loads now and every 30 s; a failed refresh turns the section to its error), `load/` with `loadEngine` (`/api/ready`), `loadClients` (runtime `list-clients`), `loadThreads` (studio `list-conversations`, no project = all, open only), `loadRuns` (studio `projects`, then per project `list-flow-runs` newest 200 and `list-flow-summaries` for Flow names). `load/tests/runs.test.ts` (3 tests): joins projects, marks `incomplete` when one project fails, throws when none can be read.
- `sections/`: `HomeSection` (named region, own loading/empty/error), `HomeEngine`, `HomeToday`, `HomeConnected`, `HomeNeedsYou`, `HomeRecentRuns`. One run read is shared by Today, Needs you and Recent runs; each section still shows its own state. Needs you shows an error if either of its two reads failed rather than half a list.
- `HomePage.tsx` (publishes `{ page: "home" }` via `PublishPanelPage`), `home.css` (auto-fit grid, no fixed widths, rows wrap at phone width), `index.ts`.
- `apps/web/src/app/(panel)/page.tsx` now renders `HomePage`.
- `apps/web/e2e/panel-home.spec.ts`: five named regions finish loading with words in them; all controls on Home have names and "All runs" goes to /runs; Needs you links point to /flows or /runs; 360px has no sideways scroll.

## Decisions and gaps (not hidden)
- **Engine version: left out.** No endpoint returns it (`/api/ready` is a bare 200/503, the runtime snapshot has `runtimeId` only, discovery has only `fluxiqDiscoveryVersion`). Engine shows Running / Not ready yet / could not tell. Needs a Core endpoint if wanted.
- **Spend today:** summed from `tokenUsage.estimatedCostUsd` on today's run summaries; shown only when at least one run recorded a cost, else omitted. It is the recorded cost of runs, not a ledger total; the top bar still shows "—" (not mine).
- **"How it ran" (replayed/explored) and "who started it": left out.** `AutomationStudioFlowRunSummary` carries neither (only status, times, counts, tokenUsage, failureCounts, metadata). Each row shows result, Flow name, cost ("cost not recorded" when absent), how long ago and duration. Needs the run summary to record origin and initiator in Core.
- **Repeated step failures:** summaries have no per-step data, so "needs you" lists a Flow whose newest runs failed in a row (2 or more), linked to its latest run: `"X" failed its last 3 runs`. Step-level wording ("Step 5 failed 3 times") needs that data in the summary.
- **Waiting questions:** open threads with `pendingAskCount > 0`; link `/runs/<id>` for run subjects, `/flows/<id>` for flow/build subjects (build's subject id is assumed to be the Flow id), `/flows` for project/panel threads.
- **Run window:** `list-flow-runs` is read newest first, 200 per project (API page maximum). A project with more than 200 runs today would undercount Today; the fix is an endpoint that counts by day, not a bigger page. Flagged here rather than hidden.
- Local-day boundary uses the browser's timezone.
- No change needed in `features/panel-shell`.

## Commands run and observed
- `cd apps/web && npx vitest run src/features/home` -> refused: `apps/web tests: Core's library build is 326 minute(s) behind its source.` Not rebuilt, per the brief.
- Same tests with the guard-free scratch config (`.../scratchpad/p9j1-vitest.config.mjs`, same esbuild/exclude as before) -> `Test Files 2 passed (2)`, `Tests 15 passed (15)`. These tests import no Core dist, so the stale build does not affect them (page-level components that import `panel-shell` were not rendered in tests).
- `node scripts/structure-audit.mjs` (root) -> first run failed 10 (barrel imports, `load-` prefix); fixed by importing barrels and moving to `data/load/`; final: `structure-audit: passed (538 warning(s), 1095 baselined).`
- Web typecheck: **not run: memory** (free memory read 2770, 2887, 2601 MB, below 3000; no lock taken). The supervisor runs it. Risk spots: JSX components were never compiled; `HomeSection` generic inference with `emptyText=""`; `studio.post<unknown>` payload narrowing in `load/runs.ts`.

## Not verified
- Typecheck, Playwright spec (panel not started), real answers from `list-clients` (assumed array or `{clients}`), `list-conversations` with `projectId: null` under the web transport's endpoint policy, and `list-flow-summaries` for browser use (not on the blocked list in `data-request-policy.ts`).
- Runtime program id `runtime` is reachable through `useProgramApi("runtime")` as the other programs are; not exercised.

## Open questions
- Whether the Engine card should call a new Core endpoint for version and spend today (one answer could also feed the top bar).
- Whether Core should add origin ("replayed", "explored") and initiator to the run summary for the Recent runs row.

# Report: core-web-test-health

Worker: `core-web-test-health` · Repository: FluxIQ Core · Date: 2026-09-11
Brief: `### Brief: core-web-test-health` in
`docs/working/mvp-week1-web-automation-reliability-plan.md`.

## Outcome

Done. All five failures existed before this work unit. They fail the same way
on a clean `git archive HEAD` copy (`e522f17`).

In every case the test was wrong and the code was right. Each test asserts a
view-id form that predates object-qualified workspace instance IDs. Commit
`2a6b8a5` (2026-09-04) introduced those IDs, and
`docs/architecture/automation-studio/workspace.md` documents them as the
current design.

I updated the five tests to that contract:

- No source file changed.
- No assertion was loosened, and two were added.
- `pnpm --filter @fluxiq/web test` → `Test Files 227 passed (227)`,
  `Tests 1146 passed (1146)`.
- `pnpm check` exits 0.

## What changed and why

### The shared cause

- **The instance-ID helpers.** In `views/view-registry.ts`,
  `automationStudioObjectViewInstanceId(viewId, objectId)` returns
  `<base>::object::<encodeURIComponent(objectId)>` when the view's
  `functionality.scope` includes `flow` or `subflow`. Otherwise it returns
  the base ID. `automationStudioViewBaseId` strips the suffix.
- **Scopes in `views/canonical-view-definitions.tsx`:**
  - `flow-router` is `["flow"]`.
  - `runtime-debug` is `["flow"]`.
  - `flow-nodes` is `["subflow"]`. It was `["flow", "subflow"]` before
    `5361951`.
  - `problems-view` is `["project", "flow", "selection"]`.

  `flow-router` and `runtime-debug` already had these scopes at `b24050e` and
  at `2a6b8a5`.
- **The authored design.** `docs/architecture/automation-studio/workspace.md`,
  section "Connected Hierarchy And Timeline", says:

  > Every Flow- or subflow-scoped inner view uses an object-qualified
  > workspace instance ID … legacy unbound tabs are bound once from their
  > saved Flow context during project hydration. The per-project browser
  > cache mirrors panes, active tabs, right and bottom regions, and
  > `viewStates` …
- **What `2a6b8a5` changed:**
  - `hierarchy/controller.ts` now opens
    `automationStudioObjectViewInstanceId(target.viewId, flowIdForSelection(...))`.
  - `workspace/layout/persistence.ts` binds unbound main-pane tabs and
    `viewStates` keys from a saved `flowId`.
  - `live/useAutomationGraphRuntime.ts` compares base IDs.
  - `views/view-surface-preloader.ts` looks up loaders by base ID.

  The same commit added tests that assert the instance-ID form:
  `view-registry.test.ts`, `view-instances.test.ts`, and `layout.test.ts`.
  The five tests below were never updated to match.
- **Why the fix is in the tests, not the code.** Reverting the code would
  contradict the documented design and break those three tests. It would also
  remove the documented ability to open two scoped windows for different
  objects.

### 1. `graph/tests/derivation-job.test.ts`

Test: "keeps conversion and validation out of the graph runtime render path".

- **Failing since:** `2a6b8a5`. That commit changed `useAutomationGraphRuntime.ts`
  from `pane.activeViewId === automationStudioViewId.flowEditor` to
  `automationStudioViewBaseId(pane.activeViewId) === automationStudioViewId.flowEditor`.
- **Why the code is right:** a Flow editor tab is an instance ID
  (`flow-nodes::object::<subflow>`), and the old comparison could never match
  it.
- **Fix:** line 26 now expects the base-ID comparison.
- **Unchanged:** the test still requires that visibility follows a pane's
  active view, and the
  `not.toContain("pane.tabs.includes(automationStudioViewId.flowEditor)")`
  line stays.

### 2. `hierarchy/tests/phase7-contracts.test.ts`

Test: "activates Router before reconciling the Flow selection".

- **Failing since:** `2a6b8a5`.
- **What the code does:** it calls
  `openView("flow-router::object::flow.checkout", "preview")`. Router is
  Flow-scoped, and its owning Flow is `flow.checkout`, so this matches the
  design.
- **Fix:** lines 96 and 97 expect that ID in `toHaveBeenCalledWith` and in the
  order list.
- **Unchanged:** the ordering assertion (the view opens before the selection
  changes).

### 3. `testing/tests/synchronous-interaction-trace.test.ts`

Test: "keeps hierarchy publication out of the synchronous visible-view
gesture".

- **Failing since:** `2a6b8a5`.
- **What the code does:** it sets `activeViewId` to
  `"flow-router::object::flow.empty"`.
- **Fix, in three parts:**
  - The fixture pane's already-open Router tab (line 38) is now that instance
    ID.
  - The expected `activeViewId` (line 111) is the instance ID.
  - An added assertion,
    `expect(workspace.getPrefs().panes[0]?.tabs).toEqual(["runtime-debug", "flow-router::object::flow.empty"])`,
    requires that the gesture adds no tab.
- **Why the fixture changed too:** the scenario is a click that activates an
  already-open tab. If only the expectation changed, the click would add a
  second Router tab next to the stale unbound one. I read this from
  `pane-choice.ts` `chooseAutomationMainPane` and `workspace-commands.ts`
  `activateMain`; I did not run that variant. The test would have accepted
  that state without complaint.
- **Unchanged:** the store and render commit counts. They passed before and
  after.

### 4. `views/tests/GraphEditorViews.test.ts`

Test: "keeps active-tab changes behind the Flow editor render boundary".

- **Failing since:** `5361951` (2026-09-07). That commit changed the
  preloader's key from the literal `"flow-nodes"` to
  `[automationStudioViewId.flowEditor]`. Later, `e55a141` updated this
  assertion's import path to `components/` but kept the literal key.
- **Why the code is right:** `automationStudioViewId.flowEditor` is
  `"flow-nodes"` (`canonical-view-definitions.tsx`, line 93), so the behaviour
  is identical.
- **Fix:** the test expects
  `[automationStudioViewId.flowEditor]: () => import("../flow-editor/components/FlowGraphCanvas")`.
- **Added assertion:** the preloader must contain
  `viewSurfaceLoaders[automationStudioViewBaseId(viewId)]`. That is the
  `2a6b8a5` lookup that lets a Flow editor instance ID preload the canvas.

### 5. `workspace/cache/tests/cache.test.ts`

Test: "debounces workspace writes and stores the latest complete window and
view state".

- **Failing since:** `2a6b8a5`. That commit rewrote the test, and it has
  failed since.
- **The conflict:**
  - The `latest` fixture is a legacy unbound `runtime-debug` tab with
    `viewStates["runtime-debug"].flowId = "flow.one"`.
  - The same commit's `normalizeAutomationWorkspacePrefs`, which
    `compactWorkspaceCacheSeed` calls, binds that tab to
    `runtime-debug::object::flow.one`.
  - `layout.test.ts` requires exactly that binding, in "migrates a restored
    Flow-scoped tab and its state to an object instance".
- **What the test is for:** the cache write. The write is debounced, then
  stores the complete pane, tab, and `viewStates` state. The workspace
  produces instance IDs itself: the controller opens them, and hydration binds
  legacy tabs. So a realistic input to the writer already uses them.
- **Fix:** the fixture uses `runtime-debug::object::flow.one` everywhere:
  `activeViewId`, the pane tabs, and the `viewStates` key. The exact-equality
  assertions against `latest` stay, and `activeViewId` now expects the
  instance ID.
- **Coverage unchanged:** `layout.test.ts` still covers binding a legacy tab.

## Commands run and observed results

Commands ran from `F:\!FluxIQ` or `apps/web`. Logs are in the session
scratchpad as `cwth-*.log`.

### 1. Working tree, before the edits

`pnpm exec vitest run` on the five files, in `apps/web`: exit 1,
`Test Files 5 failed (5)`, `Tests 5 failed | 41 passed (46)`.

| Test | Failure |
| --- | --- |
| derivation-job | `expected '"use client";\n\nimport { useCallback…' to contain 'pane.activeViewId === automationStudi…'` |
| phase7 | `expected "spy" to be called with arguments: [ 'flow-router', 'preview' ]`; received `"flow-router::object::flow.checkout"` |
| trace | expected `activeViewId: "flow-router"`, received `"flow-router::object::flow.empty"` |
| GraphEditorViews | `expected 'import { scheduleAutomationStudioAfte…' to contain '"flow-nodes": () => import("../flow-e…'` |
| cache | `expected 'runtime-debug::object::flow.one' to be 'runtime-debug'` |

### 2. Clean `HEAD` baseline

Method, as in `reports/core-failure-taxonomy.md`:

- `git archive --format=tar HEAD apps/web packages tsconfig.base.json package.json`,
  at HEAD `e522f176701c77ecd811b1def2b64e6026259ed9`.
- Extracted to `scratchpad\cwth-head\`.
- Directory junctions for `node_modules` and `apps\web\node_modules`, pointing
  at the real directories.

Result: `npx vitest run` on the five files, in the copy's `apps/web`: exit 1,
`Test Files 5 failed (5)`, `Tests 5 failed | 41 passed (46)`. The same five
tests fail with the same assertions. The only difference is that the archived
files have CRLF endings, which shows as `\r\n` in the derivation-job message.

Cleanup:

- I removed both junctions with `cmd /c rmdir`, which removes the link only.
- `Test-Path` then printed `False` for both links.
- It printed `True` for `F:\!FluxIQ\apps\web\node_modules\vitest` and for
  `F:\!FluxIQ\node_modules\.pnpm`.
- The extracted copy is still in the scratchpad.

### 3. History

- `git log -S automationStudioViewBaseId` → `2a6b8a5`, `4db9abe`.
- `git log -S '::object::'` → `2a6b8a5`, `0271d60`.
- `git log -S '[automationStudioViewId.flowEditor]: () => import'` → `5361951`.
- The four views' scope strings, read with
  `git show <c>:…/canonical-view-definitions.tsx` at `b24050e`, `2a6b8a5`,
  `5361951`, and `HEAD`.
- The preloader assertion, read at `5361951`, `0271d60`, `05bfee7`, `e55a141`,
  and `HEAD`.

### 4. After the edits

`pnpm --filter @fluxiq/web test`: exit 0, `Test Files 227 passed (227)`,
`Tests 1146 passed (1146)`. All five now pass:

- `GraphEditorViews.test.ts (17 tests)`
- `cache.test.ts (12 tests)`
- `phase7-contracts.test.ts (8 tests)`
- `synchronous-interaction-trace.test.ts (4 tests)`
- `derivation-job.test.ts (5 tests)`

### 5. `pnpm check`

Exit 0, printing:

- `# tests 48 / # pass 48 / # fail 0`
- `structure-audit: passed (117 warning(s), 256 baselined).`
- `packages/contracts`, `packages/client-gateway-websocket`,
  `packages/fluxiq`, and `apps/web` each `check: Done`.

It ran at the same time as the web suite. Both passed.

### 6. Scope of the diff

- `git status --short -- apps/web/src/features/` lists only the five test
  files.
- `git diff --stat` → `5 files changed, 13 insertions(+), 10 deletions(-)`.
- `git ls-files --eol`: four files are `w/lf`, `GraphEditorViews.test.ts` is
  `w/crlf`, and none is mixed. Git's "LF will be replaced by CRLF" warnings
  for the four LF files are its `autocrlf` notice, not a content change.

## Not verified

- **Live browser behaviour of object-qualified tabs.** Out of scope; no panel
  was started.
- **Root `pnpm test` and `pnpm build`.** Not run. The brief's definition of
  done names only the web suite and `pnpm check`.
- **Packages in the `HEAD` copy.** The copy resolved `fluxiq` and
  `@fluxiq/contracts` through the junctions, which means the working tree's
  built packages rather than `HEAD`'s. This does not change the conclusion:
  - Before my edits, `git status` showed nothing modified under
    `apps/web/src/features/`.
  - The failure messages are identical.
- **Earlier line endings.** That the four LF files were already LF is an
  inference, not something I observed. The basis is that the Edit tool kept
  the fifth file's CRLF in this session. `git ls-files --eol` shows no mixed
  endings.

## Open questions or contradictions found

1. **Problems visibility uses exact `===`.** `useAutomationGraphRuntime.ts`
   compares against `automationStudioViewId.problems` (`problems-view`), which
   is object-scoped.
   - It is correct today. The only opener is `AutomationStudioSession.tsx:467`,
     `workspaceCommands.selectRightTab(automationStudioViewId.problems)`, which
     uses the unbound ID, and right-sidebar normalization does not bind tabs.
   - The risk: if anything opens Problems through
     `automationStudioObjectViewInstanceId`, graph validation stops running
     with no error.
   - `automationStudioViewBaseId(...)` there would be the safer form. I did
     not change it, because no failing test covers it and the intended
     behaviour for an object-bound Problems view is not documented.
   - I kept the test's assertion of that line unchanged.
2. **`viewStates` keys and tabs are bound inconsistently.**
   `normalizeAutomationWorkspacePrefs` binds every `viewStates` key from a
   saved `flowId`, including right-sidebar views, but binds only main-pane
   tabs. A saved `viewStates["problems-view"].flowId` would become
   `problems-view::object::<flow>` while its right-sidebar tab stays
   `problems-view`. I did not check whether any view saves a `flowId` for
   Problems. This is for whoever owns workspace persistence.
3. **These tests were red for a week.** All five run in
   `pnpm --filter @fluxiq/web test`, yet failed across four commits:
   `2a6b8a5`, `5361951`, `0271d60`, and `e55a141`. The supervisor may want a
   gate that runs the full web suite before commit.

# t871 tasks lane report

**Outcome: Done.** Tasks screen in Core, the extension seam and tab layout, narrow checks green, headed spec read picture by picture.

## What a person now sees
1. Automations tab (only when a tasks or library port exists; otherwise the tab is byte-for-byte as today): a search box "Search tasks, automations and subflows", then Tasks / Library segments (Library only when its hook exists), then the task list, "Your automations" rows (filtered by the same text) and New automation (`.automation-row`, `#extractDataButton` unchanged).
2. List: "Needs you" first (interrupted, locked key, permission), then Today / Yesterday / weekday / date. Each row: their words, a plain state, time, length, cost (only where `reportsSpend`), attempts, saved line. A tick only where the answer turn gives one (a result with an act that may have landed is "Finished, not confirmed", as its card says).
3. Search waits 250 ms then asks the port with `text`; "Tasks (n)" / "Library (n)" shows on the segment not showing. Failed read: quiet line, Try again, rows kept. Empty: "No tasks yet. Ask for something in the chat...".
4. Open a task (takes the whole tab, Back button or Escape, focus returns to the row): name, state, one sentence of where it got to, Carry on (interrupted only), Open in chat, the latest answer drawn by `createAnswerView` (so Add $5.00 and carry on, Run again and its repeat note, CSV/JSON, What I did are the answer turn's own, pressed once), attempts timeline with the comparison words, Show steps per attempt (reasoning; small steps folded; "From saved steps" / "Worked out again" only where kind changes). Rename inline (Enter/Escape), Delete with a confirmation of what goes and what stays (focus starts on Keep it).
5. Closing and reopening: everything re-read; the open task is kept behind `TasksMemory` (`chrome.storage.local`), and reopening switches to Automations on the same task.

## Files
CORE `packages/ui-components/src`: `screens/tasks/{port,create-tasks-screen,index}.ts`, `model/*` (9 files), `view/*` (13), `tasks.css`, tests in `model/tests` and `tests`; `testing/tasks/*` (`createFakeTasksPort` with its own `results`, `createFakeTasksMemory`, `fakeTasks(nowMs)`), export line in `testing/index.ts`.
EXT `apps/extension`: `src/panel/tasks/*` (`extensionTasksPort` returns `undefined`, comment names t869/t870; `task-memory.ts`; `create-tasks-panel.ts`), `automations/{automations-tab,search-box,segments,index}.ts`, `automations.css`, `shell/{contracts,mount-panel}.ts`, tests beside them, `e2e/content/tests/screens/tests/tasks-local-classifieds.spec.ts`.

## Commands
- CORE `pnpm.cmd --filter @fluxiq/ui-components check` -> no errors in my files (earlier errors only in library's mid-edit files; last run clean). `node scripts/structure-audit.mjs` -> 0 violations at the end. vitest `src/screens/tasks src/testing/tasks` -> 3 files, 25 tests passed.
- EXT `node scripts/structure-audit.mjs` -> 0 violations (warn only: panel/automations 16 files). `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/tasks/ panel/automations/ panel/shell/` -> 195 pass, 0 fail. `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0.
- `pnpm.cmd run test:content .../tasks-local-classifieds.spec.ts --headed --workers=1` -> 4 passed (mouse every state; keyboard; close and remount on the same task; empty list and failed read).

## Pictures (e2e/test-results/content/artifacts/screens-tests-tasks-local--*/)
Read 1-list, 4-done, 5-done-steps, 7-interrupted, 9-budget-out, 11-waiting, 12-model-key-locked, 13-done-on-site, 15-rename, 16-delete-confirm, 17-deleted, keyboard-1 and 3, reopened-same-task, empty-list, failed-read-keeps-rows. Found and fixed from them: a tick beside a card that said "Not confirmed" (now the answer turn's own rule); the interrupted state said three times (card now only the sentence); "It had not taken a step yet" shown for tasks with steps; "Nothing is undone" ambiguity. No overflow at 360 px; focus ring visible on rows, search, buttons.

## Not verified
Real browser extension, Firefox popup, real `chrome.storage` (stubbed in the scripted panel); the Library segment drawn (no library hook wired here; covered by tab tests with a stub hook); light/dark theme; `quiet` steps are folded by my reading of the field; `TaskProvenance.route` / `startedFrom` are not shown.

## Needed from others
- Lead: wire `library` into `AutomationsTabHooks` in `mount-panel.ts` (a `library?: {element, search, setActive, onMatches}` hook exists); `PanelPorts.results` default is absent, so Add budget / Run again / export show only when the chat's `resultsPort` (needs `listen`, `download`) is passed in.
- t869: fill `extensionTasksPort` (`list/read/carryOn/rename/remove`); t870: `readSteps`, `readProvenance`. `waitingFor` is read as a string; `model_key_locked` words are mine until `modelKeyLockedWords` (t865) lands.
- Note for chat owners: the answer view's handlers do not guard a second press themselves (the disabled button does).

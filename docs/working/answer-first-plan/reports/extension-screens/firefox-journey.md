# t871 Firefox pass and one whole journey

Outcome: Done. Both engines pass both specs headed (16 tests each). Three defects fixed; two bigger ones written down, not built.

## What a person sees (read in 96 pictures, 24 per engine and surface; `scratchpad/journey/<engine>-<surface>/`, `popup-closing-<engine>/`)
Setup (five steps, Connect, code, connected), key card above a usable chat then gone by itself, first task with its reply and work header, permission (one press), person-only check told once with one Stop, answer turn in the chat (real results adapter fed by a run push), Automations (search, Tasks and Library, interrupted Carry on, budget-out Add budget), Library tree/details/run/Ask about it (composer filled, caret in it, nothing sent), Show me how to chip to send, Settings and Advanced. Nothing overflows 360 px or 380 x 580 except the answer table (below). No Firefox-only difference seen: scrollbars are overlay in Firefox and take 15 px in Chromium; `details`, focus rings, form controls and table widths matched.

## Defects: seen, cause, fix
1. Search on Tasks showed no count beside Library (first real use of the segment). Cause: the library only reads while its segment is on show, so nothing was loaded to count. Fix `panel/automations/automations-tab.ts`: a typed search reads the library once, quietly (stops when cleared). Test in `automations-tab-search.test.ts`.
2. With no panel open, the toolbar badge was blank while a task's work ran (only a saved run showed "..."). Cause: `toolbar-badge.ts` reads `status.runtime`, never the activity display's `working`. Fix `background/panel/toolbar-indicator.ts` (owned file only): a working display shows "..."; "!" and REC still win. Tests in `toolbar-indicator.test.ts`.
3. Dead `.top-actions .record-button` rule removed from `shell.css`, and its stale comment in `recording.css`.

## Not fixed, needs another lane
- **A result that finishes while the popup is closed is never drawn.** Reopening shows the transcript and "Finished", no answer turn, and the Tasks tab has no real port yet (`extensionTasksPort`). Cause: `panel/chat/transport/ports/results/results-port.ts` only reads a run it saw finish as a push in this panel session; an activity read's final run is ignored. In Firefox the popup closes on every page click, so this is the common case. Needs transport (forbidden to me): read the activity state's final run on open too, or Core attempt records.
- Answer table is `width: max-content` (`chat/chat.css` 730): three short columns scroll sideways at 360 px in Chromium (Likes cut). Left as a design choice of the answer lane.
- Setup step 1 says "!FluxIQWebExtension folder ... pnpm dev" (known, setup lane).

## Popup closing: what the person returns to (real click on the page, pagehide, frame removed, remount at 380 x 580)
- Setup: same five steps, nothing ticked. Right.
- Waiting for approval: same code and waiting step. Right.
- Key card after Open FluxIQ: card again; gone at once once the key is ready. Right ("Not now" is forgotten, fine).
- Typed draft: kept (page localStorage, chat's draft memory). Right.
- Work running: reply, task, working header and Stop back. Right. Finished while closed: no answer turn (above). Wrong.
- Page card while closed: "Working on your task / Opening the feed" on the page itself. Right. Badge now "..." (fix 2), "!" when waiting.
- Person-only check: same check, the "window closes" warning, Continue works. Right.
- Permission ask: same ask, one press works. Right.
- Open task: popup reopens on the Automations tab on that task. Right.
- Open subflow: reopens on Chat, details not kept. Acceptable, not built (cheap to remember via storage, say if wanted).
- Half-filled run inputs: lost, nothing was run. Acceptable.
- Recording running: bar with Stop and "goes on" words. Stopped while closed: chip on the composer on reopening. Right.
- Settings draft: reopens on Chat, unsaved address gone. Acceptable.
- Budget-out: the press went out once; the task reopens. Its new state is Core's: the fake port resets, so not checked.

## Keyboard
One tab sweep over chat, Tasks, Library, subflow details and Settings (both engines): every visible control reached; focus never fell to the body when the tab changed or a task, subflow or Settings opened. Firefox adds a tab stop on each scrolling screen (named "Automations", "Settings"), as Chromium does for scrollers.

## Files
EXT `e2e/content/tests/screens/`: `journey-panel.ts` (new), `scripted-panel.ts` (answer gets `core`, `memory`, `remove`), `panel-frame.ts` (`closePopupOnPageClick`), `tests/whole-journey-social-network-feed.spec.ts`, `tests/popup-closing-social-network-feed.spec.ts`; `src/panel/automations/automations-tab.ts` + test; `src/background/panel/toolbar-indicator.ts` + test; `shell.css`, `recording.css`. Core untouched.

## Commands
- Chromium: `pnpm.cmd run test:content <both specs> --headed --workers=1` -> 16 passed.
- Firefox: `NODE_OPTIONS=--no-experimental-strip-types pnpm.cmd exec playwright test -c e2e/playwright.content.firefox.config.ts <both specs> --headed --workers=1` (Playwright's own firefox-1475, no executable override; `test-content.mjs` hard-codes the Chromium config, so call playwright directly) -> 16 passed.
- `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/automations/ panel/shell/ panel/recording/ background/panel/` -> 288 pass, 0 fail.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> clean. `node scripts/structure-audit.mjs` (EXT) -> passed.
- Pictures go to `FLUXIQ_JOURNEY_PICTURES` (else the run's output folder).

## Not verified
Real Firefox popup and real toolbar badge (badge only by unit test); real background, Core and tasks port (all faked); the popup close is modelled; Core audit not run (no Core change); Lab not run.

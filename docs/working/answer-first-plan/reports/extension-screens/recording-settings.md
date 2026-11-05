# t871 recording as a composer attachment, and settings in order

Outcome: Done (Lab flow kept by default choices named below; one default is a compromise).

## What the Lab depends on (read in `EXT packages/test-runner/src`)
- `record-demonstration.ts`: `pressNamed("Start recording")`, then `fillLabelled("Recording description")`, then `pressNamed("Start described recording")`, then "Stop recording". So the description dialog stays (labels and button name kept), and the recording is only stored with the description it gave.
- `panel-controls.ts`: `pressNamed` needs ONE visible, enabled button by aria-label or text; Playwright `getByRole(name:"Start recording")` is a substring match, so only one such button may be visible at a time. `attach-recorded-demonstration.ts`: Chat tab, "Attach a recording", item by description inside the group, then the text `Recording: <description>`.
- `ui-e2e` journeys and `demo-workspace`: `getByRole("button", {name:"Start recording"})`, "Stop recording", `Extract Data From This Page` (exact, case-sensitive), `Settings`, settings labels, `Save`, `Saved.`, `Forget this pairing` then `Forget`. (The `ui-e2e` journeys press Start recording and wait for status without filling the description; with the dialog they were already stuck before this task.)
- No Lab file reads `#recordButton`, the top-bar record icon or "Author task instructions".

## What a person now sees
1. Chat: beside "+", a pill "Show me how" (accessible name "Start recording"). The buttons sit on a row under the text box so typing keeps the whole width. Top bar has no record icon: brand, two tabs, connection dot, Settings, Open FluxIQ (all named).
2. One press asks "What should FluxIQ learn from this?" (plain words, why it asks). Start described recording; the chat stays the screen behind it.
3. While it runs, the bar shows "Recording this tab - N steps", Extract Data From This Page, Stop recording. Panel stays on Chat. In Firefox's popup the dialog and the bar say clicking the page closes the window and recording goes on; no pictures are promised.
4. Stop: "Saving your recording..." then the chip "Recording: <words>" (removable) on the composer, caret in the box, no tab jump. The panel waits until the described recording is saved before attaching (never an older one). If it never shows: a line with OK, and "+" still attaches it. A popup closed in between attaches on reopening (the request is kept in `chrome.storage.local`).
5. Automations "New automation": "Show FluxIQ how" (same name for the Lab when that tab is showing) and Extract Data From This Page. The saved-recording card there says "Your recording is saved"; "Author task instructions in FluxIQ" is gone, Open FluxIQ is small.
6. Settings top down: Connection with the browser's approval in a sentence, Project, Model key (read through `SetupPort`) with Open FluxIQ (`purpose: "model-key"`), Status on the page, Report a problem, then Advanced (addresses, switches, Save, Disconnect, Forget this pairing). No spending setting drawn: none exists behind a port.

## Compromises
- Advanced STARTS OPEN (`ADVANCED_STARTS_OPEN` in `settings/advanced-section.ts`), because the Lab fills addresses/switches and presses Forget the moment Settings opens and a closed disclosure hides them from `shown()`. A person who closes it is remembered; it reopens on a failure or an unsaved draft. If the Lab is later changed to open it, flip the constant.
- Recording still needs the description dialog (Lab fills it): two steps after the press, not one.
- Project line says "the project you chose in FluxIQ": no port gives the panel a project name.

## Files changed
CORE: `chat/conversation/{composer.ts,chat-composer-options.ts}` (new `action` slot), `chat/chat.css` (composer-field-tools), `chat/attachment/recording-attachment.ts` (empty-list words), `conversation/tests/composer-attachment.test.ts`.
EXT: `panel/recording/` (recording-controls, description, finished-line, attach-finished, pending-recording-store, record-icon, review, css, tests), `panel/settings/` (settings-view, advanced-section, approval-line, project-line, model-key-line, css, index, tests), `panel/shell/{top-bar,mount-panel}.ts`, `panel/chat/chat-panel.ts` (one option, `composer`, passed through), two activity-overlay specs lost their `record:` top-bar argument, new `screens/tests/recording-settings-photo-social.spec.ts`. `shell.css` still holds a dead `.top-actions .record-button` rule (not mine to edit).

## Commands
- CORE `pnpm.cmd --filter @fluxiq/ui-components check` -> clean; build ok. vitest `src/chat/attachment src/chat/conversation` -> 27 files, 167 tests passed. CORE structure audit -> no violations.
- EXT `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/recording/ panel/settings/ panel/shell/ panel/chat/settings/` -> 138 tests, 138 pass. EXT structure audit -> no violations. `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> completed with no errors (138 s).
- Headed spec on photo-social: 4 passed (mouse flow, keyboard flow, settings, popup 380 x 580).

## Pictures read (under `apps/extension/e2e/test-results/content/artifacts/screens-tests-recording-se-*`)
composer idle, question, recording running, ended with chip, removed, sent (all 360 px): nothing overflows, Send stays inside, pill reads clearly; dialog buttons were unstyled in the first shot, fixed and reshot. Settings top connected/disconnected, Advanced open, popup question/recording/reopened-after-stop/settings: read well. Keyboard: Tab order composer > Attach a recording > Start recording (visible focus ring) > dialog > Stop > chip with caret.

## Not verified
Real Chrome/Firefox with the real background (Stop timing, real Core saving the recording, popup closing on a page click); the Lab itself was not run; `e2e/content/tests/extraction` not run (extraction panel untouched); Firefox has no page capture, nothing here claims pictures.

## Needs from other lanes
A project name (and later a spending limit) through a port for the Project line; if the Lab learns to open Advanced, default it closed.

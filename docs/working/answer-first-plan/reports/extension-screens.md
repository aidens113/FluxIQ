# The extension's screens (t871)

Worktrees: `C:/Users/osrs_/FluxStuff/fxwork/t871/!FluxIQ` and `.../!FluxIQWebExtension`, branch `task/t871-extension-screens`. No paid call, no real site, no real key. Worker reports are in `reports/extension-screens/` (setup, second-attempt, asks, ask-fixes, tasks, library, recording-settings, firefox-journey).

## Outcome

Done for everything the seven items can do without other lanes. All screens are built, wired into the real panel, and were looked at at 360 px and by keyboard, in Chromium and Firefox. Tasks and the library show only when a real port exists, so until t869 and t866 land a person sees Setup, the chat, Saved and second-attempt words, Asks, Recording, Settings, and the Automations tab as it is today.

## What a person now sees, step by step

**1. Setup.** Not connected: one screen, five steps in order, each saying what to do and where it stands: Start FluxIQ, Sign in, Connect this browser, Approve it, Add a model key. Only what was really detected is ticked. A failed connection says so in words, with the address behind a link to Settings.

Once connected the chat comes back. If the key is missing or this browser is locked, a card sits above a usable chat: what is done, the one thing left (Add a model key, or Unlock this browser once), Open FluxIQ going to the keys page, and Not now. It goes by itself when the key reads ready. A failed read shows nothing and blocks nobody. It is a card and not a gate because the Lab's readiness check fails at once without a ready composer.

**2. A task.** The first reply promises the result. A work header above the composer shows time, cost and one Stop. Each step shows once with its reasoning.

**3. The answer and what was saved.** The answer turn (t862) now says in the foot what was saved and when: "Saved Monday: the steps. They worked last time." "Quicker next time" is never claimed unless the record says it worked. The rows table fits 360 px with whole words, and scrolls only when the columns truly cannot fit.

**4. The second attempt.** While it runs: "Using what I saved from Sunday" in the header and at the start of its steps. A step is marked "From saved steps" or "Worked out again" only as the attempt's own record says (`ChatTaskOutcome.provenance`), and only where the kind changes. With no record, nothing is marked.

On the answer: how it went, by path, and "This time 18s and $0.00. First time 3m 14s and $1.12." with the numbers as they are, even when slower. "No steps had to be worked out again" shows only on an achieved attempt; a stop or budget-out straight after a run says "Used what I saved."

The strip's "did not keep a change" warning is now "Nothing from this run was saved for next time".

**5. Asks.** A question appears once, with its answers, and no card beside it. The header only says "The question is above." A person-only check offers Continue and Stop, and the header's Stop is put away while it shows, so there is one Stop. The answer stays in the transcript: "You allowed this." "Done. You pressed Continue."

A permission is one press, with no PIN, for every class. On the popup the check warns: "This window closes when you click the page. Press the FluxIQ button to come back and press Continue." The toolbar badge shows "!" while waiting and "..." while work runs. An aborted wait now expires its ask, so nothing stays under a turn with nothing waiting.

The rare confirmation on a thread shared with the web panel says it cannot be answered here and sends the person to FluxIQ. No PIN appears anywhere in the extension, by the lead's decision; the dialog was built and then removed.

**6. Tasks** (the Automations tab, with a real port). A search box covers tasks, automations and subflows, with Tasks and Library segments and a count on the segment not showing. "Needs you" comes first, then by day: their words, a plain state, time, cost, attempts, the saved line. No attempt is ever shown as failed.

Opening a task: where it got to in one sentence; Carry on for an interrupted one; Add $5.00 and carry on for budget-out, drawn by the answer turn's own view; Open in chat; attempts as a timeline with the comparison; steps per attempt with reasoning; Rename; Delete with a confirmation. Closing the panel and coming back reopens on the same task.

**7. The library** (with a real port). A tree by site: a site subflow with what it calls nested under it, recursively, each with a plain state ("Not proven yet", "Worked once", "Works reliably"). Search keeps the path to each match.

Details say what it does, where it works, what it needs and hands back, what it can do on the site, "Always uses: ...", what must be true to start, its steps, what it calls, who uses it, and how it has gone. Run has a form with real labels. A lasting act is one press once, and a repeat is "Go ahead" once. Refusals are in words with a next step. Ask about it fills the composer and shows Chat with nothing sent.

**8. Recording.** "Show me how" sits in the composer, and the top-bar record icon is gone. It asks "What should FluxIQ learn from this?", records with the chat on screen, and ends with a removable chip on the next message and the caret in the box, with no jump to another tab.

**9. Settings, in order.** Connection in a sentence, Project, Model key with Open FluxIQ, Status on the page, Report a problem. Advanced, closed by default, holds the addresses, switches, Save, Disconnect and Forget. It opens by itself on a failure or unsaved change, and a person's choice is remembered.

**10. Firefox.** One UI. Every flow was walked with the popup torn down by a real click on the page and remounted. Reopening lands on the same setup step, draft, question, task and recording. Running work keeps going with the on-page card and the badge. Not kept, and acceptable: an open subflow's details, half-filled run inputs, an unsaved settings address.

## Workers

| Worker | Tier | Outcome | What I verified |
| --- | --- | --- | --- |
| Setup | worker | Done | Re-ran the spec, read 1-disconnected and 4-key-missing |
| Saved state and second attempt | worker | Done | Re-ran the spec, read second-working and second-finished; found the mark on every step too noisy and changed it |
| Asks | worker-heavy | Partial: PIN could not work, five items for other files | Read the trace and pictures; acted on the items below |
| Tasks | worker | Done | Re-ran the spec, read list, interrupted, budget-out |
| Library | worker | Done | Re-ran the spec, read tree and details in Firefox |
| Recording and settings | worker | Done | Read the chip and Settings pictures; re-ran the spec after Advanced closed |
| Ask fixes | worker | Done | Re-ran tests, and the asks spec |
| Firefox and journey | worker | Done | Re-ran in Chromium; read 8 journey pictures |

No escalations. No worker changed anything outside its area beyond what its report says.

## Integration I did

- `PanelPorts` and the third `mountPanel` argument; the `screens` barrel and `styles/tasks.css`, `styles/library.css` entries; `screens/scripted-panel.ts`, `panel-frame.ts`.
- Dropped the permission card (`stream/step/without-ask-cards.ts`); "The question is above." and the single Stop (`work-header/ask-offers-stop.ts`, `data-ask-has-stop` in `chat.css`); marks only where the kind changes.
- Library wired into the tab; `ChatWidget.fillComposer` for Ask about it.
- `pathWords(path, status)`, as t870 asked.
- `ChatTaskOutcome.provenance` (`ChatAttemptProvenance`), as the lead fixed it, drawn in the stream and the tasks screen; `readProvenance` removed from `TasksPort`.
- `PanelPorts.tasks` is now `{ port, results }`, so a tasks port without a results port does not compile.
- `.answer-table` width, so three short columns no longer scroll sideways.
- `ADVANCED_STARTS_OPEN = false`; `packages/test-runner/src/extension-settings/` used by `browser-session.ts` and `ui-e2e/journeys/extension-project.ts`; `e2e/runtime/tests/lab-settings-driver.spec.ts`.
- `@fluxiq/ui-components` 0.6.0.

## Commands and observed results

All on the final tree unless marked.

- Core root: `pnpm.cmd --filter @fluxiq/ui-components check` -> no errors; `build` -> ok; `node scripts/structure-audit.mjs` -> passed (501 warnings, 1097 baselined).
- `packages/ui-components`: `vitest run src/chat/answer src/chat/stream src/chat/work-header src/chat/attachment src/chat/conversation src/chat/view src/chat/tests src/chat/ports src/screens src/testing` -> 92 files, 631 passed.
- `packages/fluxiq` (ask-fixes worker, not re-run by me since): `vitest run src/ui/activity-status src/ui/activity-action src/runtime/automation-parking` -> 38 files, 430 passed. Its aborted-wait test was red first: 3 failed, 5 passed (`expireAsk` 0 calls), then green.
- Extension: `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0. `node scripts/structure-audit.mjs` -> passed (237 warnings, 552 baselined). `test-runner exec tsc --noEmit` -> no output.
- `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/ background/panel/ background/activity/` -> tests 708, pass 708, fail 0.
- Headed Chromium, `pnpm.cmd run test:content e2e/content/tests/screens/tests --headed --workers=1`: 45 passed and 1 failed; the failure was the tab-order sweep counting controls inside closed Advanced as unreachable (fixed, with a sweep of Advanced open added). Then whole-journey and popup-closing -> 16 passed.
- Headed Firefox, `NODE_OPTIONS=--no-experimental-strip-types pnpm.cmd exec playwright test -c e2e/playwright.content.firefox.config.ts <whole-journey, popup-closing> --headed --workers=1` -> 16 passed. (Other screens specs ran in Chromium only.)
- Real extension in Chromium, headed, `playwright -c e2e/playwright.config.ts install-and-content lab-settings-driver requests-settings --workers=1 --headed`: first run 4 passed and 1 failed, because `install-and-content` still expected the old Connect sentence; fixed, then 5 passed. After the Lab helper moved to `extension-settings/`, `pnpm.cmd run test:e2e` on the same three specs (headless, rebuilt artifact) -> 5 passed.

Pictures: `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/journey-final2/` (session scratchpad, never in a repository). I read: permission ask and popup check (before the card and header fixes), setup 1 and 4, second-attempt working and finished, tasks list, interrupted and budget-out, library tree and details in Firefox, search reaching both, person-only check in Firefox, answer table before and after the fix, composer chip, Settings, the working header. Workers read the rest, and said which in their reports.

## Not verified

- **The real Firefox popup and real toolbar badge.** Playwright cannot load the extension's popup in Firefox. The close is modelled (real page click, `pagehide`, frame removed, remount), and the badge is unit-tested.
- **Real Core behind any of these screens.** Screens run on fakes or a scripted background, except `lab-settings-driver`, `requests-settings` and `install-and-content`, which load the real extension in Chromium, without Core.
- **The Lab's `connectExtension` itself.** Paid runs do not go through it: `extension-chat-check/run-chat-check.ts` connects by the `fluxiq.connect` message, and only `demo-workspace` and `ui-e2e` use Settings. Their entries are refused today because they open non-realistic scenarios. So the provider-free proof is the new real-extension spec, which runs the driver's helper and the driver's same locators. It is not the driver's own function.
- **Dark theme.** Pressing Add budget against a real attempt. Step marks against real provenance, including whether its `position` numbers match a run's step numbers (labels are matched first).
- **Words in a live run:** the header's "The question is above." relies on the thread holding the pending ask.

## Open questions and needs for others

1. **t869 / t870, the fields to fill.** I was to fill `extensionTasksPort` once t869's adapter is on dev; it is not yet, so it still answers `undefined` and this is open. `extensionTasksPort` (`panel/tasks/tasks-port.ts`) answers `{ port, results }`: `list`, `read`, `readSteps`, `carryOn`, `rename`, `remove` in `screens/tasks/port.ts`. `ChatTaskOutcome.provenance` from `taskMemory.provenance`, mapping its optional `label`, `ran` enum and `startedFrom` object to the fixed shape. `waitingFor` may gain `interrupted` and `model_key_locked`; the tasks screen reads it as a string, but `answer/words/waiting-words.ts` needs a case for `interrupted` when the type changes.
2. **t866.** Flip `LIBRARY_LANDED` in `panel/library/extension-library-port.ts` and swap the three message literals in `library-port.ts` for the constants.
3. **The description dialog stays.** It is not as small as Advanced. `record-demonstration.ts` fills "Recording description", and `attach-recorded-demonstration.ts` then finds the recording by those words, so removing it changes how the Lab identifies a recording. Say if you want it reworked.
4. **Setup step 1 is a developer's instruction** ("run `pnpm dev` in the !FluxIQWebExtension folder"), with the first-time admin password from `docs/user/quickstart.md`. There is no installer. That quickstart also still describes the old unlock, which t865 changed.
5. **Docs I do not own need updating:** `docs/architecture/extension-client.md` (Panel UI, the recording flow, line 683's check words), `package-boundaries.md` (the `screens` entry and new style files). The manifest's "Record, run and repair" store text no longer leads with what the product does.
6. **A result that finishes while the popup is closed gets no answer turn.** Passed to t869, as you said.
7. **Project line in Settings has no name:** no port gives one.
8. **Permission words** ("to build this Flow") are t870's. They still show in my pictures.

## Last piece: docs (after Core 1f3c0d462, extension 6e29ee26a)

One `worker`; its report is `reports/extension-screens/docs.md`. This supersedes open questions 5 and 7 above.

- **Updated:** extension `docs/architecture/extension-client.md`, `docs/user/quickstart.md`, the description in `manifest.chrome.json` and `manifest.firefox.json`; Core `docs/architecture/package-boundaries.md`. The e2e manifest's own description was left, as it describes the test build.
- **Quickstart's unlock section was left exactly as it was,** for the lead to update when t865 lands.
- **The Settings project line stays nameless.** No port or message reaches the name: `ExtensionStatus` has only `projectId`, `hostStatusOf` never sets `projectName`, and the background keeps only the id from Core's snapshot. I confirmed by a grep for `projectName` across `src/shared`, `src/background` and `host-status.ts`, which finds nothing. It needs `ExtensionStatus.projectName` in the background and probably a Core read.
- **Still out of date, not on the list I was given:** `docs/user/store-listing.md` lines 15 and 33 hold the old description and now disagree with the manifests. Core `docs/architecture/runtime-ownership.md:139` still says ui-components 0.1.0.
- **Not confirmed in code:** quickstart's work-header and answer-foot claims are only partly traced; its web-app steps are unchanged and unchecked; older Panel UI paragraphs in `extension-client.md` were left as they were.

Commands on the tree with these docs:
- The six screens specs not re-run after the spec-only fix, `pnpm.cmd run test:content <setup, second-attempt, asks, tasks, library, recording-settings> --headed --workers=1` -> 30 passed. They ran on the committed source; only docs and manifest descriptions changed beside them.
- `node scripts/structure-audit.mjs`: extension passed (237 warnings, 552 baselined); Core passed (501 warnings, 1097 baselined).
- `node apps/extension/scripts/release/tests/release.test.mjs` (worker's run) -> fail 0.

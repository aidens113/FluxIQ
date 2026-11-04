# Browser proof of the answer turn and work header (t862)

## Outcome
Done. Three specs, 9 tests, all pass headed (Chromium, headed, workers=1) on explicit paths. Item C ran on REAL rows: the Spain-hubs task read off the real crossborder-marketplace site by the product's own provider-free walk, then given to the extension's results adapter. Five product observations below (none fixed by me).

## What changed
New, all under `apps/extension/e2e/content/tests/answer-turn/` (Extension worktree `C:/Users/osrs_/FluxStuff/fxwork/t862/!FluxIQWebExtension`):
- `answer-chat-page.ts`: support. Bundles the real `createChatWidget` over the extension's own transport (`createExtensionChatTransport`) with a scripted background; `window.__mount(config)` draws one thread with either Core's `createFakeChatResultsPort` outcomes (A, B) or, with `config.real`, the extension's real `resultsPort` fed by scripted `runDetail` / `exportDataset` replies and a final-run activity push (C). Helpers: `openChatRail`, `mountNamed`, `pushActivity`, `sentOf`.
- `spain-hubs-read.ts`: support for C. A compact copy of the walk in `live-tasks/tests/crossborder-marketplace-spain-hubs.spec.ts` (content-script actions, then the domain evidence runtime reading the list with scripted column choices). No model, no Core, no provider.
- `tests/answer-kinds-company-website.spec.ts` (A, 4 tests), `tests/answer-waiting-job-board.spec.ts` (B, 4 tests), `tests/answer-real-rows-crossborder-marketplace.spec.ts` (C, 1 test).
Nothing else touched (no Core, no package.json, no baseline).

## Commands run and observed results
(from `apps/extension`)
- `pnpm.cmd run test:content e2e/content/tests/answer-turn/tests/answer-kinds-company-website.spec.ts e2e/content/tests/answer-turn/tests/answer-waiting-job-board.spec.ts e2e/content/tests/answer-turn/tests/answer-real-rows-crossborder-marketplace.spec.ts --headed --workers=1` -> `9 passed (2.2m)`. (Each spec also passed alone earlier.)
- `node scripts/structure-audit.mjs` (Extension worktree root) -> `structure-audit: passed (234 warning(s), 553 baselined).` (first run had 2 statement-packing failures in my specs; fixed.)
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> `core-build: ... is current with its source.` then `extension:check` built with no errors. `tsconfig.test.json` includes `e2e/**/*.ts`, so the specs are typechecked.

## Pictures I LOOKED at
Root: `C:/Users/osrs_/FluxStuff/fxwork/t862/!FluxIQWebExtension/apps/extension/e2e/test-results/content/artifacts/` (folder names below). Page is the scenario page, chat is a 420 px (or 360 px) frame on its right, viewport 1280x720.

### A. company-website (`answer-turn-tests-answer-k-6ca4a-er-turn-drawn-and-looked-at/` and siblings)
Site name in "From:" lines is the scenario page's own title (I replaced the fakes' `shop.example`). Row contents are Core's fake rows (kettle, toaster), not company data, since A is about drawing.
- `kind-rowsChecked.png`: "Found 10 of 10" with a green "check mark Checked" at top right; header-shaded table (Title, Price) with 5 rows; note "Showing 5 of 10 rows here. CSV and JSON have every row."; CSV and JSON buttons; lines "On the site: nothing changed", "Checked: ...", "From: ...", "Saved, and it partly works. I will repair it next time."; Run again, What I did. Readable, good contrast, nothing truncated.
- `kind-rowsChecked-unverified-card.png`: "Found 10 rows" (no "of"), an amber box "Not confirmed. I did not get to check this, so please look to be sure." No tick anywhere (asserted: no U+2713 in the card, `answer-check[data-state=unverified]`, zero `.answer-mark`).
- `kind-rowsChecked-refuted-card.png`: red pill "x Did not pass the check", line "What failed: They are not sorted cheapest first". No tick.
- `kind-doneOnSite-card.png`: "Done on the site", bullets: first act with "To undo it: Remove it from the cart."; second "This may have happened, look to be sure: Added the glass jug ...". No table.
- `kind-plainAnswerChecked-card.png`: quote block labelled "In the model's words" over "The store is open until nine tonight."
- `kind-rowsNotSure-card.png`, `kind-rowsRefuted-card.png`, `kind-budgetOutPartial-card.png`: "I reached this task's budget." with "It spent $5.00 of $5.00.", "What I got: N rows.", the table, and a blue-outlined primary "Add $5.00 and carry on", then Run again, What I did. Unverified has the amber box, refuted the red pill, neither a tick.
- `kind-secondAttemptFromSaved-card.png`: "This time 18s and $0.00. First time 3m 14s and $1.12." and "Saved so next time is quicker. It worked last time."
- `rows-first-five.png`, `rows-show-all.png` (`...71ca7-hand-over-the-rows-as-files/`): 5 rows, then "Show all 10" expands to 10 rows in place and becomes "Show fewer". CSV and JSON each add one file: JSON body parses to exactly the rows; CSV has header `Title,Price`, 11 lines, and a quoted cell `"Team member 1, ""quoted"", role",0.5` (asserted).
- `narrow-360.png`, `narrow-360-scrolled.png` (`...06378-rolls-inside-its-own-region/`): at 360 px, `documentElement.scrollWidth <= innerWidth` (no page scroll), every button inside the panel, and the table scrolls inside its own region (visible scrollbar under the table). BUT see defect 1.
- `keyboard-focus-ring.png`, `keyboard-pressed.png` (`...842ff-n-in-order-and-presses-them/`): Tab from the table region visits Show N rows, CSV, JSON, Run again, What I did in DOM order (asserted equal to the DOM list); a dark-blue ring is clearly visible on the focused CSV button; Enter on CSV, Space on JSON each download a file, Enter on Show N rows expands and keeps focus.

### B. job-board
- `budget-out.png`, `budget-out-after-add.png` (`...ae2c2-rry-on-and-the-turn-updates/`): exactly one `add-budget` button "Add $5.00 and carry on"; the click calls `addBudgetAndCarryOn` with `{projectId, attemptId:"attempt-listings-1", addUsd:5}` (asserted) and the card disappears (attempt is working again). See observation 3.
- `waiting-waitingForPermission.png`, `waiting-waitingForPerson.png`, `waiting-stuckInALoop.png` (`...475ca--only-check-stuck-in-a-loop/`): amber cards "Waiting for your permission", "Waiting for you", "I keep getting stuck on this". Permission and person-only have no keep-going/tell-more/stop/run-again/add-budget (only "What I did"). Stuck has Keep going, Tell it more, Stop, What I did.
- `waiting-stuck-after-keep-going.png`: Keep going puts a "Keep going." bubble in the thread; one `panelConversationSend` with text "Keep going." (asserted).
- `waiting-stuck-tell-it-more-focus.png`: Tell it more focuses the composer (`#conversationInput` toBeFocused). The composer's focus ring is faint (grey border only), see observation 4. Stop sends one `panelStopRun` with the project id.
- `work-header-working.png`, `work-header-working-steps.png`, `work-header-no-cost.png` (`...2908f-ost-where-spend-is-not-real/`): strip above the composer reads "Working . 1m 12s . $0.34 of $5.00" with the line "Reading the job list" under it and one Stop pill right. With `page.clock.fastForward(60s)` the time reads 2m 1x s; a re-pushed activity keeps `.chat-stop` count at 1 and visible. Steps stay open in the stream: two reasoning lines ("Reading the job list - I need the newest listings ...", "Checking the order - ...") and one "Click . Newest first / Done" card; none inside a closed `details`. With `reportsSpend:false` the cost segment is empty and the header text has no "$" ("Working . 1m 12s").
- `work-header-waiting.png` (`...77a4a-nd-offers-Show-the-question/`): header "Waiting for you . 1m 35s", "Finish the check on the page", Stop, and a "Show the question" button (the question sits in another thread). The stream shows the "Waiting for you" card too.

### C. crossborder-marketplace, real rows (`answer-turn-tests-answer-r-4d165-erified-first-five-total-13/`)
How the run is real: the walk of `live-tasks/.../crossborder-marketplace-spain-hubs.spec.ts` (search "usb c hub", sidebar Spain + Free shipping + 4 stars and up, the person passing the traffic screen, detect, read with rating >= 4.5 and ads out). Its 13 rows were asserted equal to `spainHubRecords()` (the scenario's own expected rows) BEFORE feeding them on. They were then served as the run's `exportDataset` reply (and its `runDetail`), a final run activity push was sent, and the extension's real `resultsPort` built the outcome.
- `real-rows-first-five.png` (viewport made 1300 tall so the whole card shows): "Found 13 rows"; amber "Not confirmed ... please look to be sure"; no tick; header Title, Store, Price, Rating; first 5 rows (asserted equal to expected rows 1-5, including "16,49 €" as the site writes it); "Show all 13", CSV, JSON; "On the site: nothing changed"; "Took 39s"; Run again, What I did. No "$" and no cost (port reports no spend).
- `real-rows-show-all.png`: all 13 rows, equal to expected, in order. JSON file body equals expected (13 rows); CSV has 14 lines; `exportDataset` was asked for json and csv.
- Limits: the read ran in the test process and the results went in as data; a real Flow run through Core and the background (writing attempt records) was not available, so the spend, check verdict and `from` are the adapter's (absent).

## Product observations (not fixed by me)
1. Table columns have no minimum width, so a narrow table crushes its first columns and breaks words in the middle. At 360 px with five columns the Title column is 43 px wide: "Stee/l/toas/ter", "Glas/s/jug" (`narrow-360.png`). Even at 420 px with the real rows, Store reads "Castella/n Gadgets ES", "Nordwa/ve/Electron/ics" and the price "16,49" puts its euro sign on its own line (`real-rows-first-five.png`). Looks like `.answer-table` / `.answer-table-scroll` in `packages/ui-components/src/chat/chat.css` (answer block): cells wrap anywhere instead of the region scrolling. A `min-width` on cells (or `overflow-wrap: normal`, `white-space: nowrap` for short columns) would let the region scroll instead.
2. A refuted or unverified result still carries a "Saved, and it partly works. I will repair it next time." line (`kind-rowsChecked-refuted-card.png`, `kind-budgetOutPartial-card.png`). It is true to the record but sits oddly under "Did not pass the check"; the wording may want to depend on the check state. Also a `done_on_site` with an act that "may have happened" still shows a green "Checked" (`kind-doneOnSite-card.png`) because its label is confirmed.
3. After "Add $5.00 and carry on" the whole card vanishes at once, since a working attempt has no answer turn, taking the "Budget added. Carrying on." status with it. In my scripted case no activity was running, so the thread shows only the person's message (`budget-out-after-add.png`). In the real flow the work header should take over; I did not exercise that (the header needs a live activity push and was proven separately).
4. Composer focus after "Tell it more" is hard to see (only a faint grey border), unlike the answer buttons' clear blue ring.
5. The "Show all N" button reads "Show N rows" when the preview holds fewer rows than the total or when all previewed rows are not shown; with the extension adapter (preview up to 50) a 13-row result says "Show all 13" and shows no "Showing 5 of 13" note. Fine, but the note and the label vary with the preview size.

## Not verified
- Dark theme (all pictures are light). Firefox popup layout (Chromium only; 360 px stood in for the popup width).
- A real Flow run through Core: spend, check verdict, saved chip and `from` for real runs. C reads the real rows but the attempt record around them is the adapter's.
- The "Show the question" button was not pressed (only shown); "What I did" scrolling was not exercised.
- Time-driven header was driven with Playwright's clock (`fastForward`), not by waiting.

## Open questions
- Should the narrow-table layout (1) be fixed in Core before the first live round? Say if you want me to write the spec's assertion for it once it is fixed (I recorded the Title column width, 43 px at 360, as a test annotation only).

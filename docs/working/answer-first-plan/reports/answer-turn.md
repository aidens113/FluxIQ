# Answer turn (t862, Answer lane)

Worktrees: Core `C:/Users/osrs_/FluxStuff/fxwork/t862/!FluxIQ`, Extension `.../!FluxIQWebExtension`, branch `task/t862-answer-turn`. Nothing committed. No provider call, no Lab launch. Worker reports: `reports/answer-turn/{answer-view,work-header,extension-adapter,browser-proof}.md`.

## Outcome

Done. A result now reaches the chat as an answer turn, budget-out and the three waits have their shapes, the work header replaces the Stop row and live line, the extension reads real rows after a run, and the first reply promises the result. Proven headed on company-website, job-board and crossborder-marketplace.

## What was built

1. **Answer turn** (`packages/ui-components/src/chat/answer/`): kinds rows, done on the site (from the act record's `acts` only), plain answer (labelled as the model's words), partial. Checks: confirmed has a tick, unverified has none and says why, refuted has a failed mark. "Found N of N" only when confirmed; otherwise "Found N rows". Show all, CSV, JSON, Run again, What I did, saved chip, "This time ... First time ...". A failed read after a good one keeps the earlier answer (one line in `reader.ts` makes it strict).
2. **Budget out**: "I reached this task's budget." what I got (labelled by its own check), what I saved, ONE action "Add $5.00 and carry on".
3. **Waiting**: permission, person-only check, stuck in a loop as answer-area states. Stuck offers Keep going (sends "Keep going." into the thread), Tell it more (focuses composer), Stop (stop port).
4. **Real rows**: extension adapter `apps/extension/src/panel/chat/transport/ports/results/` listens for a finished run, reads `runDetail` then `exportDataset` (json), builds an outcome. `reportsSpend: false` (my port-level flag, outside the contract records) so no "$0.00" is invented. Always `unverified` today (run summaries carry no check verdict). No Core change was needed.
5. **Work header** (`src/chat/work-header/`): `Working · 1m 12s · $0.34 of $5.00 · [Stop]`, one Stop element for the chat's life, waiting states, "Show the question". Cost/budget come from a `working` attempt read through the results port (`meterOfOutcomes`), no typed activity field added. Live line (`view/live-line*.ts`) and `.chat-run-controls` hook are gone from the thread; `chat-stop*`/`chat-hold*` hooks kept. Steps: "done again" dropdown is now one plain line; a failed step a later same-act try got past is neutral. Every step stays visible, never folded.
6. **First reply** (`create-here.ts`): "I'll do this on ${place} and show you the result here. I'll save how I did it, so next time is quicker." Two Core tests updated.

Integration I did: `chat-widget.ts` wiring (reader per owner, header in the dock, meter, `buildChatStream` outcomes, answer host callbacks, read when the thread becomes known), removed the live line from `thread-view.ts`, fixed tests for the new `render` signature, deleted the four live-line tests (their cases live in `work-header/tests`), added `tests/answer-in-chat.test.ts`, removed `liveLineModel` from the extension's `panel/chat/index.ts`, and a CSS fix after the pictures (table cells had no minimum width and broke words mid-word).

## Commands and observed output

- Core `packages/ui-components`: `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2 --reporter=dot` -> `Test Files 94 passed (94)`, `Tests 616 passed (616)`.
- Core root: `pnpm.cmd --filter @fluxiq/ui-components check` -> stamped, no errors. `node scripts/structure-audit.mjs` -> `passed (488 warning(s), 1097 baselined)`.
- Core `packages/fluxiq`: vitest on `extension-chat.test.ts` and `respond-to-turn.test.ts` -> 2 files, 25 tests passed.
- Extension: `EXTENSION_TEST_BUILD_LABEL=t862 node scripts/test-extension.mjs panel/` -> `tests 585, pass 585, fail 0`. `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> no errors. `node scripts/structure-audit.mjs` -> `passed (234 warning(s), 553 baselined)`.
- Headed, `pnpm.cmd run test:content <explicit path> --headed --workers=1`: company-website spec (4) and crossborder spec (1) -> 5 passed after the CSS fix; job-board spec -> 4 passed.

## Pictures (under `apps/extension/e2e/test-results/content/artifacts/`, ignored folder) and what I saw

- `answer-turn-tests-answer-k-6ca4a-er-turn-drawn-and-looked-at/kind-rowsChecked.png`: "Found 10 of 10", green "✓ Checked", shaded table, 5 rows, CSV/JSON, On the site, Checked, From, Saved line, Run again, What I did. Clean, readable.
- `...unverified-card.png`: "Found 10 rows", amber "Not confirmed ... please look to be sure", no tick. `...refuted-card.png`: red "Did not pass the check", no tick.
- `answer-turn-tests-answer-k-06378-rolls-inside-its-own-region/narrow-360.png`: 360 px, no page scroll, table scrolls inside its own region, words whole after the fix (Title column 43 px before, 87 px after; before it read "Stee/l/toas/ter").
- `answer-turn-tests-answer-r-4d165-erified-first-five-total-13/real-rows-first-five.png`: crossborder-marketplace, "Found 13 rows", not confirmed, no tick, first 5 rows exactly the scenario's expected rows (13 real rows from a model-free Spain-hubs walk through content-script actions and the domain evidence runtime, then the real adapter), "Show all 13", CSV, JSON, "Took 39s", no cost.
- `answer-turn-tests-answer-w-ae2c2-rry-on-and-the-turn-updates/budget-out.png`: budget-out with one blue action "Add $5.00 and carry on".
- `...475ca--only-check-stuck-in-a-loop/waiting-stuckInALoop.png`: "I keep getting stuck on this", Keep going / Tell it more / Stop / What I did. Permission and person-only turns have none of those three.
- `...2908f-ost-where-spend-is-not-real/work-header-working.png`: strip above the composer "Working · 1m 12s · $0.34 of $5.00", "Reading the job list", one Stop; both steps visible with reasoning above, no dropdown. `work-header-no-cost.png`: no "$" when the port reports no spend. `...77a4a.../work-header-waiting.png`: "Waiting for you", what it waits for, Show the question.
- Keyboard: Tab order matches DOM, Enter/Space press CSV/JSON/Show all, visible focus ring (`keyboard-focus-ring.png`).

## Decisions made

- Cost and time for the header come from the results port's `working` attempt, not new activity fields. Time starts from the first event's `at`.
- Port-level `reportsSpend?: false` so the adapter's placeholder spend is never drawn.
- Keep going = send "Keep going." into the thread (no new port method). Add budget amount = the attempt's budget again.
- Adapter outcomes are `achieved` + `unverified`, which Core's `checkAutomationStudioTaskAttemptResult` rejects (it requires `confirmed`). The chat port never runs that check; when Core's real records land they replace this.
- Fixed the table width defect myself (CSS in the owned package).

## Not verified / open

- No real Core run: spend, check verdict, saved chip, "From" site as a host name (the scripted fixture used a page title), Run again against a real Flow, and the Keep going / Show the question / What I did presses against live Core.
- Adapter's assumption that the final run push carries `conversationId`, `final`, phase `done` was not seen live; only scripted. The adapter only knows runs seen during this panel session (reload loses them until Core's records land).
- Dark theme, Firefox popup, and the real extension loaded in Chrome were not exercised (the specs mount the real chat on realistic scenario pages with a scripted background).
- Open wording points for the lead: a refuted or budget-out answer still shows the "Saved, and it partly works" line; a `done_on_site` with a "may have happened" act still shows a green "Checked" because its label is confirmed; after Add budget the card disappears until the header and a live push take over (the header was proven separately). The "(3 times)" repeats and "Done on the 2nd try" were left as counts on one card; the "Robot check" card still sits beside the ask sentence.
- Not committed; version bumps are the lead's.
- Core `@fluxiq/ui-components` dist and the Extension domain were rebuilt in the worktrees (ignored build output).

## Round 2: the lead's three fixes and Run again (same task, still uncommitted)

1. **No tick beside an uncertain act.** `answer/model/effective-label.ts`: a result whose check said yes but whose act record holds a `may_have_landed` act is told as not confirmed (no tick, "Something may have happened on the site that I could not settle, so please look to be sure", "Meant to check: ...", "Found N rows" not "N of N"). Settling every act brings the tick back. Test in `answer/tests/model.test.ts`. Picture: `answer-turn-tests-answer-k-6ca4a-er-turn-drawn-and-looked-at/kind-doneOnSite-card.png` (amber "Not confirmed" box, both acts listed, no tick).
2. **Told once, for asks too.**
   - The "Robot check / Waiting for you" card is no longer drawn (`stream/step/without-person-check.ts`, applied in `buildChatStream`; the question with Continue and Stop is the one telling). The reasoning before a check stays. `stepMessages` itself is unchanged, so its settling rules and tests stand. Four card-view tests were rewritten to assert no card.
   - "(N times)" is gone from card wording. Identical refusals and failures that did nothing still fold into one card, said once with no count. **Decision beyond the brief:** I stopped folding successful repeats altogether (`card-repeats.ts`), because five reads of five pages are five real steps and "Every step stays visible" is the user's rule; a count would have hidden them. Each now shows as its own "Done" card. "Done on the 2nd try" (`retried.ts`) is kept: it names which try worked, not a repeat count. Tests updated (`messages`, `card-words`, `recovery-message`).
   - Saved line under refuted and budget-out kept, as you decided.
3. **The adapter's record passes the shared check.** A finished run nothing confirmed is no `achieved` attempt: it carries a package-local status `finished_unchecked` (`ChatFinishedRunAttempt` in `ports/results.ts`, never a contract status, never written by Core). The answer turn tells it as found and not confirmed with no tick, so the crossborder picture still reads "Found 13 rows, not confirmed". A run whose own summary confirms its check is `achieved` with a `confirmed` result. The extension adapter test (`results-port.test.ts`, 23 tests pass) runs `parseAutomationStudioTaskResult` and `checkAutomationStudioTaskAttemptResult` from `@fluxiq/contracts/automation` on both outputs.
   - **Needs your call: to import the contract from the extension's test I added one line to `apps/extension/package.json` (`"@fluxiq/contracts": "link:../../../!FluxIQ/packages/contracts"`, a link like its three Core siblings) and the matching 3 lines in `pnpm-lock.yaml`.** Without it the structure audit refuses the import (Core's build files are not a public surface), and `fluxiq` does not re-export the contract. Backups of both files are in the session scratchpad if you prefer a different route (for example `fluxiq` re-exporting the contract's automation records, which is outside this lane's files).

### Run again on a budget-out, from the person's view

It could repeat a lasting act: Run again starts a new attempt and may run the saved steps again. Decision and change: when the act record holds an act that landed or may have, (a) a budget-out gives way to "Add $5.00 and carry on" alone, which carries the same attempt on with its act record, so nothing is done twice; Run again stays only if the port cannot add budget; (b) any other ended answer keeps Run again but says first, above the buttons, "Running this again may repeat what was done on the site." A read-only task shows neither. Model tests in `answer/tests/model.test.ts`; headed picture `answer-turn-tests-answer-w-a15e1-d-budget-and-carry-on-alone/budget-out-did-something.png` (saved job listed under "On the site", "Add $5.00 and carry on" and "What I did", no Run again).

### Round 2 commands and observed output

- Core `packages/ui-components`: `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2 --reporter=dot` -> `Test Files 94 passed (94)`, `Tests 619 passed (619)`. `pnpm.cmd --filter @fluxiq/ui-components check` -> stamped, no errors. `node scripts/structure-audit.mjs` -> `passed (488 warning(s), 1097 baselined)`. `pnpm.cmd --filter @fluxiq/ui-components build` -> ok.
- Extension: `EXTENSION_TEST_BUILD_LABEL=t862 node scripts/test-extension.mjs panel/` -> `tests 586, pass 586, fail 0`. `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> no errors. `node scripts/structure-audit.mjs` -> `passed (234 warning(s), 553 baselined)`.
- Headed `pnpm.cmd run test:content <paths> --headed --workers=1`: first pass had one expected failure (the company-website spec still expected a tick on the done-on-site card; spec updated to the new rule). Then company-website (4) and job-board (5, one new) -> 9 passed; crossborder-marketplace real-rows (1) passed in the earlier all-three run -> 8 of 9 passed then, its 1 failure being that spec. Pictures viewed: kind-doneOnSite-card.png, budget-out-did-something.png.

### Not verified (round 2)

- The removed robot-check card was proven in unit tests only (stream and card-view tests), not re-shot in a browser picture: the job-board waiting spec passes but does not assert the card's absence. The crossborder picture was not re-viewed after this round, only re-run (passed, assertions unchanged: first five rows equal expected, unverified, no tick).
- `finished_unchecked` exists only in this package and the extension adapter; Core's real records never carry it, so a Core `readThread` simply never produces it.

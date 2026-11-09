# Live lane B (t876, slot-2): everything-store, job-board, photo-social

Supervisor: lane B sub-supervisor. Branch `task/t876-live-breadth-b` in both
`fxwork/t876` trees. Share of the Claude credit: about $40, expiring 2026-11-10.

## State at wrap-up (2026-11-05, evening)

- 20 launches: 16 reached the model, 1 failed at Core startup ($0), 3 were refused by the Lab before any call ($0). About $4.63 spent of the ~$40 share. No balance error.
- Pairs passed: batteries Haiku and Sonnet, quillmark Sonnet (the toggle case: attempt 2 pressed no heart). Kiln Sonnet: both answers right and no duplicate collection, but attempt 2 parked on the judge (fixes 8-10 built for it). Quillmark Haiku: one wrong (judge yes on 3 search rows, lane A), one parked on an empty A6 judge reply (A6 since taken out of dev).
- Held by the lead: count tasks (batteries, napkins, kiln) until lane A's repeat fix lands; Haiku judged pairs resumed on dev without A6 but none run since.
- Open: fixes 8-11 done and verified locally, uncommitted, not live-checked; the next live check is a kiln Sonnet pair (attempt 1 saves its steps; attempt 2 ends right without a wait). Second-choice tasks (coupon-earbuds, remote-easy-apply, august-over-1300) not started. A home-page click flake in local-classifieds tests (`open-furniture`/`open-buying` under heavy load) is undiagnosed and unowned. The judge's "what would settle it" (lane A) and an attempt-record field to keep a before reading across a Core restart are not done.

## Fix log

| # | Cause | Files | Exposing run | Validation | Status |
| --- | --- | --- | --- | --- | --- |
| 11 | Flaky provider-free test: local-classifieds "nearby furniture" timed out waiting for "Try again" under load. Cause (not the blind scrolls): a filter change inside the feed's 250-500 ms load wait sent the old generation's batch-1 request with the new filter, which spent the one failure; the page dropped it as stale, so "Try again" never appeared. Fix: the recording waits on the site's state (skeletons gone, no check alert, or "Try again") after each filter and each scroll, and never scrolls blind. A separate home-page click flake (`open-furniture` / `open-buying`, 2-5 of 24 under 24-way load) is undiagnosed and unowned. | Downstream `apps/scenario-lab/src/scenarios/local-classifieds/script/filters.ts` (`feedSettled`, waits after filters), `script/results.ts` (`scrollWholeFeed`) | integration checks | worker: breadth 7/7, scenario + browser 15/15, audit passed; deterministic repro old 2-5 of 12 fail, fixed 12/12 | done, verified locally |
| 9 | Kiln attempt 2's unsure loop: the model fetched the missing evidence (opened and searched the collection) but looks were not in the judged summary, so the fingerprint stayed and completions were refused `same_evidence` until `ask_person`. Diagnosis: `lane-b/unsure-loop.md`. Fix (a): a bounded, screened `looked` list (where, what was found; last 6, cut short, screened twice) of looks after the first lasting act reaches the judge and the evidence fingerprint; the refusal names a look at the page as the way out and no longer says "need not keep trying". (c) the judge's "what would settle it" is lane A's. | Core `answer-first/attempt/call-chain.ts`, `attempt/run-attempt.ts` (:175-176 list, :184 to the check, :212 to the chain), `completion/check.ts`, `completion/refused-words.ts`, `flow-less/types.ts:22-23` (the one field), `flow-less/judged-summary.ts` (view :70, bounds :33-36, withheld :48-49, :80-102), `flow-less/question.ts:16` (one line); tests `completion/tests/looked-evidence.test.ts`, `attempt/tests/looked.test.ts`, `flow-less/tests/looked-view.test.ts` | run-mw4dsh8i-3fb9dc39 | worker: flow-less + completion + attempt + witnesses 24 files / 150 tests; supervisor: `npx vitest run --maxWorkers 2 --minWorkers 1 src/runtime/result-verification/flow-less/tests src/framework/automation-service/service/answer-first` -> 95 files / 749 tests pass; `pnpm --filter fluxiq check` clean; Core structure audit passed (534 warnings, 1097 baselined) after the supervisor fixed 2 `swallowed-failure` comments and 1 `statement-packing` line | done, verified locally; not live-checked (count tasks held) |
| 10 | Kiln attempt 2 had no before reading for acts carried from attempt 1, so every unsure asked for before/after it could not get. Fix (b): attempt 1's before reading travels with the carried acts in process memory (page text, never persisted; after a Core restart the judge is told an earlier attempt took it). | Core `answer-first/witnesses/{witnesses.ts, input.ts, index.ts, before-readings.ts (new), earlier.ts (new), earlier-words.ts (new)}`, `attempt/opening.ts` (49, 73, 102-117), `attempt/run-attempt.ts` (53, 133, 171-174); tests `witnesses/tests/witnesses.test.ts`, `witnesses/tests/before-readings.test.ts`, `attempt/tests/carried-before.test.ts` | run-mw4dsh8i-3fb9dc39 | worker: witnesses + attempt + carry-on 71/71, later-attempt/same-words/saved-read-restart 55/55; supervisor: covered by the same 95-file / 749-test run, typecheck and audit as fix 9 | done, verified locally; not live-checked |
| 8 | Kiln attempt 1's steps could not be saved (`evidence_completion_parameters_unresolved`): one "Saved" back link pressed from two pages got two agreeing pre-act witnesses, and `absolute.ts` accepted exactly one, so it answered `web.handle.ambiguous`. Not lane C's af5b23723 (zero witnesses). Fix: several acted witnesses that all agree resolve; zero or disagreeing still refuse. | Downstream domain `plan-resolution/control-intents/absolute.ts` (~57-75), tests `control-intents/tests/resolution.test.ts` (+2), `control-intents/tests/host.ts` (`leading` handle-shift option) | run-mw4dsh8i-3fb9dc39 | control-intents 21/21, plan-resolution 319/319; supervisor: `pnpm --filter @fluxiq-web-extension/domain check` clean (after the Core rebuild on dev); downstream audit passed (244 warnings, 552 baselined) | done, verified locally |
| 7 | A press in a dialog had no name on the card ("Done."): the card rule gave nothing in a dialog. Fix: a press in a named dialog is named by the binding's private `dialogNames`, never shown to the model. | domain `node-run/press-effect/acted-on-card.ts`; tests in `press-effect/tests/acted-on-card.test.ts` (a Done in a named dialog is named by it; the look is byte-identical whatever the dialog is called) | run-mw4dsh8i-3fb9dc39 | domain acted-on 14/14; domain typecheck clean; audit passed | committed (8b10eaa52); live-checked: not yet |
| 6 | A press on a lone card (one search result, no look-alike) was named only by its control ("Add to cart."): the capture reads each element's record words but publishes them (`within`) only to tell look-alikes apart, and publishing more would grow every page view. Fix: the binding keeps the same words privately as `cardWords`, never in the evidence; `acted-on-card.ts` reads `within`, else `cardWords`. | Downstream domain, `runtime/llm-evidence/`: `sanitize.ts` (type field `cardWords` after `subjects`, the Map beside `subjects`, one `set` beside the `subjects` set, the `present<>` key), `stable-handles.ts` (Map and re-keying beside `subjects`, the `present<>` key), `capture.ts` (one line beside `subjects`), `structure/detect.ts` (one line beside `subjects`), `node-run/press-effect/acted-on-card.ts`; tests in `press-effect/tests/acted-on-card.test.ts`: a lone card's add is named by its card; the look's evidence JSON and rendered page lines are byte-identical whatever the card's words, and never contain them | run-mw4c1gwh-0a615df9 (attempt 1's add), run-mw4coxdn-e2b30c8c | domain typecheck clean; domain tests acted-on 12/12, stable-handles 24, look-alikes 11, sanitize 21, capture 22, structure 81, present 5; audit passed | committed (6b1f3eb34) |
| 5 | A failed isolated-Core startup in the attempt lane lost its logs: `startTopology` copies startup logs only when `copyStartupFailureLogs` is passed, which the scenario lane does (`run-scenario.ts:251`) and the attempt lane did not, so run-mw499mns-1532a49a's Core web build failure left no log. | Downstream test-runner: new `attempt-lane/live/attempt/startup-logs.ts` (`attemptStartupLogs`: copies the logs to the run's `startup-logs/`, and the failure says "Its startup logs are in <path>" with `details.startupLogs`); `attempt/session.ts` (import line 8, input field 33-34, `startupLogs` const 54, `copyStartupFailureLogs` spread 73, catch 108); `run-attempt-command.ts:170` (one line, `startupLogsDirectory`); test `attempt/tests/startup-logs.test.ts` (a failing build leaves its log in the run folder and the failure names it; nothing copied, nothing renamed) | run-mw499mns-1532a49a | test-runner `pnpm build` clean; startup-logs test 2/2; downstream structure audit passed (244 warnings, 552 baselined) | committed (070a770a1) |
| 4 | The card names an act by the page title when the press is in no detected list: Haiku's descaler add from the cart page's suggestion tiles read "Add to cart: Brightaisle.com Shopping Cart" (Core `answer-first/act-record/item-names.ts` fell back to `page-words.ts`). Fix: the domain says the control's own card for a press in no list, `actedOnCard` (the capture's `within` card words, else the heading the control sits under on the same part of the page, else nothing), apart from `actedOnItem` so it never makes a row tie; Core names the act by it in place of the page title, which is never used again. | Downstream domain: new `node-run/press-effect/acted-on-card.ts`, `press-effect/index.ts` (barrel line), `node-run/outcome.ts` (+`actedOnCard`), `node-run/run.ts` lines 78 (import), 254, 543 (beside `actedOnItem`, one line, keeping the file at 800), `node-run/written-step.ts:117`; test `press-effect/tests/acted-on-card.test.ts` (tile in no list; item page heading; a heading of another landmark gives nothing; a list press keeps its item and no card). Core: `answer-first/act-record/gate/read-answer.ts` (`card` from `actedOnCard`, `pageTitle` gone), `gate/act-gate.ts:109`, `contracts.ts:64-65`, `record.ts:260,267`, `item-names.ts`, `index.ts` (barrel line), `page-words.ts` deleted; tests `tests/item-names.test.ts` (re-pointed to `card`; new "a page's title never names an act" and "a card's words are said, never a row tie"), `tests/real-press-answers.ts` (`pressSaveAnswer` carries `actedOnCard`, as the domain now answers). Also t869's request: `answer-first/completion/check.ts:138` says the real check count. | run-mw44rtn1-37dee092 (and dining-tables run-mw3itjcy-ce4429f7) | domain acted-on tests 8/8; Core vitest act-record + completion (2 workers) 21 files / 328 pass; `pnpm --filter fluxiq check` clean; Core structure audit passed (532 warnings, 1097 baselined); domain typecheck and downstream audit re-running after keeping `run.ts` at 800 lines | committed (8b6313eaf, 89aef4bf5, adacec714 option-change test); live-checked on run-mw4c1gwh/run-mw4coxdn cards ("Add to cart." honest fallback) |
| 3 | A table request completed with no rows: Core accepts a completion with acts and the model's own answer text and 0 rows (`answer-first/completion/check.ts:95`), and the read-out "give me what is in my cart" is an `open` act any kept opener ticks (`instruction-acts.ts:151`). Design: `lane-b/read-out-rows.md`: refuse `answer_first.rows_not_read` when the request asks for records and no read ran; drop the read-out act pattern. | Core `runtime/flow-authoring/bootstrap/answerability/index.ts` (exports `instruction-ask.ts`); `framework/automation-service/service/answer-first/completion/check.ts` (`rows_not_read` refusal), `completion/refused-words.ts` (`rowsNotRead`), `rows/sink-type.ts` + `rows/row-sink.ts` (`readsAnswered`), `attempt/run-attempt.ts` (one line, :174 `readsRan: () => sink.readsAnswered() > 0,`); `instructed-acts/instruction-acts.ts` (read-out pattern kept as a clause boundary, `readOut: true`, makes no act). Tests: new `completion/tests/rows-not-read.test.ts`, new `answer-first/tests/endings/tests/refused-rows-not-read.test.ts` (refused, then next round reads and ends achieved; nothing asked back completes with no read), `row-sink.test.ts`, `instruction-acts.test.ts`, re-pointed `check.test.ts`, `checklist.test.ts`, `bootstrap-completion.test.ts`, `notes.test.ts`, `refused-again.test.ts`. Worker: worker-heavy (`lane-b/read-out-rows.md`). | run-mw45itmx-c4d6f5cb | supervisor re-run: vitest answer-first service + instructed-acts + answerability + decision-handlers + bootstrap-completion + asked-count + draft-amendment-feedback: 124 files, 1251 pass; worker: `pnpm --filter fluxiq check` clean, Core structure audit passed | committed (66ced8fa7); live-checked: run-mw48myz5-12cc1ddd (refusal fired, then read, right) |
| 1 (committed dfc00bd86) | `judgeAskedAgain` (Run again oracle) read a set-to act as an amount: "make the batteries three packs" landing 5 on a Run again counted as `pressedAgain` and held. The asked table had no way to say an act names an end value. | extension tree: `packages/test-runner/src/flow-lane/creation/site-change/asked/index.ts` (`AskedAct.sets?: true`), `asked/table.ts` (batteries-and-descaler's batteries act, bigbox ensure-soap-quantity's soap act), `later/judge-asked-again.ts` (a `sets` act moved further is a repeat), `later/tests/judge-asked-again.test.ts` (+3 tests: set-to-3 landing nothing holds; landing 5 is a repeat while the add beside it may move again; the table marks the two set-to acts) | lead's review (no run) | `pnpm --filter test-runner check` pass; site-change tests 28/28 pass; both structure audits pass | committed (dfc00bd86) |

| 2 | Every batteries run wastes one call: "give me what is in my cart" is an `open` act (Core `instructed-acts/instruction-acts.ts:151`), ticked by the step that opened the cart, but the checklist shows only verb "give" and the read-out's words, so the model names it on the read; the add with that act is dropped silently (`llm/evidence-loop.ts:189`) and the retry is refused `act_on_a_read` with a way out pointing forward (`draft-amendment-feedback/fallback.ts:80-88`). Diagnosis: `lane-b/act-on-read.md`. | Kept: Core `llm/decision-handlers/amendment.ts` (`ClaimWrittenAct` tells `act_on_a_read` for a written read), `llm/evidence-loop.ts:189` (calls it for any kept step with an act), new `llm/decision-handlers/tests/act-on-read-told.test.ts`. **Reverted:** the `openSaid` checklist line (`checklist.ts`) and the opener way-out sentence (`fallback.ts`). They told the model to name the read-out on the page's opener, which ticked it before any read and caused run-mw45itmx-c4d6f5cb's no-rows failure. | run-mw43nq03-285153fa, run-mw4415ke-8ac2857a, run-mw44cwfl-253505f4 (step 0022 each); the revert because of run-mw45itmx-c4d6f5cb | vitest decision-handlers + instructed-acts + draft-amendment-feedback: 34 files, 491 pass (after the revert); fluxiq typecheck and Core structure audit passed before the revert | kept part committed (790506fce); openSaid and the opener sentence reverted |

## Run table

Attempt 2 held by the lead until the `$row.url` fix reaches the branch, so pass rate is counted on attempt 1.

| Run id | Task | Model | Attempt 1 | Attempt 2 | Cost | Calls | Cache % | Time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| run-mw43nq03-285153fa | batteries-and-descaler | Sonnet | right (batteries 1 to 3, descaler +1, no repeat) | held | $0.2653 | 12 | 74% | 98 s |
| run-mw4415ke-8ac2857a | batteries-and-descaler | Sonnet | right (same acts) | held | $0.2702 | 12 | 73% | 110 s |
| run-mw44cwfl-253505f4 | batteries-and-descaler | Sonnet | right (same acts; watched after the fact, not live) | held | $0.2767 | 12 | 72% | 88 s |
| run-mw44rtn1-37dee092 | batteries-and-descaler | Haiku | right (card names the add by page title) | held | $0.0232 | 12 | 73% | 142 s |
| run-mw45itmx-c4d6f5cb | batteries-and-descaler | Haiku | wrong, no_result (acts right, no read; caused by lane B's `openSaid`, since reverted) | held | $0.0178 | 10 | 69% | 114 s |
| run-mw45vqbj-12b28717 | save-quillmark-remote | Sonnet | right (3 saves, no unsave, 5 rows) | held | $0.4855 | 20 | 78% | 188 s |
| run-mw46uxke-6bffc19b | save-quillmark-remote | Sonnet | right (same saves, 5 rows) | held | $0.4873 | 21 | 80% | 189 s |
| (refused, no id) | save-quillmark-remote | Sonnet | not started: the Lab's core-build gate refused while a worker edited Core source; no provider call, no cost | - | $0 | 0 | - | - |
| run-mw48myz5-12cc1ddd | batteries-and-descaler | Haiku | right on Core 66ced8fa7: `rows_not_read` refused a no-read completion, the model read the cart, 3 rows | held (pairs not yet on) | $0.0321 | 19 | 76% | 184 s |
| run-mw499mns-1532a49a | batteries-and-descaler | Haiku | not started: Core web build failed at startup (most likely lane B editing Core during it); 0 calls | - | $0 | 0 | - | - |
| run-mw4a2ywt-f935cbc5 | batteries-and-descaler | Haiku | right (rows_not_read once, then read; card "Add to Cart: About this item", since fixed) | not started: Core's chat asked instead of running (lane A's panel-command fix); stopped | ~$0.03 | ~19 | 75% | - |
| run-mw4b0gs6-06ff6993 | save-quillmark-remote | Sonnet | right (same saves, 5 rows) | held | $0.4933 | 20 | 78% | 191 s |
| run-mw4b7kav-cbff03e1 | photo-social-kiln-notes | Sonnet | attempt 1: 1 / 1; pairs: 0 / 1 (attempt 2 right but parked on the judge) |
| save-quillmark-remote | Haiku | wrong (records, not_shown): acts right, but 3 filtered search rows stored, saved list never read; judge said yes (lane A's area) | held | $0.1205 | 53 | 78% | 644 s |
| run-mw4c1gwh-0a615df9 | batteries-and-descaler | Haiku | right (13 calls) | right: found both acts done, changed nothing, ran the saved Flow then explored, 3 rows | $0.0426 | 23 | 70% | 327 s |
| run-mw4coxdn-e2b30c8c | batteries-and-descaler | Sonnet | right (11 calls) | right: both found done, nothing changed; one judge reply unreadable under A6 (lane A) | $0.5178 | 21 | 68% | 206 s |
| run-mw4d2rwb-fc03c3ac | save-quillmark-remote | Sonnet | right (3 saves, 5 rows, 19 calls) | right: found done, site change and activity empty (no heart pressed), 3 calls, $0.10 | $0.5641 | 22 | 75% | 247 s |
| run-mw4db9pz-2789cf41 | save-quillmark-remote | Haiku | answer right (5 rows), but ended waiting_for_person: A6 judge replied "unknown" with empty fields, then same_evidence and the loop ladder asked a person | not run (attempt 1 still waiting) | $0.0667 | 30 | 76% | 405 s |
| run-mw4dsh8i-3fb9dc39 | photo-social-kiln-notes | Sonnet | right (collection with the 2 posts, 3 rows; steps not savable) | answer right, site unchanged (no duplicate), but ended waiting_for_person: judge never confirmed (2 empty A6 replies, 3 unsure for nameless acts and no witness) | $0.9369 | 45 | 76% | 338 s |

| Task | Model | Passes / runs |
| --- | --- | --- |
| batteries-and-descaler | Sonnet | attempt 1: 4 / 4; pairs: 1 / 1 |
| batteries-and-descaler | Haiku | attempt 1: 4 / 5 (the failure was lane B's own regression, since reverted); pairs: 1 / 1 judged (run-mw4a2ywt's attempt 2 never started, before lane A's A5) |
| save-quillmark-remote | Sonnet | attempt 1: 4 / 4; pairs: 1 / 1 |
| save-quillmark-remote | Haiku | attempt 1: answers 1 / 2 right, endings 0 / 2 (one wrong rows, one parked on an empty A6 judge reply); pairs 0 / 1 |

## Phase 0: plan (2026-11-05, nothing run, nothing edited in source)

### How attempt 2 is judged (read on t869's tree, uncommitted work included)

`lab attempt --attempts 2` with no script form types the same words into the same
thread with no reseed, so attempt 2 goes through `judgeLaterChange` (not
`judgeAskedAgain`, which only the `run-again` form uses). `stillAsked` subtracts
what attempt 1 left from the asked acts; after a full attempt 1 nothing is still
asked, so the only right attempt-2 change is none: a move further the asked way is
a repeat, a move back is an unasked change. Rows are still judged against the same
expected dataset (an end state, so it is unchanged), declared account facts are
absolute and must still hold, and the shown answer must carry the rows. Attempt 2
runs only if attempt 1's answer was right (`can-go-on.ts`).

### Per task

**everything-store-batteries-and-descaler** (Sonnet, then Haiku). Asked:
`cart:B0BAAA48CT:own` +2 (one pack made three) and `cart:B0TWDESC04:own` +1.
Expected dataset `extract-topped-up-cart`, 3 cart rows. Attempt 1 traps: "three
packs instead of one" is set-to, not add-three (landing 4 is a repeat, by the
oracle's arithmetic); descaler must be the Brightaisle-sold 4 pack. Attempt 2: the
cart already holds 3 and 1; any press of Increase or Add is a repeat. The risk is
Core replaying a saved add step rather than checking the cart. Only live history:
run-mvcws1l9-f43e197f (2026-10-17, DeepSeek, project mode, passed, $0.023).

**job-board-save-quillmark-remote** (Sonnet, then Haiku). Asked: three
`saved:<key>` +1 (9acf8f84c9c767ef, 12989de62c149c5b, a31866ada1ad54e1); expected
5 saved rows. Traps: Quillmark Labs lookalike, Hybrid London, a sponsored card,
two jobs already saved, and the first heart press of each page load fails with
"Couldn't save this job. Try again." (a press that must be retried, not assumed
landed). Hearts are toggles: in attempt 2 any heart press unsaves, which the oracle
reads as an unasked change and fails. Eight project-mode runs failed 10-17 to 10-27
(icon-only heart missing from the page view, For Each value gate, reset witness
and trial-reset refusals, entry prep re-running saves); one passed 10-28
(run-mvsknvqv-555a5de2). Most of those causes were Flow-trial machinery that
answer-first does not use; the heart's visibility, the refused first save and the
toggle remain.

**photo-social-kiln-notes** (Sonnet, then Haiku). Asked: `collection:kiln-theory-notes`
+1 plus its two codes. The fixture slugs a second collection of the same name
`kiln-theory-notes-2`, so a repeated creation in attempt 2 shows as unasked
changes and a fourth tile in the rows: caught. Traps: the filled bookmarks
(pressing unsaves a post), the studio's kiln-photo lookalike, the picker naming
posts only by alt text, the messages dock covering controls, the new collection
listed last. Never run live; the site has no accepted task. Expect this to be the
dearest and the most likely to need a fix.

### Order and budget

Per task: Sonnet ($5 purse), then Haiku ($1). Batteries first (cheapest, best
understood), then save-quillmark-remote, then kiln-notes. Once a pick passes both
attempts on a model, run it twice more on that model (the person's rule, 11-05),
then take the site's second choice (coupon-earbuds-rated-four, remote-easy-apply,
august-over-1300). Rough planned spend before second choices: 3 tasks x (3 Sonnet
at about $0.5-2 + 3 Haiku at about $0.1-0.3), so $8-25, inside the $40 share.

### Guards and duties per run

- Claim `lab-slots/slot-2/owner` before the first run.
- `behind-dev`: both trees must contain local `dev`; phase 1 waits for the lead's merge.
- `debug`: a note at `docs/working/language-driven-flow-loop-plan/debugs/<runId>.md`
  in the extension tree before the next run; `unchanged`: no rerun of a failed task
  without a source change; `loop`: at most 3 runs per 30 minutes per instance.
- Watch every run with the watcher; stop at the first balance error.
- Open `answer-turn.jpg` each run and judge the chat.
- Before fixing a cause, read lanes A and C's fix logs.

### Phase 1 checks (after the lead's message)

Rebuild Core libraries, domain, test-contracts, test-runner, extension; run the
three scenarios' provider-free tests (`everything-store` breadth-oracles,
`job-board` breadth expected and scenario tests, `photo-social` expected,
breadth-paths and scenario tests); `--dry-run` each paid command.

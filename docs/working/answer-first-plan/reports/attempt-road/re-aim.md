# A row's own control, on every pass (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. Scripted model, no provider, no spend, no real site, visible Chrome. Nothing committed.

## Outcome

**Done for the forward run, proven in the browser. Done by test only for the other two paths and for a row that cannot be found.**

Before the fix, the row-link Flow exited 1 and the site recorded `unsaved pine-round-table`. After it, the same Flow exited 0, with the three tables saved once each. The plain and reshape forms, the Accept task and the apprentices task all still pass on the final code. The page view after a forward run is now the page as it stands.

Three gaps the lead should know about are under Open questions: a saved Flow and a part stop at a row they cannot do rather than going on, and one narrow wrong-row case is still open.

## The cause

The saved click reaches the page with the pass's row on it. The page then decided it did not need the row.

1. Core sends `item` on every pass: `forward.12.pass.2` in `run-mw2udxzh-d8d29f9e` carries it. So the first guess, `replay/span.ts`, is wrong.
2. The domain writes the row's values on as `element.context.record.values`: `domain/src/output-nodes/targets/row-scope.ts:57`. That part is correct too.
3. The saved identity is `{ landmark: "region" }` beside a positional selector, so the row is the only thing placing it. `apps/extension/src/content/action-runtime/pass-row/resolved-for-pass.ts:73` (before the fix) resolved it as recorded, found the first row's link, and asked `sitsInRepeatedRow`. If the answer was no, it pressed that link as a page-level control.
4. `identity/record.ts:545` (`repeatedRowOf`) answered no, because the fixture's card is `<div class="wrap"><a class="card" href>...</a></div>`, and all three of its row tests miss that shape:
   - **Record:** a `<div>` is not one.
   - **Twin:** each link is named by its own row, so none is alike (`controlRow`).
   - **Run of siblings:** the link is an only child (`identity/own-run.ts:57`).

So no refusal came, unlike the Accept case: nothing ever asked about rows. The other guess, `candidate-trial/target-on-page.ts`, only words a refusal and was never reached.

The Save press then stood on the first row's page, where nothing said it was the wrong row. A title link in a plain card, with other things beside it, has the same hole, and the fix covers both.

## The rule now

A pass presses the row's own control, or says it could not, and never presses another row's. One place decides this: `pass-row/aim.ts` (new), called from `resolved-for-pass.ts`. It asks, in order:

| Question | Answer |
| --- | --- |
| Is the page in hand another row's own page? (`pass-row/item-address.ts`: its address is the row's link with one id-like segment different, and neither the title nor a main heading names the row) | Refused |
| Is the answer a link, and does the row have a link? | Its own: act on it. Another row's: act on the element of its shape that links to this row, wherever the list moved it. None drawn: refused |
| Does it sit in a row of same-shaped parts? | The part holding every value is the row. Its own: act. One beside it: act on its copy in the same place, if that copy differs only by row data. Otherwise refused |
| No part holds the values? | A whole-card link is another row's: refused. Anything else stays page-level, as before. A toolbar's button and a form's field never have a part holding row values |

"Refused" falls through to the existing gated resolution, which fails not found with the closed word `other-record`.

**A row that cannot be found.**
- The domain marks the answer with the reason `row_control_not_found`, beside whichever code it reads the miss as (`node-run/replay.ts`, `missing-target.ts`).
- A forward run (`replay/span.ts`) then sends no later lasting step in that pass.
- It still sends the pass's later steps that declare nothing, so a pass that opened a row comes back.
- The row is named in `rowsNotDone` and the instruction, with `passed: false`, and the next row runs. The result code stays `core.run_flow.ran`.
- The row is not held done, so a later press of it is allowed. A test proves this.
- Any other failing step still stops the run, as before.

**How the second press is stopped.** There are three walls:
1. The first press now goes to the right row.
2. If a pass's first step fails, its lasting step is never sent.
3. If a pass reaches another row's page by any road, the question at the top of the table refuses the Save before it resolves, on every path.

**Should the act gate refuse as well? I checked, and did not add it.**
- A replay's answer carries no location, so the gate's idea of the page is one call old at best. It cannot see the target at all.
- It would cover one path of the three, and a stale place would refuse a right press.
- The page's own check runs at the moment of the press, on all three paths.
- This also leaves `act-record/` untouched, so t870 has nothing to merge over.

**A reset was not an option.** My first way back was a reset. `SVC/answer-first/attempt/call-chain.ts:59` refuses every reset in an attempt, so the real-service test caught it and I replaced it with the pass's own later steps.

## The three paths

| Path | Same aim? | How proven |
| --- | --- | --- |
| 1. Forward run | Yes: `replay.ts` to `webAutomationScopedToRow` to `resolveTarget` | Browser, below. Core through the real service: `SVC/answer-first/tests/whole-row-link.test.ts`. Page rule: `pass-row/tests/whole-row-link.test.ts` |
| 2. Saved Flow's repeat | Yes: `output-nodes/native-runtime.ts` to the same two | Engine test `SVC/answer-first/tests/whole-row-link-flow-run.test.ts`: every step of every pass gets its own row, each row once. A row's link not found: its lasting step is never sent, the run answers `reachedEnd: false`, and the next run does the rest without repeating what landed. Page rule by the same stub tests. **Not run in a browser** |
| 3. A part's repeat | Yes, see below | Read only |

**Limit of the Core tests.** The page's choice of element is the extension's, so Core's stub stands in for it. The Core tests prove Core's half: the row is carried, the row is told, the task goes on, and nothing lands. The aim itself is proven by the extension's stub-page tests and the browser run.

**`legacy` and `candidate` modes.** They share the resolver, so what changes for them is:
- A pass over a whole-row link now presses each row's own, where it used to press the first row's every time.
- A pass whose row is not drawn now fails, with the closed `other-record` word, where it used to press the first row's. Candidate feedback then gives its existing "name each pass's own row's control" advice.
- Their codes are unchanged. They ignore the new reason, and a pass answered `remembered` still passes for them (tested).

## Does `project-parts` have the hole?

**It had it, but the cause is not in `project-parts`, and this fix closes it with no change there.** A part has no aim of its own:
- `fxwork/t866/.../project-parts/run/row-target.ts:36` asks the node what it would send, which goes through `webAutomationScopedToRow`.
- `run/recheck.ts:36` asks the page `visible`, through `web.dom.assert` and `content/actions/assert.ts:147`, into `resolveTarget`.
- The press goes through the same resolver.

So before this fix, on a whole-row link, a part's check said the first row's link was visible and the press landed on it. t866's proof used a row's own button with a stub domain, so it could not show this. t866 needs my extension change merged, and I did not run a part against it.

## The stale view

**Cause.** Evidence: `run-mw2uqmhe-06d373e0`, step 0040. The brief's run id was off by one: `open-saved-17` is not in `run-mw2udxzh`. A pass's answer carries no page by design, and `core.run_flow`'s own answer carried none either. So `core.current_view` kept the list from before the run while the browser stood on the last row's page.

**Fix.** The run ends with one look, the loop's own free look. Its result goes into the answer under the keys the domain declares as its view, so the current view is this page. A look that fails says `pageNotRead: true`. This is in `node-tools/run/flow-part.ts` and `flow.ts`.

**Proof.**
- The plain and reshape forms end on the last table's page and press Saved by the handle in the view: `open-saved` answered `web.action.succeeded` in both, and the by-address fallback was not used.
- The test for this fails with the look taken out.

## The browser runs

Command: `pnpm lab attempt <site> --task <task> --authoring-mode answer-first --scripted-model`, with `FLUXIQ_ATTEMPT_SCRIPT_FORM` as shown. Evidence is under `fxwork/t869/!FluxIQWebExtension/test-runs/attempts/`.

| Run | Exit | Result line | Evidence |
| --- | --- | --- | --- |
| row-link, **before the fix** (all fix files taken out by hand, rebuilt) | **1** | `answer wrong because records, final_state, change, not_shown. Ended achieved, 3 rows stored, 3 shown, 26 live steps, 22 calls, $1.0616, 65 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2y3y2i-7439f655` |
| row-link, final | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 28 live steps, 23 calls, $1.1331, 64 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2zr0cn-2a3bede6` |
| plain, final | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 26 live steps, 23 calls, $1.1318, 59 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2zxbp2-d66ace33` |
| reshape, final | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 27 live steps, 23 calls, $1.1362, 62 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2zzq78-050d2daa` |
| professional-network-accept-messaged-invitations, plain, final | 0 | `answer right. Ended achieved, 3 rows stored, 3 shown, 14 live steps, 13 calls, $0.5097, 34 s. NOT LIVE, stand-ins: model, spend.` | `run-mw302g37-a62cffa6` |
| company-website-apprentices, final | 0 | `answer right. Ended achieved, 4 rows stored, 4 shown, 10 live steps, 11 calls, $0.4034, 26 s. NOT LIVE, stand-ins: model, spend.` | `run-mw304cdh-7dc13793` |

The dollar figures are stand-in spend; no provider was called.

**Before the fix.** `site.json` activity: `saved pine-round-table, unsaved pine-round-table, saved pine-round-table`; change: pine only. Both passes clicked `main > section > div:nth-of-type(1) > div:nth-of-type(4) > a`. Their Saves report "no longer pressed" on the glass pass and "now pressed" on the industrial pass, both on pine's page.

**After the fix.**
- `site.json` for row-link, plain and reshape, identical in all three: change `saved:1003207682554201 +1, saved:1054419573499480 +1, saved:1055628457179429 +1`; activity `saved pine-round-table, saved glass-table, saved industrial-table`, with no `unsaved`.
- All five final runs score `repeatedActs: []`, `missingActs: []`, `unaskedChanges: []`.
- The row-link forward run answered `Rows: 2 done, 2 skipped as already done, 0 failed.` Each Save reports "Saved now pressed" and "Saved to your list".
- The selector in the call is still the first row's, as it should be: the aim happens on the page.

**The answer-turn picture**, `run-mw2zr0cn-2a3bede6/answer-turn.jpg`, read by me:
- The site shows Saved items, 5: lamp £22, pine £45 "Saved just now", glass £60 "Saved just now", armchair £65, and industrial £95 "Saved just now".
- The panel shows CSV and JSON, three "Save (On the site).", "Checked once against what was asked for: 5 rows, 3 acts on the site", "Took 1m 4s · $1.13", and "I got what you asked for". No code shows.

**What the browser did and did not exercise.**
- Exercised: the first wall on a whole-row link, row by link.
- Not exercised: a row that cannot be found, the wall on another row's page, a read with no link column, and a title link in a plain card. Those are by stub page and stub target only.

## Checks

```text
vitest by path, final code (--minWorkers 1 --maxWorkers 2): node-tools/tests, node-tools/run/tests,
  answer-first/act-record, answer-first/tests/{row-identity,whole-row-link,whole-row-link-flow-run,attempt,carry-on,later-attempt},
  answer-first/flow-run/tests, candidate-trial/tests/target-on-page, flow-authoring/draft/scheduled-candidate
                                                                   Test Files 51 passed (51); Tests 655 passed (655)
pnpm.cmd --filter fluxiq check                                     exit 0
pnpm.cmd --filter @fluxiq-web-extension/extension check            passed
pnpm.cmd --filter @fluxiq-web-extension/domain check               passed
pnpm.cmd --filter @fluxiq-web-extension/test-runner check          passed
extension: node scripts/test-extension.mjs pass-row action-runtime/tests/resolve-target wrong-row store-chooser option-chip identity/tests/own-run identity/tests/record
                                                                   # tests 136, pass 136, fail 0
domain: node scripts/test-domain.mjs other-record row-scope host-runtime-repeat
                                                                   # tests 20, pass 20, fail 0
node --test dist/.../local-classifieds-save-dining-tables.test.js  # tests 10, pass 10, fail 0
Core: node scripts/structure-audit.mjs                             passed (501 warning(s), 1097 baselined)
Extension: node scripts/structure-audit.mjs                        passed (240 warning(s), 552 baselined)
Win32_Process filtered on t869 (node, chrome, msedge) after the runs   0 left over
service.ts                                                         4304 lines, not touched
```

The acceptance list names `S/runtime/llm/node-tools/replay` by path, but that folder holds no tests. Its tests live in `node-tools/tests`, which is included above.

**Taken out and seen to fail** (each restored, `cmp` clean):
- **Go-on rule out of `span.ts`:** 3 of 5 tests in `whole-row-link.test.ts` fail.
- **Aim out of `resolved-for-pass.ts`:** 6 of 12 tests in `pass-row/tests/whole-row-link.test.ts` fail.
- **Look's keys out of `evidence-loop.ts`:** 1 of 5 fails, the view test.

## What changed

**Core**
- `runtime/llm/node-tools/replay/{replay,forward,span,draft}.ts`
- `runtime/llm/node-tools/run/{flow,flow-part}.ts`
- `runtime/llm/evidence-loop.ts`: one argument, see Open questions
- New tests: `node-tools/run/tests/forward-run-rows.test.ts`, `SVC/answer-first/tests/whole-row-link.test.ts`, `whole-row-link-flow-run.test.ts`
- `docs/architecture/automation-studio/llm-flow-bootstrap.md`

**Extension**
- `apps/extension/src/content/action-runtime/pass-row/`: `aim.ts`, `item-address.ts` and `slot-path.ts` new; `resolved-for-pass.ts` and `row-slot.ts` changed; `tests/whole-row-link.test.ts` new
- `identity/{own-run,record,index}.ts`: two small exports
- `domain/src/runtime/llm-evidence/`: `tool-rejection.ts`, `node-run/replay.ts`, `node-run/missing-target.ts` and the `replay-other-record` test
- The scripted form `row-link` and its test. All three forms now press Saved by the handle in the view, falling back to the address only if refused
- `docs/architecture/build-loop.md`, `element-identity.md`

No oracle, fixture or guidance was changed. The tool description says generically that a row that cannot be found is named and the run goes on. Your change in `attempt-carry-on.ts` and its test are untouched.

## Not verified

- **Any real model.** A script made every choice.
- **A saved Flow's repeat, or a part's, in a browser.** Their aim is the same code on the same wire form, proven by stub page and by engine test separately. Nothing runs the real engine, the real node and the real resolver together on one page.
- **How long a row that cannot be found takes on a real page.** Each attempt under the default retries waits for its target, and I did not measure it.

## Follow-up, on the merged tree (Core `059fc3d7c`, with t870 and t865)

### What t870's clause did before I touched it

**It did what the lead feared.** In `same-row.ts`, `fitOf`, "a row whose values all lie in another may be that row" held every row carrying a press's word done. Before any change, my probe (`act-record/tests/thin-press.test.ts`) gave `[true, true, true]` for Ada, Ben and Cyd, where only one row was ever pressed, in three cases:
- A press carried a row `{ action: "Accept" }`, after the read.
- The same press, before the read.
- The same press, then a Flow's read of other columns.

**A second route gave the same result, and it was not the clause.** A by-hand press's sentence names its control: `through its "Accept"`. `row-ties.ts` `ofWords` fits that word to a column repeating it on every row, so all rows tie. That sentence case is the one a real by-hand press reaches, and it predates t870.

**The clause cannot simply go.** With it removed, two t870 tests fail, both in `identical-rows`:
- "a run's act in a shape that fits two"
- "a press with the act's own key"

The first holds `{ title }` done on both rows of a list. That has the same shape as `{ action: "Accept" }`, so values alone cannot tell them apart. No t870 test was edited, and the clause stays. What differs is whether the row's word is the control's own name.

### What changed for the same-row rule

- **A row that says only its control's own name names no row** (`record.ts` `identityOf`, `identity/target-keys.ts`). `{ city: "Leeds" }` still ties, as t870's test wants.
- **A press now carries its item's whole words** (`actedOnItem`, from `structure/item-row.ts` and `press-effect/acted-on.ts`). The record finds the row by those, with no control's name in them (`gate/read-answer.ts`). The sentence the model reads is unchanged. A read of a column past the sentence's first two lines used to share no word with the press, and this closes that gap.
- **A press on a row nothing names keeps the list it was pressed on** (`listBefore`, `record.ts` `tieByChange`). The next read says which row it was: rows that read differently are held, and rows that read the same were not pressed. A read of another shape says nothing, and the one after it is asked.

**Both sides hold wherever anything shows which row it was.** Two limits remain, each pinned by a test:
- **A press that leaves no mark on any read, and whose item has no words a read kept.** No row is held, so its row may be pressed again. This is the one place the two wishes truly conflict. I let the never-pressed rows go, since the alternative stops an "accept each" task. It is the lead's call if it should go the other way.
- **A host that sends only a sentence, with no `actedOnItem`.** Its words still fit every row, so all are held and told, as before. The web domain sends it wherever an item is known.

### The title-link case (open item 3)

A plain navigation link may still go. When a pass's link goes as page-level, its resolution now says so (`passRow: "page-level-link"`, written in `pass-row/aim.ts`, kept as a closed word in `client/gateway-mapping.ts`). From there:
- **Forward run** (`replay/span.ts`): the pass's next lasting step is not sent, the row is named in `rowsNotDone`, its steps that declare nothing still run, and the next row goes on.
- **A later step can take it back.** If a step between them answers that it found its row (`row_own_control`), the lasting step lands. So a pass of "Back to results, open the card, Save" still works.
- **Saved Flow** (`run-acts/run-gate.ts`, under `settle`): the lasting step fails with nothing sent, code `answer_first.row_left_behind`, and the run answers that step as failing. It stops there, as any failing step does.

Proven by stub page (`pass-row/tests/whole-row-link.test.ts`), by Core through the real service, and by an engine test whose dispatcher answers the word by hand.

**Unproven in a browser.** No scripted task draws this page shape cheaply. Only stub answers exercise how a dispatch's answer holds the word on the saved-Flow road; the gate reads both places it may sit.

### `record.ts` `matches`

**It can occur in the browser, so I fixed it.** A row with two controls that have no words, such as icon buttons with a class and no name, read as one act, so the second was refused as already done. Now two fingerprints whose keys differ and that share no words are two controls.

A form that names no element (a handle, a Flow's `{ control }`) still counts as one act, so one press by hand and in a loop stays one. Pinned in `thin-press.test.ts`: the two "two controls" tests fail with the rule out.

"Add 3" presses three times and refuses a fourth, on no row and by hand on a list's item, with the rule in or out. A count on a call that carries its row stays one per row, as the record's header says.

### Browser runs on the merged tree

Every line ends `NOT LIVE, stand-ins: model, spend.` Evidence is under `test-runs/attempts/`. All seven score `repeatedActs: []`, `missingActs: []`, `unaskedChanges: []`.

| Form | Exit | Result line | Evidence |
| --- | --- | --- | --- |
| accept, plain | 0 | `answer right. Ended achieved, 3 rows stored, 3 shown, 14 live steps, 13 calls, $0.5106, 34 s.` | `run-mw326tb7-6360e2ec` |
| accept, reshape | 0 | `answer right. Ended achieved, 3 rows stored, 3 shown, 16 live steps, 15 calls, $0.6085, 36 s.` | `run-mw328o4u-05ba1ae7` |
| accept, **thin** (new) | 0 | `answer right. Ended achieved, 3 rows stored, 3 shown, 14 live steps, 13 calls, $0.5089, 33 s.` | `run-mw324xck-1c0a5aa4` |
| toggle, plain | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 25 live steps, 22 calls, $1.0692, 60 s.` | `run-mw32aq7d-f33e4c52` |
| toggle, reshape | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 27 live steps, 23 calls, $1.1365, 60 s.` | `run-mw32d7rl-85421447` |
| toggle, row-link | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 27 live steps, 22 calls, $1.0707, 61 s.` | `run-mw32fmhy-e956ef40` |
| company-website-apprentices | 0 | `answer right. Ended achieved, 4 rows stored, 4 shown, 10 live steps, 11 calls, $0.4034, 28 s.` | `run-mw32i185-80d4247e` |

- **Site record:** all three accept forms show each of the three invitations accepted once. All three toggle forms show three listings +1 with no `unsaved`.
- **The thin form** reads only the message column. The forward run answered `Rows: 2 done, 1 skipped as already done, 0 failed.`: the row pressed by hand was left out, and the other two were pressed once each. I did not run this form with the fix out, so I cannot say how it behaved before.
- **Discarded runs:** my first queue overlapped with one I had thought was stopped, so two Labs shared log files. I killed both, and no run above came from them. All seven are from one clean rebuild and one queue, with no source change after it.

### Follow-up checks

```text
vitest by path (--minWorkers 1 --maxWorkers 2): node-tools/tests, node-tools/run/tests, answer-first/act-record,
  answer-first/tests/{row-identity,whole-row-link,whole-row-link-flow-run,later-attempt,attempt,carry-on},
  answer-first/flow-run/tests, answer-first/run-acts/tests, candidate-trial/tests/target-on-page, flow-authoring/draft/scheduled-candidate
                                                      Test Files 60 passed (60); Tests 835 passed (835)
pnpm.cmd --filter fluxiq check                        exit 0
extension, domain and test-runner check               exit 0 each
Core: node scripts/structure-audit.mjs                passed (514 warning(s), 1097 baselined)
Extension: node scripts/structure-audit.mjs           passed (241 warning(s), 552 baselined)
extension: test-extension.mjs (pass-row and neighbours)   # tests 139, pass 139, fail 0
domain: test-domain.mjs other-record row-scope host-runtime-repeat acted-on   # tests 25, pass 25, fail 0
node --test on both scripts' dist tests               # tests 17, pass 17, fail 0
Win32_Process filtered on t869 (node, chrome, msedge) after the runs   0 left over
```

**Taken out and seen to fail** (each restored, `cmp` clean):
- **Control-name rule, with the fingerprint line, out of `record.ts`, and left-behind out of `span.ts`:** seven tests across `thin-press`, `forward-run-rows` and `whole-row-link`.
- **The fingerprint line alone:** the two "two controls" tests.

The `actedOnItem` and `tieByChange` changes had no separate take-out run. Their tests are the ones that failed in the first probe's form or were written with the change.

## Open questions and contradictions

Item 3 below was closed by the follow-up above: the title link may go, but no later lasting step of that pass lands. Item 1 stands. For a part (item 2), `passRow` is not read on its road, so a part's later lasting step after a page-level link is not stopped; t866 owns that seam.


1. **A saved Flow stops at a row it cannot do; it does not go on.** The engine's For Each fails there: `reachedEnd: false` and a named failing step. By `flow-run.ts` that is an answer the attempt carries on from, so it is not a new task ending, and my refusal adds no new way to end. But the rest of the rows wait for the next attempt. The go-on rule is a forward-run rule today. The seam, if you want it on the engine, is the For Each's failed route.
2. **A part stops too.** t866's `row-across-call.test.ts` pins "stops at a row that is gone" and "its own control is not: stops", with nothing pressed. It names the step, not the row. That is t866's to reconcile with the rule.
3. **One wrong-row case is still open, and it is narrow.** The read kept no link column, the row is not drawn, and the control is a plain title link, not a whole card. Nothing then says it is a row's, so it stays page-level and the first row's title link would be pressed. Refusing it would also refuse a plain navigation link in a pass, which I judged the worse trade. A read with a link column does not have this hole. The same goes for the wall on another row's page: it needs the row's link in the read.
4. **One line outside my named paths.** `runtime/llm/evidence-loop.ts:215` now passes `observedStateKeys` to the run-flow binding. Core has no other way to know which keys of a look are the view, and the alternative was copying `pageChanged` and `status` into the run's answer.
5. **Noticed, not changed.**
   - A stopped forward run reports `stoppedAt` as its span's last member, not the one that failed (`draft.ts`, `span.outcomes.at(-1)`). It predates this work.
   - In `record.ts` `matches`, a second act on the same row with the same action and no control words on the record reads as the same act. My stub hit this with a way-back step and got "already done". Real web presses carry control words and a navigate is another action, so I do not expect it in the browser. It is one for t870 to look at.

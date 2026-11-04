# Engine go/no-go: is the state rule sound enough to build on?

Date 2026-11-03. Task `t858`, paired worktrees `fxwork/t858/!FluxIQ` and `fxwork/t858/!FluxIQWebExtension`. Provider-free: no model, site, browser or Lab launch. Every store was read from a copy under scratch space, and the originals' size and modified time were unchanged after the run. This report and the harness's output hold counts, codes, field paths and short ids only.

## Verdict: go, with named limits

**The rule itself is sound. On today's saved explorations it checks almost nothing, so it has not yet shown it is useful.** Build the engine, but only together with D2 and the canonical form, and re-measure before any claim about Flows rests on it.

| Question | Number | Target | Reading |
|---|---:|---:|---|
| When it answers, is the page right? | URL 108/108; with the opening reads 121/131 (92%) | Control 119/129 (92%) | **At the control.** Selection effect: limit 1 |
| When it answers, is the page view close? | Selector overlap >= 0.8: 94/108 (87%) | Control 98/120 (82%) | At the control |
| Same status as live, all answered commands | 171/195 (88%) | Control 207/243 (85%); study's five runs 110/125 | **At the control** |
| Why acts disagree | 20 of 20: recorded succeeded, live `web.target.not_found`, all marked as one-time layers | | As the study saw it. The control's own layer acts agree only 3/16 |
| How much it answers | **195 of 796 commands (24%); median build 20%, 3.5 of 24.5 commands** | | **Too little to check a Flow** |
| False passes on saved failed runs | **0 of 26, because nothing passed at all** | 0 | Met, but vacuous |
| Inconclusive | **28 of 30 builds (93%), 73 of 73 live trials** | | The honest headline |
| Rows compared with live | **0.** No Flow's rows-bearing read was answered | | `same_rows` is untested on explorations |
| Deliberately broken Flows | 0 of 138 passed. The exploration as its own Flow: 32 of 32 pass, 2,180 of 2,180 answered | 0 | The rule catches what it claims to |
| The same rule over a recording in the Flow's own wire form | **74% answered**, URL 777/777, status 1,284/1,318 (97%), rows 55/55, 19 of 64 pass | | The rule works once the inputs match. **2 false passes here** (limit 4) |

**Named limits.** A later lane may not assume any of these away.

1. **The agreement figures describe a short prefix.** A typical build is answered for the opening look, one navigate and one more look (3 of 28), then leaves the recording. URL agreement there is close to automatic, and a read is only answered once the position already matches. It is evidence that the rule does not invent answers. It is not evidence that a whole Flow simulates correctly.
2. **D2 stops being optional.** Against an exploration's calls the rule answers 24%. Against the Flow's own wire form it answers 74%. Only 38% of a Flow's acts have the same input as any exploration call (52 of 138), against 88% of reads and 73% of page moves. The rule's soundness comes from leaving the recording at the first unrecorded act, so a low act match means little gets checked.
3. **Row computing is unproven and is now the main dependency.** Flows' final reads differ from exploration's (`where`, `answer`, `rejectedSamples`, `recordOutput`, fields). All 4 first gaps on `extract_list` are that. Until the row computer exists, read tasks end `inconclusive`.
4. **A pass means "the same as the recording", not "right".** In the wire-form arm, 2 passes followed a judge's `yes` and then failed the oracle, both on the first-page-plus-earbuds task (`run-mvswh11y`, `run-mvtdoyf3`). The Flow repeated the recording's mistake. Three more passes repeated a recording whose own judge did not say yes. A simulated pass must never be worded or counted as more than D4 and the study's section 7 allow, and the reference needs better than one judge's yes.
5. **Do not exempt layer acts from `acts_covered`.** Reading a dropped dismissal as harmless gave the only pass on an exploration, and it was false (`first/layers`, `run-mvwvu6i3`: no Flow was created and the run failed). The strict rule said `fail` there.
6. **This is a walk over recorded commands, not the real intake.** The commands are the ones the Flow sent given the site's answers. Given recorded answers it might send others. Engine step 3 must repeat these measurements through the real socket.
7. **The corpus is thin.** See the next section.

**Proposed stop condition (the lead's to confirm).** After Exploration lane step 5, re-run this harness on the first result-reaching explorations. Stop the Engine lane and take it to the user if acts with the same input stay under 70%, or answered commands under 50%, or inconclusive over 50%. Also stop using the verdict for anything but a chat note if a pass ever follows an oracle-confirmed reference and then fails the oracle. The product still works without the Engine: attempt 2's live run is the real test.

## What this rests on

Of 411 saved Lab runs (2 unfinished, so not used), **32 still have their exploration trace**. The rest hold none: a Lab workspace gets reused and traces have no retention rule, and the oldest runs may predate tracing or ran with it off. I did not split those. That is **25 DeepSeek flash project builds and 7 Claude Sonnet 5.5 legacy builds, 8 tasks on 6 of the 10 scenarios**. There is **no Claude project-mode build**. The Lab said passed on 4 and failed on 28. Only 12 have an oracle verdict: 4 Lab-passed with the oracle passed, 4 Lab-failed with the oracle passed, 4 oracle-failed; 20 reached no oracle. 2 of the 32 had no Flow to walk. So the false-pass target rests on 26 failed builds with a Flow, of which **4 are oracle-failed**. The wire-form arm is DeepSeek only: 64 pairs from 19 builds.

**What a saved exploration does and does not show.** These builds were not trying to reach a result. They wander, and 38% is what is left of a Flow's acts against that wandering. So a low answered share here does **not** show that a result-reaching exploration would also be low, and a high one would not follow either. There is none to test (Exploration lane step 5 makes the first). It **does** show that when the rule answers it agrees with live as well as a Flow agrees with itself, and that its refusals are right. It does **not** show that a simulated pass predicts a live pass: no exploration-based pass exists under the strict rule. The wire-form arm is the best stand-in available, and it flatters: 14 of its 64 pairs sent the same commands, because they are one Flow running twice.

## 1. Saved why each check is inconclusive

**The cause of `gapStep: null` on all 26.** The matcher's gap answer carries its reason as the failure code. The web domain's `adapter.ts` (`clientReportedFailure`) does not recognise it and reports `web.action.unknown`, so `gapStep()` in `offline-first/answer.ts` finds no feedback step naming a gap reason, and the note stays `inconclusive`. The reason did exist: the 26 notes in saved `result.json` files say `argument_mismatch` 20, `missing_transition` 5, `ambiguous_context` 1. `meta.json` dropped it because `logged` kept only the outcome.

**The change, logging only.** The answer's step-log counts now carry the matcher's first gap: code, cause, the command's place, its action type, differing field paths, and the step the run stopped at. `meta.json` gains `gap`, `gapStep` is filled, and the summary says "it was inconclusive (argument_mismatch at step 5)". Every part is whitelisted. The note, the gate's evidence and everything the model reads are unchanged, and the tests hold that. No saved check can be re-run to show this on real data until a live build runs.

**Left for the lead, because fixing it changes what the model reads:** the `gap` outcome can never happen on the web domain, so a model always reads "settled nothing" instead of "could not answer step N, because...".

## 2. The harness

- **Core, `packages/fluxiq/src/client-gateway/trace-state/`, domain-neutral:** `recording.ts` (one exploration as states), `walker.ts` (the rules), `end-check.ts`, `verdict.ts`, `recorded-calls.ts`, `bookkeeping-calls.ts`, `gap-codes.ts`. Exported from `client-gateway/index.ts`. Wired into no live path. Its gap codes stay its own until the rule is wired in, so U5's list is untouched.
- **Domain, `domain/src/runtime/offline-reads/state-domain/`:** the port. Labels come from `WEB_AUTOMATION_ACTION_SAFETY`. Three declared normalisations and nothing else: `target_form` (dropped only when `adaptedTargetSupersedesRecording` says no and the wire target restates the element), `wait_fields`, `new_tab`. Row identity, `where`, `text`, `url`, `value`, `checked` and `ensureState` stay in the key, and tests hold that.
- **Harness, `packages/test-runner/src/offline-trial-experiment/state-rule/`:** `cli.js state-rule --lab-runs <dir> --work <dir under test-runs/> [--extra-store <project.sqlite>@<run>]... [--out] [--tables]`, or `--store <project.sqlite> --run <lab run dir>`. Each store's database and artifacts are copied, read through Core's own store API and migrations, and removed.

**Checked against the study before trusting it.** On the study's five control runs the harness gives key 109/125 and status 110/125, exactly the study's figures, and URL 67/71 where the study has 73/77, because I count only positions where both runs sent a snapshot; both have 4 differing.

**Beyond the brief, because the corpus could not otherwise test a pass:** the exploration walked as its own Flow, six kinds of deliberately broken Flow, one live Flow run walked over the one before it, every live trial, and a position-blind counterfactual. Receipts are computed from the looks before and after each act (equality of address and each control's selector, text, value and checked state), since saved builds kept no digest for the real reducer. They err toward no receipt, which costs a false failure and never a false pass, but they are an approximation.

## 3. Page position: how far better tracking gets

**All the way on URL, among what is answered.** Tracked reads: **108/108**, or 136/136 reading after skipped acts, 152/152 with the whole build as the recording. The study's prototype had 51/74. The study's 28-of-28 is reproduced directly: the same input after the same acts on another node would have had the wrong URL **24 of 24** times (`first/layers`) and 16 of 16 (`first/tolerate`). Reads refused after the run left the recording would have been wrong 136 of 330 and 16 of 31 times, so those refusals earn their place.

What it took, each found by a failing self-walk rather than assumed:

1. **A position is what recorded answers report, never the live run.** A read's own answer says where the page is.
2. **A move or act settles at the next look, not its own answer,** because a press that navigates reports before the page has gone.
3. **A node is a position plus how many relative moves have gone from it,** since a list that pages without changing its address has one URL and several states. `next_page` past the recorded end is a gap.
4. **A state is searched in recorded time order.** Some pages move by themselves between looks, there and back, and a page can go on moving after a failed act. Following such moves by position alone let a dropped navigate pass one mutation test, so moves are now followed only in the order they were recorded.
5. **Position is unknown after an unanswered move,** and only a recorded absolute move restores it.

**The opening reads are the weak spot left: 13/23.** Before its first move a live run stands wherever the last one left it, and a simulation starts where the exploration started. That is a real difference between the two, it is outside the Flow, and it is counted in the 121/131.

**URL is a weak measure on single-page sites** (one task's URL path never changes across a whole run), which is why the selector and row columns exist.

## 4. Measurements

**Reading the configs.** `first` is the recording up to the build's first trial, `whole` is all of the model's calls. `gap` is the study's rule: what follows a skipped act is refused. `layers` also leaves acts marked as closing a layer out of the acts done. `tolerate` answers after skipped acts, with the count on the answer. **`first/gap` is the primary config.**

**Totals against the control.**

| Config | Cmds | Answered | Before leaving: answered of cmds | Not sent | URL, all reads | URL, snapshots | Opening URL | Selectors >= 0.5 | Selectors >= 0.8 | Rows | Status, all | Act status | Move status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Control** (two live runs, 10 builds) | 243 | - | - | - | - | 119/129 | - | 112/120 | 98/120 | 13/13 | 207/243 | 20/41 (layer 3/16) | 31/32 |
| first/gap | 796 | 195 | 195/234 | 0 | 108/108 | 108/108 | 13/23 | 103/108 | 94/108 | 0/0 | 171/195 | 2/22 (20 marked) | 38/38 |
| first/layers | 796 | 199 | 199/239 | 0 | 111/111 | 111/111 | 13/23 | 106/111 | 97/111 | 0/0 | 175/199 | 3/23 (20 marked) | 38/38 |
| first/tolerate | 795 | 241 | 241/282 | 1 | 136/136 | 136/136 | 13/23 | 128/136 | 114/136 | 0/0 | 214/241 | 6/28 (22 marked) | 49/50 |
| whole/gap | 796 | 195 | 195/234 | 0 | 108/108 | 108/108 | 13/23 | 103/108 | 94/108 | 0/0 | 171/195 | 2/22 (20 marked) | 38/38 |
| whole/layers | 796 | 199 | 199/239 | 0 | 111/111 | 111/111 | 13/23 | 106/111 | 97/111 | 0/0 | 175/199 | 3/23 (20 marked) | 38/38 |
| whole/tolerate | 794 | 268 | 268/306 | 2 | 152/152 | 151/151 | 13/23 | 143/152 | 129/152 | 1/1 | 240/268 | 14/37 (22 marked) | 51/52 |

**"Exactly the same input"**, whatever the state, and what an unmatched act's nearest recorded act looks like.

| Config | Reads same input | Moves same input | Acts same input | Act gaps' nearest recorded act |
|---|---:|---:|---:|---|
| first/gap | 496/565 | 68/93 | 52/138 | same_selector_agree 4, other_selector 2 |
| first/layers | 496/565 | 68/93 | 52/138 | same_selector_agree 4, other_selector 3 |
| first/tolerate | 496/565 | 67/92 | 52/138 | other_selector 8, same_selector_agree 4, same_selector_conflict:context 1 |
| whole/gap | 497/565 | 80/93 | 62/138 | same_selector_agree 5, other_selector 2 |
| whole/layers | 497/565 | 80/93 | 62/138 | same_selector_agree 5, other_selector 2 |
| whole/tolerate | 497/565 | 79/92 | 61/137 | other_selector 5, same_selector_agree 5, same_selector_conflict:context 1 |

**Gaps.** `after_unrecorded_act` dominates because rule 4 refuses everything after the first unrecorded act, so read "what first took the run off the recording" as the cause.

| Config | Gaps by reason | What first took the run off the recording |
|---|---|---|
| first/gap | after_unrecorded_act 507, after_unrecorded_move 51, missing_transition 23, state_changed_by_act 14, argument_mismatch 5, other_position 1 | state_changed_by_act on navigate 12, missing_transition on click 6, on next_page 3, on scroll 2, on navigate 2, state_changed_by_act on type 1, other_position on next_page 1 |
| first/layers | after_unrecorded_act 502, after_unrecorded_move 51, missing_transition 24, state_changed_by_act 13, argument_mismatch 6, other_position 1 | state_changed_by_act on navigate 12, missing_transition on click 7, on next_page 3, on scroll 2, on navigate 2, other_position on next_page 1 |
| first/tolerate | after_unrecorded_act 488, missing_transition 29, after_unrecorded_move 22, argument_mismatch 7, other_position 6, other_row 1, act_out_of_order 1 | missing_transition on click 12, other_position on click 4, missing_transition on next_page 3, on scroll 2, on navigate 2, other_position on type 1, other_row on click 1, act_out_of_order on check 1, other_position on next_page 1 |
| whole/gap | after_unrecorded_act 507, after_unrecorded_move 51, missing_transition 21, state_changed_by_act 16, argument_mismatch 5, other_position 1 | state_changed_by_act on navigate 14, missing_transition on click 6, on next_page 3, on scroll 2, state_changed_by_act on type 1, other_position on next_page 1 |
| whole/layers | after_unrecorded_act 502, after_unrecorded_move 51, missing_transition 21, state_changed_by_act 17, argument_mismatch 5, other_position 1 | state_changed_by_act on navigate 14, missing_transition on click 6, on next_page 3, on scroll 2, state_changed_by_act on click 1, other_position on next_page 1 |
| whole/tolerate | after_unrecorded_act 467, missing_transition 24, after_unrecorded_move 18, other_position 8, argument_mismatch 6, act_out_of_order 2, other_row 1 | missing_transition on click 9, other_position on click 6, missing_transition on next_page 3, on scroll 2, act_out_of_order on check 2, other_position on type 1, other_row on click 1, other_position on next_page 1 |

Differing fields against the nearest recorded call, `first/gap`: `extractList.answer` 5, `extractList.where` 5, `rejectedSamples` 5, `element.classNames` 5, `browserFrameId` 5, `browserTabId` 5, `extractList.fields` 4, `element.accessibleName` 2, `element.attributes` 2, `element.context` 2, `element.selector` 2, `selector` 2.

The first gap per build under `first/gap`: `state_changed_by_act` on a navigate 12 (the exploration navigated there only after acts the Flow never did), `missing_transition` on a click 6, `argument_mismatch` on `extract_list` 4, `missing_transition` on a scroll 2, on a navigate 2, on `web.page.facts` 1, `state_changed_by_act` on a type 1. `parameters.browserTabId` and `browserFrameId` are run-specific handles that some Flow reads carry. They are not a declared normalisation, so they are gaps here, and Engine step 2 should decide them.

**Act disagreements.** Under `first/gap` all 20 are one thing: exploration closed a layer, so the same press in a later run in that browser finds nothing. The rule answers it and marks it `may_be_gone_next_time`, and every one was marked. The control shows the same instability from the other side (layer acts 3/16, all acts 20/41), because a replay in a fresh profile finds the layer again. So act status is low for a reason that is not the rule, and the only 2 unmarked acts agree. Under `tolerate`, `web.target.not_shown` on a layer act, `web.action.rate_limited` on a move and (with the whole build) `web.action.page_reported_failure` on an act appear once each. No recording could predict the last two.

| Config | Disagreements: kind, recorded, live, live failure code, layer mark | Marked |
|---|---|---:|
| first/gap, first/layers, whole/gap, whole/layers | act, succeeded, failed, `web.target.not_found`, layer: 20 | 20 |
| first/tolerate | act, succeeded, failed, `web.target.not_found`, layer: 21; move, succeeded, failed, `web.action.rate_limited`: 1; act, succeeded, failed, `web.target.not_shown`, layer: 1 | 22 |
| whole/tolerate | the same three, and act, succeeded, failed, `web.action.page_reported_failure`: 1 | 22 |

**What refused reads would have said of the URL, and what position-blind reading would have said.**

| Config | Same | Differ | Position-blind: URL same / all |
|---|---|---|---:|
| first/gap | after_unrecorded_act 194, after_unrecorded_move 15 | after_unrecorded_act 136, after_unrecorded_move 16 | 0/0 |
| first/layers | after_unrecorded_act 194, after_unrecorded_move 15 | after_unrecorded_act 133, after_unrecorded_move 16 | 0/24 |
| first/tolerate | after_unrecorded_act 192, after_unrecorded_move 12 | after_unrecorded_act 126, after_unrecorded_move 3 | 0/16 |
| whole/gap | after_unrecorded_act 205, after_unrecorded_move 13 | after_unrecorded_act 126, after_unrecorded_move 18 | 0/0 |
| whole/layers | after_unrecorded_act 204, after_unrecorded_move 13, state_changed_by_act 1 | after_unrecorded_act 123, after_unrecorded_move 18 | 0/24 |
| whole/tolerate | after_unrecorded_act 193, after_unrecorded_move 12 | after_unrecorded_act 112, after_unrecorded_move 1 | 0/18 |

**One live Flow run over the one before it.** A recording in the Flow's own wire form, as D2's forward runs and every later attempt would make.

| Pairs | Same commands | Cmds | Answered | URL, snapshots | Selectors >= 0.5 | Selectors >= 0.8 | Rows | Status, all | Act status | Pass | Fail | Inconclusive |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 64 | 14 | 1769 | 1318 | 777/777 | 823/836 | 785/836 | 55/55 | 1284/1318 | 217/242 (3 marked) | 19 | 1 | 44 |

Passes by what each run's judge said: earlier yes, later yes 2; earlier yes, later no 2 (a false pass); earlier no, later no 2; earlier no, later yes 1; a run with no judge or an unsure one 12. Passes where the two runs sent the same commands: 14, which is every pair that did. The last execution of a run is judged by the Lab's oracle here.

Gaps: `after_unrecorded_act` 355, `argument_mismatch` 44, `after_unrecorded_move` 25, `missing_transition` 22, `state_changed_by_act` 5. Disagreements: recorded failed, live succeeded, 17; recorded succeeded, live `web.action.page_reported_failure` 3; live `web.target.not_found` on a layer 3; live `web.target.not_actionable` 1; live `web.action.rate_limited` 1. The 17 look like the layer case reversed (a replay in a fresh profile finds the layer). I infer that from the build I read and did not check all 17. The mark is only computed on recorded successes, so they read as unmarked.

The 5 passes whose later run was judged no: `run-mvgw3ve5` test to test (`execution_failed`, `no`), `run-mvswfjbq` test to test (`execution_failed` twice), `run-mvswh11y` test to execution (`yes`, oracle failed), `run-mvtdoyf3` test to test (`unsure`, `no`) and test to execution (`yes`, oracle failed). 12 of the 19 passes are on runs the Lab failed.

**Per run, `first/gap`.**

| Run | Task | Model | Mode | Lab | Oracle | Flow | Cmds | Answered | URL (snapshots) | Act status | Move status | Rows | Verdict | First gap |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| mvgvyaip-d856e135 | everything-store-office-checkout-review | ds-flash | project | failed | - | last_live_test | 33 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvgw1854-5d10955b | job-board-save-quillmark-remote | ds-flash | project | failed | - | last_live_test | 29 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvgw3ve5-294881b5 | social-network-feed-recent-group-posts | ds-flash | project | failed | - | last_live_test | 18 | 14 | 8/8 | 0/3 | 2/2 | 0/0 | inconclusive | missing_transition (dom.scroll) |
| mvgw7320-de416190 | photo-social-newest-likes | ds-flash | project | failed | - | none | - | - | - | - | - | - | - | - |
| mvhibis0-b536958b | photo-social-newest-likes | ds-flash | project | failed | - | last_live_test | 25 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvhibis1-d570b37d | social-network-feed-recent-group-posts | ds-flash | project | failed | - | last_live_test | 111 | 14 | 8/8 | 0/3 | 2/2 | 0/0 | inconclusive | missing_transition (dom.scroll) |
| mvhibit5-e1d3a4f3 | everything-store-office-checkout-review | ds-flash | project | failed | - | last_live_test | 8 | 4 | 2/2 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvhibk0z-1950493f | job-board-save-quillmark-remote | ds-flash | project | failed | - | last_live_test | 22 | 6 | 3/3 | 0/0 | 2/2 | 0/0 | inconclusive | state_changed_by_act (dom.type) |
| mvrj7qg8-6916b3f7 | everything-store-office-checkout-review | ds-flash | project | failed | - | last_live_test | 25 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvrj7qg8-c20c132e | social-network-feed-recent-group-posts | ds-flash | project | failed | - | last_live_test | 23 | 15 | 9/9 | 0/3 | 2/2 | 0/0 | inconclusive | argument_mismatch (dom.extract_list) |
| mvrj7qg9-b6dc94f6 | job-board-save-quillmark-remote | ds-flash | project | failed | - | last_live_test | 28 | 4 | 2/2 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvrj7qgf-a44a1427 | photo-social-newest-likes | ds-flash | project | failed | - | last_live_test | 29 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvsknffp-153bc89a | everything-store-office-checkout-review | ds-flash | project | passed | passed | last_live_test | 28 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvsknvqv-555a5de2 | job-board-save-quillmark-remote | ds-flash | project | passed | passed | last_live_test | 32 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvskodlp-9966d618 | social-network-feed-recent-group-posts | ds-flash | project | failed | passed | last_live_test | 23 | 11 | 6/6 | 0/2 | 2/2 | 0/0 | inconclusive | missing_transition (dom.click) |
| mvskptb1-c9cef4fe | photo-social-newest-likes | ds-flash | project | failed | - | last_live_test | 34 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | missing_transition (browser.navigate) |
| mvswewhy-e4e469d4 | social-network-feed-recent-group-posts | ds-flash | project | failed | passed | last_live_test | 23 | 11 | 6/6 | 0/2 | 2/2 | 0/0 | inconclusive | missing_transition (dom.click) |
| mvswfjbq-d0a95f6e | photo-social-newest-likes | ds-flash | project | failed | - | last_live_test | 18 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvswh11y-9d462629 | everything-store-first-page-plus-earbuds-dea | ds-flash | project | failed | failed | last_live_test | 14 | 13 | 7/7 | 2/3 | 2/2 | 0/0 | inconclusive | argument_mismatch (dom.extract_list) |
| mvswhobv-5eb308c0 | crossborder-marketplace-hub-to-cart-basket-r | ds-flash | project | failed | - | none | - | - | - | - | - | - | - | - |
| mvtdmo5p-4dca4787 | social-network-feed-recent-group-posts | ds-flash | project | passed | passed | last_live_test | 23 | 15 | 9/9 | 0/3 | 2/2 | 0/0 | inconclusive | argument_mismatch (dom.extract_list) |
| mvtdn37t-e1e4d0a7 | photo-social-newest-likes | ds-flash | project | failed | - | last_live_test | 28 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvtdoyf3-47ffaac1 | everything-store-first-page-plus-earbuds-dea | ds-flash | project | failed | failed | last_live_test | 12 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | missing_transition (browser.navigate) |
| mvtdpdpf-76a54b57 | crossborder-marketplace-hub-to-cart-basket-r | ds-flash | project | passed | passed | last_live_test | 24 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | state_changed_by_act (browser.navigate) |
| mvud43a2-445c7f17 | social-network-feed-recent-group-posts | ds-flash | project | failed | passed | last_live_test | 32 | 15 | 9/9 | 0/3 | 2/2 | 0/0 | inconclusive | missing_transition (page.facts) |
| mvwvu6i3-28c1853c | company-website-gas-engineers | cl-sonnet-5-5 | legacy | failed | - | dry_run | 6 | 6 | 5/5 | 0/0 | 1/1 | 0/0 | fail | - |
| mvwx2cob-3454e2ce | company-website-gas-engineers | cl-sonnet-5-5 | legacy | failed | - | dry_run | 12 | 9 | 8/8 | 0/0 | 1/1 | 0/0 | inconclusive | argument_mismatch (dom.extract_list) |
| mvx1t6il-3d751ec6 | company-website-gas-engineers | cl-sonnet-5-5 | legacy | failed | - | dry_run | 31 | 7 | 6/6 | 0/0 | 1/1 | 0/0 | inconclusive | missing_transition (dom.click) |
| mvx43ff7-ec829cb3 | company-website-gas-engineers | cl-sonnet-5-5 | legacy | failed | - | dry_run | 21 | 7 | 6/6 | 0/0 | 1/1 | 0/0 | inconclusive | missing_transition (dom.click) |
| mvx64gvn-6781507e | company-website-gas-engineers | cl-sonnet-5-5 | legacy | failed | failed | execution | 46 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | missing_transition (dom.click) |
| mvx83b7v-5eda5d6c | company-website-gas-engineers | cl-sonnet-5-5 | legacy | failed | passed | execution | 36 | 3 | 1/1 | 0/0 | 1/1 | 0/0 | inconclusive | missing_transition (dom.click) |
| mw0irrs5-cb525a15 | everything-store-kettle-to-cart | cl-sonnet-5-5 | legacy | failed | failed | execution | 2 | 2 | 0/0 | 0/0 | 0/0 | 0/0 | fail | - |

## 5. False passes

| Config | Builds | Pass | Fail | Inconclusive | False pass on failed run | Of those, oracle failed | Pass on passed run | Fail on failed run | False fail on passed run |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| first/gap | 30 | 0 | 2 | 28 | 0 | 0 | 0 | 2 | 0 |
| first/layers | 30 | 1 | 1 | 28 | 1 | 0 | 0 | 1 | 0 |
| first/tolerate | 30 | 0 | 2 | 28 | 0 | 0 | 0 | 2 | 0 |
| whole/gap | 30 | 0 | 2 | 28 | 0 | 0 | 0 | 2 | 0 |
| whole/layers | 30 | 1 | 1 | 28 | 1 | 0 | 0 | 1 | 0 |
| whole/tolerate | 30 | 0 | 4 | 26 | 0 | 0 | 0 | 4 | 0 |

- **On explorations:** 0 passes under the strict rule, so **0 false passes on the 26 failed builds, and 0 true passes on the 4 passed**. The 2 `fail`s are right in direction but neither is why the Lab failed: `run-mvwvu6i3` dropped a dismissal, and `run-mw0irrs5`'s only execution in its window holds 2 commands. False failures on saved passes: 0, because all 4 are inconclusive.
- **Live trials under the strict rule:** 73 trials, judged `no` 28, `execution_failed` 23, `yes` 14, `unsure` 8. All 73 inconclusive, 515 of 2,043 commands answered.
- **Broken Flows:** 138 applied, 0 passed, 8 `fail`, 130 `inconclusive`. Most are caught as gaps rather than as a demonstrated failure, so a repair would hear "not recorded", not "wrong". The mutations are mine, so they test what I thought of.

| Mutation of the exploration's own commands | Applied | Passed (must be 0) | Fail | Inconclusive |
|---|---:|---:|---:|---:|
| drop_last_act | 32 | 0 | 7 | 25 |
| repeat_act | 32 | 0 | 0 | 32 |
| other_row | 2 | 0 | 0 | 2 |
| changed_read | 26 | 0 | 0 | 26 |
| swap_acts | 31 | 0 | 0 | 31 |
| drop_last_move | 15 | 0 | 1 | 14 |

## 6. Recommendations for the next steps

- Keep `gap`. `tolerate` answers more (241 against 195) and stayed at URL 136/136, but what it answers shows what the Flow did not cause, and it adds nothing to the verdict.
- Treat D2 as a dependency of the Engine lane, not a nicety. Engine step 2 should target acts: 38% same input. Of the acts that first took a run off the recording under `first/tolerate`, the nearest recorded act has another selector 8 times and the same selector with agreeing descriptors 4 times, so a wider `target_form` buys a little and the rest are really different acts.
- Retention first if more evidence is wanted: 379 of 411 saved runs have no exploration trace to read, and of six 2026-11-03 runs the study found one run's traces left. Keeping them from now on is the cheapest large gain in evidence.
- Run the real reducer's receipts in Engine step 3 and retire the approximation here.

## Outcome

Done. Decision: **go, with the named limits above.**

## What changed and why

- `packages/fluxiq/src/client-gateway/trace-state/**` (new), `client-gateway/index.ts` (one export): the rule.
- `framework/automation-service/service/offline-first/answer.ts`, `runtime/flow-authoring/bootstrap/offline-first/{contracts,gate-step}.ts`, `runtime/llm/step-log/{offline-trial-step,index}.ts`, with their tests: the saved gap reason. Two existing `answer.test.ts` assertions gained the new `gap` field in `checked`.
- `domain/src/runtime/offline-reads/state-domain/**` (new), `offline-reads/index.ts`: the web port.
- `packages/test-runner/src/offline-trial-experiment/state-rule/**` (new), `cli.ts`, `index.ts`: the command.

## Commands run and observed results

- `vitest run --minWorkers 1 --maxWorkers 2 src/client-gateway/trace-state/tests src/runtime/llm/step-log/tests/offline-trial-step.test.ts src/framework/automation-service/service/offline-first/tests src/runtime/flow-authoring/bootstrap/offline-first/tests src/framework/automation-service/service/offline-trial/tests/gap-vocabulary.test.ts src/runtime/flow-authoring/bootstrap/candidate/tests/offline-trial/tests/offline-first-gate.test.ts src/runtime/flow-authoring/bootstrap/subflow-candidate/tests/subflow-trial-offline.test.ts` -> `Test Files 15 passed (15)`, `Tests 149 passed (149)`. Also `project-build-offline-first.test.ts` -> 8 passed.
- `DOMAIN_TEST_BUILD_LABEL=t858 pnpm --filter @fluxiq-web-extension/domain test -- offline-reads` -> `# tests 31`, `# pass 31`, `# fail 0`.
- `node --test dist/offline-trial-experiment/state-rule/tests/state-rule.test.js dist/offline-trial-experiment/state-rule/tests/build-measure.test.js` (packages/test-runner) -> `# tests 14`, `# pass 14`, `# fail 0`.
- `pnpm --filter fluxiq check`, `pnpm --filter @fluxiq-web-extension/domain check`, `pnpm --filter @fluxiq-web-extension/test-runner check` -> each exit 0.
- `node scripts/structure-audit.mjs` -> Core `passed (487 warning(s), 1097 baselined)`, extension `passed (234 warning(s), 553 baselined)`.
- `node scripts/check/core-mirror.mjs` -> `1 mirror set(s) match`.
- `node packages/test-runner/dist/offline-trial-experiment/cli.js state-rule --lab-runs <lab-runs> --extra-store <t836 copy>@run-mvwx2cob-3454e2ce --extra-store <t840 copy>@run-mvx83b7v-5eda5d6c --work <scratch>/test-runs/final` -> 5m33s, `Builds 32; models {"deepseek-flash":25,"claude-sonnet-5-5":7}; modes {"project":25,"legacy":7}; Lab {"failed":28,"passed":4}; stores unread 0; originals unchanged true`. 364 stores read. The tables above are its output, with the gap and disagreement tables condensed by hand.
- Full suites not run, by the twice-a-day rule.

## Not verified

- The real intake: no saved Flow ran through the socket and virtual clock (limit 6).
- Any Claude project-mode build, since none is saved. Any result-reaching exploration, since none exists.
- The row computer and any `same_rows` on an exploration.
- The new `meta.json` fields on a real run: tests only.
- The real reducer's receipts: the harness approximates them.
- The 17 recorded-failed, live-succeeded disagreements were not read one by one.
- Whether the Lab's oracle verdict belongs to the last execution of a run in every case: the wire-form arm assumes so.
- Firefox, protected projects, multi-session traces.

## Open questions or contradictions found

- The study's "9 of 9 recorded succeeded, live failed" holds, and it also holds for the control: the layer acts are unstable between two live runs, so an act-status target was never reachable on acts alone. The 110/125 target is mostly snapshots.
- The brief's target "0 false passes on saved failed runs" is met on explorations only because nothing passes, and is not met in the wire-form arm (2, or 5 counting every later run judged no). The lead should decide which arm that target is meant for.
- The `gap` note can never happen on the web domain (section 1). Fixing it changes model-facing text, so I left it.
- `parameters.browserTabId` and `browserFrameId` need a decision in Engine step 2.

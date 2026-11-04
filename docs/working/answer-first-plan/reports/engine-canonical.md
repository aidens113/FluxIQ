# Engine: one canonical form, the state engine, the row computer and the pure verdict

Date 2026-11-03 to 04, updated after the lead's decisions on the first version. Task `t864`, paired worktrees `fxwork/t864/!FluxIQ` and `fxwork/t864/!FluxIQWebExtension`. Provider-free: no model, site, browser or Lab launch. Stores were read from copies, and the originals' size and modified time were unchanged after the run. This report and the harness's output hold counts, codes, field paths and short ids only.

## Numbers first

**The engine is built and works through the real intake, and a run now reports all its gaps with their steps in one verdict. On saved explorations it still settles nothing: 0 passes, 0 fails and 18 of 18 inconclusive. The canonical form did what a form can do, and that was not enough to move the verdict.** Whether the design earns its place is still unknown until a result-reaching exploration exists.

| Measure | Before (go/no-go) | After canonical form | After row computer too | Target or stop line |
|---|---:|---:|---:|---:|
| Study's six runs, core acts with equal input | 0 of 43 raw | **21 of 43** | same | |
| Study's six runs, all non-snapshot commands | 7 of 59 raw | **37 of 59** | same | |
| A Flow's acts with the same input as exploration | 52/138 (38%) | **61/138 (44%)** | same | stop line 70% |
| Reads with the same input | 496/565 | 502/565 | same | |
| Moves with the same input | 68/93 | 68/93 | same | |
| Commands answered, `first/gap` | 195/796 (24%) | 221/796 (28%) | **223/796 (28%)** | stop line 50% |
| Builds inconclusive, `first/gap` | 28 of 30 (93%) | 28 of 30 | **28 of 30** | stop line 50% |
| False passes on saved failed runs, `first/gap` | 0 (nothing passed) | 0 | **0 (nothing passed)** | 0, still vacuous |
| Live trials inconclusive | 73 of 73 | | **73 of 73** | |
| URL on answered reads | 108/108 | 128/128 | 130/130 | control 119/129 |
| Selector overlap >= 0.8 | 94/108 | 114/128 | 116/130 | control 98/120 |
| Status, all answered commands | 171/195 | 197/221 | 199/223 | control 207/243 |
| Reads computed in the walk, rows same as live | | | **2/2 explorations, 3/3 wire arm** | |
| Broken Flows that passed | 0 of 138 | | **0 of 138** | 0 |
| Wire-form arm: answered | 1,318/1,769 (74%) | same | 1,321/1,769 (75%) | |
| Wire-form arm: pass, fail, inconclusive | 19, 1, 44 | same | **18, 1, 45** | |
| Wire-form arm: false passes | 5 | same | **4, of which 2 wrong reference** | 0 in both arms |
| With a recording counted only when its own run was judged yes (11 of 64 pairs) | | | **7 pass, 1 fail, 3 inconclusive; false passes 2, both wrong reference; false failures 0** | 0 |

**Through the real intake** (`state-engine`, 18 of the 25 project builds ran. Of the other 7, 4 stores keep no candidate, 2 keep one no traced trial ran, and 1 task no longer loads. The 7 legacy builds have no way to get a candidate). Before and after the lead's decisions 1 and 3:

| Arm | Ran | Pass | Fail | Inconclusive | False pass | False failure | Answered | Reached the end | Gaps reported per run (median) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Exploration, before | 18 | 0 | 0 | 18 | 0 | 0 | 133 | 0 | the run stopped at the first |
| **Exploration, after** | 18 | **0** | **0** | **18** | 0 | 0 | 133 (median 3.5 per build) | **12** | **7, on 3.5 distinct steps and reasons** |
| Previous live test, before | 14 | 0 | 0 | 14 | 0 | 0 | 228 | 4 | the run stopped at the first |
| **Previous live test, after** | 14 | **0** | **0** | **14** | 0 | 0 | 251 | **9** | **2** |
| Own live run (parity), before | 18 | 11 | 1 | 6 | see below | 0 | 422 | 12 | |
| **Own live run (parity), after** | 18 | **14** | 1 | **3** | see below | 0 | 460 | **15** | 0 |

**What decisions 1 and 3 moved, and what they did not.** Going on past a read gap gives a repair round the whole list instead of one item, and every one of the gaps carries its step. **It did not answer one more command on an exploration (133 before and after), because the rule still refuses what follows a move or act it cannot answer.** So it improves what a model is told, not how much is checked. In the walk nothing moved at all (223/796, 61/138): saved Flows' commands carry no `now`, since their Core did not send one.

- **The false-pass target of 0 is not met in the wire-form arm.** Four false passes in the walk. Two are the wrong references the go/no-go named (`run-mvswh11y`, `run-mvtdoyf3`), and only a live run can show those. The other two rest on a recording nobody said yes to, and the new reference rule makes those inconclusive.
- **Through the intake, 0 false passes is vacuous in both product arms**: nothing passed. In the second arm no build's previous test had a judged yes, so the reference rule held back the 4 runs that reached the end with no gap. Without it they would have read: pass on `run-mvskptb1` (live yes, oracle agrees); fail on `run-mvswewhy` (live yes, a false failure the rule rightly withholds, since the reference was a judged no); pass on `run-mvswh11y` (live yes, oracle failed, a wrong reference); inconclusive on `run-mvgw3ve5` (no rows).
- **Parity is the real result here.** A saved Flow run through Core's executor, gateway and virtual clock against its own trace comes out as live did. Of the 8 builds with a live oracle verdict that passed parity, the oracle's verdict on the offline-stored rows matches the live verdict **8 of 8**: 6 passed, 2 failed. The one fail is right: that run failed live too. Of the 3 inconclusive: 1 is a recording with no rows, and 2 are reads the offline run sent that the live one did not (decision 5 below).
- **Own-run passes are not correctness.** 5 of the 14 are Flows judged no live, because a Flow always fits its own recording. That is why the reference rule exists.
- **The row computer is right when it answers, and rarely can.** Of 34 changed list reads on explorations: 3 have no recorded read of that page, 12 are computable, 19 are not. All 6 reads of the 12 that differ come from one case, a list that grew on one address (live held 16, 24 or 28 items, the recorded read 8; `run-mvskodlp` 34 against 25). Every computed row was among the live rows. On a page holding the same items: **6 of 6 identical**. In the walk the state rule answered only 2 of them, since most runs have left the recording by then. 8 of the 19 need the page, because a condition reads a value no recorded column holds.

## Why the canonical form did not move the verdict

**The form is exhausted. What is left are real differences.** Of the 77 acts with no equal input, measured against every recorded act:

| What the act is | Count |
|---|---:|
| Another selector and other words, on a row | 38 |
| Another selector and other words, no row | 17 |
| The same selector on **another row** | 15 |
| No recorded act of this type at all | 6 |
| Another selector, same words | 1 |

A wider normalisation could reach one act, and making another row equal would be wrong. So 44% (51% against the whole build) is roughly the ceiling these explorations allow. The first thing to leave the recording did not change either: `state_changed_by_act` on a navigate for 12 builds (9 of 18 through the intake), because exploration navigated there only after acts the Flow never did.

**So "EXACTLY the same inputs" is now true by construction where the two name the same thing, and it is the explorations that differ from the Flows.** These builds wandered. This confirms the go/no-go's limit 2 and says nothing about a result-reaching exploration, which still does not exist. **Against the proposed stop condition all three lines are crossed on saved data, but that condition was set for after Exploration lane step 5, so it is not triggered. The lead should keep it.**

## The lead's decisions, and what came of them

1. **A read gap does not end the run. Done.** A read the recording cannot answer gets the domain's `unansweredCall`, which says nothing was read: a list read keeps no rows, a look shows an empty page at `https://no-recorded-page.invalid/`. The gap is counted as usual, so the verdict can only be `inconclusive`. It is not recorded data. `stepGaps` lists every gap in order with the feedback's step number, read from the order of commands, since a command does not name its step.
   - **My call, beyond your words: a page move's gap goes on too** (a navigate says it arrived, a next page says the list ended). The rule already treats a move that way, with the position unknown until a recorded absolute move restores it. Without this, 9 of the 18 explorations would still stop at their first navigate. Say if you want it back to a stop.
   - **An act's gap fails and its run stops.** A run is never told an act landed when it did not. Reads after it are `after_unrecorded_act` as the rule says, and they appear when a retry or a look still asks.
   - **A limit that remains:** a later step that needs a value an unanswered read did not give can stop the run itself (1 of 14 in the second arm, `executor.parameter.unresolved_state_path`). So "all the gaps" means all up to the first act gap or such a stop.
2. **The reference rule stands**, as built below.
3. **`now`: a simulated run stands on the recording's clock. Done** (`run_clock`, the sixth declared normalisation). A `now` inside the time the recording spans is the recording's own and leaves the key. A `now` outside it asks about another time, stays in the key, and the row computer refuses it, with a test.
   - **What stopped the 3 parity runs:** a condition that reads the page. `run-mvtdmo5p` and `run-mvud43a2` have a `read` condition beside a date bound on a column, and `run-mvtdn37t` a `read` date bound. Their saved runs never sent `now`; today's dispatch adds it because the filter judges a date, so the read looked changed, and the computer rightly would not compute a read condition. With `run_clock` the recorded answer stands, and **all 3 now pass parity, with rows the oracle passes**.
4. **Stop lines:** left as written. Not triggered on saved data, and they apply after the first real explorations.
5. **The 2 parity gaps, cause found.** `run-mvgvyaip` and `run-mvswfjbq` both failed a step live, and their saved traces hold no `includeHidden` look and no `web.page.facts` at all. Today's Core sends those on a failing step's path, and the older Core that made those runs did not. I read that from the traces and the failing-path code, and did not step through it. It is a gap between the saved run's Core and today's, not an engine defect, and it should not arise on a recording made by the same Core. They stay inconclusive. A third inconclusive, `run-mvgw3ve5`, read no rows.

**The nine gap words are below, under "What the next steps need".**

## Decisions made

1. **A declared normalisation, not a change at the cause.** Making both paths write one wire form would change what a live run sends, and the wire target goes through `output-nodes/targets` and Core's `io-policy`, neither of which is in this lane. The rule reads both forms instead.
2. **Live bytes are unchanged.** `gateway-mapping.ts`, `output-nodes/**` and `io-policy.ts` are untouched, and `client/tests/gateway-mapping-canonical.test.ts` pins them: a Flow step's wire target is what it was, one key means one element and selector at the page (`webAutomationActionFromGatewayCommand`), and a repair that renamed the control is another key because the page is sent another element. **Exactly what did change on a live path:**
   - `offline-first/answer.ts`: a build whose offline check hit a gap now tells the model `could not answer step N (reason)` instead of `settled nothing`, as you decided. Generic words, from the existing `WORDS.gap`, no code or field path. Only where offline-first is installed. The note's other outcomes are unchanged.
   - The matcher's delivery code moved to `trace-matcher/recorded-feed.ts` unchanged, and its tests pass. U5 gained nine reason codes additively.
3. **Six declared normalisations**, returned with every result: `target_form`, `wait_fields`, `new_tab` (from t858), `run_clock` (above), and new:
   - `run_handles`: `browserTabId` and `browserFrameId`, as you decided, read as their **place in the run**. The first tab named equals none, a later one is `tab#1`. Tests hold that a genuinely new tab still differs. It cannot see a press that opened a tab before the run named any.
   - `read_asks`: `rejectedSamples`, `recordOutput`, `extractList.answer`, and `extractList.now` only when no date is judged. These are what a Flow's dispatch adds beside the read.
   Row identity, `where`, `text`, `url`, `value`, `checked` and `ensureState` stay in the key.
4. **A recording needs a judged yes to mean anything** (`reference: "judged_yes" | "unjudged"`, required). Without one, the result is `inconclusive` (`judgement_unavailable`), a fail included, since differing from a run that failed may be the repair. **This is beyond the brief.** It is what brings the wire arm's false passes down to the wrong references and its false failures to 0. In the replay the exploration arm passes `judged_yes` because no saved exploration was ever judged: that arm stands in, and it passed nothing anyway.
5. **Three further cases are `inconclusive`, each found by a mutation or a parity run:** a recording that read rows and kept none (two empty lists are not the same result; 4 of the 32 explorations, which is why the self-walk now passes 28 and not 32); a run that went on after a computed read changed the rows (`recording.after_changed_rows`); and a run that never reached the recording.
6. **A read that kept nothing has no rows.** An exploring read answers its rejected rows when its filter keeps none (`unfiltered`). They are no longer read as its result, and a Flow's `answer: "kept"` read is not answered with them.
7. **Gap codes.** The nine rule-only reasons went into U5 and the drift test, and stayed out of the matcher's list, so what a gate must have words for is unchanged until this is wired in. That also kept `runtime/flow-authoring/**` untouched, so I did not need to ask. Proposed words are in the next section.
8. **Core's bookkeeping is not the Flow.** A result check or end view gets a gap answer, is counted apart, and the verdict never reads it. Without this, every run that reached its end showed a false `capture_snapshot` gap.

## What the next steps need from this

**Repair tools.**

- `core.simulate` can call `runAutomationStudioOfflineStateTrial` as it stands. It needs the recording's trace id, the reference, and receipts. **Receipts are still the harness's approximation** (`traceStateReceipts`); a saved build keeps no digest for the real reducer. The product must pass the reducer's.
- **`stepGaps` is the list a repair round reads.** Most of an exploration's gaps are consequences (`after_unrecorded_act` 68 and `after_unrecorded_move` 25 of 121), so show the first of each run of them and count the rest. The first gap on the list is what to fix first.
- The never-recorded answer has its parts: the first gap's code, its fields by path, and `nearest`. It lacks "what was recorded in this state", which needs a small reader on the walker.
- `automationStudioOfflineFirstAnswer` reads the matcher's report, not the engine's. Wiring needs its own mapping.
- Words for the nine reasons, generic, for `offline-first/words.ts`, which the Exploration lane owns:
  - `state_changed_by_act`: "the recording only did that after other actions this draft does not take"
  - `other_position`: "the recording only did that on another page"
  - `would_repeat_act`: "the recording did that once, and it would not be done twice"
  - `after_unrecorded_act`: "an earlier step did something the recording never did"
  - `after_unrecorded_move`: "an earlier step went somewhere the recording never went"
  - `other_row`: "the recording did that on another row"
  - `act_out_of_order`: "the recording did that before an action this draft already took"
  - `wait_longer_than_recorded`: "the recording gave up waiting sooner than this step would"
  - `wait_shorter_than_recorded`: "the recording's answer came later than this step waits"

**Flags.** A flag needs the first gap's step and code, which the report gives. The row computer's refusals (a condition that reads the page, another column) are flags by nature. `after_unrecorded_*` are consequences, so flag only the first.

**The Exploration lane.** Judge the exploration's result live once (the reference), read witnesses, and read a filtered list unfiltered or with `rejectedSamples: true`, since that is what the computer needs. `upToFirstChild` goes away once exploration has no trials. `sources.ts` keeps only test trials, so the latest exploration per Flow needs a store query. Product tracing and retention are still off.

## Limits a later lane may not assume away

1. **No simulated pass has been shown through the intake against anything but a Flow's own run.** Everything said of a pass on an exploration is a prediction.
2. **A date filter recomputed from recorded rows is judged at the recorded read's end,** on the recording's clock, as you decided. A row on a date boundary is judged as the recording would have judged it, which is the point.
3. **What a run does after an unanswered read is not evidence.** Its stored rows, routes and later steps come from an empty answer. Only the gap list and the commands the recording did answer mean anything there.
4. **The row computer rests on 12 reads, 6 identical on same-content pages, on three scenarios.** Enough to say it does not invent rows, not enough to say it is general. Its own named limit, a condition judging shown text against a recorded disclosed cell, did not show up here. Column subsets are a gap.
5. **The corpus is the go/no-go's:** 32 builds, 8 tasks, 6 scenarios, no Claude project-mode build, none reaching a result.
6. **`state-engine` runs the stored candidate, with its own base digest.** A rebuild from the script does not give the same digest under today's Core (`run-mvtdmo5p`), so the store's candidate is the one run, and the base-digest check is answered with the candidate's own, since the Flow moved on after the trial.

## What changed and why

**Core:** `client-gateway/trace-state/engine.ts` (new, the socket), `walker.ts`, `recording.ts`, `verdict.ts`, `end-check.ts`, `types.ts`, `gap-codes.ts`, `index.ts`. `client-gateway/trace-matcher/recorded-feed.ts` (new, shared feeding), `matcher.ts`, `index.ts`, `gap-answer.ts` (a wider parameter type). `offline-trial/state/{run,evidence-result,step-gaps,index}.ts` (new), `matcher-session.ts` (generic session), `index.ts`. `offline-first/answer.ts`. `flows/authoring/model/offline-trial/vocabulary.ts` (additive). Tests: `trace-state/tests/engine.test.ts`, `offline-trial/state/tests/{run,step-gaps}.test.ts` (new), plus edits to `walker`, `verdict`, `fake-domain`, `gap-vocabulary` and `answer` tests. `docs/architecture/automation-studio/client-gateway.md`.

**Extension:** `domain/src/runtime/offline-reads/state-domain/row-computer.ts`, `run-handles.ts` (new), `canonical-operation.ts`, `answer-reading.ts`, `web-trace-state-domain.ts`, barrels, tests. `domain/src/client/tests/gateway-mapping-canonical.test.ts` (new). `gateway-mapping.ts` itself did not need changing. `packages/test-runner/src/offline-trial-experiment/state-rule/engine/` (new, the `state-engine` command), `flow-walk.ts`, `build-measure.ts`, `corpus-summary.ts`, `mutations.ts`, `types.ts`, `state-rule-arguments.ts`, `state-rule-command.ts` (`--row-computer on|off`), `cli.ts`.

`mutations.ts` now changes only a read that returned rows. A read that kept nothing changed to another that keeps nothing breaks nothing, which is why the applied count for `changed_read` fell from 26 to 22.

## Commands run and observed results

- `vitest run --minWorkers 1 --maxWorkers 2 src/client-gateway src/framework/automation-service/service/offline-trial src/framework/automation-service/service/offline-first src/flows/authoring/model/offline-trial src/runtime/flow-authoring/bootstrap/offline-first` -> `Test Files 80 passed (80)`, `Tests 563 passed (563)`.
- `DOMAIN_TEST_BUILD_LABEL=t864 pnpm --filter @fluxiq-web-extension/domain test -- offline-reads gateway-mapping` -> `# tests 94`, `# pass 94`, `# fail 0`.
- `node --test dist/offline-trial-experiment/state-rule/tests/state-rule.test.js .../build-measure.test.js .../engine/tests/summary.test.js` (packages/test-runner) -> `# tests 18`, `# pass 18`, `# fail 0`.
- `pnpm --filter fluxiq check`, `pnpm --filter @fluxiq-web-extension/domain check`, `pnpm --filter @fluxiq-web-extension/test-runner check` -> each exit 0.
- `node scripts/structure-audit.mjs` -> Core `passed (488 warning(s), 1097 baselined)`, extension `passed (235 warning(s), 553 baselined)`, both on the final files. `node scripts/check/core-mirror.mjs` -> `1 mirror set(s) match`.
- `node packages/test-runner/dist/offline-trial-experiment/cli.js state-rule --lab-runs <lab-runs> --extra-store <t836 copy>@run-mvwx2cob-3454e2ce --extra-store <t840 copy>@run-mvx83b7v-5eda5d6c --work <scratch>/test-runs/<label> [--row-computer off]` -> about 6 min each, `Builds 32; models {"deepseek-flash":25,"claude-sonnet-5-5":7}; modes {"project":25,"legacy":7}; Lab {"failed":28,"passed":4}; stores unread 0; originals unchanged true`. Baseline reproduced the go/no-go's table exactly before any change (195/796, 52/138, 19/1/44).
- `node packages/test-runner/dist/offline-trial-experiment/cli.js state-engine --lab-runs <lab-runs> --work <scratch>/test-runs/engine-all` -> about 25 min, `Builds 32; not run {"session":7,"legacy_build_has_no_rebuild_seam":7}`, 0 stores unread, the arms table above. A simulated run took a median of 7.4 s on the parity arm and 8.9 s on the exploration arm before decisions 1 and 3, wall time, on this machine; I did not re-take that figure after them. The harness's `first/gap` line and verdict table are the same before and after those decisions.
- Scratch counters over the same stores, not in the repository: the act classification, the list-read classification and the study's six runs (`t864/acts2.mjs`, `reads.mjs`, `rowsdiff.mjs`, `study.mjs` in the session scratchpad). Counts, booleans and field keys only.
- Full suites not run, by the twice-a-day rule.

## Not verified

- Any result-reaching exploration, since none exists. Any Claude project-mode build, since none is saved.
- A simulated pass on a judged-yes reference through the real intake: the replay's previous-test arm held none. The 7 passes on judged-yes references are from the walk.
- The real reducer's receipts: still the approximation.
- The new note words read by a real model in a real build: tests only.
- 14 of 32 builds through the intake: the 7 named at the top, and 7 legacy builds.
- The two parity gaps' cause: read from the traces and the code, not stepped through.
- The step numbers on real gaps against what a model would read: they use the feedback's numbering and no gap lacked one, but the order rule is inferred, since a command names no step.
- Firefox, protected projects, multi-session traces, and a trace with real page-capture artifacts answering a computed read's own artifact references.

## Open questions or contradictions found

- **A page move's gap going on** is my reading of your decision 1. Say if you want it stopped.
- **The reference rule** depends on the Exploration lane judging the exploration's result live. You are telling it. Until it does, nothing simulated can pass.
- **The study's "37 of 63"** is 37 of 59 here: the six runs' last live tests hold 147 commands where the study counted 173 with its own window. The direction agrees.
- The lane's stop lines are all crossed on saved data. They were set for after Exploration lane step 5, so I treat them as not triggered, and I name that so nobody reads this as a quiet pass.

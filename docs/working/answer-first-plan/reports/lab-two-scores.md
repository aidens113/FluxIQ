# The Lab's two scores (t863)

## Outcome

Done, with the live driver left for when Core has something for it to read. The Lab now scores "the person got the right answer" (`answerVerdict`) apart from "the Flow became deterministic" (`oracleVerdict`, the replay), on the attempt itself, before any reset. A headed, provider-free run on `everything-store`, started from the real extension chat of a real isolated Core with no model key, scored the kettle task right with no Flow promoted, wrong with a repeated act (named: asked 2, landed 4), wrong when the right answer never reached the chat, and showed a second attempt on one workspace that started from the first's draft and spent less. Nothing is committed, and no provider was called.

**Stand-ins in that proof, exactly:** Core's attempt record, the stored rows (read by the Lab's reference reader instead of Core's dataset store), the chat's answer turn, the exploration (the task's own recording script, played in the browser), the saved draft (a file per workspace) and the calls, tokens and dollars (fixed arithmetic per scripted decision). Each row carries them in `standIns`, and a run with any stand-in enters no bench rate. **Real:** the extension, the side panel, the typed instruction reaching Core's `append-turn`, Core, the site and its state, every act and page, every oracle, the live steps and the time.

**So what the proof does not show:** the second attempt's lower spend is the driver's rule (saved steps need no decision), checked by a proof that the draft was really found. It says the Lab can see the saving, not that Core makes it. That needs Core's attempt loop and a live run.

## What changed and why

The six items, in the brief's order. New directories hold most of it; the existing files got small edits.

1. **`answerVerdict`.** `flow-lane/creation/answer/` (`judgeAttemptAnswer`, `scoreAnswer`) judges stored rows, declared facts, the change and what was shown, through the same comparison the Flow answers to. `lane.ts` judges right after the build ends, before anything can reset or throw, and again from its catch for a build that threw. `judgeCreatedFlowDataset` now takes a `CreatedFlowDatasetSource`, so no persisted Flow run is needed. `oracleVerdict` is playback only: the contract refuses one with no Flow on any run that has an answer score. `reportedVerdict` may stand beside a judged attempt with no Flow. A draft with a right answer scores `right` and `flow: "unproven"`.
2. **What the chat showed.** `ChatAnswerPort` is the port (`answer/ports.ts`). `scriptedChatPort` stands in. A real run's `liveAnswerStage` reads the panel's words until the turn lands, so **a real run scores `not_shown` today wherever the chat tells the build and not the answer.** That is the plan's finding, now measured. A turn is compared row by row, in order, with the total; a preview of the right rows with the right total holds. The screen is declared secrets: one in what was shown fails. Only counts and closed names are kept.
3. **Double-act oracle.** `flow-lane/creation/site-change/`: a lasting view per realistic site (named counts over `GET /__control/final-state`), a baseline read just before the attempt acts, and `asked/table.ts` holding what each of the 108 realistic tasks asks, by act. `judgeSiteChange` reports repeated acts by name, missing acts, and unasked changes. No scenario, oracle or task was touched.
4. **Same-workspace attempt lane.** `attempt-lane/`: `runAttemptSeries` over an `AttemptDriver`, reseeding the site and keeping the workspace. `proveContinuation` refuses a repeat that merely spent less, naming each failed condition.
5. **Report.** `test-contracts/src/attempt-score/` holds `AttemptReportRow`, `AttemptSeries` and validators. `BenchWorkflowResult.answerRate` and `metrics.answerScore` are separate, and `report.md` prints them under their own heading.
6. **Hard rule and default.** `no_result` can only be `wrong`, in `scoreAnswer` and again in the contract; a spent budget and a person's Stop are excused. `--authoring-mode answer-first` goes through Core's resolver, so it works the moment Core's does. **The line you flip** is `LAB_DEFAULT_AUTHORING_MODE` in `packages/test-runner/src/live-llm/authoring-mode-env.ts`, marked `FLIP AT THE ANSWER-FIRST MERGE`. `testing-facility.md`'s stale line is corrected, and the two new sections are in.

Also: `lane-rules/built-flow.ts` lets an answer-only ending through, `run-scenario.ts` wires the stage (799 lines, one under the limit), and `audit-asked-changes.ts` is a provider-free tool that replays every honest path against the table.

### Decisions I made

| Decision | Why |
| --- | --- |
| `answerVerdict` and `answer` are optional, and the evaluation stays schema 0.3 | An old run must state none rather than a filled-in value. A required field or a bump would invite exactly the blending you ruled out |
| Words: `right`, `wrong`, `budget_out`, `stopped_by_person` | Not `passed`/`failed`, so an answer score cannot be mistaken for a Flow's. The rate is right over right and wrong; excused endings are reported and in no rate |
| `verdict` stays the Flow chain in `legacy`, `candidate` and `project`; in `answer-first` a right draft passes with no Flow | Keeps old numbers. `passRate` now counts only a pass with a Flow behind it, which changes nothing for any old run and keeps an answer-first pass out of it |
| A `legacy` build states no answer | It keeps no rows of its own, so it would score `no_result` and say something false about a run that never tried |
| Permission stop at the declared point: no answer score | It has not ended; it is waiting for a person. The run stays `stopped_for_permission` |
| The asked changes live in `test-runner`, not beside each site's tasks | The brief's ownership. They would sit well in `live-tasks.ts` if you want to move them |
| The table is measured, not written from reading | Each row is what the task's own recording script moved on the real site. It caught a thing reading would miss: a shop's reply lands in the same thread, so the view counts only what the person sent |
| The site is reseeded between attempts, on a site reset and never a workspace one | Final-state oracles are absolute, and a kept cart would read as wrong rows. This is the Lab's reset, as before playback, and the product's minimal-reset behaviour is untouched |
| A person's Stop and a spent budget are read from Core's failure code (`attemptEndingOfBuild`) | The attempt record's status is the real source. Until then, `budget_exhausted` and `cancel` in the code |

## Commands run and observed results

Provider-free throughout. Credentials are scrubbed from the process (`withoutProviderSecrets`).

- **The proof:** `node dist/attempt-lane/cli.js --evidence <scratch>` -> exit 0. `"entry":"real-extension-chat"`, side panel, four `append-turn` calls answered 200 on one conversation. Checks all true:

```text
{"rightWithNoFlowPromoted": true, "wrongWithRepeatedAct": true, "repeatedActNamed": true, "rightButNotShownFails": true, "secondStartedFromFirst": true, "secondSpentLess": true, "secondRight": true}
attempt | path | calls | tokens | usd | ms | live steps | simulation | answer | oracle | flow | repeated acts
1 | explore | 26 | 67080 | 0.0780 | 45555 | 24 | passed | right | none | unproven | none
2 | run_flow | 1 | 2580 | 0.0030 | 44053 | 24 | not_run | right | passed | playback_held | none
second attempt started from the first's draft: proven
1 | explore | 29 | 74820 | 0.0870 | 45596 | 27 | passed | wrong | none | unproven | Two sage kettles put in the cart (asked 2, landed 4)
1 | explore | 26 | 67080 | 0.0780 | 42878 | 24 | passed | wrong | none | unproven | none
wrongBecause: doubled ['records', 'final_state', 'repeated_act', 'not_shown'], silent ['not_shown']
```

  I also read the repeated-act picture: the site's own cart shows quantity 4 of the kettle and "Subtotal (6 items)". Time and live steps are measured and are about the same in both attempts, since the script plays the same steps at the same pace (attempt 2 was slightly slower in the site-only run). Only the scripted calls, tokens and dollars fell.
- Same proof, `--site-only` -> same checks true, `"entry":"site-only"`.
- **The table against the site:** `node dist/attempt-lane/audit-asked-changes.js --out <scratch>`, headed, after the table was written -> `{"played":85,"finished":83,"unfinished":2,"disagree":0}`, exit 0. The 85 distinct paths cover all 108 tasks; twins of a variant share their path. The two unfinished are `professional-network-rotterdam-data-engineers` and `-netherlands-data-engineers`: "paginates by numbered, and the Lab's extract reader follows only next".
- `pnpm.cmd --filter @fluxiq-web-extension/test-contracts check` -> `test-contracts:check`, no errors. `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` -> `test-runner:check`, no errors.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (234 warning(s), 553 baselined).` `node scripts/check/model-text.mjs` -> `model-text: ok`.
- Tests, in `packages/test-runner`, naming only the folders I changed: `node --test "dist/bench/tests/*.test.js" "dist/bench/answer-score/tests/*.test.js" "dist/flow-lane/creation/tests/*.test.js" "dist/flow-lane/creation/answer/tests/*.test.js" "dist/flow-lane/creation/site-change/tests/*.test.js" "dist/flow-lane/creation/site-change/asked/tests/*.test.js" "dist/flow-lane/tests/lane-observation.test.js" "dist/run-evaluation/tests/*.test.js" "dist/lane-rules/tests/*.test.js" "dist/live-llm/tests/authoring-mode-env.test.js" "dist/attempt-lane/tests/*.test.js" "dist/tests/*environment*.test.js"` -> `tests 485, pass 485, fail 0, skipped 0`.
- In `packages/test-contracts`: `node --test tests/*.test.mjs src/tests/*.test.mjs` -> `tests 180, pass 180, fail 0`.

Failures on the way, which are the honest record: the first audit stalled on every task because my tool never opened the start page; the first double act timed out because pressing the colour swatch reloads the product page, so the act now doubles through the sheet's own "Continue shopping"; the first lane tests passed on a failed build rather than a draft because my fixture was invalid, which I found by reading a neighbouring failure and fixed, with an assertion that the build is a draft. One `timeout 170` run of the chat proof was cut off by my own bound.

## Not verified

- **Any live run.** No paid run, by the brief. `liveAnswerStage` and the `run-scenario.ts` wiring type-check and the lane is tested against a fake Core, but they have never read a real draft's trial rows. Its `get-flow-run-detail` read copies the shape `persisted-flow-run.ts` uses and has not met a real answer.
- **A live attempt driver does not exist.** It needs `answer-first` and a Core read for the attempt record and saved state. The port (`AttemptDriver`) is the place. So item 4 is proven on the stand-in only.
- **Core's own second attempt.** In the chat proof, Core took all four instructions on one conversation (`append-turn` 200). It has no model key, and it did none of the attempt's work. I did not read what it answered in the thread.
- `answer-first` end to end. It is tested with Core's resolver replaced and a fake Core. `readiness.ts` admits it with no candidate trial; if the mode keeps candidate trials, that line changes.
- `replay_held` is read by the series and the bench, and **nothing sets it yet**, so `attemptsUntilDeterministic` stays `null` until a live driver carries `lab replay`'s result.
- The asked changes beyond the honest path. A different right route that moves a lasting name differently would read as wrong. I expect this to be rare, because the views count outcomes, but only live runs will say. The two `professional-network` reads whose script stops at numbered pagination rest on their instructions, not a finished path.
- Firefox, the web panel, and the extension's rendering of any answer: untouched.
- Whole package suites and `pnpm check`, under the twice-a-day limit.

## Open questions or contradictions found

1. **The plan's "relax the validation that forces both null" and "`oracleVerdict` means playback only" pull apart.** I relaxed `reportedVerdict` and kept `oracleVerdict` null with no Flow, since a draft has no playback. The attempt's score is `answerVerdict`.
2. **`job-board-apply-quillmark-check-first`:** its table row says one application, from its script, which plays the person allowing. Its lane ending is a permission stop, which scores no answer. Consistent, but say if a stop on an ask-first task should score.
3. **A wrong answer with a right Flow in `answer-first`** fails after playback (`lab.answer_wrong`), and the Flow's score stands beside it. I took "fails" literally. A later attempt's Flow could make this common, so check it against the plan's D4.
4. **Build order for a worktree's chat proof:** it also needs `pnpm --filter @fluxiq-web-extension/extension test:e2e:build`, `pnpm --filter @fluxiq-web-extension/domain host:build` and `node dist/extension-chat-check/cli.js --prepare-core-web-build`. `pnpm lab` has no entry for this lane, because `scripts/lab/` was not in my paths. One line there would add it.
5. **No task was unachievable.** 83 of 85 distinct honest paths finished on the real site; the other two are the reference reader's limit, not the task's.

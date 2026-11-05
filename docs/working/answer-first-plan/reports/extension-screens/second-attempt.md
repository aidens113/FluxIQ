# t871 second attempt made visible

Outcome: Done (extension full `check` not run; see Not verified).

## What a person now sees
1. First attempt answer: "Saved Sunday: the steps. They only partly work, so next time I will fix what changed." once, in the foot, above the buttons. Notes-only says "notes only"; needs-you says it needs them; "worked last time" only for `ready`. No "quicker next time" anywhere. Budget-out uses the same words, or "Nothing saved yet."
2. Second attempt working (path not `explore`, saved state or earlier attempt known): work header gets a quiet line "Using what I saved from Sunday." and the first step of that attempt carries the same line.
3. Each step of it is marked quietly: a run's step "From saved steps"; a model thought (decision/repair) or a build action "Worked out again"; anything else unmarked.
4. Finished answer: one line by path (run_flow / run_flow_then_repair / run_flow_then_explore wording as briefed, no count), then the comparison, then the saved line.
5. Comparison: "This time X. First/Last time Y.", cost only where reported, numbers as they are (slower/dearer shown plainly), nothing unless this attempt finished and both times are known; an earlier budget-out/stopped attempt reads "First time it ran out of budget after 3m 14s and $1.12."
6. Extension: "did not keep a change" now "Nothing from this run was saved for next time"; "Whether this run kept a change is not available" dropped; "Wait for FluxIQ to finish." in the strip now names the reason ("Another run is going..." / "FluxIQ is working on a task...") .

## Files changed
CORE ui-components/src/chat: answer/words/{day-words,path-words,using-saved-words,using-saved-for}.ts (new), saved-words.ts, compared-words.ts, words/index.ts; answer/index.ts, model/{answer-model,answer-types}.ts, view/{body,host,answer-view}.ts; stream/saved-marks.ts (new), stream-items.ts, step/messages.ts (StepMessage `origin`, `usingSaved`), stream/index.ts; view/step-message-view.ts; work-header/{saved-of-outcomes (new),work-header-model,work-header-view,index}.ts; chat-widget.ts (one line + helper, readiness lines untouched); chat.css (header, step sections). Tests: answer/tests/{second-attempt-words (new),model,view}.test.ts, stream/tests/saved-marks.test.ts (new), work-header/tests/work-header-model.test.ts.
EXT panel/automations/{summary-copy,automation-strip}.ts, tests/{summary-copy,controller}.test.ts (strings only); e2e/content/tests/screens/tests/second-attempt-bigbox-retail.spec.ts (new).

## Commands and observed results
- `pnpm.cmd exec vitest run src/chat/answer work-header stream view tests` (ui-components) -> 55 files, 378 tests passed.
- `pnpm.cmd --filter @fluxiq/ui-components check` -> exit 0 (after fixing a test type).
- `node scripts/structure-audit.mjs` CORE -> passed (494 warnings, baselined).
- `node scripts/structure-audit.mjs` EXT -> 4 FAIL, none in files I own: screens/scripted-panel.ts (as-never, statement-packing), getting-started/start/tests/view.test.ts, chat/asks/work-watch.ts (swallowed-failure). Other lanes.
- `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/automations/` -> 126 pass, 0 fail.
- `pnpm.cmd run test:content ...second-attempt-bigbox-retail.spec.ts --headed --workers=1` -> 6 passed (one earlier failure was my own assertion matching "Better" in the site name; narrowed to the three lines).

## Pictures (bigbox-retail, 360 px; in e2e/test-results/content/artifacts/screens-tests-second-attem-*/)
Read: first-attempt-saved, second-working-run-flow, second-finished, second-run_flow_then_explore, budget-out-saved. Saw: wording fits, no sideways overflow, header line under the step line, marks and the start line quiet and legible. Not looked at as pictures (asserted only): second-run_flow_then_repair, second-slower, budget-out-nothing-saved, second-finished-after-run-again. The "From saved steps" label repeats on every step of a run; it is quiet but takes a line each.
Keyboard: focused CSV, Tabbed through CSV, JSON, Run again, What I did, each with a non-none outline; Enter on Run again called the port's runAgain once. Not exercised: Add budget, Keep going and the other answer buttons by keyboard.

## Not verified
Extension `pnpm check` (slow) not run; Chrome/Firefox real panel and a real Core attempt feed not exercised, only Core fakes and a scripted background. Mark/line timing relies on an attempt's start/end window.

## Needs from t869/t870 (exact fields wanted)
- Attempt to activity link: `ClientGatewayActivity.attemptId` (or `ChatTaskAttempt.activityIds`). I mark steps by time window and subject kind (run = saved, thought/build action = worked out), which fails if attempts overlap.
- Per-step proof: `detail.fromSaved: boolean` on a step row, so a run_flow_then_repair repaired step is marked exactly.
- `ChatSavedState.keeps: { steps: boolean; notes: boolean }` so "the steps, and notes" can be said; today ready/partly_works/needs_you say "the steps" and notes_only says "notes only".
- `ChatTaskOutcome.usedSavedAtMs` (when the saved work this attempt used was written); I use `comparedTo.endedAtMs`, else `saved.savedAtMs`, which for an ended attempt can be its own save.

# t869 count and part

## Outcome
Partial. Items 1 and 3 are done. Item 2 is done and proven at stub-page and service level, but not in a browser (see Not verified).

## What changed and why
1. Acts with no row, now measured.
   - The one place that knows the case is `act-record/record.ts` `tieByChange`. When a read of the press's list shows no row changed, the entry is marked `unmarked` once. The mark is persisted (`contracts.ts`, `record-data.ts`), so a restart cannot count it twice or lose it.
   - `record.actsWithNoRow()` counts marked entries that still hold no row. A later read that does tie the row drops it from the count.
   - New `S/runtime/llm/step-log/note-step.ts` writes one `NNNN-note` folder with the plain line "A lasting act could not be tied to a row: <action name>". It carries no page text and is barrelled.
   - `AutomationStudioTaskAttemptFields.actsWithNoRow?` is a whole number. It has its parser and an issue code, and absent reads as zero, so records on disk still read. It is restated in `ui-components/.../ports/results.ts`, and the type-equality test guards it.
   - `SVC/answer-first/attempt/keep.ts` fills it as `max(prior, record count)` and omits it at zero. The record is seeded on a carry-on, so the count carries. `carry-on/prior.ts` and `carried-opening.ts` pass the prior count.
   - The Lab result line adds "N lasting acts could not be tied to a row." only when above zero. `attempt.json` always holds `actsWithNoRow`, as a top-level field (0 when absent) and in the raw `attempt`. The read type is updated. I did not touch `AttemptReportRow` or `report.ts`, because the row has strict keys in `test-contracts` and `attempt.json` already carries the number. Nothing shows on a person's card.
   - New test `act-record/tests/acts-with-no-row.test.ts`. It covers the known-limit case (count 1, one line, the line in `index.md`), two more reads (still 1), a carried-on record (1, no second line), a later tying read (0), a by-hand press named by its sentence (0, no line) and a pass-carried row (0).
2. A part stops as a Flow does.
   - New `SVC/project-parts/run/left-behind.ts`. `settled-calls.ts` tells it each step's row and reads `resolution.passRow` from dispatch answers and from steps run at their own door.
   - `step-gate.ts` stops the pass's next lasting step before it is sent. It asks of the row found again, and of the pass in hand when the row cannot be found again.
   - New stop reason `row_left_behind`, worded in `outcome.ts`: "A step before this one went by a link that is not shown to be this item's, so nothing says the page is still on this item, and this step was not done." It uses the part's own `stopped` shape with the step label and carries no page text.
   - A step answering `own` takes it back. Steps that declare nothing lasting still run. It is an answer the attempt carries on from, not an ending.
   - `run-part.ts` now always wraps the doors. Before, it did so only when `settled` or `admit` was given.
   - Test `run/tests/row-left-behind.test.ts` has four cases. `part-rows-harness.ts` gained an additive `page.passRow` for `.link` and `.own` step ids.
   - Docs: `llm-flow-bootstrap.md` for the count, and `subflow-library.md` for the part's stop.
3. The part specs were run on the final tree. There is no `test:e2e` path to them: `test:e2e` ignores `content/**`, so those two specs run under `test:content`. The briefed `test:e2e` narrowed to the two files found no tests, twice.

## Commands run and observed
- vitest by path, `--minWorkers 1 --maxWorkers 2`: `act-record`, `llm/step-log/tests`, `project-parts/run/tests` (includes t866's `row-across-call.test.ts`, unedited) and `project-parts/tests/pinned-calls.test.ts`. Result: 33 files passed, 425 tests passed, 102 s.
- Take-out: with the `row_left_behind` stop removed from `step-gate.ts`, `row-left-behind.test.ts` failed 2 of 4 ("lasting step after the link is not sent" and "nothing lasting after the link still runs"). Restored with `cmp` clean, and it passes 4 of 4.
- `contracts` `src/task-attempts`: 10 files, 91 tests passed. `ui-components` `src/chat/ports`: 3 tests passed.
- `pnpm.cmd --filter fluxiq --filter @fluxiq/contracts --filter @fluxiq/ui-components check`: exit 0.
- Extension and test-runner `check`: exit 0. `node --test dist/attempt-lane/live/tests/shown-answer.test.js`: 8 tests, 8 pass, including the new result-line test.
- Structure audits: Core "passed (524 warning(s), 1097 baselined)"; Extension "passed (243 warning(s), 552 baselined)".
- Both part specs, run from `apps/extension` as `pnpm.cmd run test:content part-run-job-board.spec.ts pinned-calls-job-board.spec.ts --headed --workers=1` after the rebuild: `4 passed (11.9m)`. The job-board browser was visible. No orphaned t869 node, chrome or msedge process remained afterwards.

## Not verified
- **The browser proof of item 2 is not done.**
  - job-board does have page-level links: the logo and nav, and the pane's company link `href="#"`.
  - Proving the stop in a browser needs a scripted build that records such a link inside a part's per-row pass, on a page where the press would still land without the fix. I did not build that spec.
  - Without it the e2e would pass trivially, because the press target is usually not on the page after a navigation. The stop is proven only with stub answers, by the real service, executor and For Each.
  - It is unproven that the web domain's real `passRow` answer reaches the part's doors in the shape `left-behind.ts` reads (`outputs.result.resolution`, or `.result.result.resolution`, copied from `run-gate.ts`).
- The gate compares the refreshed row (`row.inputs.item`) to the row the link step was handed by JSON identity. If a re-read changed a row's fields, that comparison misses. The gate then still stops when the row cannot be found again, but not when it is found again as a changed row.
- No service-level test covers `keep.ts` or the carry-on path (`max(prior, record)`). That would be a real-sql test. The count is tested at the record level only.
- `AttemptReportRow` and `report.ts` do not carry the count.

## Open questions
- `test:e2e` in the brief cannot reach these specs. `test:content` is the script that runs them.
- Count semantics: it counts acts a read left untied, and it drops an act that a later read ties. An act pressed with no read after it is not counted yet.

## Second round (lead's two gaps) - Outcome now Done

**Browser proof of the part's stop.** New `apps/extension/e2e/content/tests/part-run/tests/left-behind-job-board.spec.ts`, headed, job-board as it stands, no fixture change. It is the pinned spec's scripted build plus one step, the header's "Sign in" link (`href="#"`: moves nothing, no row's). A person splits the per-row work into an action part of two steps, that link then the job's heart. Run by the site part: `stopped`, `acts: []`, reason "A step before this one went by a link that is not shown to be this item's...", step "keep the role", `modelCalls: 0`, and the board's own saved list unchanged.
- This is also the proof that the real `passRow` reaches the door: the real dispatch answer holds it at `outputs.result.result.resolution.passRow`, which `left-behind.ts` reads as its second place.
- Take-out: with the `row_left_behind` stop removed from `step-gate.ts` and Core rebuilt, the spec failed: `{"status":"succeeded","acts":["modify_existing"]}`, Expected "stopped", Received "succeeded", so the heart landed. Restored with `cmp` clean and Core rebuilt.

**Count on the kept attempt.** New `SVC/answer-first/tests/acts-with-no-row.test.ts` (real service, `later-attempts.ts`, `fake-library.ts` as they are): a press tied to its row gives 0; a press naming a loan no list holds, then a second read of the unchanged list, gives `actsWithNoRow: 1` on the kept attempt, the stored row and its parse, and 1 again after a carry-on (same attempt id). Take-out of the `keep.ts` wiring: the second test failed, the first passed. Restored with `cmp` clean.

**Count on the Lab series.** `AttemptReportRow.actsWithNoRow?` (optional, present only when the attempt had one, so the series reports it without opening `attempt.json`). Validation in `test-contracts/src/attempt-score/attempt-report-validation.ts`, wired in `report.ts`, `driver.ts` and `live-driver.ts`, tested in `attempt-series.test.ts`.

**Run and observed.**
- vitest by path (`act-record`, `step-log/tests`, `project-parts/run/tests`, `pinned-calls.test.ts`, `acts-with-no-row.test.ts`): 34 files, 427 tests passed.
- `pnpm.cmd run test:content part-run-job-board.spec.ts pinned-calls-job-board.spec.ts left-behind-job-board.spec.ts --headed --workers=1` after a full rebuild: `5 passed (11.8m)`.
- Core and extension builds, then Core `check` for `fluxiq`, `contracts` and `ui-components`: exit 0. Extension, test-runner and test-contracts `check`: exit 0.
- test-runner `node --test` (`attempt-series` and `shown-answer`): 16 of 16 pass.
- Core structure audit: passed (524 warnings, 1097 baselined). Extension structure audit: passed (243 warnings, 552 baselined). It first failed `statement-packing` on one line of the new spec; I split the line and re-ran. After that reformat I re-ran only the audit and a `tsc -p tsconfig.test.json --noEmit` (no output), not the spec itself.

**Still not verified.** `AttemptReportRow` and `report.ts` carry the count only for the attempt record; `renderAttemptSeries` text does not print it. The gate's JSON comparison of the refreshed row is unchanged and unproven for a re-read row with changed fields; the browser case reaches the stop through the pass in hand.

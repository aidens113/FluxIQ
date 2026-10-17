# t687 keep request-exclusion conditions: worker report

## Outcome

Done, with one edit outside the owned paths (a one-line barrel export, flagged
below). There is also one finding the supervisor must act on: **fix 3 alone
would not have changed run `run-mvblov2i-abb7d82e`**. In this run, Core's
record never reached the builder's gate at all (see "Why the condition had no
`keptOut` record").

## Why this run's condition had no `keptOut` record

The debug note inferred that the record held no `keptOut` because 3 of the 5
rows the condition left out were unaccounted. That is not what happened.

1. **The record would have had `keptOut`.** I rebuilt Core's record from the
   exact summary the judges saw (step `0034-judge/request.json`, user message
   `context.resultSummary` and `context.instructions`) with this branch's own
   `automationStudioResultNoRecord` and `automationStudioResultStandingNoRecord`.
   Condition 1 (`sponsored is absent`) left out 5 rows alone. Four are marked
   `also_in_result` (the judge-shown summary lists all 4 under
   `leftOutAlsoInResult`; the note said 2). The fifth row, the one not also in
   the result, is settled with witness `"Sponsored"`, and the request-text test
   passes on it: `automationStudioResultRequestTextTest("sponsored is absent",
   <request>, says, "Sponsored")` returns `['sponsored']`. That gives
   `accounted: { by: "request_words", texts: ["sponsored"] }`. Every row is
   accounted for, so `keptOut` holds all 5 rows. The pre-t687 memory would have
   kept the condition, and the revision 2 submission would have been refused
   once.
2. **The record never reached the builder's subflow gate.** This was a
   single-subflow project build, so each `core.test_subflow` is the t679 judged
   whole run. `project-agents/single-subflow/single-subflow-trial.ts`
   (`answerOf`) builds the builder's `AutomationStudioSubflowTrialResult` only
   from the supervisor's `core.test_candidate` tool **evidence** (`ran.evidence`).
   The candidate gate keeps `standingNo` out of that evidence by design
   (`flow-bootstrap/candidate/trial-gate.ts` around line 425; it is never
   model-facing). So the trial the whole-test port hands the subflow gate has no
   `standingNo`, and the gate's
   `this.keptConditions.remember({ standingNo: undefined, ... })` keeps nothing
   (`subflow-trial-gate.ts:399`). The scoped submission controller asks that
   subflow gate (`gate.standing(proposal)` → `keptConditions`). It found none, so
   revision 2 (step `0040`) was accepted at once, with no kept-condition refusal.
   The supervisor's candidate gate did remember the condition, but under the
   whole candidate's revision, and nothing asks it about the builder's proposals.
   The same gap means the subflow gate's standing-no memory (t633) never weighs
   anything on this path either.
3. **The fix needed is in `project-agents/**`, which I must not touch.** The
   whole-test answer must carry Core's record beside the evidence. Either the
   whole test returns the candidate trial's `standingNo` to
   `single-subflow-trial.ts`, which sets `trial.standingNo` on the subflow trial
   result, or the whole-test port reads it from the candidate gate's kept verdict
   (`gate.standing(complete)`). Without that, neither t641 nor t687 can hold a
   condition on any single-subflow project build.

## What changed and why

**Fix 3a: a condition written in the request's own exclusion words is kept without `keptOut`.**

- `standing-no-record/request-exclusion.ts` (new): reads, from Core's record
  alone, whether a condition leaves rows out by what the request says to leave
  out. A condition qualifies when:
  - it is one of the exclusion shapes that `refuted-no/request-text-test.ts`
    routes to its exclusion reading: `X is absent`, `X not is present`, or a
    negated literal text test;
  - the read kept rows and the request was given;
  - it has settled rows whose `quoted` came from the request-text test.

  It yields one of two fields:
  - `excludes`: the request's words, where at least one settled row passed the
    test and none failed it;
  - `askedFor`: settled rows on which Core read a non-empty witness value that
    fails the test, with no other copy in the result. By Core's own reading,
    these are rows the request asks for.

  Label tests (t651) never count: their rows are never quoted.
- `standing-no-record/record.ts`: each record condition carries those fields.
  `standing-no-record/index.ts` exports the new module.
- `standing-no/types.ts`: `AutomationStudioResultStandingNoCondition` gains
  `excludes` and `askedFor`. `AutomationStudioResultKeptCondition` gains
  `excludes`, and its `keptOut` may be empty when `excludes` is set.
- `standing-no/record-shape.ts`: reads both new fields back from a port. A
  malformed field makes the record none, as for the other fields.
- `standing-no/kept-conditions.ts` (`remember`), in order:
  - `askedFor` releases the condition;
  - `keptOut` or `excludes` keeps it, carrying `excludes`;
  - unaccounted `leftOutAlone` rows release it only when the kept entry has no
    `excludes`.

  So a request-exclusion condition is released only by a record showing a row
  Core reads as asked for. Sets (t666) are unchanged.
- `standing-no/kept-condition-drop.ts`: `keptOf` accepts an entry with empty
  `keptOut` when `excludes` is set. `said` gives such a condition in Core's
  words: "leaves out rows by what the request itself says to leave out
  ("<words>"): Core read what those words name on rows it left out, and on none
  of them a value the request does not say to leave out", then any accounted
  rows, and "brings back rows the request says to leave out". When no dropped
  condition carries `excludes`, the wording is byte-identical to before.
  Refuse-once (t644) is unchanged.
- `standing-no/index.ts`: header note.

**Fix 3b: a reading Core contradicts entirely passes its `observed`, not its `advice`.**

- `agreement/refuted-labelled.ts`: the wholly refuted label prefix is now one
  constant (the label text is unchanged). Added
  `automationStudioResultAdviceShown(advice)`. It splits a labelled field into
  its `Judge call N (...)` parts and replaces each part whose label is the
  wholly refuted one with Core's words: "Judge call N's advice is left out:
  Core's record contradicts every claim its reading makes, so the change it
  named rests on nothing the trial shows." The paging (t501) and order (t511)
  labels begin with the same words but are kept as they were, and so are
  part-refuted and unlabelled advice.
- `service/candidate-trial/feedback.ts`: a judged no's `judge.advice` and an
  unsure's `unconfirmedReading.advice` pass through that function; `observed` is
  unchanged. `service/subflow-trial` uses the same `judged` feedback, so subflow
  trials get the same behaviour.
- **Outside the owned paths:** `agreement/index.ts` gained one line,
  `export { automationStudioResultAdviceShown } from "./refuted-labelled.ts";`.
  `agreement/` is not re-exported by the top `result-verification` barrel, and
  the structure audit ratchets imports that reach past a barrel. A
  subdirectory `index.ts` import is exempt, so `feedback.ts` imports from
  `../../result-verification/agreement/index.ts`. Without that line, the only
  routes were a deep import (an audit failure) or copying the label string into
  `feedback.ts`.

**Tests** (each new; no existing expectation changed):

- `standing-no-record/tests/shows-fixture.ts`: a venue's show listings,
  "leave out sold out shows", condition `soldOut is absent`.
- `standing-no-record/tests/request-exclusion.test.ts` (5 tests): the words are
  carried though `keptOut` is absent; the negated text shape; `askedFor` on a
  non-excluded witness; `askedFor` when the request says "including"; nothing
  for a positive text test.
- `standing-no/tests/kept-request-exclusion.test.ts` (5 tests):
  - kept without `keptOut`; refused once in Core's words; the same drop sent
    again is accepted;
  - survives a JSON round trip;
  - stays kept through a later record with unaccounted rows;
  - released by `askedFor`;
  - never kept when the request says "including".
- `agreement/tests/refuted-labelled.test.ts` (5 tests): a wholly refuted part
  is withheld from real `bothReadings` output; a single wholly refuted reading
  from `refutedLabelled` is withheld; a part-refuted reading is unchanged; a
  paging-contradicted reading is unchanged; unlabelled advice is unchanged.
- `service/candidate-trial/tests/refuted-advice.test.ts` (2 tests): a no's
  advice, and an unsure's `unconfirmedReading` advice, lose the wholly refuted
  part, and `observed` is unchanged.

## Commands run and observed results

- Run reproduction (scratch script outside the repo, with
  `node --experimental-transform-types`): the record rebuilt from step 0034's
  summary gives condition 1 `leftOut` = 4 × `also_in_result` + the 5th row
  `request_words ["sponsored"]`, so `keptOut` holds all 5 rows. Run file
  `0040-tool-core.submit_subflow/result.json` shows `ok: true, revision: 2`, so
  there was no refusal.
- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo`
  (in `packages/fluxiq`):
  - before tests: no output, about 59s;
  - after tests: 2 errors in my test files (TS2554 in `refuted-labelled.test.ts`
    line 51; a missing `records` in `refuted-advice.test.ts`); I fixed both;
  - final run: `tsc exit: 0`, no output.
- `npx vitest run .../result-verification .../service/candidate-trial .../service/subflow-trial`:
  - before adding tests (code changes only): `Test Files 145 passed (145)`,
    `Tests 1197 passed (1197)`;
  - after adding tests: `Test Files 149 passed (149)`;
  - after the two type-only test fixes, the two affected files were re-run:
    `Test Files 2 passed (2)`.
- Fix-off checks (each source file backed up to scratch, edited, and restored;
  `cmp` confirmed the restore):
  - all three fixes off (`feedback.ts` advice unfiltered, pre-t687 `remember`,
    no exclusion fields in `record.ts`): 9 of the 12 new tests failed (`×`). The
    3 that passed are guards that hold either way (positive text test says
    nothing; release by `askedFor`; "including" is never kept).
  - only the memory rule off: 3 of the 5 `kept-request-exclusion` tests failed
    (the kept, round-trip and stays-kept tests).
  - `refuted-labelled.test.ts` imports the new function, so it cannot pass
    without it.
- `node scripts/structure-audit.mjs` (repo root):
  `structure-audit: passed (393 warning(s), 1155 baselined).`, exit 0.

## Not verified

- No live run or Lab run. Whether a builder keeps the condition when it is
  given the refusal or the withheld advice is untested.
- The flow-bootstrap gate and controller tests were not run (outside the
  brief's validation). They read `keptConditions` through
  `kept-condition-drop.ts`, whose behaviour is unchanged for entries without
  `excludes`.
- `askedFor` treats a settled row as one Core read a value on only when its
  witness in `leftOutObservations` is present and non-empty. When two reads
  share a condition name and a label, `quoted` can be cleared (`null` in
  `refuted-no/record.ts`), and such a row would count as `askedFor`. This is
  rare, but I did not test it.
- The whole-test record gap (above) is diagnosed from code and run files only.
  I made no change to it.

## Open questions or contradictions found

1. **The debug note's cause for fix 3 is contradicted by the run's own data.**
   The record would have had `keptOut`. The condition was dropped because the
   t679 whole-test path never hands `standingNo` to the builder's subflow gate.
   Fix 3 is still general and correct: it covers withheld labels and rows whose
   value Core did not read. But this run needs the `project-agents/single-subflow`
   carrier fix to change outcome. That is a separate brief in owned territory I
   could not touch.
2. **Out-of-ownership edit:** one export line in
   `result-verification/agreement/index.ts` (reason above). Please confirm or
   move it.
3. The debug note says the label noise included call 2 being marked "contradicts
   part" for saying the holder was "left out only by rating". The run files show
   that label on call 2. I did not change that labelling; it is in `refuted-no`
   weighing, outside this brief.

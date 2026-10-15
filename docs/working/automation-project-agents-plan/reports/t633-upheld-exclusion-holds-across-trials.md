# t633 upheld-exclusion-holds-across-trials: worker report

Brief: t633, part 1 of t632, plus debug fix 3. Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t633/!FluxIQ`, branch
`task/t633-upheld-exclusion-holds-across-trials`. Nothing was committed. No live run and no provider call.

## Outcome

**Done.**

- **(1)** A build test's double no now carries Core's own record of it (`standingNo`). The record holds:
  - the rows the result stored;
  - the conditions it was read with;
  - the stored rows a standing no called not the asked kind (t628's path);
  - the conditions each standing no asks to remove.
  The record is Core-only.
- **(2)** Both trial services pass it on the trial result, beside the feedback and never in it.
- **(3)** Both gates keep the records that upheld rows. A later no whose remedy would bring back exactly those rows is
  weighed as contradicted by the build's own record. Such a no is not taken: the trial is unsure, its revision is not
  closed, and the builder is told why in Core's words and told to test again.
- **(4)** `checked-rows.ts` now flags a row a judge calls stored that is not in the result.
- **Definition of done.** The stub swing test passes through the real build-test judge and the real gate, for both the
  subflow gate and the candidate gate:
  1. A no upholds a kind exclusion on revision 1.
  2. Revision 2 leaves those rows out and is judged no by advice to remove the conditions that left them out. That no is
     contradicted, and the builder is told so.
  3. The re-test is judged yes twice, which confirms the exact Flow.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### (1) result-verification

- **New `result-verification/standing-no/`**. It reads only records, so the gates can import its barrel without a
  module cycle.
  - `types.ts`:
    - the record, `AutomationStudioResultStandingNoRecord`: `stored`, `storedWhole`, `conditions` (each with a `key`
      and `leftOutAlone`), `upheldKind`, and `standing` (one entry per call, with `drops`);
    - `AutomationStudioResultStandingNoCarrier`;
    - the contradiction type.
  - `contradiction.ts`: the rule, `automationStudioResultStandingNoContradicted`. A later no is contradicted when there
    is an earlier record with `upheldKind` rows for which all of the following hold:
    1. The later revision stores none of those rows, and `storedWhole` is true: the record holds every stored row, and
       no record set was truncated.
    2. Every standing call has `drops`, and every dropped condition is one the later revision has and the earlier one
       lacked.
    3. Without the dropped conditions, the later revision has no condition the earlier one lacked. The remedy therefore
       takes the read back to conditions that kept the rows.
    4. No kept condition left one of those rows out alone.

    Conditions are compared by their wording, lower-cased, with Core's `(read "…" on a row it kept)` aside removed. They
    are never compared by number or node id.

    Core's sentence names the conditions and a count of rows. It never names the row labels.
  - `memory.ts`: `AutomationStudioResultStandingNoMemory`, which each gate holds.
    - It validates the shape of any `standingNo` a port answers.
    - It weighs a no against standing nos of other revisions.
    - It keeps only nos that upheld rows and were not contradicted, at most 20.
- **New `result-verification/standing-no-record/`**. It is separate from `standing-no/` because it imports
  `refuted-no`, whose read accounts import `flow-bootstrap` back.
  - `record.ts`: `automationStudioResultStandingNoRecord`.
    - A call that `automationStudioResultRefutedReading` wholly refutes does not stand.
    - `upheldKind` comes from the new `automationStudioRequestKindExclusionLabels`.
    - `drops` come from the new `automationStudioResultAdviceChangedConditions`, and only where the call's observed
      reading names no stored row, no left-out row and no row Core has no record of. Quotes of texts that the result's
      own conditions test are removed first.
  - `named-stored.ts`: moved out of `agreement.ts`, which now imports it.
- **`agreement.ts`**: `standingNoOf(input)` is added to the double-no branch, only when `confirmAnswer === true`, so only
  for build tests. The header notes t633.
- **`contracts.ts`**: `AutomationStudioResultVerification` is now `import("./standing-no/index.ts").AutomationStudioResultStandingNoCarrier & { … }`.
  - This adds no lines. The file was at 800 lines, which is its hard limit.
  - The field is documented on the carrier type.
- **`build-test/judge.ts`**: the `no` verdict carries `standingNo`, structured-cloned. The header and the field are
  documented.
- **`refuted-no/advice-condition.ts`**: the advice parse is split out as `automationStudioResultAdviceChangedConditions`,
  without clearance. `automationStudioResultAdviceConditions` calls it, and its behaviour is unchanged.
- **`refuted-no/types.ts` and `record-conditions.ts`**: `wording` is added to each `AutomationStudioResultNoCondition`.
- **`request-rows/unstated-exclusions.ts`**: cue parsing is factored into `exclusionsOf`, and `saysWhatANamedRowIs` now
  returns the labels (`saysWhatNamedRowsAre`). The new export is `automationStudioRequestKindExclusionLabels`. The t515
  and t628 behaviour is unchanged.
- **`index.ts`**: exports both new barrels.

### (2) The trial services

- **`service/candidate-trial/run.ts`**:
  - `AutomationStudioCandidateTrialOutcome.result` is now `AutomationStudioCandidateTrialResult & AutomationStudioResultStandingNoCarrier`.
  - On a judged no, `answerFor` puts `standingNo` on the result.
- **`service/subflow-trial/run.ts`**: the same change for the partial receipt.
- **The port wrappers in `service/project-build/*-trials.ts` and `project-agents/dispatch`** spread the result, so the
  field reaches the gate. I checked this by reading the code. I did not edit those files.

### (3) The gates

- **`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`** and **`flow-bootstrap/candidate/trial-gate.ts`**:
  - `ask()` returns `{ answer, standingNo }`.
  - `test()` calls `standingNos.weigh(...)`; the subflow gate does this only when `entryPrepared`.
  - A contradiction becomes `notTaken(...)`: verdict `unsure`, with `feedback.contradictedByBuild` holding Core's
    sentence.
  - The judge's feedback, including `code: candidate.trial_judged_no`, is kept unchanged. That is my reading of
    "failure codes stay primary".
  - `retestsLeft` and `retry_allowed` follow from the unsure verdict, the digest is not closed, and `refuted()` stays
    undefined.
  - The instruction is `CONTRADICTED_RETESTABLE`, in generic words. It says to test the same revision again and not to
    make the change that no asks for. With no retests left, the plain unsure wording applies.
  - Both headers note t633.
  - Both gates import `../../result-verification/standing-no/index.ts`, not the result-verification barrel, to avoid
    the cycle.

### (4) `request-rows/checked-rows.ts`

- `STORED` words are said of the run: stored, kept or holds, "the result includes", "in the result". They are excluded
  when said of the request, when said as what should happen or did not, and when said of a condition wanted ("that
  keeps", the `WANTED` pattern).
- A mention is called stored when the last thing said of the run before it is a stored word, or, if nothing is said
  before it, when the first thing said after it is. It is never called stored when the next thing said after it is a
  left-out word.
- A named row called stored that is not in the result gets a misread line: "is not in the result, although the check
  calls it stored …". The condition line is still said.

### Tests

| File | Tests | What it covers |
| --- | --- | --- |
| `result-verification/standing-no-record/tests/campsite-swing-fixture.ts` | (fixture) | Another kind of site: the campsite search from t631's fixture. Revision 1 stores a rental cabin; revision 2 leaves it out by two name conditions together (`together: true`). |
| `result-verification/standing-no-record/tests/record.test.ts` | 5 | Through the build-test judge with a scripted provider: `upheldKind` is kept; `drops` are kept; there are no drops for a no naming a wrongly left-out row; a runtime check's double no carries no `standingNo`; a yes carries none. |
| `result-verification/standing-no/tests/contradiction.test.ts` | 4 | The rule; seven cases Core cannot measure; the memory; the words are generic. |
| `flow-bootstrap/subflow-candidate/tests/standing-no-swing.test.ts` | 3 | The swing end to end, from no to unsure (contradicted) to yes, with completion ok after 6 calls. Control: a no with no earlier upheld no still closes the revision. The words are generic. |
| `flow-bootstrap/candidate/tests/trial-gate-standing-no.test.ts` | 2 | The same swing through the whole-candidate gate, including `retestable()`, plus the control. |
| `service/candidate-trial/tests/standing-no.test.ts` and `service/subflow-trial/tests/standing-no.test.ts` | 2 each | `standingNo` rides on the result and the port, and never in the feedback; it is absent on a yes. |
| `result-verification/request-rows/tests/checked-rows.test.ts` | +3 | The t633 describe block for (4), on the campsite fixture. |

## Commands run and observed results

All commands ran in the t633 worktree, with nothing heavy running beside them.

- **Typecheck.** `node_modules/.bin/tsc --noEmit -p tsconfig.json`, in `packages/fluxiq`. Final run: exit 0, no output.
- **Brief vitest set, first run.** `node_modules/.bin/vitest run <R>/result-verification <R>/service/candidate-trial <R>/service/subflow-trial <R>/flow-bootstrap/subflow-candidate <R>/flow-bootstrap/candidate`.
  This ran before the new tests existed.
  - Result: 1 failed and 1140 passed.
  - The failure was t628's checked-rows case: "the stored rows include … <rows> were seen and only excluded by rating".
    My first stored rule gave the stored word to the left-out rows.
  - I fixed the rule: a left-out word after a mention wins. After that, the case passes unchanged.
- **Brief vitest set, final run** (after the directory split): `Test Files 137 passed (137)`, `Tests 1162 passed (1162)`.
- **Neighbouring tests that use the judge**, which are not owned:
  - `vitest run <R>/flow-bootstrap/unfinished-build/tests/judged-wrong-rows.test.ts <R>/llm/harness/tests/judge-request-prefix.test.ts <R>/recovery/refuted-result/tests/brief-checked.test.ts <R>/service/project-build/tests/project-build-subflow-entry.test.ts <R>/project-agents/dispatch`
  - Result: `Test Files 13 passed (13)`, `Tests 81 passed (81)`.
- **Structure audit.** `node scripts/structure-audit.mjs`, from the Core root.
  - First run: 4 FAILs.
    - `contracts.ts` was at 809 lines, over the 800-line limit.
    - Three imports reached past a barrel, in the two gates and in `contracts.ts`.
  - Fixed by:
    - writing the carrier as an intersection, which adds 0 lines;
    - splitting out `standing-no-record/`;
    - importing barrels only.
  - Final run: `structure-audit: passed (371 warning(s), 1156 baselined)`.
  - Existing advisory warnings on touched files: `trial-gate.ts` is at 579 lines, `agreement.ts` at 716 and
    `contracts.ts` at exactly 800.
- **Mutation check.**
  - Turned off: the gate's `notTaken` in both gates, and the misread push in `checked-rows.ts`.
  - Result: the 2 swing tests and the 2 new checked-rows tests failed (`4 failed | 24 passed`).
  - All three files were restored from copies, and `grep "&& false"` finds nothing.
- **Scratch replay of the real wave 8 readings.**
  - Command: `node --experimental-transform-types <scratchpad>/t633_replay.mts lab-runs/2026-10-15/run-mv9gbsm5-2957581c`.
  - Method: each step's `request.json` summary and `decision.json` diagnosis, through `automationStudioResultNoRecord`,
    the new record builder and `automationStudioResultStandingNoContradicted`. Not committed.
  - Records:
    - b2 (0046/0047), r1 (0069/0070), r3 (0091/0092) and r6 (0119/0120) each have
      `upheldKind: ["Loftwell Countertop Paper Towel Holder, Bamboo"]`.
    - r2 re-test (0085/0086): 0085 is wholly refuted (t631). 0086 stands with
      `drops: name contains ["paper towels"], name not contains ["holder"], name not contains ["dispenser"]`.
    - r5 (0109/0110): neither call has drops, because both name rows.
  - Pairs:
    - **r1 → r2 re-test: contradicted.** Core's sentence: "Revision 1, read without condition 4 (name contains ["Paper
      Towels"]), condition 5 … and condition 6 …, stored a row that the no standing on its trial called not the kind of
      thing the request asks for; … so this no is not taken: the verdict is unsure, not no."
    - b2 → b3 (0053's call): contradicted.
    - r3 → r5, r1 → r5 and r1 → r3: not contradicted.

## Not verified

- No live or Lab run, as the brief says. Whether a model re-tests after `CONTRADICTED_RETESTABLE`, rather than following
  the no, is unmeasured.
- The full package suite was not run. Only the brief's directories and the neighbouring judge tests listed above were
  run.
- `standingNo` reaching the gate through the real project-build wrappers (`service/project-build/subflow-trials.ts`,
  `whole-trials.ts`) was checked by reading the code, which spreads the result. No test covers it.
- In the replay, b2's call 1 (0046) came out wholly refuted by t607/t631, so only 0047 stood. The verdict is unchanged,
  because a refuted no beside a standing one is only labelled. I did not dig into why 0046 is wholly refuted.

## Open questions or contradictions found

1. **The memory is per gate, which means per brief for subflows.** In the towels run, brief 1 (b2 → b3) and repair
   brief 2 (r1 …) were separate builder loops, each with its own gate.
   - The contradiction holds inside brief 2: r1's no, then the r2 re-test's no. It cannot carry brief 1's upheld no into
     the repair brief.
   - Carrying it across briefs needs `project-agents/dispatch` to hand a gate the earlier records, for example through
     the brief or `AutomationStudioSubflowBuilderLoop` input. That is outside this brief.
2. **Outer layers still see the raw "no".** Three wrappers read the port's result before the gate weighs it:
   - `service/project-build/subflow-trials.ts` (`proposals.trialled`, and the time limit's "last verdict");
   - `project-agents/dispatch/run-brief.ts` (`remembered`, `heard`);
   - `receipts.ts`.

   So a receipt can say `no` where the gate said `unsure`. Only `yes` changes what passes, so nothing is promoted
   wrongly. A supervisor reading the receipts may still dispatch a repair for that receipt. Aligning them, by weighing in
   the port or by having the gate report back, is the supervisor's call.
3. **"Failure codes stay primary".** I kept the judge's feedback `code` (`candidate.trial_judged_no`) first and unchanged,
   and added Core's words as `feedback.contradictedByBuild`. The tool's `resultCode` follows the gate's verdict
   (`subflow.trial_unsure` / `candidate.trial_unsure`), as the existing verdict-to-code rule does. If "primary" meant the
   `resultCode` should stay `_no`, that conflicts with `retry_allowed` and with leaving the digest open.
4. **How strict the rule is.** The remedy must remove only conditions added since the earlier revision, and must take the
   read back to no condition the earlier revision lacked.
   - So a no asking to remove just one of two jointly excluding conditions is not contradicted. This is correct: that
     alone would not re-admit the row.
   - Conditions are matched by wording across all reads, not per read. In a Flow with two reads that use one wording,
     they are conflated. I found no such case.
5. **`contracts.ts` is exactly at its 800-line limit.** The next field there needs a split.

# t651 own-label-is-not-request-words

Brief: cause 2 of the A8 towels debug
(`!FluxIQWebExtension/docs/working/automation-project-agents-plan/reports/a8-towels-run-mva446jf-debug.md`).
Run `run-mva446jf-926a3c72`. Worktree `fxwork/t651/!FluxIQ`, branch
`task/t651-own-label-is-not-request-words`. Nothing was committed.

## Outcome

Done. If a condition's tested value is the row's own label, Core no longer
counts that condition as the request's own words, even when its text is a
request word. Core therefore no longer refutes a no with it, accounts for no
row with it (`request_words`), stops printing "contradicted by Core's record"
on its rows, and never keeps it through t641. A revision that drops it is not
refused. A text condition over a column of its own still settles its rows and
is still kept.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/`.

**Every reader goes through one point.** The t629 test
(`automationStudioResultRequestTextTest`) is called in exactly one place:
`refuted-no/record.ts` `requestQuotes`. That function sets `quotesRequest` and
`quoted` on each left-out row. Every other reader works from those two fields:

- `missing-claim.ts` and `row-reference-claim.ts` (t629/t631 refutation) and
  `value-claim.ts` (t629);
- `record-conditions.ts` (`accounted.by: "request_words"`), and from there
  `advice-condition.ts` (t631 clearance and the "contradicted" banner);
- `standing-no-record/record.ts` `keptOutOf`, then `standing-no/kept-conditions.ts`
  (t641 memory), then `kept-condition-drop.ts`, then the submission refusal.

I found no other reader of `quotesRequest`, `quoted` or `request_words`, and
no other caller of the request-text test, anywhere under `runtime/` (grep).
t636 (`exclusion-evidence/advice-kept.ts`) does not read any of them. So the
fix is a single gate, and it covers t629, t631, t636 and t641.

- New `refuted-no/label-tested-condition.ts`,
  `automationStudioResultConditionTestsLabel(condition, stored)`. It is
  exported from the barrel. It answers true when Core's own record shows the
  condition tests the row's label. Values are compared folded and whole. Any
  one of these signals is enough:
  1. the account's `testedLabel`;
  2. a left-out row whose present witness value is that row's own label (the
     run's shape: `retailer` was read from the title);
  3. the value read on a kept row, `(read "…" on a row it kept)`, is a stored
     row's label (in the run, the kept value was a stored row's name);
  4. the tested column is stored, and on a stored row it holds that row's
     label.

  Whole-value matching only: a brand column whose value merely starts the
  title stays a column of its own.
- `refuted-no/record.ts` `requestQuotes` skips any condition for which that
  function returns true. It now takes `stored`. The header has a t651
  paragraph.
- `refuted-no/types.ts`: the `quotesRequest` doc says it is never set on a
  label-tested condition. `refuted-no/index.ts`: added the export and a
  header line.

**Cue window not widened.** The primary rule alone settles the run. The
debug's secondary change would have marked "<house> sells itself rather than
a marketplace seller" as not clean. That would also stop Core vindicating a
*genuine* seller column (`seller contains "<house>"`), whose left-out rows
really do fail the request's words. The converse test covers that case
(`sellerLine`). Widening the window would weaken a correct settlement, so I
left it alone.

**Tests** use a generic hardware-store fixture: a house name used both as the
site and as the seller, drills, a delivery column. None of the bigbox site,
its products or its words appear.

- `refuted-no/tests/hardware-fixture.ts`: the run, plus a `sellerLine` variant
  in which the seller column is a real seller line.
- `refuted-no/tests/hardware-readings-fixture.ts`: the judges' no.
- `standing-no-record/tests/hardware-plans-fixture.ts`: the revision plans.
- `refuted-no/tests/request-words-name-field.test.ts` (6 tests):
  - t629 alone still reads the name condition as the request's words. The cue
    falls outside the window, so the label rule is what decides.
  - Its rows are settled but not quoted or accounted for, and the no plus its
    advice to remove the condition stand.
  - Each of the four signals is tested, along with whole-value matching and a
    withheld label.
  - Converse: the delivery column and the seller-line column are still quoted
    and `request_words`, and the seller-line no is still wholly refuted.
- `standing-no-record/tests/label-condition-replay.test.ts` (3 tests): a stub
  replay through `automationStudioBuildTestJudge` with a scripted provider.
  - Name condition: the verdict is `no`, with no "contradicted by Core's
    record". In `standingNo`, condition 3 has `leftOutAlone` and no `keptOut`;
    condition 1 still has `keptOut` with `request_words`.
  - The memory keeps only the delivery condition. Dropping the name condition
    (the run's rev 4) returns `undefined`, so it is not refused. Dropping the
    delivery condition is still refused.
  - Converse: the seller-line no is refuted, so the verdict is not `no`. Once
    the no stands for another reason, the seller-line condition is kept and
    dropping it is refused once.
- I had to place the replay test in `standing-no-record/tests/`, not
  `result-verification/tests/`. That directory would have reached 26 files
  against the audit's 25-file limit.

No judge pin moved. No existing test was edited.

## Commands run and observed results

All from `fxwork/t651/!FluxIQ`:

- `npx vitest run <the two new test files>` with the gate line in
  `record.ts` temporarily commented out:
  `Tests 3 failed | 6 passed (9)`. The three t651 tests failed; the converse
  tests passed. I restored the file from a copy and confirmed the line is
  back (`grep -c` gave 1).
- `npx vitest run src/.../runtime/result-verification src/.../runtime/service/candidate-trial src/.../runtime/service/subflow-trial src/.../runtime/flow-bootstrap`
  (packages/fluxiq), final state:
  `Test Files 288 passed | 1 skipped (289)`,
  `Tests 3180 passed | 2 skipped (3182)`, exit 0.
- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq): exit 0, no output.
- `node scripts/structure-audit.mjs`:
  `structure-audit: passed (382 warning(s), 1156 baselined)`, exit 0.
  - The first run failed on three things: 26 files in
    `result-verification/tests/`, 22 exports in the fixture, and a
    `failure-as-empty` `JSON.parse` catch. I fixed all three: moved the test,
    split the fixtures, and replaced the catch with plain unescaping.
  - One advisory warning remains: `hardware-fixture.ts` has 13 exported
    values against an advisory threshold of 8.

## Not verified

- No live run (as the brief says).
- I did not replay the real `0022`/`0040` summaries byte for byte. The
  fixture reproduces their shape: witness equals label, the kept value is a
  stored row's name, and the column is unstored.
- I did not test at loop level that the run's revision 4 submission is now
  accepted. That path lives in `flow-bootstrap/**`, which is t650's and which
  I must not touch. I checked it at the gate (`automationStudioResultKeptConditionsDropped`
  returns `undefined`), which is the function `submission.ts` asks.

## Open questions or contradictions found

- **t607 is still in place.** A sentence such as "Missing rows: X" that does
  not mention a condition is still refuted when X was settled by a
  label-tested condition, because the row "fails the condition as written".
  That reading was not the request-words reading the brief named, so I left
  it alone. However, a judge cannot misread a row's name: calling such a row
  missing is in effect a dispute of the condition. If the supervisor agrees,
  the fix is to treat `disputesCondition` as true for such rows in
  `missing-claim.ts` (the record would need a per-row flag).
- In the run, both judges' sentences named condition 4, so they stand under
  this fix. A judge that does not name the condition would still hit the t607
  case above.
- The debug's cause 1, the repeat guard blocking the t641 resend, is not
  touched here. It remains in t650's area, `llm/**` and `flow-bootstrap/**`.

## Round 2: the t607 case

Coordinator's instruction: a judge's "Missing rows: X" that names no
condition must not be refuted when the only thing that left X out is a
condition testing the row's own label. Refutations where a condition over a
column of its own left X out must stay.

### Outcome

Done.

### What changed and why

All paths are under `result-verification/refuted-no/`.

- `record.ts` gains `labelTested(summary, stored)`. It reuses
  `automationStudioResultConditionTestsLabel` and returns the names of the
  read conditions that test a label. `requestQuotes` now skips a condition by
  that set, so the same rule is applied once. Each left-out row of such a
  condition carries `testsLabel: true`. The header has a sentence on this.
  - Processing (`recordOutput.process.where`) conditions are not flagged. Core
    settles none of their rows, so `missing-claim.ts` already never refuted
    them.
- `types.ts`: added `AutomationStudioResultNoLeftOutRow.testsLabel?: true`, with
  a doc comment.
- `missing-claim.ts`: a sentence counts as disputing a condition when it
  speaks of one (as before) **or** when any row it names has `testsLabel`. A
  disputed sentence stands unless every row it names is quoted on the
  request's words, which a label-tested row never is. The header has a t651
  paragraph.
  - A row left out by a name test in one read and by a genuine column in
    another stands. Core did not measure the name test's exclusion, and both
    exclusions would have to hold for X to be rightly absent.
- **Siblings.** `missing-claim.ts` is the only reader that refutes on
  `settled` without a quote (grep of `.settled` in `refuted-no`,
  `standing-no` and `standing-no-record`).
  - `row-reference-claim.ts` refutes left-out rows only when every one is
    quoted, so label rows already fall through to `missing-claim.ts`. Its
    "these rows are in the result" branch is a claim Core does measure (the
    row is not stored), so I kept it.
  - `value-claim.ts` reads `quoted` only.
  - None needed a change.

**Tests.** I added a new describe block, two tests, in
`refuted-no/tests/request-words-name-field.test.ts`:

- "Missing rows: <name-test rows>." stands. The rows carry `testsLabel`.
  Mixed with a delivery-column row, the sentence still stands.
- "Missing rows: <delivery row>." is still wholly refuted, with the delivery
  value finding. In the seller-line variant, the same rows are not flagged and
  the sentence is still refuted.

### Commands run and observed results

From `fxwork/t651/!FluxIQ`:

- `npx vitest run runtime/result-verification/refuted-no runtime/result-verification/standing-no-record`:
  `12 passed (12)` files, `94 passed (94)` tests.
- With `|| rows.some((row) => row.testsLabel === true)` removed from
  `missing-claim.ts`: `1 failed | 7 passed (8)`. The failure was "stands
  though it names no condition". I restored the file from a copy (`grep -c` = 1).
- `npx vitest run runtime/result-verification runtime/service/candidate-trial runtime/service/subflow-trial runtime/flow-bootstrap`:
  `Test Files 288 passed | 1 skipped (289)`,
  `Tests 3182 passed | 2 skipped (3184)`, exit 0.
- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `node scripts/structure-audit.mjs`:
  `structure-audit: passed (382 warning(s), 1156 baselined)`, exit 0, no FAIL.

### Not verified

- No live run.
- No judge-level replay of a "Missing rows:" sentence through
  `automationStudioBuildTestJudge`. The claim is tested at
  `automationStudioResultRefutedReading`, which `agreement.ts` calls.

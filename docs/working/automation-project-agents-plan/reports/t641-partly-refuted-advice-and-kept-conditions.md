# t641 report: partly refuted advice and kept conditions

Worker report for the brief `t641 partly-refuted-advice-and-kept-conditions`. The work was done in the Core worktree
`fxwork/t641/!FluxIQ`, branch `task/t641-partly-refuted-advice-and-kept-conditions`. Nothing was committed, and there
was no live run.

## Outcome

Done. All three fixes from the debug (`a8-towels-run-mv9ul5dy-debug.md`, RC1 to RC3) are in, as the brief scoped them.
There is a stub replay of the run's shape on a campsite search, through the build-test judge, the trial gates and the
submission controllers.

## What changed and why

### (1) A double no labels a reading that Core's record refutes in part

File: `result-verification/agreement.ts`.

- **Before.** `bothReadings` was given only readings that were wholly refuted (`refutedFindings`). In trial 2, call 1's
  advice reached the builder unlabelled.
- **Labels.** `bothReadings` now gets every no that Core's record refutes any of (`weighedNos`).
  - A reading refuted in part is labelled `Judge call N (Core's record contradicts part of this reading: <findings>)`.
    This is the label the split path already used (t628), now in the shared constant `PART_CONTRADICTED`.
  - Such a reading still stands. It is not reordered behind the others, it is not re-asked, and the verdict is
    unchanged. `refutedMark` still marks only readings that are wholly refuted.
- **Edge case.** A single reading, or two worded alike, is now labelled too. Before, it returned the first directive
  unchanged.
- **New field `recordContradicts`.** `unconfirmedReading` now carries Core's fact beside the label:
  `recordContradicts: "whole" | "part"`.
  - It is set in `refutedLabelled` (`agreement.ts`) and in `labelled` (`refuted-no/reask.ts`, which sets `"whole"`).
  - Types were widened in `contracts/verification.ts` and `build-test/judge.ts`.
  - The service's `compact({...unconfirmedReading})` passes it into trial feedback without any service change.

### (2) Conditions Core's record showed keep out only rows the request does not ask for

Call these the vindicated conditions.

**The record** (`standing-no-record/record.ts`). Each condition now carries:

- `nodeId` and `number`;
- `keptOut`, set when the condition alone left out at least one row and every such row is accounted for. A row is
  accounted for when it is `also_in_result`, or when it is `request_words` (with the texts it was read against). This
  uses the existing t631 `accounted`. A numeric bound's settled row does not count.

**`standing-no/`** (gates import it without a cycle):

- `types.ts`: added `AutomationStudioResultStandingNoKeptOutRow`, `AutomationStudioResultKeptCondition`,
  `AutomationStudioResultKeptConditionsCarrier` and `AutomationStudioResultKeptConditionDrop`.
- `record-shape.ts`: `recordOf` moved out of `memory.ts` (no behaviour change). It now also parses `nodeId`, `number`
  and `keptOut`.
- `written-conditions.ts` finds a record condition as the revision that ran wrote it:
  - It matches the step whose node id ends in `.<subflow>.<step>`, falling back to `.<step>` when only one step
    matches.
  - It reads that step's `where[number-1]`, or `recordOutput.process.where` for a saved answer.
  - It canonicalises the condition as JSON with sorted keys, and collects every condition a plan writes under any
    `where`.
- `kept-conditions.ts`: `AutomationStudioResultKeptConditionMemory`.
  - It keeps each vindicated condition by its written form, and a later trial's account replaces the earlier one.
  - It forgets a condition when a later record shows that same written condition leaving out a row Core does not
    account for.
  - It ignores the verdict, because the record is Core's, not a judge's.
- `kept-condition-drop.ts`: `automationStudioResultKeptConditionsDropped` lists the kept conditions that a plan no
  longer writes as they were written, leaving out any already refused. Core's words name, for each one:
  - the condition, as `condition N (wording)`;
  - the revision and the condition as written;
  - each row it kept out, and how Core accounts for that row.

**Gates** (`candidate/trial-gate.ts`, `subflow-candidate/subflow-trial-gate.ts`):

- After each trial, the gate calls `remember` with the trial's `standingNo` and the plan that ran. The subflow gate does
  this only when `entryPrepared`.
- The result kept in `verdicts`, which is what `standing()` returns, carries `keptConditions` when there are any.
- It is never in the trial evidence or feedback the model sees; the tests assert this.

**Submission** (`candidate/submission.ts`):

- `submit`, but not `submitComposed`, finds the latest accepted revision whose trial carries `keptConditions`.
- A submission that drops or changes one of them is refused with `candidate.kept_condition_dropped` (exported as
  `AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE`). The refusal feedback has `keptConditions`, `issues` and
  `instruction`, and the standing revision is restored.
- The refusal happens once per condition and per trial that showed it, keyed by `revision + written`. The same drop
  sent again is accepted.
- `subflow-candidate/scoped-submission.ts` copies `keptConditions` through its history adapter (`candidateTrial`), so
  briefs are held to their own trials.

### (3) Re-test advice rests on Core's findings

Files: both gates.

- `UNSURE_RETESTABLE` no longer says "one judge call said yes". It is now split into two texts:
  - `UNSURE_RETEST_ADVISED`: Core's record contradicts what kept the trial from a yes, so a re-test is the better move.
  - `UNSURE_RETESTABLE`: nothing contradicts it, so change the Flow for the defect where the evidence shows one, and a
    re-test stays allowed.
- `automationStudioCandidateRetestAdvised` (exported from `trial-gate.ts` and used by the subflow gate) reads only
  Core's fields:
  - `feedback.unconfirmedReading.recordContradicts === "whole"`, or
  - a non-empty `feedback.doubtContradicted`.
- The fact is also a field, `retestAdvised`. It appears in the test evidence and in the completion refusal for an unsure
  that can be re-tested and has no `contradictedByBuild`.
- The t632 case is kept: where Core's record wholly contradicts the no, the gate still advises a re-test.

### Tests

**New tests:**

| Test | What it covers |
| --- | --- |
| `refuted-no/tests/partly-refuted-route.test.ts` | The label appears; the verdict stays no with 2 calls; words alike; an unrefuted no is left as it was |
| `standing-no-record/tests/record.test.ts` | One new case: `nodeId`, `number` and `keptOut` per condition |
| `standing-no/tests/kept-conditions.test.ts` | Resolution, keep and forget, drop, loosen, reorder or move, refused set, malformed input, and words |
| `flow-bootstrap/candidate/tests/kept-condition-drop.test.ts` | The full replay (see below), the second condition refused alone, no refusal while conditions are kept, nothing held without a record |
| `flow-bootstrap/subflow-candidate/tests/kept-condition-drop.test.ts` | The brief mirror |

The full replay in `candidate/tests/kept-condition-drop.test.ts` goes:

1. The exact revision is judged no on the partly refuted advice, and the label shows in the trial feedback.
2. The gate keeps conditions 1 and 2.
3. Dropping condition 1 is refused once, in Core's words, and the revision that stood still stands.
4. Sending the same drop again is accepted.

**Fixtures:**

- `candidate/tests/kept-condition-fixture.ts` is new.
- `refuted-no/tests/campsite-readings-fixture.ts` gains `GAP_AND_CHANGE_NO` and `GAP_NO`.
- All fixtures use the campsite site; no realistic scenario is used.

**Updated tests** (their pinned t632 wording changed):

- `candidate/tests/trial-gate-unsure.test.ts`
- `subflow-candidate/tests/subflow-trial-unsure.test.ts`
- one assertion in `subflow-candidate/tests/subflow-trial-gate.test.ts`

## Commands run and observed results

All commands ran from `packages/fluxiq` unless noted.

- `npx tsc --noEmit -p tsconfig.json` -> no output, exit 0. Final run after all edits.
- `npx vitest run .../runtime/result-verification .../runtime/service/candidate-trial .../runtime/service/subflow-trial .../runtime/flow-bootstrap`
  -> `Test Files 281 passed | 1 skipped (282)`, `Tests 3155 passed | 2 skipped (3157)`.
  - The skipped file is `flow-bootstrap/verification/tests/process-restart.test.ts`, which was already skipped.
- `node scripts/structure-audit.mjs`, from the repository root:
  - The first run printed `FAIL [directory-files] .../result-verification/tests/: 26 source files exceeds the 25-file
    limit`. I moved my test to `refuted-no/tests/partly-refuted-route.test.ts`.
  - The rerun printed `structure-audit: passed (378 warning(s), 1156 baselined)`, exit 0.
- Before updating them, the three earlier unsure tests failed on the old "Testing this same revision again ... is
  allowed" and "one judge call said yes" wording, as expected. They pass after the update.

## Not verified

- No live run or Lab run, as the brief said.
- Whole-package `pnpm test` was not run.
- The project path (`project-agents/**`) was not run.
- Node ids in a live summary end in `.<subflowKey>.<stepKey>`. I took this from `flow-bootstrap/adaptation.ts:219` and
  the run's `node.bootstrap.080904b6e3222263.main.s10`; the tests build ids in that shape.
  - Steps whose ids are reused through `nodeIdByKey` are not matched, so nothing is remembered for them. This is safe.
- I did not confirm that a live candidate plan holds a read's `where` as a JSON object rather than a string. The tests
  show the script reader parses `readList: {...}` into an object.
  - If a domain kept it as a string, nothing would resolve at the gate, so nothing is held. No false refusal results.
- The subflow gate's kept conditions are not seeded across briefs. The debug's cross-brief memory (t634) runs through
  `project-agents`, which this brief excludes.

## Open questions or contradictions found

1. **Model-facing `next` text** (`candidate/submission-refusal.ts`, not owned). The refusal's `next` is built
   generically: "Correct every listed issue ... a third decision in a row ends this build". Core's own words travel in
   `diagnostics.instruction` and in the one issue's `message`. A branch like the `unchanged` one, which uses
   `feedback.instruction` as `next`, would say it directly.
2. **Old re-test wording** (`candidate/unchanged-submission.ts`, not owned). `retestWords` still says "one judge call
   said yes" when it names a re-testable standing revision. RC3 should reach it too.
3. **`row-reference-claim.ts` claims** (debug RC2, second bullet). Refuting "kept" claims for rows that conditions left
   out jointly was not in this brief's list and is not done. Trial 3's holder claim is still unrefuted. Its advice is
   now held only by the kept-condition refusal, when it drops a vindicated condition.
4. **Composed Flows.** `submitComposed`, the project supervisor's assembled Flow, is deliberately not held, because no
   model wrote it. This should be confirmed if the project path is wanted under the same rule.
5. **Prompts.** No prompt changed and no judge pin moved. `llm/**` was not touched.
6. **Advisory line counts.** `subflow-trial-gate.ts` grew from 381 to 418 lines, past the 400-line advisory threshold.
   `trial-gate.ts` is at 644 and `agreement.ts` at 769, both under the 800-line limit.

## Round 2

This round covers two follow-ups from the coordinator. I now also own `candidate/submission-refusal.ts` and
`candidate/unchanged-submission.ts`.

### Outcome

Done.

### What changed and why

#### Follow-up 1: the kept-condition refusal has its own next-step text

File: `candidate/submission-refusal.ts`.

- `automationStudioCandidateSubmissionRefusal` now has a branch for `candidate.kept_condition_dropped`, chosen by code,
  beside the existing `unchanged` branch. It builds `next` with `keptConditionNext`.
- `next` gives Core's words on each condition: as written, by which revision, and the rows it kept out, with how Core
  accounts for each.
- It then adds two sentences:
  - "Nothing was made a new revision: revision N, which stood before this submission, still stands."
  - "This refusal is a hint from Core's record, not a block: if you are sure the change is right, send the same change
    again and it is accepted."
- `next` no longer carries the general advice ("Correct every listed issue ...") or the warning that a third refusal
  ends the build.
- The standing revision comes from a new `standingRevision: { revision, digest }` that `submission.ts` now puts on the
  refusal feedback.
- The subflow builder sends its refusals through this same function (`subflow-candidate/builder-loop.ts:306`), so briefs
  get the same text. No separate path was needed.

#### Follow-up 2: the re-test offer rests on Core's findings

File: `candidate/unchanged-submission.ts`.

- `retestable` now decides whether the re-test is advised. It is advised only for an unsure last trial where one of
  these holds:
  - `feedback.contradictedByBuild` is set;
  - `automationStudioCandidateRetestAdvised` holds (the no's reading wholly contradicted, or the doubt contradicted).
- `retestWords` says one of two things:
  - "It is the better move here (retestAdvised is true): Core's record contradicts what kept that trial from a yes ...";
  - "Nothing in Core's record contradicts what kept that trial from a yes (retestAdvised is false), so test it again only
    where its feedback ... shows no defect".
- `standingRevision.retestAdvised` carries the same fact as a field.
- The "one judge call said yes" wording is gone from all code. It remains only in header comments that tell the history.

#### Tests

- `candidate/tests/kept-condition-drop.test.ts`: `evidence.next` holds Core's condition words, the standing revision
  and the override-once hint. It does not contain "Correct every listed issue" or "a third decision in a row ends this
  build", and it names no realistic scenario.
- `subflow-candidate/tests/kept-condition-drop.test.ts`: the builder's `next` is the same.
- `subflow-candidate/tests/unchanged-after-no-words.test.ts`:
  - The old "one judge call said yes" assertion is now a check that the wording is absent, plus a check for
    `retestAdvised: false`.
  - A new case: a split advises nothing. A reading wholly contradicted, a contradicted doubt and `contradictedByBuild`
    each advise a re-test. A reading contradicted only in part advises nothing.

### Commands run and observed results

- `npx tsc --noEmit -p tsconfig.json`, from `packages/fluxiq` -> exit 0, no output.
- vitest on `runtime/result-verification`, `runtime/service/candidate-trial`, `runtime/service/subflow-trial` and
  `runtime/flow-bootstrap` -> `Test Files 281 passed | 1 skipped (282)`, `Tests 3156 passed | 2 skipped (3158)`. The
  skipped file is still `process-restart.test.ts`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (378 warning(s), 1156 baselined)`, exit 0.
- `grep -rn "one judge call said yes"` across non-test source -> header comments only.

### Not verified

- No live run.
- The model-facing `next` was checked through `automationStudioCandidateSubmissionRefusal` directly. It was not run
  through a full authoring-loop or builder-loop LLM turn.

### Open questions

- A scripted shell edit wrote two backspace characters in place of `\b` in two test regexes. I found them and fixed
  them before the final run. No other file I touched contains one.

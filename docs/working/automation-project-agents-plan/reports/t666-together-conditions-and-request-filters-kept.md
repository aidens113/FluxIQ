# t666: together conditions and request filters kept

Worker report. Core worktree `fxwork/t666/!FluxIQ`, branch `task/t666-together-conditions-and-request-filters-kept`. Nothing was committed.

## Outcome

**Partial.** Everything inside the brief's owned paths is built, tested and passing. Three pieces cannot take effect without a file the brief does not give me.

- **E, the together sets.** The gate sees only Core's standing-no record. That record is built in `result-verification/standing-no-record/record.ts`, which I do not own. Until that file puts `together` on the record, the new memory keeps nothing in a live run.
- **F, the re-ask of a no.** The narrowing doubt is read only inside `agreement.ts`, which I must not touch, and only for unsure verdicts. The agreement's one caller is `result-verification/verify.ts`, which I do not own either. The re-ask is built as its own function, but nothing calls it yet.
- **F, the step hint.** It is wired into `submission.ts` under a new code, `candidate.kept_step_dropped`. The trouble is in `flow-bootstrap/candidate/submission-refusal.ts`, which picks the model's next-step words by code. Without a one-line change there, the model is shown the general advice: "Correct every listed issue ... a third decision in a row ends this build". That advice is wrong for a hint.

A patch for all three files is at the end of this report. It passes `git apply --check` on this worktree, but I have not applied, compiled or tested it.

**E has a limit even with the patch.** Rows that conditions left out together carry only their labels, so Core never read a value on them. The only way Core can account for such a row is "another copy of it is in the result". The other way, "a value fails the request's words", is not available:

- t651 says a label test (`name contains ...`) is never the request's own words.
- So the debug's own case is **not** kept: the holder was left out together by conditions 3 and 4, and both are name tests.
- Core did not measure that the holder is not paper towels. I did not loosen t651 to make this case fire.

## What changed and why

**E: a set of conditions is kept as one.** All of this is in `result-verification/standing-no/`.

- `types.ts`:
  - The record gains `together?: AutomationStudioResultStandingNoTogether[]`, each `{ nodeId, numbers, rows, keptOut? }`.
  - A kept condition gains `members?: [{ name, written }]`.
  - For a set, `written` is the members' written forms as one sorted JSON list. The existing refusal can then print it with `JSON.parse`, unchanged.
- `record-shape.ts` reads `together` back. A malformed set makes the whole record none, as a malformed condition does.
- `kept-conditions.ts`:
  - A set whose members can all be found as the plan wrote them is kept as one entry, if the record accounts for every row (`keptOut`).
  - A later record that shows the same written set leaving out a row Core does not account for removes the entry.
- `kept-condition-drop.ts`:
  - A set counts as dropped only when the plan writes **none** of its members as written. A row that failed exactly those conditions stays out as long as any one of them remains.
  - The drop is refused once, through the existing t641 refusal and t650's invited resend. The refusal is never permanent.
  - Core's words say the conditions left the rows out together, so keeping any one of them keeps the rows out.

**F, part 1: re-asking a no that blames a step which chose the request's own words.**

- `unsure-doubts/narrowing.ts` adds `automationStudioResultNarrowingNoBlamed`. A no counts when all of these hold:
  - A sentence of its `observed` or `advice` names a step that chose an option of a named group, and says something against it. That means a blame word (narrow, drop, remove, exclude, restrict, replace, keep only or keep less, and similar) or t655's "not named" words.
  - At least one step it blames chose an option whose words pass the request-text test.
  - Every other step it blames either did the same, or removed no row by the page's own count. That is t659's measure: `addedChoice`, with the same count before and after.

  This covers 0064, which blamed s8 "ValueRidge", s9 "Today" and s10 "4 & up" (16 results before, 16 after). The function returns Core's words on each step it blames. It refutes nothing.

- `unsure-doubts/narrowing-no-reask.ts` (new) adds `automationStudioResultReaskNarrowingNo({ settled, first, second, reads, requestText, says, ask, agree })`.
  - **When it asks:** only where every no that stands between the verdict and two yeses blames such steps. In practice that is a split's no beside a yes, or both nos of a double no.
  - **When it does not ask:**
    - A double no whose other no names anything else is left as it is. Re-asking one no could not make two yeses, which matches how t501 treats a refuted no beside a standing one.
    - An unsure beside a no.
    - An outcome that already asked a call again (more than 2 verdicts).
    - An outcome already agreed yes.
  - **The answer:** it takes the call's place through `agree`, so a yes still needs two yeses. A re-ask that does not come back usable keeps the original answer.
  - **The recheck words:** they state the record and say Core did not see the rows the step removed. They ask the judge to answer no over such a step only by quoting the evidence, or the request's words, that the chosen option fails.
- `unsure-doubts/index.ts` exports the new module.

**F, part 2: the one-time step hint.**

- `standing-no/kept-steps.ts` (new) adds `automationStudioResultKeptStepsDropped({ trial, revision, ran, plan, requestText, refused, subject })`. It works in four steps:
  1. It reads the steps that acted before each read from the kept trial's feedback (`feedback.reads[].narrowedBefore`, which gives `group` and `chose`). The submission controller already holds this feedback through `trialOf`, so the gates need no change.
  2. It keeps the steps whose chosen option passes the request-text test.
  3. It finds each kept step as the revision that ran wrote it.
  4. It names a step when the new plan has no step with the same parameters, and no condition under any `where` list tests those words.

  The words give the step as written, the option, and the request's words. They also say Core did not see the removed rows, so this is no finding that the step was right. `says` is built locally from the `request-rows` words, with the same run test as `request-wording.ts`, because the full wording needs a summary.
- `standing-no/written-conditions.ts` adds `automationStudioResultWrittenStep` and `automationStudioResultWrittenSteps`. A step is found by its node id the same way a condition is, and written as its canonical parameters.
- `standing-no/index.ts`: new exports, and the header updated.
- `flow-bootstrap/candidate/submission.ts`:
  - Adds the code `AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE = "candidate.kept_step_dropped"` and the method `keptStepsDropped`.
  - The check runs after the kept-condition check, on model submissions only.
  - The hint is given once per revision and step as written. The same submission sent again is accepted.
  - The refusal carries `resend: "accepted_once"`, `standingRevision`, `keptSteps`, and one issue whose path names the steps.
  - The file grew from 399 to 478 lines, past the 400-line advisory.
- **The subflow mirror needs no edit.** `scoped-submission.ts` submits through the same inner controller, with the scope's own text. `candidateTrial` copies the feedback, and the subflow trial builds that feedback with the same `candidate-trial/feedback.ts`.

**Tests.** All fixtures are a library catalogue.

- `standing-no/tests/kept-together.test.ts`:
  - A pair is refused once when both members are dropped, and also when both are loosened.
  - It is not refused when only one is dropped, and it is accepted when sent again.
  - A later record that does not account for a row takes it back.
  - Shape and wording guards.
- `standing-no/tests/kept-steps.test.ts`:
  - The hint is given when a request-worded step is dropped.
  - No hint when the step is kept (keys reordered, or moved to another subflow), when a condition tests the words, when the option is not the request's words, when it was already given, or when the feedback is malformed.
  - Wording guard.
- `unsure-doubts/tests/narrowing-no.test.ts`:
  - Core's words, including for the step that removed no row.
  - No re-ask for a step whose option is not the request's words and which removed rows, or for a step named without blame.
  - A split's no is re-asked once, and a yes then gives two yeses. A second no stays unsure and is never asked twice.
  - A double no re-asks both calls, or neither when one of them names a row.
  - No re-ask beside an unsure.
  - Wording guard.
- `flow-bootstrap/candidate/tests/kept-step-drop.test.ts` runs through the real controller:
  - The hint is given once, with its code, words, fields and standing revision, and the resend is accepted.
  - No hint for an option that is not the request's words, or when a condition tests the words.

## Commands run and observed results

- `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq`: exit 0. I ran it twice; the second run included all the new tests.
- `npx vitest run` over `result-verification`, `flow-bootstrap/candidate`, `flow-bootstrap/subflow-candidate`, `service/candidate-trial` and `service/subflow-trial`, with nothing else running beside it:
  - **180 files passed, 1410 tests passed**, exit 0.
  - Earlier, while developing, one of my new tests (`kept-together`) failed. The fault was its fixture, which numbered conditions inconsistently; I fixed the test, not the code.
- `node scripts/structure-audit.mjs`: `passed (389 warning(s), 1156 baselined)`.
  - The first run had one FAIL: a deep import of `../refuted-no/request-text-test.ts`. I switched it to the barrel. The audit then showed no cycle, because `flow-bootstrap/index.ts` does not re-export `candidate/`.
  - The one new warning is `submission.ts` at 478 lines, past the 400-line advisory.
- `git apply --check -v` of the patch below: all three files check clean. **Not applied.**

## Not verified

- The patch below: not compiled, not tested, not applied.
- That E fires in a live run. It needs the record patch, and even then it fires only for together rows that are also in the result.
- That the no re-ask fires in a live run. It needs the `verify.ts` patch.
- The step hint's next-step words. They need the `submission-refusal.ts` patch; until then the model is shown the general wording.
- There is no subflow-level test of the step hint; it relies on the inner controller. On a subflow the target is re-keyed, so the step is found in the probe plan by its step key alone. That works only where step keys are unique across the probe's parts. Otherwise the hint silently does not fire.
- No live run, and no replay on the towels run's real requests.

## Open questions or contradictions found

1. **The brief's ownership leaves out three files that E and F need:** `standing-no-record/record.ts`, `verify.ts` and `submission-refusal.ts`. The patch below covers all three.
2. **The debug's own case for E is a label test, and t651 forbids treating that as the request's words.** With only measured accounting, Core can keep the holder pair only when the holder is also in the result. Keeping it in the real case would need a new measure, which I did not invent. This is a supervisor decision.
3. **0062 (the holder trial) still would not be re-asked.** It was a double no:
   - 0063 was wholly refuted, but only because of the clipping (cause A).
   - 0064 was the narrowing no.

   My rule asks only where every no blames such steps. Re-asking 0064 beside 0063, which is refuted but not re-asked, would conflict with t501. Worth revisiting once t665 fixes cause A.
4. **t655's existing test "is never a reason to ask a no again"** still passes, because it covers `reaskContradicted`, which is unchanged. t666 deliberately adds a separate path that does re-ask such a no. Once the `verify.ts` wiring lands, you may want to update that test's comment.

## Proposed patch for the files outside the brief's ownership (checked with `git apply --check`, not applied)

The same patch is in this session's scratchpad as `t666-unowned.patch`. It was made by `t666-make-patch.py`, which reads the worktree and never writes to it.

```diff
--- a/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/standing-no-record/record.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/standing-no-record/record.ts
@@ -27,6 +27,13 @@
 // (`../refuted-no/record-conditions.ts`) -- those rows (`keptOut`): it left out
 // nothing the request asks for, whatever the judges said of it. The gate keeps
 // such conditions across the build's trials (`../standing-no/kept-conditions.ts`).
+//
+// **And the conditions that left rows out only together (t666).** Each read's
+// sets of conditions that left rows out only together, where its listing of
+// them is complete (`../refuted-no/record.ts`, `together`), with those rows,
+// and, where another copy of every one is in the result, those rows as kept
+// out (`keptOut`). Together rows carry no value Core read, so the request's
+// words never account for one here. The gate keeps such a set as one.
 
 import type { AutomationStudioRunResultSummary, AutomationStudioResultVerification } from "../contracts/index.ts";
 import {
@@ -38,9 +45,9 @@
   type AutomationStudioResultNoCondition,
   type AutomationStudioResultNoRecord
 } from "../refuted-no/index.ts";
-import { automationStudioRequestKindExclusionLabels, type AutomationStudioRequestWording } from "../request-rows/index.ts";
+import { automationStudioRequestKindExclusionLabels, automationStudioRequestRowLabel, type AutomationStudioRequestWording } from "../request-rows/index.ts";
 import { automationStudioResultNamedStoredLabels } from "./named-stored.ts";
-import type { AutomationStudioResultStandingNoCall, AutomationStudioResultStandingNoKeptOutRow, AutomationStudioResultStandingNoRecord } from "../standing-no/index.ts";
+import type { AutomationStudioResultStandingNoCall, AutomationStudioResultStandingNoKeptOutRow, AutomationStudioResultStandingNoRecord, AutomationStudioResultStandingNoTogether } from "../standing-no/index.ts";
 
 /** Core's aside on the value a condition read on a kept row (`../read-account/condition.ts`): it may differ between revisions. */
 const KEPT_ROW_ASIDE = /\s*\(read\s.*?\son\sa\srow\sit\skept\)/giu;
@@ -66,6 +73,7 @@
     standing.push({ call, ...(drops ? { drops } : {}) });
   }
   const stored = [...new Set(record.stored.map((row) => row.label))];
+  const together = togetherOf(summary, record, new Set(stored));
   return {
     stored,
     storedWhole: storedWhole(summary, record),
@@ -81,8 +89,26 @@
       };
     }),
     ...(upheld.size ? { upheldKind: [...upheld] } : {}),
-    standing
+    standing,
+    ...(together.length ? { together } : {})
   };
+}
+
+/**
+ * Each set of conditions that left rows out only together, of each read whose
+ * listing of them is complete (header, t666): its rows, and those rows as kept
+ * out where another copy of every one is in the result.
+ */
+function togetherOf(summary: AutomationStudioRunResultSummary, record: AutomationStudioResultNoRecord, stored: ReadonlySet<string>): AutomationStudioResultStandingNoTogether[] {
+  return (record.together ?? []).flatMap(({ nodeId, sets }) => {
+    const listed = (summary.reads ?? []).find((read) => read.nodeId === nodeId)?.leftOutTogether ?? [];
+    // `sets` is that listing's conditions, in its order (`../refuted-no/record.ts`).
+    return sets.map((numbers, index) => {
+      const rows = (listed[index]?.rows ?? []).map(automationStudioRequestRowLabel);
+      const kept = rows.length > 0 && rows.every((label) => stored.has(label));
+      return { nodeId, numbers: [...numbers], rows, ...(kept ? { keptOut: rows.map((label) => ({ label, by: "also_in_result" as const })) } : {}) };
+    });
+  });
 }
 
 /**
--- a/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts
@@ -111,6 +111,7 @@
 import { automationStudioResultCoreObservation } from "./core-observation.ts";
 import { automationStudioResultSummaryWithPagingWords, automationStudioResultSummaryWithUnreadColumns } from "./read-account/index.ts";
 import { automationStudioRequestWording, automationStudioResultSummaryWithAlsoInResult, automationStudioResultSummaryWithLeftOutNamingTheItem, automationStudioResultSummaryWithRowIds } from "./request-rows/index.ts";
+import { automationStudioResultReaskNarrowingNo } from "./unsure-doubts/index.ts";
 import { automationStudioResultVerdict } from "./verdict.ts";
 import { automationStudioResultAdviceKept, automationStudioResultExclusionEvidenceRecheck } from "./exclusion-evidence/index.ts";
 import { emitAutomationStudioActivity } from "../activity/index.ts";
@@ -221,9 +222,12 @@
   // A contradicted unsure beside a yes is asked once more, with Core's record named (header, t503); so is a split's no
   // whose advice adds an exclusion the request never states (t515), and each no whose every reason Core's record
   // refutes (t607). The agreement names the call to ask.
-  const outcome = await automationStudioResultVerificationReaskContradicted({
-    ...input, settled,
-    ask: (recheck, call) => askCheck({ ...request, summary: { ...request.summary, recheck } }, provider, call, interventions, true)
+  const ask = (recheck: string, call: 1 | 2) => askCheck({ ...request, summary: { ...request.summary, recheck } }, provider, call, interventions, true);
+  const reasked = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
+  // Where nothing was asked again, a no blaming only steps that chose the request's own words is asked once more (t666, `./unsure-doubts/narrowing-no-reask.ts`).
+  const outcome = await automationStudioResultReaskNarrowingNo({
+    settled: reasked, first, second, reads: request.summary.reads, requestText, says: wording?.says, ask,
+    agree: (one, two) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two })
   });
   return said({ outcome: { ...outcome, performed: true }, interventions });
 }
--- a/packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/submission-refusal.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/submission-refusal.ts
@@ -95,7 +95,7 @@
 
 import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
 import type { AutomationStudioFlowCandidateSubmission } from "./contracts.ts";
-import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE } from "./submission.ts";
+import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE } from "./submission.ts";
 
 /** The code a refused submission is counted under when its check names no closed code of its own. */
 export const AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE = "candidate.submission_refused";
@@ -195,7 +195,8 @@
   // says what failed last and the way out (t464, `./unchanged-submission.ts`).
   const next = feedback.unchanged === true && typeof feedback.instruction === "string"
     ? `${feedback.instruction} ${RESUBMIT}`
-    : feedback.code === AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE && typeof feedback.instruction === "string"
+    // A dropped step that chose the request's own words is the same kind of hint (t666, `./submission.ts`).
+    : (feedback.code === AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE || feedback.code === AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE) && typeof feedback.instruction === "string"
       ? keptConditionNext(feedback.instruction, feedback.standingRevision)
       : refusedSteps(feedback) + (advice ? advice + HANDLE_TAIL : GENERAL_NEXT);
   return {
```

## Round 2

### Outcome

**Done.** The patch above is applied, compiled and tested. E and F now take effect through the real paths. As decided, t651 stands: a pair of name tests is never kept, and only what Core measured is kept.

### What changed and why

- **`result-verification/standing-no-record/record.ts`** (patch as above). The record now carries `together`: each complete read's sets of conditions that left rows out only together, with their rows. Where another copy of every row is in the result, those rows are marked `keptOut`. Together rows carry no value Core read, so the request's words never account for one.
- **`result-verification/verify.ts`** (patch as above). After the agreement's own re-asks, it calls `automationStudioResultReaskNarrowingNo` with the same `ask`, and passes `agree` as the real agreement.
- **The step hint moved into a focused module**, `flow-bootstrap/candidate/kept-step-hint.ts` (new). It holds:
  - `AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE`;
  - `AutomationStudioCandidateKeptStepHint`, which keeps the once-only memory, finds the latest accepted revision's trial, and builds the refusal.

  In `submission.ts`, a one-line field and a five-line call replace the round 1 method and builder. It is now 412 lines, down from 478; it was 399 before t666. Exported from `candidate/index.ts`.
- **`flow-bootstrap/candidate/submission-refusal.ts`**. The step hint now has its own branch beside t641's. Both use `hintNext` (renamed from `keptConditionNext`): Core's words, then "Nothing was made a new revision: revision N, which stood before this submission, still stands", then "This refusal is a hint from Core's record, not a block: if you are sure <...>, send the same change again and it is accepted."
  - The step's `<...>` is "the Flow does not need that step, or reads those words another way".
  - The kept-condition wording is unchanged: "the change is right".
  - Neither branch says "Correct every listed issue" or gives the third-decision warning.
  - The header gains a t666 paragraph.

New tests, all scripted with no model:

- **E through the judge, the trial gate and the controller**: `flow-bootstrap/candidate/tests/kept-condition/tests/kept-together-drop.test.ts`. It uses the campsite run, with name conditions 4 and 5 leaving out one row only together, and that row also in the result.
  - The gate keeps the set as one entry, built by the real record builder.
  - Dropping both is refused once, with the together words, and the same drop sent again is accepted.
  - Dropping one is never refused.
  - When the together row is not in the result, nothing is kept: the t651 decision.
- **F through the judge and `verify.ts`**: `result-verification/tests/reask-route/tests/narrowing-no-route.test.ts`. It uses the campsite run with a region step before the read, and a request that names "Lakeshore".
  - A no blaming that step, beside a yes, is asked once with Core's record, and two yeses confirm (3 calls).
  - When the re-asked call says no again, the verdict is unknown after 3 calls; it is never asked twice.
  - When the step chose "Riverside", which the request does not say, it is not re-asked (2 calls, unknown).
- **The subflow mirror of the step hint**: `flow-bootstrap/subflow-candidate/tests/kept-step-drop.test.ts`, through the scoped controller.
  - The proposal re-keys its target under the scope key, so the step is found in the probe by its own key.
  - The hint is given once and names the subflow. Its next step is told as a hint, and the same proposal sent again is accepted.
- **The candidate step-hint test** now also checks the next-step words. It moved to `flow-bootstrap/candidate/tests/kept-step/tests/`, with its fixture `kept-step-fixture.ts`, which the subflow test shares.
- **Two directory limits**: my new files had pushed `candidate/tests/` and `result-verification/tests/` to 26 files, over the 25-file limit. The new tests now sit in the feature folders `kept-step/tests/` and `reask-route/tests/`, following the existing `kept-condition/tests/` and `judge-reply/tests/` pattern.

### Commands run and observed results

- `git apply -v t666-unowned.patch`: all three files applied cleanly.
- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq):
  - First run: exit 2. Two errors in my new E test: `standingNo` exists only on the no variant of the verdict. I fixed the test.
  - Re-run after the fix and again after the moves: exit 0.
- `npx vitest run` over `result-verification`, `flow-bootstrap/candidate`, `flow-bootstrap/subflow-candidate`, `service/candidate-trial` and `service/subflow-trial`: **183 files passed, 1417 tests passed**, exit 0. This was a final run on the final tree, with nothing else running.
  - The run before the moves gave the same result.
  - During development, two F test expectations said `unsure` where the build-test judge says `unknown`. The test was fixed; the code was not changed.
- `node scripts/structure-audit.mjs`:
  - First run: 2 FAIL, `directory-files` (26 > 25) in `candidate/tests/` and `result-verification/tests/`. Fixed by the moves above.
  - Final run: `passed (389 warning(s), 1156 baselined)`. The `submission.ts` advisory remains at 412 lines; it was at 478 lines in round 1.

### Not verified

- No live run.
- The F re-ask is not exercised with t665's unclipped readings (cause A), which are in flight separately.
- `submission.ts` still sits 12 lines past the 400-line advisory. It is a warning only. Getting under 400 would mean cutting existing content.

### Open questions

- Unchanged from round 1, items 3 and 4:
  - 0062's double no, where one no is refuted and one blames a step, is still not re-asked, consistent with t501.
  - t655's test comment "is never a reason to ask a no again" now describes only the agreement's own re-ask path. It still passes. Consider rewording it.

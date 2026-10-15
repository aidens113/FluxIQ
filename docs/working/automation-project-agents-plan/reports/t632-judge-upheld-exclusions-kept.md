# t632 judge-upheld-exclusions-kept: worker report

Brief: t632. Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t632/!FluxIQ`, branch `task/t632-judge-upheld-exclusions-kept`. Source: the A8 wave 8 debug of towels run `run-mv9gbsm5-2957581c`, root causes 2 and 3 and fixes 2 and 3. Nothing was committed.

## Outcome

**Partial.**

- **Part 2 is done.** The `candidate.unchanged_after_no` refusal now names the tools of the loop it is sent in.
- **Part 3 is done.** After an unsure trial, the builder is told that re-testing the same revision is allowed and when that is the better move.
- **Part 1 is blocked.** This is the gate memory of upheld kind exclusions, plus weighing a later no that would re-admit those rows. The data it needs never reaches the gates, and no record anywhere holds it in the form the rule needs. Details are under "Open questions". No speculative code was written for it.

## What changed and why

### Part 2: the refusal names the loop's tools

**`flow-bootstrap/candidate/unchanged-submission.ts`**
- The hard-coded `SUBMIT` and `TEST` constants are replaced by a `tools` input: `{ submit, test, subject }`.
- When `tools` is not given, the refusal falls back to the candidate loop's tools (`core.submit_candidate`, `core.test_candidate`, "Flow"), so the candidate loop reads as before.
- New optional `current` input. It carries the revision still standing beside a refuted Flow, together with its last trial.
- When a Flow was refuted and the standing revision's last trial was unsure, not_judged or execution_failed, the refusal now also:
  - adds `standingRevision: { revision, digest, verdict }`;
  - says that testing that revision again with the loop's test tool is allowed until its retests run out;
  - says when that is the better move: one judge call said yes, Core's record contradicts the other call, or the change that reading asks for would take back what answered an earlier no.
- This is the debug's optional item under fix 4.
- The header records t632.

**`flow-bootstrap/candidate/submission.ts`**
- The controller input has a new optional `refusalTools` field, which is passed through to the refusal.
- The controller works out `current`: the standing revision, when it differs from the refuted one, with `history.trialOf(standing)`. It passes this in.

**`flow-bootstrap/subflow-candidate/scoped-submission.ts`**
- The inner candidate controller is now built with `refusalTools: { submit: core.submit_subflow, test: core.test_subflow, subject: "subflow" }`.

**`flow-bootstrap/subflow-candidate/submit-tool.ts`** (new)
- `AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID` moved here from `builder-loop.ts`, so that `scoped-submission.ts` can use it without an import cycle. `builder-loop.ts` imported `scoped-submission.ts`.
- `builder-loop.ts` now imports the constant, and `index.ts` exports the new file.
- Every consumer already imported it through `index.ts`, so no import path changed.

### Part 3: what an unsure trial tells the builder

**`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`**
- While retests are left, an unsure verdict now says (`UNSURE_RETESTABLE`):
  - testing the same revision again, with the same revision and digest, is allowed, and `retestsLeft` says how many times;
  - that is the better move when the feedback names no defect that the trial's own reads, steps and stored rows show: one judge call said yes (`answeredReading`), Core's record contradicts the other call's reading or doubt, or the change that reading asks for would take back what answered an earlier no;
  - otherwise, change the subflow, submit it with `core.submit_subflow`, and test the new revision.
- With no retests left, it says the revision has none left and to change the subflow for a defect the trial shows.
- `instructionFor` now takes a `retestable` flag:
  - after a trial, `retestsLeft > 0`;
  - on completion, the count of trials so far is below the maximum.
- The header records t632.

**`flow-bootstrap/candidate/trial-gate.ts`**
- The same change for whole candidates. `standingInstruction` returns `UNSURE_RETESTABLE` for an unsure verdict while it is retestable. The plain `unsure` text is now the no-retests-left wording. The header records t632.

**The `readings` text was checked first.** `service/candidate-trial/feedback.ts`'s `SPLIT_NOTE` already says "where it supports the yes, test this same revision again". The new words agree with it and add the two other cases.

**Every model-facing word is generic.** No site, task, product or answer appears in them, and tests guard this.

### Tests

- **New `subflow-candidate/tests/unchanged-after-no-words.test.ts`** (the definition of done for part 2). It uses a real scoped controller:
  1. Revision 1 is judged no. Revision 2 stands with an unsure trial. Resubmitting revision 1 is refused `candidate.unchanged_after_no`.
  2. The instruction names `core.submit_subflow` and `core.test_subflow`, and never `core.submit_candidate` or `core.test_candidate`.
  3. It names revision 2 as still standing and safe to test again, and carries `standingRevision`.
  4. When the standing revision passed instead, no re-test is named.
  5. With no `tools` given, the candidate loop's tool is still named.
- **New `subflow-candidate/tests/subflow-trial-unsure.test.ts`**
  - The first two unsure trials say the re-test is allowed and when, and carry `retry_allowed`.
  - The third says no retests are left and carries no `retry_allowed`.
  - The completion refusal says the same as the trial.
  - A guard checks the words name no scenario.
- **New `candidate/tests/trial-gate-unsure.test.ts`**: the same checks for the whole-candidate gate.
- **Updated `subflow-candidate/tests/subflow-trial-gate.test.ts:186`**
  - It matched the old unsure sentence exactly. It now asserts that an unsure carrying `yesUnconfirmed` gets the new unsure wording and is never said as a yes Core held.
  - The intent of this t611 guard is unchanged.

## Commands run and observed results

All commands ran in the worktree. No other heavy job was running beside them.

- `npx vitest run <runtime>/flow-bootstrap/subflow-candidate <runtime>/flow-bootstrap/candidate <runtime>/service/subflow-trial <runtime>/service/candidate-trial`, run from `packages/fluxiq`:
  - **Before updating the tests:** 1 failed and 381 passed. The failure was the expected one: the exact old unsure sentence at `subflow-trial-gate.test.ts:186`.
  - **Final run:** `Test Files 51 passed (51)`, `Tests 388 passed (388)`.
- `npx tsc --noEmit -p .`, run from `packages/fluxiq`: exit 0, no output.
- `node scripts/structure-audit.mjs`, run from the Core root: `structure-audit: passed (370 warning(s), 1156 baselined)`, exit 0.
  - These advisory warnings are on touched paths, and each was already past its threshold before this change:
    - `candidate/trial-gate.ts` is at 540 lines.
    - `subflow-candidate/scoped-submission.ts` is at 420 lines; it was 414.
    - `candidate/tests/` holds 20 files.
- No live or Lab run was made, as the brief instructed.

## Not verified

- Part 1 is not implemented, so the definition-of-done stub test of the swing does not exist. The second check in that definition does: a refusal in a brief names `core.submit_subflow`.
- Tests outside the four named directories were not run. That includes `project-agents/dispatch/tests/*`, which drive the builder loop. A grep of `packages/fluxiq/src` found no other test asserting the old unsure or refusal sentences.
- No live behaviour was checked: whether a model now re-tests after an unsure instead of following the no.

## Open questions or contradictions found

### Part 1 cannot be built inside the owned paths with what result-verification exports

**1. The gates never see row labels.**
- The subflow and whole-candidate gates receive only `verdict` and the model-facing `feedback` from the trial port.
- `service/candidate-trial/feedback.ts` builds that feedback. By design it carries no stored-row labels, and no labels of rows a condition left out. `reads.ts` says "never the rows a condition left out, which are page values".
- On a no, it carries `judge.{expected, observed, advice}`, `findings`, `fix` and `checked`. It does not carry the verdict's structured `checkedRows`.
- So the gate has no structured way to know which stored rows a standing no called not the asked kind. The only alternative is re-parsing the judge's sentences. That is the pattern-list approach that root cause 1 of the debug rejects, and the gate has no `AutomationStudioResultNoRecord` to run t628's exports against in any case.

**2. Result-verification does not export the decision.**
- Nothing it exports says "this standing no called stored rows X not the asked kind".
- t628's kind path lives inside `agreement.ts`: `unstatedExclusion` / `namedStoredLabels` together with `saysWhatANamedRowIs` in `request-rows/unstated-exclusions.ts`. It returns only exclusions it *marks*, not the labels of a kind exclusion it let stand.
- Exposing those labels needs a new export or a new verdict field there. That is t631's directory, so per the brief I stopped.

**3. No existing record holds the rows that "would be re-admitted".**
- This is the larger gap, and it applies even inside result-verification.
- In this run the holder was left out by several conditions at once ("Paper Towels" and "not Holder"). Every condition's `leftOutOnlyByThis` was empty; the debug notes `rejectedByItself: 0` for conditions 4–6.
- `AutomationStudioResultReadAccount.conditions` names only rows that one condition removed *by itself*. A row removed by two named conditions together appears in no field.
- So "the rows the named conditions leave out", which the remedy would re-admit, cannot be computed from any one trial's record.
- What does exist is a cross-revision fact:
  - the earlier revision **stored** the excluded row, and that revision's standing no named it;
  - the later revision does not store it;
  - the later no asks to drop conditions that the later revision added.
- Using that fact needs, per trial, the stored labels plus the labels the standing no named (Core-held, never model-facing). Those must be carried on the trial result: a service/port change in `service/candidate-trial` and `service/subflow-trial`, fed by result-verification.

**What would unblock it.** Ownership is the supervisor's call; this is the suggested shape.

1. In result-verification (t631, or after t631): put on the build-test verdict, for a `no` that stood, the labels of the stored rows its reading named under a kind exclusion that was not marked (t628's path), together with the stored labels.
2. In `service/candidate-trial/run.ts` and `service/subflow-trial/run.ts`: pass these through on the trial result as a Core-only field outside `feedback`, so the model never sees page values from it.
3. In the gates, which this brief owns:
   - keep the upheld labels per subflow;
   - on a later no whose trial stores none of them, while the earlier revision stored them, and whose advice names conditions this revision has and that earlier revision lacked, weigh that no as contradicted by the build's own record and tell the builder so.
   - This cannot turn a no into a yes. At most it gives an unsure, which leaves what a yes must prove unchanged.
4. The alternative is to do the cross-trial weighing inside result-verification, with the gate passing the upheld labels into the trial request. That also needs the port and service to forward them.

### Smaller notes

- **Unsure wording in the debug.** The debug's own cause, the builder following the no-reading at 0054, is now addressed only by words. The gate does not stop a submission that rebuilds a refuted Flow beyond what it already did. The unchanged refusal now points at the standing unsure revision.
- **Judge supplementary rule.** The debug's open question, the judge supplementary rule against "extra narrowing", is outside this brief and was not touched.

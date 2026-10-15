# t636: settle empty and absent rows; a quote-lacking yes is held, not a no

Worker report. Core worktree `fxwork/t636/!FluxIQ`, branch `task/t636-settle-empty-and-absent-rows`. Nothing was committed, and no live or Lab run was made.

## Outcome

Done. Both fixes are in, with tests. The judge replay of the 0208/0214 shape fails on HEAD and passes with the fix. The 0131-shape replay (a quote-lacking yes with `patchNeeded`) also fails on HEAD and passes with the fix.

## What changed and why

### 1. Settled rows (`value-readings/settled-rows.ts`)

Two kinds of left-out row are now settled. Core settles each one only where its own condition semantics fail on no value, which is `!automationStudioRecordConditionHolds(condition, undefined)`.

- **(a) A numeric bound's empty row.** These rows are now settled:
  - rows whose witness is `absent`;
  - rows whose witness is `present` with a blank value (Diego's shape);
  - rows with no witness, where the row says `label — column: (no value)`.

  A negated bound holds on no value, so it never settles such a row. A witness that is `unavailable` or `withheld` settles nothing. So does a non-empty value that states no number.
- **(b) A text test's absent rows.** A text test that is not negated now settles rows whose witness is `absent`. This covers `contains`, `startsWith`, `endsWith`, `matches`, and a text `equals`. A negated test's absent rows stay unsettled, and so do `unavailable`, `withheld` and missing witnesses.
- **The settled sentences.** Each kind gets its own sentence saying the read found no value. A condition that mixes both kinds of row gets a combined sentence. The existing sentence for numbers only, and the one for present text only, are byte-identical to before. The one-quote-per-condition requirement (`boundUnquoted`) is unchanged.

### 2. A quote-lacking yes (`verdict.ts`, `verify.ts`, `agreement.ts`, `contracts/verification.ts`, and new `exclusion-evidence/advice-kept.ts`)

- **`verdict.ts`.** A yes that lacks its quote and carries `patchNeeded: true` is now held on the existing path, not turned into a no. It is `unsure`, `model_unconfirmed`, `core.result.exclusion_evidence_missing`, with `exclusionEvidenceMissing`, so it gets the exclusion-evidence recheck. It also keeps its screened `answeredReading`.
- **A new field, `changeAdvised: true`.** It is set in place of `yesUnconfirmed`, because the t611 contract and `answeredYes` in `agreement.ts` say `yesUnconfirmed` only of a plain yes. That keeps the subflow gate's "do not rewrite it" instruction away from a yes that advised a change.
- **`verify.ts`, `askCheck`.** When an ask of a call was a held yes that advised a change, the call keeps that advice (`automationStudioResultAdviceKept`):
  - a recheck's taken plain yes is coded `answersWithChangeAdvised`, so a runtime check's single yes is still not confirmed;
  - a recheck held again carries `changeAdvised` and drops `yesUnconfirmed`.
- **`agreement.ts`.** The exclusion-evidence outcome carries `changeAdvised` when either call had it. It also carries the first yes's `answeredReading`, whether that yes was taken or held.

### 3. The judge instruction (`llm/diagnosis-instructions.ts`)

The `leftOutSettled` sentence now covers the cases where no value was found. These are the only re-pinned lines.

- The clause "...as a number that fails that condition's own bound, **or found none there, and no bound holds on a row with no value**, or, for a condition..." was added.
- The clause "...its read found on the row a value that fails that condition as written, **or, where the condition is not negated, found none**, so none needs a quote beside it;" was added.
- In `llm/deepseek/tests/system-prompt-pins.json`, the same two substrings were replaced in the `loop_verification` and `loop_verification_build_test` pins. The rest of the pins is unchanged.

### 4. Tests

- **`value-readings/tests/settled-rows.test.ts`.** New cases for (a) and (b), and for the negated, unavailable, withheld and non-empty-non-number cases that stay unsettled. One guard case was edited: it listed `absent` among the witnesses that never settle a text test. `absent` now settles a non-negated test, so it was moved to the new positive tests. The unavailable, withheld, null and undefined guards are kept.
- **`value-readings/tests/tool-waitlist-fixture.ts` (new).** The 0208/0214 shape on a makerspace tool waitlist:
  - read A uses `sessions atLeast 3` and leaves out two failing numbers and one empty value;
  - read B runs after the approvals, with an item-text `contains ["Booking approved"]` whose left-out rows are all `absent`.
- **`value-readings/tests/empty-and-absent-judge.test.ts` (new).** For both a candidate trial and a subflow trial, a stub judge's two yeses confirm without per-row quotes for those rows, in 2 calls. A guard checks that a yes quoting the request for neither condition is still held.
- **`build-test/tests/judge-held-advice.test.ts` (new).** The 0131 shape, for both trials:
  - a quote-lacking `patchNeeded` yes is rechecked, and its recheck's yes plus the other yes give `yes` in 3 calls;
  - a recheck that lacks the quote again gives `not_judged`, with no `yesUnconfirmed`.
- **`tests/verdict.test.ts`.** A quote-lacking yes with `patchNeeded` is held, not a no, keeps its reading and carries `changeAdvised`. The same is checked beside a plain held yes in the agreement. `automationStudioResultAdviceKept` behaviour is also covered.
- **`tests/judge-sees-the-read.test.ts`.** The new settled sentences and instruction clauses were added to the realistic-scenario wording guard.

## Commands run and observed results

All commands were run from `packages/fluxiq` unless noted.

- `npx vitest run src/programs/automation-studio/runtime/result-verification src/programs/automation-studio/runtime/service/candidate-trial src/programs/automation-studio/runtime/service/subflow-trial src/programs/automation-studio/runtime/llm/deepseek src/programs/automation-studio/runtime/llm/tests/diagnosis-channel.test.ts` printed `Test Files 123 passed (123)` and `Tests 1126 passed (1126)`. It was run twice, the second time after the last code change; only whitespace in `verify.ts` changed after that.
- With `settled-rows.ts` temporarily restored to HEAD, `npx vitest run .../value-readings/tests/empty-and-absent-judge.test.ts` failed 3 of 5 tests (the settle assertion and both two-yes replays). The fixed file was restored afterwards.
- With `verdict.ts` temporarily restored to HEAD, `npx vitest run .../build-test/tests/judge-held-advice.test.ts` failed 4 of 4 tests. The fixed file was restored afterwards.
- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo`:
  - the first run printed TS7022 at `verify.ts(238,11)`, a circular inference on `asked`;
  - I fixed it with a `typeof reply` annotation, and the rerun printed nothing.
- `node scripts/structure-audit.mjs`, run from the repo root, printed `structure-audit: passed (373 warning(s), 1156 baselined)`. Before my changes it printed 372 warnings. The new warning is advisory only: a directory-file count, since `build-test/tests/` gained a file.
- `npx biome check <changed .ts>` ignored every path under its configuration.

## Not verified

- **No replay of the run's own recorded replies.** I did not replay the recorded 0132-0134 and 0209-0218 replies themselves. The replays use generic fixtures, as the brief asked. Whether DeepSeek's actual 0210-style wording names "condition 1" beside a quote of the request's own words, rather than the site's "Request accepted", is still a model-side matter.
- **The build-test feedback does not show the held yes's reading.** `answeredReading` and `changeAdvised` are kept on the verification and the agreement outcome. `build-test/judge.ts` does not forward either one on a `not_judged`, and neither does `service/candidate-trial/feedback.ts`, which is not my file. A builder therefore does not see the held yes's reading yet.
- **What the build does after an advised hold.** I did not check how `project-agents/**` or `flow-bootstrap/**` react to a `not_judged` that has no `yesUnconfirmed` after an advised hold. These paths are not mine to touch, and they behave as for any other not-judged result.
- No full suites were run, and there was no live run.

## Open questions or contradictions found

- **Policy choice: `changeAdvised` instead of `yesUnconfirmed`.** For a held `patchNeeded` yes, I set `changeAdvised` and left `yesUnconfirmed` unset, following the t611 contract ("a plain yes") and `answeredYes`. As a result, the subflow gate's `NOT_JUDGED_AFTER_YES` text ("do not rewrite it") is not used for it. If the supervisor wants that text for an advised hold too, set `yesUnconfirmed` as well, in `verdict.ts` and `advice-kept.ts`.
- **A shared condition number lets one quote cover two reads.** Two reads whose conditions are both numbered "condition 1" let one sentence naming "condition 1" with a quote count for both reads' settled conditions. This is existing `boundUnquoted` behaviour; I did not change it. The guard test therefore removes the quotes for both conditions.

## Follow-up (coordinator, same session): show the builder an advised hold

### Outcome

Done. A held yes that advised a change now reaches the builder: a `not_judged` result tells it that a change was advised, shows that yes's reading, and gives the change the judge named. It comes through `build-test/judge.ts` and `service/candidate-trial/feedback.ts`, and the feedback is shared by candidate trials and subflow trials. `changeAdvised` still comes without `yesUnconfirmed`.

### What changed and why

- **`contracts/verification.ts`.** `answeredReading` gains an optional `advice` field. It is filled only on a yes held for its exclusion evidence that advised a change.
- **`verdict.ts`.** The held path for an advising yes keeps the change it named: its `changed`, or failing that its summary, screened the same way a no's advice is. The change goes into `answeredReading.advice`. A taken yes's reading is unchanged.
- **`exclusion-evidence/advice-kept.ts`.** The function now takes the earlier held verification as a second argument. A yes held again gets `changeAdvised` and the earlier ask's advice when its own reply named none. The caller in `verify.ts` passes the earlier held verification.
- **`agreement.ts`, exclusion-evidence outcome.**
  - `changeAdvised` is now set when either call is a held yes with `changeAdvised` or a taken `answersWithChangeAdvised` yes.
  - `answeredReading` comes first from the held yes that advised a change, with its advice, and otherwise from any yes.
- **`build-test/judge.ts`.** On a `not_judged` from an exclusion-evidence hold, the verdict carries `changeAdvised: true` and `answeredReading` (expected, observed, advice). The type and header table were updated to match.
- **`service/candidate-trial/feedback.ts`.** On that `not_judged`, the feedback adds:
  - `changeAdvised: { code: "candidate.trial_yes_change_advised", said }`, with the code first and then Core's short, generic words (weigh the advice against this trial's reads, steps and stored rows; make the change where that evidence supports it, otherwise test this same revision again);
  - `answeredReading`.

  Every other feedback is byte-identical. A new test pins the key list of a plain `yesUnconfirmed` not-judged. The gates in `flow-bootstrap` were not touched.
- **Tests.**
  - `service/candidate-trial/tests/change-advised.test.ts` (new) covers four cases: `Feedback.judged` directly; a plain not-judged that stays as it was; a candidate trial run through `runAutomationStudioCandidateTrial`; and a subflow trial run through `runAutomationStudioSubflowTrial`. Both runs inject the judge verdict.
  - `judge-held-advice.test.ts` now asserts `changeAdvised` and `answeredReading.advice` on the held case, for both trials.
  - `verdict.test.ts` covers `advice` on the held reading, on the agreement, and through `automationStudioResultAdviceKept`.

### Commands run and observed results

All run from `packages/fluxiq` unless noted.

- `npx vitest run` over result-verification, service/candidate-trial, service/subflow-trial, llm/deepseek and llm/tests/diagnosis-channel.test.ts printed `Test Files 124 passed (124)` and `Tests 1130 passed (1130)`.
- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo` printed nothing.
- `node scripts/structure-audit.mjs`, run from the repository root, printed `structure-audit: passed (374 warning(s), 1156 baselined)`. The new warning is advisory: `build-test/judge.ts` is now 418 lines, past the 400-line advisory threshold.

### Not verified

- **A taken yes's advice is not kept.** When the yes that advised a change was taken and the other call was held, the outcome says `changeAdvised` but the reading has no `advice`. A taken yes does not keep its advice: adding it would have changed what a split's `answeredReading` shows. I left that alone so other feedback stays byte-identical.
- **How builders use the new feedback.** I did not check how `project-agents` or `flow-bootstrap` gate instructions use the new feedback; they were not touched. For a subflow trial, the gate's `INSTRUCTIONS.not_judged` text applies as before, and the new fields only add data beside it.
- No live run.

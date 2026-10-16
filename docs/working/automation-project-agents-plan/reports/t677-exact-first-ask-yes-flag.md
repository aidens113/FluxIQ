# t677 report: exact first-ask yes flag

## Outcome

Done. The verification now records whether its yes was first-ask confirmed. The flag travels from the build-test judge's yes to the candidate trial record, then to the proposal's `created` audit event, then to the saved Flow's `judgedBuildTrial` metadata, and finally to the judged-trial port. The playback hold now reads this flag instead of counting judge calls. A record without the flag still uses the old count (`calls === 2`), as the header says.

## What changed and why

**Where the fact is recorded: `result-verification/verify.ts`, with a new `result-verification/first-ask/`.**
- `first-ask/model-said.ts`: gives the verdict word the model said on one ask. A yes that Core held for missing exclusion evidence still counts as the model's yes. An ask that returned no verdict (no reply, a reply that could not be read, a cut yes) gives `undefined`.
- `first-ask/confirmed.ts`: `automationStudioResultFirstAskConfirmed(trail)` returns true only when all of these hold:
  - the verification has `confirmAnswer` set;
  - the outcome is a model `answers`;
  - both checks ended on a model `answers`;
  - no check's verdict word changed between its asks;
  - no call was re-asked after the two checks (`reasks === 0`).
- `first-ask/index.ts`: the barrel. Its header explains the rule and the decision on retries.
- `verify.ts`: `askCheck` now takes a `CheckTrail` (`interventions`, `verdictChanged`, `reasks`) where it used to take the bare interventions array. The `ask` closure (which every agreement and narrowing re-ask goes through) increments `reasks`. Inside a check, an ask whose verdict word differs from an earlier answered ask of the same check sets `verdictChanged`. The outcome gets `firstAskConfirmed: true` only when the rule holds.
- `contracts/verification.ts`: new field `firstAskConfirmed?: true`.

**Decision: why a temporary-fault retry or the evidence recheck does not clear the flag (from the code).**
- **Temporary-fault retry.** `askCheck` asks again only when `asked.temporary` is set, and that happens only when there was no response or the yes was cut and unreadable (`unreadYes`). That ask gave no verdict, so the next ask's answer is the check's first answer.
- **Exclusion-evidence recheck.** It runs only when `exclusionEvidenceMissing` is set (`exclusion-evidence/recheck.ts`), which `verdict/result-verdict.ts` sets only on a model yes held for missing quotes. Its text tells the model to correct the explanation, not the verdict. So a yes after the recheck is the same verdict word asked again.
- Either one clears the flag only if the verdict word actually changed between the check's asks.
- **Re-asks after the two checks.** The refuted no (t607), contradicted unsure (t503), split's no (t515) and t666 narrowing re-asks all go through `ask`, and each one re-asks a call that said something other than yes. Any of them clears the flag.

**Carried to the hold.**
- `build-test/judge.ts`: the yes branch gets `firstAskConfirmed?: boolean`. The judge always sets it on a yes: `outcome.firstAskConfirmed === true`.
- `service/candidate-trial/contracts.ts` and `run.ts`: the record gets `firstAskConfirmed?: boolean`. It is set only when both the gate's read verdict and the judge's verdict are yes and the judge said something. It is absent otherwise, for example when a fake judge in other tests returns a yes without it.
- `service/candidate-trial/promotion.ts`: the flag is written only into the `candidateTrial.trial` JSON audit detail. `AutomationStudioGeneratedCandidateTrial`, which lives in `flow-bootstrap-commands` outside my files, is unchanged.
- `flow-version/judged-build-trial/`:
  - `contracts.ts`: new optional field.
  - `applied.ts`: reads a boolean flag from the audit. A missing or non-boolean value means nothing is recorded.
  - `metadata-with.ts`: writes the flag.
  - `from-metadata.ts`: an absent flag is fine; a non-boolean one marks the record as damaged and it reads as none.
- `build-yes-hold/`:
  - `judged-trial.ts`: new optional field.
  - `saved-flow-trial.ts`: passes the flag on.
  - `held-double-no.ts`: the new `firstAskConfirmed(trial)` returns `verdict === "yes" && (trial.firstAskConfirmed ?? calls === 2)`. The header and the `FIRST_ASK_CONFIRMED_CALLS` doc now say the count is only the fallback for old records.
  - `because.ts`: the `trial_not_confirmed` text is updated.

**Tests.**
- `first-ask/tests/first-ask.test.ts`: the pure rule.
- `tests/first-ask-route/tests/first-ask-confirmed.test.ts`: end to end through the real `verifyAutomationStudioRunResult` with a scripted provider. It is nested because `result-verification/tests/` would otherwise have gone to 26 files, over the 25 limit; it follows the existing `reask-route/tests/` pattern. Cases:
  - yes, yes: confirmed.
  - timeout, then yes, yes: confirmed, with 3 interventions.
  - held yes, then evidence recheck yes, then yes: confirmed.
  - a runtime check's single yes: no flag.
  - contradicted unsure re-asked: not confirmed.
  - split's no re-asked: not confirmed.
  - lamps fixture, two refuted nos re-asked (the t664 towels shape): not confirmed.
- `build-test/tests/first-ask.test.ts`: the judge's yes is `firstAskConfirmed` true with 2 calls, true with 3 calls (timeout), and false with 4 calls (refuted nos).
- `build-yes-hold/tests/held-double-no.test.ts`:
  - flag true with 3 calls: held.
  - flagged towels trial (4 calls, false): `trial_not_confirmed`.
  - 2 calls with false: not held.
  - flag on an unsure: not held.
  - old record: count, both ways.
  - The towels playback (nos stand whole) beside a flagged yes stays refuted with `no_stands_whole`.
- `build-yes-hold/tests/saved-flow-trial.test.ts`: the whole route from audit to apply to metadata to port to check:
  - flag true with 3 calls: held;
  - false with 2 calls: `trial_not_confirmed`;
  - a non-boolean flag records none and falls back to the count.
- `flow-version/judged-build-trial/tests/judged-build-trial.test.ts`: the flag round trip; it is absent on old proposals; a damaged flag reads as none.
- `candidate-trial/tests/run.test.ts`: the record carries true or false. There is no flag when the judge gives none or the verdict is not a yes.
- `candidate-trial/tests/promotion.test.ts`: the audit detail's trial carries the flag, or none.
- `build-test/tests/judge.test.ts`: two exact-shape `toEqual` expectations are updated. One with a stubbed verify outcome now expects `firstAskConfirmed: false`; the real yes, yes case now expects `true`.

## Commands run and observed results

- `packages/fluxiq: node_modules/.bin/tsc --noEmit -p .`: no output, then `tsc exit: 0`. Run three times, the last after all test moves.
- `node_modules/.bin/vitest run src/.../runtime/result-verification src/.../runtime/service/candidate-trial src/.../runtime/flow-version`:
  - First run: 2 failures in `build-test/tests/judge.test.ts`: "answers is yes, with every call's spend summed" and "yes, yes is yes, and both calls are paid for", each `expected { verdict: 'yes', …(2) } to deeply equal { verdict: 'yes', spent: {…} }`. These were exact-shape expectations; I updated them as described above.
  - Rerun: `Test Files 141 passed (141)`, `Tests 1193 passed (1193)`.
- After moving the verify-level test: `vitest run .../result-verification/tests/first-ask-route .../result-verification/first-ask` gave `Test Files 2 passed (2)`, `Tests 11 passed (11)`.
- Read-only check of tests outside my files that use the real judge: `vitest run .../flow-bootstrap/unfinished-build/tests/judged.test.ts .../judged-wrong-rows.test.ts .../flow-bootstrap/candidate/tests .../result-verification/build-test` gave `Test Files 49 passed (49)`, `Tests 349 passed (349)`.
- `node scripts/structure-audit.mjs`:
  - First run: `FAIL [directory-files] .../result-verification/tests/: 26 source files exceeds the 25-file limit`. I fixed it by moving the test into `tests/first-ask-route/tests/`.
  - Rerun: `structure-audit: passed (390 warning(s), 1156 baselined)`. The new advisory warnings are `verify.ts` at 411 lines and `judge.ts` at 442 lines, both over the 400-line advisory threshold and under the 800 limit.

## Not verified

- I did not run the whole Core suite (as the brief says).
- I did not run tests under `project-agents/**`, `flow-bootstrap/subflow-candidate/**`, `service/project-build/**` or `service/subflow-trial/**`, because other workers are editing them. Any exact-shape `toEqual` on a real judge's yes in those directories would now see the extra `firstAskConfirmed` field. My grep found `toEqual({ verdict: "yes"` only in `unfinished-build/tests/judged.test.ts`, `finishing-verdict.test.ts` and `project-agents/supervisor/tests/interruption-repair.test.ts`. The first passed; the other two do not take the judge's verdict object directly, but I did not run them.
- No live or Lab run. The flag starts working only once a new build's yes has been promoted and applied after this change. Flows saved before it keep the count.

## Open questions or contradictions found

- `subflow-trial/types.ts` reuses `AutomationStudioCandidateTrialRecord["judge"]` but builds its own records. A subflow trial's records do not carry the flag. That is fine for the whole-Flow hold, which only reads whole-Flow promotions, but if Subflow promotion ever feeds a judged trial it would need the same carry.
- `AutomationStudioGeneratedCandidateTrial.trial` (`service/flow-bootstrap-commands/contracts.ts`, outside my files) still has only `calls`. The flag reaches apply through the audit JSON alone, which is the only thing apply reads. Adding it to the typed `candidate` would need that file.

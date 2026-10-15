# t611 judges-yes-structured: worker report

Brief: `judges-yes-structured`. Core worktree `fxwork/t611/!FluxIQ`, branch `task/t611-judges-yes-structured`.
Paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`. Nothing committed. No live run.
Nothing that could reach a model provider ran: every test uses scripted diagnoses or an injected `verify`.

## Outcome

Done. Both fixes are in and tested. Typecheck is clean, the named vitest directories pass, and the structure audit's
only failure is the `docs/working/README.md` index, which this task did not touch (see open question 1).

## What changed and why

1. **The judges' held yes is now a field, not a text match.**
   - `result-verification/contracts.ts`: a new optional `yesUnconfirmed?: true` on `AutomationStudioResultVerification`,
     next to `exclusionEvidenceMissing`. It is set exactly when every call that was asked answered a plain yes and Core
     held that yes because it lacked the exclusion evidence. None answered no, none was unsure, none failed to answer.
     It is never a yes and never permission to promote. Both of these fields now have their doc comment on the same
     line as the field. The file is at its 800-line limit, and this layout added the new field without going over it.
   - `result-verification/verdict.ts`: the one held call (`exclusion_evidence_missing` from a single yes) carries
     `yesUnconfirmed: true`.
   - `result-verification/agreement.ts`: the two-call exclusion-evidence branch sets it only when `answeredYes` is true
     for both calls. That means a call held for its evidence, or a `model` `answers` whose code is the plain
     `answers_request`. A yes that also advised a change does not count. The single-call path (`{...first}`) keeps the
     first call's field. The re-ask paths (t503 `contradictedUnsure`, t607 `refutedNo`, t515) all re-run `agree`, so
     the field follows their outcome. `refutedNo` is untouched and both fields live side by side. A t611 paragraph was
     added to the header.
   - `result-verification/build-test/judge.ts`: the `not_judged` returned for `exclusionEvidenceMissing` carries
     `yesUnconfirmed: true` when the outcome has it. The field was added to the `unknown | not_judged` member of
     `AutomationStudioBuildTestVerdict`, and one row was added to the header table.
   - `service/candidate-trial/feedback.ts`: a judged `not_judged` puts `yesUnconfirmed: true` in its feedback, next to
     `why`, when the verdict has it. A header paragraph was added. This feedback is shared with the whole-candidate
     trial, so that trial's model also sees the field on a held yes. The whole-candidate gate
     (`flow-bootstrap/candidate/trial-gate.ts`) was not touched, and its wording is byte-identical.
   - `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`: the `/\bexclusion evidence\b/iu` regex is gone.
     `instructionFor` now gives `NOT_JUDGED_AFTER_YES` only when `verdict === "not_judged"` and
     `feedback.yesUnconfirmed === true`. `NOT_JUDGED_AFTER_YES` and every other instruction text are unchanged. A t611
     header paragraph was added.
   - Behaviour change to note: if one call's yes was held and the other call was unsure or did not answer, the field is
     not set, so the builder now gets the default `not_judged` text. Under t601 it got the after-yes text, because the
     reason string matched. The after-yes text says "the judges answered yes ... and none answered no", which was
     false in that case.
2. **A standing yes is `done`, however the builder loop stopped** (`project-agents/dispatch/ending.ts`).
   - `built()` first calls a new `passedProposal(outcome)`. It looks for the latest proposal whose standing trial is
     `yes`, has its entry prepared, and matches that proposal's revision and digest. When one exists, the return is
     `done` with that proposal and the brief's trial receipts:
     - Clean receipt (`loop.ok`, no `ended`): the reason is unchanged, "Revision N of the subflow was tried on its own
       and its trial answered yes."
     - Loop stopped (any `loop.ok === false`: guard, iteration limit, allowance): the same sentence, then "The brief
       is done on that trial's receipt, though the builder did not complete with it.", then the existing
       `stopReason` (code, guard codes, calls).
     - Builder's own ending beside a standing yes: the same, then "The builder then ended it <outcome>: <reason>".
   - `trialSaid` now reports a yes as well. A return that is not done, and whose last trial was a yes, says " Its last
     trial, of revision N, answered yes, but revision M was submitted after it and was never tried." The ", but ..."
     part appears only when the latest proposal is a different revision or digest. Before, a yes produced nothing.
   - `thrown()` is unchanged. A builder loop that throws reaches it with no standing trial, because `run-brief.ts`
     passes only the receipts (see open question 2). Header paragraph added.

Tests:
- `flow-bootstrap/subflow-candidate/tests/subflow-trial-gate.test.ts`: the t601 test was rewritten to cover these
  cases:
  - A `not_judged` with `yesUnconfirmed: true` gets the after-yes instruction from both the test tool and the
    completion refusal, and a reworded `why` still gets it.
  - New: both of Core's held-yes reasons, word for word, plus a deadline reason, all *without* the field, get the
    plain `not_judged` text, pinned exactly, from the tool and from completion.
  - The field on an `unsure` changes nothing.
- `result-verification/tests/agreement.test.ts`, new `describe`, built from real `automationStudioResultVerdict`
  calls on the request-words fixture:
  - The field is set on a single held call, and absent on a yes that was taken and on an unknown.
  - It is set for held+held, held+taken and taken+held.
  - It is absent for held+unsure and held+unavailable.
  - It is kept when only the first call was asked.
- New `result-verification/build-test/tests/judge-yes-unconfirmed.test.ts`: with an injected `verify`, the judge's
  `not_judged` carries the field after two yeses and leaves it out when held+unsure. The `why` is unchanged.
- New `service/candidate-trial/tests/yes-unconfirmed.test.ts`: a `not_judged` verdict with the field puts it in the
  feedback, and one without the field does not, even when the reason is the same.
- `project-agents/dispatch/tests/brief-return-reason.test.ts`, new `describe`:
  - Done with its receipt, after a stop by `subflow.ending_shape` refusals (`repeat_without_progress`) and after
    `iteration_limit`. The full reason is pinned.
  - Done after the builder's own partial ending.
  - The clean receipt keeps its old wording.
  - Not done for a yes whose entry was not prepared, or for a yes of another digest.
  - A last yes for a replaced revision is reported as such.

## Commands run and observed results

All from `packages/fluxiq` in the worktree unless noted:

- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check-t611.tsbuildinfo`
  - Printed nothing, exit 0, both before and after the tests were moved.
- `npx vitest run <R>/result-verification <R>/service/candidate-trial <R>/service/subflow-trial <R>/flow-bootstrap/subflow-candidate <R>/project-agents <R>/service/project-build <R>/llm/deepseek`,
  with `<R>` = `src/programs/automation-studio/runtime`:
  - First run: `Test Files 1 failed | 160 passed (161)`, `Tests 1 failed | 1358 passed (1359)`. The failure was
    `service/project-build/tests/project-build-time-limit.test.ts` > "keeps an assembled candidate as a draft ...":
    `expected { …(13) } to match object { status: 'draft', …(2) }`.
  - Rerun of that file alone: `2 passed`.
  - `npx vitest run <R>/service/project-build`: `Test Files 14 passed (14)`, `Tests 67 passed (67)`.
  - Final run, after moving the tests: `Test Files 161 passed (161)`, `Tests 1359 passed (1359)`.
- `npx vitest run <R>/flow-bootstrap/candidate` (whole-candidate gate pins): `Test Files 17 passed (17)`,
  `Tests 145 passed (145)`.
- From the worktree root, `node scripts/structure-audit.mjs`:
  - First run: 3 violations.
    - `result-verification/tests/` had 26 files: my new test file. I removed it and moved its tests into
      `agreement.test.ts` and `build-test/tests/`.
    - `contracts.ts` had 810 lines: fixed by putting the two doc comments on the field lines.
    - `[working-docs] docs/working/README.md is out of date`.
  - Final run: `structure-audit: 1 violation(s) across 1 rule(s)`, the working-docs one only.

## Not verified

- No live builder or Lab run. Whether real builders stop rewriting after a held yes, and whether the supervisor now
  stops amending a subflow that passed, is not measured.
- The project-build time-limit test failed once under the full parallel run and passed twice in isolation. It mocks
  an 8 s wall-clock bound, so I read it as load timing. I did not run it under load against the base commit to prove
  that it is independent of this change.
- I did not check whether the whole-candidate builder's model reacts to the new `yesUnconfirmed` field in its trial
  feedback. Its gate text is unchanged.
- The full `pnpm check` and `pnpm test` suites were not run, per the twice-a-day rule.

## Open questions or contradictions found

1. The structure audit fails `[working-docs] docs/working/README.md is out of date`. No file under `docs/working` was
   changed when it first appeared. This report adds a file under `reports/`, and the audit says the same after it.
   The supervisor owns that index (`pnpm structure:baseline`).
2. Fix 2 covers every way the builder loop can *return*. It does not cover a throw, or a brief stopped by its own
   ending (permission or person-needed), because `project-agents/dispatch/run-brief.ts` hands `ending.thrown` and
   `endedAs` only the receipts, with no standing trial. That file is outside this brief. For a throw after a
   standing yes to come back `done`, `run-brief.ts` would need to carry the gate's standing trial in `spend`.
   The brief-ending (t551) path should probably stay `blocked`.
3. `agreement.ts` holds a yes whose second call actually supplied the evidence (`first` held, `second` a clean
   `answers`) as `exclusion_evidence_missing`. It is now marked `yesUnconfirmed`, but the verdict still depends on
   the first call's missing quote. That rule came before this task. I did not change it.

## Follow-up: a throw after a standing yes (coordinator, same task)

The coordinator's follow-up added `project-agents/dispatch/run-brief.ts` to what I own. It asked for the gap in open
question 2 to be closed with one shared check.

### Outcome

Done. A builder whose loop throws after a standing yes now returns `done` with its receipts. A throw with no standing
yes returns what it did before, with its failure first.

### What changed and why

- `project-agents/dispatch/ending.ts`:
  - `passedProposal(proposal, trial)` is now the one check both endings ask. `built()` passes the gate's standing
    verdict (`outcome.proposal`, `outcome.trial`). `thrown()` passes the latest accepted proposal and the last trial
    the brief's port answered (`spend.accepted`, `spend.trial`).
  - The check returns the proposal only when the trial is a partial `yes` with its entry prepared and the same
    identity: the four fields `buildId`, `briefId`, `planDigest` and `subflowKey`. It must also be the same revision
    and digest. The identity test was added because `spend.trial` is the port's raw answer, not the gate's checked
    copy.
  - `passedSaid` and `passedDone` hold the wording, so `built()` and `thrown()` share it as well.
  - `AutomationStudioProjectDispatchSpend` has a new optional `trial`.
  - Header paragraph extended.
- `thrown()` with a standing yes returns `done` with the reason "Revision N ... answered yes. The brief is done on
  that trial's receipt, though the builder did not complete with it. <today's why>". Today's why is the failure,
  the allowance refusal or the stop.
  - This covers a stopped build too. I read "however the loop stopped" to include it. If a stopped build should not
    say `done`, that is one `stopped` guard in `thrown()`.
  - `endedAs` in `run-brief.ts` still overrides the outcome and reason, so a brief stopped by its own ending
    (permission or person-needed, t551) stays `blocked`, as before.
- `project-agents/dispatch/run-brief.ts`: the builder's trial port is now wrapped by `heard(spend, ...)`, inside
  `kept`, which still carries `prepareStart`. It keeps a clone of each answer on `spend.trial`. The catch already
  passes `{ ...spend, trials }` to `ending.thrown`. Header paragraph added.

Tests:
- New `project-agents/dispatch/tests/brief-thrown-after-yes.test.ts`, run through the real dispatcher with the
  garden fixture. A scripted builder proposes revision 1, tries it through the wired port, then throws
  "The page closed.":
  - A `yes`: `done` with proposal revision 1 and its digest, and receipt `run.trial-1` with verdict yes. The full
    reason is pinned.
  - An `unsure`: `partial`, reason exactly "The builder failed: The page closed.".
  - A `yes`, then revision 2 accepted untried, then the throw: `partial`, with the same reason.
- `brief-return-reason.test.ts`, inside the standing-yes `describe`: `ending.thrown` with a generation error and a
  standing yes returns `done`, with the error's code and guard after the yes sentence. Four cases keep today's
  `partial` reason exactly, with the error's code first: no trial, an unsure, a yes of another brief, and a yes whose
  entry was not prepared.

### Commands run and observed results

From `packages/fluxiq`:
- `npx vitest run <R>/project-agents/dispatch`: `Test Files 8 passed (8)`, `Tests 56 passed (56)`.
- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check-t611.tsbuildinfo`: no
  output, exit 0.
- `npx vitest run <R>/project-agents <R>/service/project-build <R>/flow-bootstrap/subflow-candidate`, run three
  times:
  - First run: `Test Files 1 failed | 56 passed (57)`, `Tests 2 failed | 395 passed (397)`. Both failures were in
    `project-build-time-limit.test.ts` (11.6 s and 12.3 s against its mocked 8 s bound). The new
    `brief-thrown-after-yes.test.ts` passed its 3 tests.
  - That file run alone: `2 passed`.
  - Second and third runs of the same three directories: no failures. The third printed `Test Files 57 passed (57)`,
    `Tests 397 passed (397)`.
- From the worktree root, `node scripts/structure-audit.mjs`: `1 violation(s)`, the `[working-docs]` README index
  only. The coordinator said to ignore it.

### Not verified

- `project-build-time-limit.test.ts` is flaky under parallel load. It has now failed twice under load and passed
  every time alone or on rerun. Its scripted builder gets an unsure trial, so the new `done` path cannot apply to it.
  I still have not run it under load against the base commit.
- No live run.

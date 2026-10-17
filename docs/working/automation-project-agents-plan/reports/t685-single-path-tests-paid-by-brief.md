# t685: single-path tests paid by the brief

Worker report. Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t685/!FluxIQ`, branch
`task/t685-single-path-tests-paid-by-brief` (from Core dev 8ac92ef1). Nothing committed.

## Outcome

Done. On a single-subflow plan, each builder test (the build's judged whole run) is now paid
the way a candidate builder's trials are: by the brief's allowance and its top-ups first, with
the build's judging reserve as the backstop when they cannot pay. A test is refused
`candidate.trial_unaffordable` only when neither can. The builder keeps its normal finishing
keep again (`keptForFinishing: AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS`, 4 calls). The
judge's record attribution stays `supervisor`. Plans with several subflows are unchanged.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

**Root cause.** t679 ran the single-subflow test's judge in a scope frame of the build's purse.
On that purse an open allowance's unspent money is kept from every other call
(`allowances.outstandingUsd`). The one brief's allowance was sized near the whole purse, so the
judge could only draw on what was left beside it, which was the 4-call judging reserve plus a
little finishing money. Two tests used that up, and the third was refused while the allowance
had barely been touched.

**The backstop (in `llm/build-purse/`, needed because the trial port's own affordability
probe and the real judge calls both go through `purse.hold`).**
- `judge-backstop.ts` (new): `automationStudioLlmBuildPurseJudgeBackstopScope(purse, backstop, call)`
  opens a scope frame of the allowance that names a backstop. It throws if the backstop is not a
  purse the allowance was carved from, so whichever purse pays, the call is held against the
  same Flow ceiling.
- `run-frame.ts`: a frame can now carry an optional `judgeBackstop`. There is a new lookup,
  `automationStudioLlmBuildPurseJudgeBackstopOf`, and `automationStudioLlmBuildPurseInFrame`
  takes an optional backstop.
- `purse.ts` `hold`: a judge call inside a backstopped scope is held normally first (the
  allowance, its t627 top-ups, then every purse above). Only if that is refused is it held on
  the backstop alone (`holdFor(call, undefined)`, which is t679's reserve arithmetic). When the
  backstop pays, the refusal from the first attempt is put back. When neither can pay, the
  backstop's refusal is returned. Calls that are not a judge's, and every call outside such a
  scope, take exactly the old path.
- `index.ts`: exports `judge-backstop.ts`.

**The single-subflow path.**
- `project-agents/single-subflow/single-subflow-trial.ts`: the test now runs as
  `withAutomationStudioProjectAgent({role:"supervisor"}, () => paidByBrief(ports.purse, test))`.
  `paidByBrief` reads the current build purse, which is the brief's allowance because
  `run-brief.ts` runs the builder inside `automationStudioLlmBuildPurseScope(allowance)`. If that
  allowance was carved from `ports.purse`, the test runs in a backstopped scope of it.
  Otherwise it falls back to t679's `ports.purse` scope. Afterwards the allowance's refusal is
  put back to what it was before the test, which keeps t679's guarantee that a refused judge
  call shows up as the trial's own answer and never as a thrown refusal ending the builder. The
  model text `WORDS.unaffordable` now says "neither this brief's money nor the money kept for
  judging the build's whole run can pay". It is generic and mirrors no scenario.
- `flow-bootstrap/subflow-candidate/builder-loop.ts`: the `whole ? 0 :` special case is gone,
  so the finishing keep is 4 calls on every path. The allowance now pays the test's judge calls
  (they are held against its call cap too), so the builder must keep calls for a last test.
  `AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS` already equals wrap-up decisions plus those 4.
- Header comments only: `project-agents/dispatch/run-brief.ts`, `project-agents/supervisor/brief-sizing.ts`,
  and `service/project-build/reserve.ts`. No code change was needed in sizing: t679's sizing
  (what the purse can carve, less the finishing calls priced at the average call) already gives
  the allowance the money its tests now draw on. `whole-trial.ts` and `service/project-build/run.ts`
  were not changed.

**Reserve guarantee.** The reserve is now the backstop, not the payer, so while the allowance
can pay it stays whole for the judged whole run and one repair round after the brief. A test
asserts `purse.judgingFits()` after six tests. When the allowance cannot pay, the reserve still
judges (second test below), as t679 did.

**Attribution and frame (brief: keep, or justify a change).** The record attribution is kept:
the judge still runs under `{role: "supervisor"}`. The purse frame did change: it is now the
allowance's scope with the build's purse as backstop. That is the point of the task, because
the brief's money pays. As a result the judge's spend shows in `attributedSpend` under the
builder's allowance when the allowance paid, and only under the build purse's own spend when
the reserve paid.

**Tests.**
- `llm/build-purse/tests/judge-backstop.test.ts` (new, 6 tests): the allowance pays judges it
  can and the reserve stays whole; a judge the allowance and its top-ups cannot pay is paid by
  the backstop, with no refusal left on the allowance or the purse; neither can pay gives the
  backstop's figures; a call that is not a judge's gets no backstop; a plain allowance scope
  (the multi-subflow builder path) is unchanged and the allowance refuses; the backstop must be
  an ancestor.
- `project-agents/single-subflow/tests/single-subflow-trial.test.ts`:
  - The frame test is rewritten. The judge's current purse is the brief's allowance (its parent
    is the build purse, attribution builder/brief-1), and its agent role is `supervisor`.
  - New: six tests on a $0.25 purse where the brief is given $0.219 (asserted). The verdicts
    are no ×5 then yes. All are paid by brief-1 ($0.06 of judge spend), none is unaffordable,
    and the reserve still fits.
  - New: with $0.225 already spent, the brief's allowance cannot pay, so the reserve judges
    the test (yes), none of the spend is the brief's, and the allowance holds no refusal.
  - New: with $0.225 spent and verdicts no, no, yes, the reserve pays two tests and the third
    is refused unaffordable with the new words. The allowance holds no refusal after any test.
  - These whole trials work the way the service's trial port does: they first probe for the
    two judge calls with the real `automationStudioTrialJudgingShortfall`, then hold and settle
    them on the current purse.
- `project-agents/single-subflow/tests/single-build.ts` (fixture): it now carves one allowance
  per brief for the whole brief, as `run-brief.ts` does. Before, it carved a fresh one per
  test, and that shrinking re-carve hid the defect.
- `flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts`: the whole-run case now expects
  `keptForFinishing: 4`.
- **Regression check.** I temporarily put back t679's `automationStudioLlmBuildPurseScope(ports.purse, ...)`
  call. The many-tests case then fails with three `candidate.trial_unaffordable` refusals
  (tests 4 to 6), which is the live defect. The other new single-subflow tests fail too. With
  the fix restored, all pass.

## Commands run and observed results

All from `packages/fluxiq` unless stated.
- `npx tsc --noEmit -p tsconfig.json` -> no output, `tsc exit: 0` (1m17s).
- `npx vitest run src/.../runtime/project-agents src/.../runtime/service/project-build src/.../runtime/flow-bootstrap/subflow-candidate src/.../runtime/llm/build-purse`
  -> `Test Files 103 passed (103)`, `Tests 657 passed (657)`, exit 0, 182.97s.
- Temporary t679 revert, `npx vitest run .../single-subflow/tests/single-subflow-trial.test.ts`
  -> `Tests 4 failed | 6 passed (10)`. The many-tests case got `expected [ {…}, {…}, {…} ] to deeply equal []`
  (three unaffordable refusals). The file was restored and the grep confirmed `paidByBrief(ports.purse` is back.
- From the worktree root, `node scripts/structure-audit.mjs` -> `structure-audit: passed (393 warning(s), 1155 baselined).`, exit 0.
  Advisory warnings on files I touched:
  - `purse.ts` is now 410 lines, past the 400-line advisory. It was 395 lines, so this
    warning is new.
  - Already over before my change, and grown slightly:
    - `builder-loop.ts`: 411 lines (was 409).
    - `run-brief.ts`: 525 lines.
    - `llm/build-purse/`: 18 files against the 15-file advisory (was 17).
    - `AutomationStudioLlmBuildPurse`: 30 methods against the 25 advisory. My change adds
      no method.

## Not verified

- No live Lab run. The fix is shown only by unit and integration tests on the scripted
  supervisor and the fixture trial port, which follows the real probe and hold path. The real
  `service/candidate-trial` port and harness were not exercised end to end on this path.
- I did not run the whole Core vitest suite or `pnpm check`, as the brief instructed.
- With a real builder loop, a refused judge call is put back off the allowance after the test,
  as before. Whether the builder's next decision is then refused on its own money was reasoned
  about, not tested.

## Open questions or contradictions found

- `purse.ts` crossing the 400-line advisory is new with this change. Moving the backstop branch
  of `hold` out of the class would need `holdFor` exposed, so I left it. Splitting
  `AutomationStudioLlmBuildPurse` would be a separate structural task.
- The fallback (a test asked outside an allowance carved from the build purse runs under the
  build purse as in t679) is never reached in production, where `run-brief.ts` always gives
  the builder an allowance. Existing tests that use no purse go through it.
- Working copies of the edited files are now LF where the checkout had CRLF. Git normalizes
  them (the index stores LF), and the diff is content-only. A supervisor could re-checkout to
  restore CRLF if wanted.
- Docs: no architecture doc describes the t679 funding. The working-doc report
  `reports/t679-one-part-plan-tests-once.md` and `automation-project-agents-plan.md` still
  describe the judge as paid from the reserve. I am not allowed to edit those, so the
  supervisor should note t685 there.

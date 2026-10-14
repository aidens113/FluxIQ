# t586 whole-test-start-hook: worker report

Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t586/!FluxIQ`, branch `task/t586-whole-test-start-hook`. Nothing was
committed. No model provider was called and no Lab run was started.

## Outcome

Done. Both parts of the brief are built and covered by stub tests. The supervisor, project-agents and project-build test
sets pass, the typecheck passes, and the structure audit passes.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/supervisor/`.

### (1) The whole test gets the same gate as candidate mode

- **`whole-trial.ts`** is now the class `AutomationStudioProjectSupervisorWholeTrial`, one export. It owns the whole
  test and its reset.
  - `reset` is an `AutomationStudioSiteResetTrialReset` over every brief's ledger in the project ledger. It is passed to
    the gate, so the gate now runs the deployment's `prepareStart` before each whole trial (`trial-gate.ts:227`).
  - **Start hook.** Every ledger is asked with `startReset`, so all acts count as undone and the trial runs. The gate's
    evidence carries `absorbedByStartReset`.
  - **No hook.** Every ledger that holds an act is asked `beforeTrial` with no look at the target:
    `compare: async () => ({ moved: false })` and no `compareAt`. The supervisor never acts on the target, so an act
    counts as undone once a reset brief's undo of it has landed, or once that brief's own check found it gone.
  - **Refusals.** The gate's `candidate.trial_reset_required` is turned into `project.trial_reset_required` with
    `actsInPlace` (act, did, owning brief) and `GUIDANCE.refusals.resetRequired`, which names `project.dispatch`.
    `retry_allowed` is kept.
  - **Kept acts.** An act the ledger keeps (asked twice, or named under `cannotUndo`) no longer blocks the test. The
    trial runs with it in place and the judge is told under `startedWith`, as in candidate mode.
  - **Supervisor rule, not in candidate mode.** After a refusal, the next test gets the same refusal without asking
    the ledgers, until a reset brief has come back. The ledgers' no-deadlock admission (an identical refusal admits)
    is meant for a reset that was tried and made no progress. Without this rule, a supervisor that tests again instead
    of dispatching a reset would be admitted with the acts still on the site.
  - **`trialRan` records no acts.** The service's whole-trial port already records them under the supervisor
    (`service/project-build/whole-trials.ts:58-60`). Recording them here as well would duplicate them. `trialRan` only
    starts a new phase in every ledger and returns what is left.
  - **Joining the ledgers' answers.** `joined` and `joinedStartedWith` copy the joiner in
    `service/project-build/trial-reset.ts`. I copied it because project-agents must not import from service.
  - **Fallback.** For a ledger that is not an `AutomationStudioSiteResetProjectLedger` (a stand-in with only
    `snapshot`, as the old test fixture uses), the old pre-check stays exactly as it was.
- **`supervisor-loop.ts`** builds the whole-trial object, builds the gate with `reset: wholeTrial.reset`, and routes
  `core.test_candidate` to `wholeTrial.test(...)`.

### (2) A supervisor stopped by a guard gets an honest ending, after Core's own reset

- **Cause.** The supervisor loop runs with `propagateDecisionErrors: true` (`service.ts:1592`). A stall is therefore
  thrown out of the loop. `supervisor-loop.ts` caught only purse refusals and rethrew everything else, so no ending was
  recorded and no reset ran.
- **`supervisor-loop.ts` now:**
  - Wraps `input.loop.unusableDecisions.stalled`, so it knows the exact error object a guard stall throws, and the
    stall's issue codes.
  - Catches only that error, and only when the signal is not aborted. Every other throw still propagates.
  - On a guard ending, thrown or returned (not cancelled, not out of money, and not the model's own ending), calls
    `resetBeforeEnding`. It dispatches a reset brief through `automationStudioProjectSupervisorDispatchTool`, inside the
    supervisor's agent and purse frames, so the brief is recorded, shown and sized like any other. It does this only
    when all of the following hold:
    - a purse exists;
    - a plan and a task spec are in force;
    - `left.undoable` is true;
    - the last brief sent was not a reset that came back.

    The reset's `subflowKey` is the subflow of the brief that owns the first undoable act, or the plan's first subflow.
    A purse refusal of the reset is swallowed, and the ending still names what is left.
  - Skips the reset, but still records the ending, when the stall is a person ending (`flow_bootstrap.permission_required`
    or `flow_bootstrap.user_intervention_required`). No brief is sent past a person's no.
  - Records the ending with `left-on-target`'s note, then rethrows the original stall error. The caller's failure path
    is unchanged.
- **`left-on-target.ts`** now also names acts that no reset can undo. Before this change, only snapshot `inPlace` acts
  were named, and the ledger's `inPlace` excludes kept acts and irreversible acts.
  - Kept acts are found through `ledger.forBrief(owner).claim(act)`. It answers `candidate.undo_act_kept` for a kept act
    and changes nothing. They are named "(the site offers no way to undo it)".
  - Acts of an irreversible class (`undoable: false`) are always named "(cannot be undone by FluxIQ)".
  - `undoable` is true only for in-place acts that can be undone.
- **`completion.ts`**: `project.completion_reset_first` lists under `actsInPlace` only the acts a reset can still undo.

### Tests

- **`tests/supervisor-fixture.ts`** has a new `ledger?: { hook?, undoes? }` option. It gives the build a real
  `AutomationStudioSiteResetProjectLedger`:
  - A build brief's act is recorded as its subflow trial's.
  - Whole-trial acts are recorded under `"supervisor"`, as the service's port records them.
  - A reset brief undoes each act through `explored` with `undoes` (unless `undoes: false`), then checks what is left
    the way a reset's completion does.
  - `hook` adds `prepareStart` to the trial port.
- **`tests/supervisor-script.ts`** gains a `propagateDecisionErrors` option.
- **New `tests/whole-trial.test.ts`** (5 tests):
  1. Start hook absorbs the build's act: the test runs and answers `yes` with `absorbedByStartReset: [act-1]`. No
     reset brief is dispatched, and the ledger shows `inPlace: false`.
  2. No hook: the test is refused `project.trial_reset_required` (`act-1`, `brief-2`, instruction names
     `project.dispatch`). The test again after another build brief but no reset is refused again. After a reset brief
     the test runs `yes` with no `startedWith`. One trial in total.
  3. No hook and no undo control: refused, then the reset fails, then the trial runs with
     `startedWith.cannotUndo: [act-1]`. The blocked ending names the act "(the site offers no way to undo it)".
  4. Guard stall with acts left: Core dispatches a reset brief itself (`subflowKey: place_hold`, `permittedActs: []`).
    The recorded ending is `partial`, says "The supervisor stopped before a whole trial passed" and names the act still
    in place. The stall error is rethrown.
  5. Guard stall where Core's reset undoes everything: the ending names nothing, and the ledger shows nothing in place.

## Commands run and observed results

All were run from `packages/fluxiq` unless noted.

- `npx tsc --noEmit -p .` printed nothing; `tsc exit 0`, run after the final edit.
- `npx vitest run src/programs/automation-studio/runtime/project-agents/supervisor`: `Test Files 10 passed (10)`,
  `Tests 64 passed (64)`. That run was before the person-ending guard and the barrel import, which the next run
  covers.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`
  (final): `Test Files 36 passed (36)`, `Tests 238 passed (238)`.
- From the worktree root, `node scripts/structure-audit.mjs` (final): `structure-audit: passed (356 warning(s), 1156 baselined).`
  - One earlier run failed `[imports]` on a direct `generation-failure/error.ts` import. I switched it to the barrel
    and the audit then passed.
  - The remaining supervisor warnings were there before this change: 25 files in the directory, and 13 exported
    values in `supervisor-script.ts`.
- While the new tests were in progress, two expectations needed fixing. Both were test defects, not product defects:
  - The second identical `core.test_candidate` with nothing in between is answered by the loop's repeat guard
    (`llm_evidence_loop.already_answered`) before it reaches the gate. The test now puts a build brief between the two
    tests.
  - After a reset that could not undo the act, the act is still `inPlace` (asked once, not yet kept). The ending
    therefore names it plainly, without the "no way to undo" note.

## Not verified

- No live run and no browser. The start-hook path is checked only against a stub `prepareStart` that returns
  `"reset"`, not the Lab fixture's `/__control/reset`.
- No test covers the person-ending skip (`personEnded`).
- No test covers the guard path when the loop returns failure without `propagateDecisionErrors`. That path is the same
  code after the catch.
- Full suites (`pnpm check`, the whole vitest run) were not run, per the twice-a-day rule. The flow-bootstrap/candidate
  and site-reset tests were not run because those files are unchanged.
- I did not check whether the chat now shows the ending. See the first open question.

## Open questions or contradictions found

1. **The person still does not see the recorded ending.** `service/project-build/run.ts:113-117` builds the chat's
   failure from the thrown error (`draft.ending(loop)` or `post_provider_validation_failed`). It never builds it from
   `outcome.ending.reason` or the record's ending. So the "Still on the target..." note now reaches the build record,
   but not the chat. The fix belongs in `service/project-build/` (out of bounds for this brief). One option is to carry
   `outcome.ending.reason`, or a left-on-target line, into the thrown diagnostic or a chat card. The rethrown stall
   error carries no ending.
2. **`ports.ts` types `projectLedger` as `Pick<..., "snapshot">`.** I did not edit it because it is not in my owned
   list. Instead, `whole-trial.ts` and `left-on-target.ts` narrow with
   `instanceof AutomationStudioSiteResetProjectLedger`, and the old rule is kept for stand-ins. Widening the port to
   `"snapshot" | "forBrief"`, and moving the old supervisor-loop tests onto the real-ledger fixture, would let the
   fallback be deleted. The `ports.ts` doc line "an act still in place refuses the whole trial until a reset brief has
   undone it" is now stale.
3. **The ledger has no accessor for its kept acts.** `left-on-target.ts` reads them by calling `claim(act)`, which
   changes nothing. A `kept()` method on `AutomationStudioSiteResetLedger` (site-reset, not owned) would be cleaner.
4. **Duplicated joiner.** `joined` and `joinedStartedWith` in `whole-trial.ts` copy
   `service/project-build/trial-reset.ts`. Both could move to `flow-bootstrap/site-reset/` and be shared.
5. **Possible deadlock.** If a reset brief can never be dispatched (for example `project.allowance_unavailable`), the
   repeat-until-reset rule keeps refusing the test. If every brief came back done and no trial has run,
   `project.completion_ended_too_soon` then refuses an honest ending, so only the loop's guard ends the build. The
   guard now leads to Core's reset and a named ending, but it spends turns. A rule to admit the ending when the reset
   was refused could be added in `completion.ts` or `dispatch-tool.ts`.
6. The reset-brief fixes from the social debug report (fixes 2 to 5: telling the reset model its task, `cannotUndo` on
   the reset completion, the `outsideBrief` note, refusal wording) are not part of this brief and are not done.

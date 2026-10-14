# t580: a dependent builder explores from its entry (A8 bigbox debug fix 8)

Worker report, brief `a8-builder-explores-from-entry`. Core worktree `fxwork/t580/!FluxIQ`, branch
`task/t580-a8-builder-entry`. No provider was called and no live run was made.

## Outcome

Done, with one file added beyond the brief's literal list and one dependency on fix 1 (see Open questions).

1. **Entry preparation.** Before a builder whose subflow has predecessors takes its first look, the predecessors'
   latest passing proposals now run once. The run uses the same proposals a subflow trial uses (`proposals.ts`, only
   ones whose trial answered yes), the same start (the deployment's start hook), and the same detached runner. The
   last predecessor is the run's target and the others run before it. Nothing is judged and no model is called.
   - Prepared: the builder opens with a look where the predecessors left the page. It does not arrive at the build's
     start, which would walk away from the entry. Its opening result carries `entry: {prepared: true, note}`.
   - Not prepared (a predecessor has no passing proposal, the start failed, or a predecessor's run did not end): the
     builder keeps its normal arrival. It is told plainly, with the reason and code, that this page is not its
     subflow's entry.
   - Acts the preparation lands go into the brief's ledger and the build record, as a trial's acts do, so a reset
     undoes them.
2. **The `modify_existing` that brief-4 pressed.** The gate behaved as the user's rules require. I did not add a
   refusal. I added an honest note to the model.
   - Why it ran: `brief-ports.ts:86-90` narrows `permittedConsequences` to the brief's `permittedActs`. The gate,
     however, only ever refuses the destructive classes: `move_money`, `delete` and `send_or_publish`
     (`action-permissions/destructive.ts`, the user's rule of 2026-09-30, pinned by `tests/destructive.test.ts`).
     `create_new` and `modify_existing` are permitted whatever the brief says.
   - So the filter does work for destructive classes. A read-only brief's deleting press goes to the person's gate even
     when the person granted the build `delete` (now tested).
   - It cannot work for `modify_existing`. Routing that to the person would break the 2026-09-30 rule ("the other two
     are never asked about"). Refusing it before it runs would break the 2026-10-01 rule (no new pre-action refusals).
   - What I did instead: a landed call that declared a class outside the brief's `permittedActs` now gets
     `outsideBrief: {consequences, note}` beside its evidence. The note tells the model that the act ran, that it
     stays on the site until a reset undoes it, and that it should not write that act into its subflow or do it again.

## What changed and why

- `service/project-build/entry-preparation.ts` (new): `automationStudioProjectBuildPrepareEntry`.
  - Order of work: check the predecessors' passing proposals (missing or stale ones mean no run), run the start hook
    (`automationStudioCandidateTrialStart`), open a session marked `metadata.entryPreparation`, run
    `runAutomationStudioDetachedSubflow`, write the session's end, and return the acts that landed
    (`automationStudioCandidateTrialLandedActs`).
  - Answers: `start`, `prepared` or `unprepared` (with `code`, plus `missing` or `failed`).
  - An abort is rethrown. Any other error that the runner throws ends the session as failed and answers `unprepared`
    with `project.entry_run_failed`.
- `service/project-build/brief-ports.ts`:
  - It now keeps its own `AutomationStudioProjectBuildProposals`, fed by each brief's trial wrapper. Every brief's
    trials pass through that wrapper.
  - The builder factory runs the entry preparation before it returns the ports, so before the loop and its opening.
    It records the acts that landed.
  - When the entry was prepared, it removes `initialObservation.arrival` from the loop's tools. The start-check reader
    keeps the original tools.
  - It wraps the loop's `executeTool` (`told`) to add the `entry` note to the opening result and the `outsideBrief`
    note to landed out-of-brief calls. The domain's evidence is kept whole; Core's key is added beside it.
  - The header documents both behaviours.
- `service/project-build/proposals.ts`: header comment only.
- `project-agents/dispatch/run-brief.ts`: unchanged. The builder factory is already called inside the lease and before
  `runBuilder`, so no dispatch change was needed.
- Tests (new):
  - `tests/project-build-brief-ports.test.ts`: two cases through the actual service, with a scripted model and a stub
    domain.
    - Case (a), the dependent builder's entry: `second` runs after `first`. The log shows `trial of first succeeded`,
      then `entry for second succeeded`, then second's opening `initial.look {"look":true}`. The first builder's
      opening was the arrival `{"go":"start"}`, with no entry note. Second's opening carries
      `entry: {prepared: true}` and its note names `"first"`.
    - Case (b), a read-only brief: the person permitted the build `delete` and `modify_existing`. Remove was refused
      with `missing: ["delete"]` and the person was asked once (a declining stub thread). Rename ran, and its result
      carries `outsideBrief: {consequences: ["modify_existing"]}` with "they ask for no lasting act".
  - `tests/project-build-entry-preparation.test.ts`: unit cases with a stub environment and runner. They cover: no
    predecessors (nothing runs); order, target and identity, start and session sequence; a later failed proposal is
    not used; a missing predecessor (nothing runs); a failed predecessor; a failed start (no run).

## Commands run and observed results

All commands ran in `fxwork/t580/!FluxIQ`.

- `npx tsc --noEmit -p .` in `packages/fluxiq`:
  - First run: one error in my test (`permittedConsequences` was typed `string[]`). I fixed it.
  - Rerun: no output, `tsc exit: 0`.
- `npx vitest run .../project-build/tests/project-build-brief-ports.test.ts`:
  - First run: 2 failed. The build threw `flow_bootstrap.evidence_repeat_without_progress`, because the scripted
    supervisor completes `{ended: "partial"}` straight after dispatch.
  - The test now ignores the build's own ending (`.catch`). Rerun: 2 passed.
- Mutation check: I temporarily gave the preparation an empty predecessor list and disabled the `outsideBrief` note,
  then ran the same file. Both cases failed (`expected -1 to be greater than 5`; `expected { ok: true, renamed: true }
  to match object {…(1)}`). I restored the file from a scratch copy; `git diff --stat` shows the intended change.
- `npx vitest run .../project-build/tests/project-build-entry-preparation.test.ts`: 5 passed.
- `npx vitest run src/.../service/project-build src/.../project-agents`: `Test Files 33 passed (33)`,
  `Tests 212 passed (212)`.
- After the type fix, both new files again: `Test Files 2 passed`, `Tests 7 passed`.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (356 warning(s), 1156 baselined)`. The warning count
  matches the run before my change. The `project-build/` directory-files advisory (22 files) was already present
  at 21.
- `npx biome check <changed files>`: biome's config ignores these paths ("No files were processed"), so nothing was
  linted.

## Not verified

- **Live behaviour in the web domain.** It is not verified that an opening look with no arrival is accepted as a
  builder's first call. The repair `held` path relies on the same thing, but no live builder has done it.
- That the scripted supervisor's ending in my test is refused only because of the script. The builders' behaviour
  that the test asserts happened before that ending.
- **Cause A interaction (stale tab after the start hook).** In the Lab, the preparation calls the hook, which resets
  the server, and then runs the predecessors on a tab that was not reloaded, exactly as the trials do today. Until fix
  1 lands somewhere the preparation shares, a predecessor like `switch_store` may fail there. The builder is then
  told "not prepared" and arrives at the (freshly loaded) start, which is honest, but its entry is not prepared.
- The full suites (`pnpm check`, whole vitest) were not run, per the twice-a-day rule.

## Open questions or contradictions found

1. **Fix 1 must reach the entry preparation too.** If fix 1 adds the page load in `service/subflow-trial/run.ts`,
   after `automationStudioCandidateTrialStart`, the preparation will not get it. If it adds it at the head of the
   throwaway root in `flow-bootstrap/verification/detached-subflow.ts`, the preparation gets it automatically,
   because it uses that runner. Recommendation: put it in `detached-subflow.ts`, or in a helper both callers use. If
   it lands in `run.ts`, I (or the next worker) should mirror it in `entry-preparation.ts` after the start.
2. **The supervisor's guidance claims more than Core enforces.**
   `project-agents/supervisor/guidance.ts:37` says Core "permits exactly the lasting acts its parts ask for". That is
   true only for moving money, deleting and sending. It is not my file. Suggested wording: Core "asks the person
   about any money, delete or send its parts do not ask for, and tells the builder when another lasting act falls
   outside them". The brief's DoD wording ("a read-only brief's lasting press goes to the person's gate") likewise
   holds only for those three classes. For `modify_existing`, the user's rule says nobody is asked, so the test
   asserts the note instead. Please confirm that this reading is wanted; I did not treat the DoD wording as the
   user's rule.
3. **Two proposal registries.** `run.ts` (not mine) creates the proposals instance used by assembly and trials.
   `brief-ports.ts` now keeps a second one, fed from the same trial results through each brief's trial port.
   Recommended one-line follow-up: pass `run.ts`'s `proposals` into `automationStudioProjectBuildBriefPorts` and drop
   the inner one.
4. **New file outside the listed paths.** `entry-preparation.ts` is new. It is in `project-build/` beside the owned
   files and touches nothing another worker owns. I made it its own module rather than growing `brief-ports.ts` into a
   catch-all.
5. With fix 3 (the dispatcher stops a waiter whose predecessor is not `done`), the "no passing proposal" path will
   mostly matter for briefs sent again. It stays as the honest fallback.
6. A prepared entry adds the predecessors' acts to the ledger. The supervisor's whole trial then needs a reset first
   (`project.trial_reset_required`), as it already does after any subflow trial's acts. Each dependent brief also
   costs one extra detached run, with no model calls.

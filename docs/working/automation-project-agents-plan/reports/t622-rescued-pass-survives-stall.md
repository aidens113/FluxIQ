# t622 rescued-pass-survives-stall: worker report

## Outcome

Done. The fixes A, B and C from the A8 social debug (`run-mv96rz6h-02502365`) are implemented in Core worktree `fxwork/t622/!FluxIQ` on branch `task/t622-rescued-pass-survives-stall`. Nothing was committed and no live run was started.

## What changed and why

### (A) Every guard-forced end keeps a standing rescued pass (`supervisor/supervisor-loop.ts`, `supervisor/state.ts`)

- `recoveryShortfall()` replaces the old shortfall check, which covered only money, time and turns. A rescued pass now also stands when:
  - the loop threw a stall (`stalled`);
  - the loop returned any other non-ok code (`stalled`);
  - the provider stopped answering (`llm_evidence_loop.provider_unavailable`, reason `provider`).
- Only the person's cancel (`signal.aborted` or `llm_evidence_loop.cancelled`) and a model's own honest ending (`loop.ok`) skip it.
- When it stands, the run returns `candidate`. It records no ending, sends no reset and does not throw the stall.
- `AutomationStudioProjectSupervisorRecoveryShortfall` gains `stalled` and `provider`, each with its own `SHORTFALL_WORDS`.
- `relyOnRecovery` also says "A repair to add that came back without it." when the repair was already short and the build was then stopped by something else. So the person reads both what happened and what stopped the build.
- The header comments in both files say this.

### (B) A result naming the passing test is a completion (`supervisor/completion.ts`, `supervisor/guidance.ts`)

- A result that carries a numeric `revision` and a string `digest` is now judged by the candidate branch whatever else it carries; `ended`, `reason` and any other keys are dropped. The ending branch runs only when no revision and digest are named. A non-matching revision or digest is still refused `project.completion_not_latest`.
- `project.completion_shape` now carries:
  - `complete`: the latest assembly, when one exists;
  - `extra`: the keys to drop.
- Every supervisor refusal carries its own sent-again words under `sentAgainInstead`, using the existing t581 key from `llm/decision-handlers` (imported, not edited), in `GUIDANCE.completion.sentAgain`. So a draftless supervisor is never told to "run the step that is missing".
- The completion schema gained a `description` saying the same thing.
- `GUIDANCE.completion.shape` is reworded. It cannot contain the word "digest", because the guidance test bans it as a scenario word.

### (C) A repair builder is shown its subflow (`dispatch/run-brief.ts`, new `dispatch/accepted-subflows.ts`)

- **Where the accepted proposal lives.** Core keeps the accepted proposal in only two places:
  - the brief's `spend.accepted`;
  - the service's `AutomationStudioProjectBuildProposals` (`service/project-build/proposals.ts`), which is wired in `run.ts`. That file is forbidden here, and the dispatcher input does not reach it.
- **New per-build memory.** `AutomationStudioProjectAcceptedSubflows` lives in a `WeakMap` keyed by the dispatcher input, like `TRIALS`, and keeps the latest 200 entries. It holds each accepted proposal, which comes through the builder loop's `accepted` callback. It also holds the script Core accepted for it, which it reads off the submit tool's own answer (`script`, or `plan`) through an `observe` wrapper composed in front of `ports.observe`.
- **What `repairOf` now carries.** `repairOf` is now async and carries `yourSubflow`. It picks the proposal in this order:
  1. the proposal the failing subflow trial ran (`TRIALS` entries now keep `ran` from the trial result's identity, revision and digest), when that proposal is held;
  2. otherwise, the latest `done` return's proposal of that subflow from the build record, preferring the plan in force.
- **What `yourSubflow` holds.**
  - `revision` and `digest`;
  - `script`, or `plan`;
  - `steps`: each subflow's nodes as Core resolved them (key, node, parameters), which is what each handle stood for;
  - a note telling the builder those handles came from another builder's looks, to find the same controls on its own page, and to keep every other step.
- **When it is not held** (for example, a dispatcher made again), `yourSubflow` names the revision and digest and says the script is not held here.

## Commands run and observed results

All commands ran in `fxwork/t622/!FluxIQ/packages/fluxiq` unless noted. Nothing heavy ran beside them.

- `npx tsc --noEmit -p .` exited 0 (run twice, the last time after all edits).
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: 51 files and 353 tests passed. This was the final run, after all edits.
  - An earlier run had 1 failure: `guidance.test.ts` caught "digest" in `completion.shape`. I reworded it.
- `npx vitest run .../supervisor/tests/rescued-pass-stall.test.ts`: 8 passed.
  - With `supervisor-loop.ts` and `completion.ts` temporarily reverted to HEAD, 7 of the 8 failed. Only the cancel test passed, as expected. The files were then restored from scratch copies.
- `npx vitest run .../dispatch/tests/repair-opening.test.ts`: 7 passed. The first run failed on node ids I had guessed (`web.browser.navigate`); the resolved ids are `web.output.*`, and I fixed the test.
- `node scripts/structure-audit.mjs`, run at the repository root: `structure-audit: passed (363 warning(s), 1156 baselined)`.
  - The first run failed `[failure-as-empty]` on a catch in `latestDone`. I removed it, so a record read failure now propagates and the brief comes back thrown.
  - New advisory warning: `supervisor/state.ts` is now 410 lines, past the 400-line threshold. It was 400 before.

## Tests added

`supervisor/tests/rescued-pass-stall.test.ts` holds the first seven tests below; `dispatch/tests/repair-opening.test.ts` holds the last three.

- **The replay.** A rescued whole-test yes, then the repair coming back with `wholeTestStands`, then six completions `{ended, reason, revision}` with no digest, so each is refused on its shape. Run under `propagateDecisionErrors`, the loop stalls. The test expects:
  - the outcome is `candidate` with `reliesOnRecovery.why: "stalled"`;
  - `loop` is undefined;
  - no record ending, and only the build and repair briefs dispatched (no reset);
  - the shape refusal carries `complete` and `extra: ["revision"]`;
  - the refusal sent again is worded for a completion, not a draft.
- **The run's exact shape** (`{revision, digest, ended, reason}`) is accepted with no shape refusal (`why: "short"`).
- **The provider stops answering after the repair:** the outcome is `candidate` with `why: "provider"`.
- **The person's cancel:** the outcome is `ended`, the recorded ending is `cancelled`, and there is no `reliesOnRecovery`.
- **Completion check (B):**
  - a latest revision and digest with extra words is a completion;
  - an ending with extra keys is refused, naming `complete` and `extra`;
  - a misshapen ending before anything is assembled is refused with `extra: []` and no `complete`;
  - a revision and digest that are not the latest are still refused `completion_not_latest`.
- **`repairOf` (C):**
  - `yourSubflow` carries the latest done proposal's revision, digest, exact script and resolved steps, and its note is checked against the scenario-word regexes;
  - a failing subflow trial's own proposal is shown even when that brief came back blocked;
  - when the subflow is not held, it says so.

## Not verified

- No live or Lab run was made, as the brief says. Whether a live repair builder now keeps its subflow and re-finds its handles is untested.
- The address guard still refuses navigation to an address that appears only in `yourSubflow`'s script. That guard lives in the extension domain (`domain/src/runtime/llm-evidence/node-run/shown-addresses.ts`), outside this brief. The builder can still click its way there.
- `yourSubflow` is only in-process memory. A supervisor or dispatcher restarted on a build under way gets the "not held" note.
- The size of `steps` on a large subflow is not bounded. The parameters are copied whole.
- The `pnpm check` and full-suite gates were not run, per the project's twice-a-day rule.

## Open questions or contradictions found

- **Is a model's own honest ending still allowed to drop a rescued pass?** If the supervisor sends only `{ended, reason}` after a short repair, the completion check accepts it, because a short repair counts as "not done". The build then ends without the passing Flow. That is a model-chosen ending, not a guard, so I left it alone. The rule "a repair that fails never loses a passing Flow" may want this refused once, with the `complete` object. That is the supervisor's call.
- **Person-question stalls.** A stall on a question put to the person (`permission_required`, `user_intervention_required`) is treated as guard-forced, so it now keeps a rescued pass, because it is not the person's cancel. Confirm this is wanted.
- **Advisory line count.** `state.ts` is now past the 400-line advisory threshold.

## Follow-up: the coordinator's two decisions

### Outcome

Done. Both decisions are in the code and tested.

### What changed and why

1. **An honest ending completes on a rescued pass** (`supervisor/completion.ts`, `supervisor/state.ts`).
   - When the model sends a well-formed `{ended, reason}` and a rescued pass stands (`rescuedTest`), the build completes on that pass. It no longer records an ending, and the "ended too soon" and reset-first refusals do not apply. The passing test is the evidence, not the model's words.
   - This works whether or not a repair was tried first.
   - The new shortfall reason `ended` says: "The supervisor ended the build before a repair to add that was made." If a repair had already come back short, that sentence comes first.
   - The person is told the usual "relies on the run's own recovery" words. These are Core's words only; the model's reason is never in them.
   - The model's ending is kept as `reliesOnRecovery.endedWith: {outcome, reason}` on the run's outcome.
   - A person's cancel still ends the build: the loop returns `cancelled` before the completion is read.
2. **Person-question stalls keep the pass** (`supervisor/supervisor-loop.ts`). A stall on `permission_required` or `user_intervention_required` keeps the rescued pass. The header now says so: the person declining a later step is not the person cancelling the build, and the pass was made under what they permitted.

### Tests added (`rescued-pass-stall.test.ts`)

- After a short repair, an honest ending completes on the pass:
  - `why` is `ended`, and `endedWith` holds the model's outcome and reason;
  - what the person is told holds both shortfall sentences and not the model's reason;
  - no record ending is written.
- Before any repair, an honest ending completes on the pass instead of being refused as too soon. Only one dispatch is made.
- A person's cancel at the moment the model ends still ends the build `cancelled`, with no `reliesOnRecovery`.

### Commands run and observed results

All run in `packages/fluxiq` unless noted, with nothing heavy beside them.

- `npx tsc --noEmit -p .` exited 0.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: 51 files and 356 tests passed (353 before, plus 3 new).
- `node scripts/structure-audit.mjs`, at the repository root: `structure-audit: passed (363 warning(s), 1156 baselined)`. The only advisory warning for the changed files is that `supervisor/state.ts` is now 416 lines, past the 400-line threshold.

### Not verified, and open questions

- **The model's reason is not in the build record.** Decision kind `ending` can only be written through `record.end`, which would end the build. The store refuses it otherwise (`project.ending_through_end`, `record/store.ts:207`). `record/**` was outside this brief, so the reason lives only on the run's outcome (`reliesOnRecovery.endedWith`). Putting it in the record needs a record contract change, such as a new decision kind.
- **The service does not use `endedWith` yet.** Nothing in `service/project-build/run.ts` reads it, and that file is forbidden in this brief.

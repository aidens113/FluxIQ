# t590 amend-and-chat-ending: worker report

## Outcome

Partial. Items 2 to 5 are done. Item 1 is done for dispatch order, entry preparation, assembly and the amend's answer.

Item 1 still fails end to end in the real service. After an amend, the dependent's own subflow trial refuses the kept predecessor (`subflow.trial_predecessor_stale`), so the dependent cannot come back done. The refusal is in `service/subflow-trial/run.ts:175` (`unpreparedEntry`), which is outside this brief's files. Neither t588 nor this brief listed that check. Open question 1 gives the change.

All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

## What changed and why

### (1) Keeping proposals across `project.amend_plan`

`project-agents/supervisor/state.ts`:
- The state now keeps every plan and task spec by digest. `load` reads all of the record's plans and task specs, not only the latest.
- New `adopt(plan)` takes a plan into force. It sets the task spec, structure, purposes and `after`, and works out once which done proposals from earlier plans are kept and which are dropped. The result is fixed until the next adopt or load, so it never shifts under a dispatch.
- A subflow's latest done proposal from an earlier plan is kept when all of these hold:
  - the subflow has the same key, role, interface and success check;
  - it carries the same parts, compared as a set, and each part has the same quote, goal facts and lasting acts in the two task specs;
  - the new plan's `after` for it equals, as a set, the predecessors its brief ran after;
  - every predecessor is kept too. This is applied to a fixpoint, so dropping a predecessor drops everything after it.
- Each dropped subflow records why: "its parts changed", "it runs after "x", which is not kept", "it is no longer in the plan", and so on.
- A supervisor restarted on a build under way has no `after` for the plan in force, so it keeps nothing. This is deliberate and conservative.
- New `keptFromEarlierPlans()` and `droppedByEarlierPlans()`.
- `latestDone()` now returns the current plan's done proposals plus the kept ones, in the order their briefs were sent.
- `doneUnderEarlierPlans()` now returns only the dropped set. `dispatch-order` and `dispatch-tool` keep their t588 behaviour.
- New field `resetLeft`, used by item 5.

`project-agents/supervisor/plan-tool.ts`:
- Takes the plan into force through `state.adopt`.
- Calls the new port `ports.kept?.({planDigest, madeUnder})` each time a plan comes into force.
- An amend's answer now carries `proposalsKept: [{subflowKey, briefId}]` and `proposalsDropped: [{subflowKey, why: string[]}]`.
- Its `next` is now `afterAmend`, or `afterAmendWarned` when the plan has warnings.

`project-agents/supervisor/ports.ts`:
- New type `AutomationStudioProjectSupervisorKept`.
- New optional port `kept`.

`project-agents/supervisor/assembly.ts`:
- The `planDigest !== structure.digest` part of `project.assemble_proposal_stale` is removed. The subflow-key checks stay.
- I could not pass assembly a kept set: its only caller, `assemble-tool.ts`, is not in my files. Assembly's proposals already come only from `state.latestDone()`, and `assemble-tool` binds each one to its brief, so the plan check is the state's job. The header says so.

`service/project-build/entry-preparation.ts`:
- New type `AutomationStudioProjectBuildKeptProposals` (`keptUnder(subflowKey, madeUnder, planDigest)`).
- The input's `proposals` may carry `keptUnder`.
- A predecessor is stale unless its plan digest is the brief's, or `keptUnder` says the plan in force kept it.

`service/project-build/run.ts`:
- The build's `proposals` is the same `AutomationStudioProjectBuildProposals` instance, with `keptUnder` added through `Object.assign`. It answers from the latest `ports.kept` message.
- Because it is the same object, `brief-ports.ts` passes it to entry preparation unchanged. I did not touch that file.

### (2) The chat message for a failed project build carries the recorded ending

`service/project-build/run.ts`:
- New private `endedAs(failure, recorded, from)`. It applies only when the record holds a partial or blocked ending, and the failure is one of Core's `AutomationStudioFlowBootstrapGenerationError`s that is not a question to the person (permission or user intervention).
- If the failure already carries an `ending` (budget, unreadable replies, silent provider), its kind and message stay, and Core's "Still on the target from this build: ..." note is appended.
- Otherwise the failure becomes:
  - `flow_bootstrap.build_not_finished` with an `ending` of kind `not_finished`;
  - or `budget_exhausted` with bound `cost`, when the supervisor's loop returned no loop result, which happens only when the purse could not pay for its next call.
- The new ending's message is the recorded reason as one chat line:
  - control characters are collapsed to spaces;
  - Core's bracketed loop codes such as "(llm_evidence_loop.iteration_limit)" are removed, since the codes travel under `issueCodes`;
  - it is fitted to 1000 characters, with the note kept whole and the model's words cut at a sentence end.
- `issueCodes` keep `project.build_<outcome>`, the old code and the old issue codes.
- This covers both places a failure comes from: the `!candidate` branch, and a stall thrown out of the supervisor loop after its ending was recorded. For a stall, the ending is read from the build record.

### (3) `ports.ts`

- `projectLedger` is now `Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief">`.
- The stale doc line is rewritten: start hook first, then per-brief ledgers; an act still to undo holds the test back until a reset comes back; an act no control undoes is kept and the judge is told; every ending names what is left.
- The `instanceof` fallbacks in `whole-trial.ts:68` and `left-on-target.ts:40` can now be removed, but those files are not in my brief, so they are unchanged.
- The test fixture's stand-in now gives `forBrief` from an empty real ledger, to satisfy the type.

### (4) Guidance and tools

`guidance.ts`:
- `DISPATCH` now describes a return as: outcome, reason, what it was given and spent, the proposal's revision, "trials (a list holding one receipt reference for each trial its builder ran)", and any interface change.
- It describes `failingReceipt` (repair only) as "one entry of the trials an earlier return of that subflow listed, the object copied whole".
- It says a repeated reset is not run.
- `AMEND_PLAN` now says what is kept and that the answer lists `proposalsKept` and `proposalsDropped`.
- New strings: `next.afterAmend`, `next.afterAmendWarned`, `refusals.resetRepeatedTest`, `refusals.resetRepeatedEnd`.
- No string names the field "digest", because `digest` is on the guard's Lab-word list.

`tools.ts`: the `failingReceipt` schema is now `{kind: enum of AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS, receiptId, digest}`, all required, with no additional properties.

### (5) Social fix 5: a reset sent again after a blocked one

`dispatch-tool.ts`:
- After the returns, if the call held a reset, it records `state.resetLeft`: the last reset's id, outcome and reason, plus a key of what `left-on-target` reports.
- If that reset came back done, the record is cleared.
- A later call made only of reset briefs is answered `project.reset_repeated` and never run, when all of these hold:
  - the latest brief is a reset that came back;
  - `resetLeft` is that reset's;
  - what is left on the target is unchanged.
- The answer carries `lastReset {briefId, outcome, reason}`, `leftOnTarget [{act, did, brief, undoable}]`, `lastWholeTrialLeftActs`, and the instruction:
  - test the latest assembled Flow, since what a reset could not undo no longer holds the test back, or end honestly;
  - when nothing is assembled: assemble first, or end.
- It is marked `retry_allowed`.
- A whole test in between leaves acts of its own, which changes the key, so the next reset runs. A test covers this.

### Tests

- `supervisor/tests/amend-dispatch.test.ts`: rewritten, 3 tests.
  - The t588 "dropped" case is now driven by a real change to p1's lasting acts, and also checks `proposalsDropped`.
  - A new stub-loop test: an amend keeps `find_titles`; the build is told `kept` (the first plan with nothing kept, then the second plan with `find_titles` made under the first); `place_hold` and `note_shelf` are dispatched on it; assembly lists `find_titles` from brief-1; the outcome is `candidate`.
  - A test of the kept and dropped lists, with transitive dropping.
- `supervisor/tests/reset-repeated.test.ts`: new, 2 tests (the test and end instructions; a reset runs again after a whole test).
- `supervisor/tests/assembly.test.ts`:
  - the stale case is now another subflow's proposal;
  - a new test assembles a proposal with an earlier plan digest.
- `supervisor/tests/guidance.test.ts`: a new test of the trials, `failingReceipt` and amend wording, and of the `failingReceipt` schema. The existing scenario and Lab-word guard covers all the new strings.
- `supervisor/tests/supervisor-fixture.ts`: `forBrief` on the stand-in, and it records `kept`.
- `project-build/tests/project-build-entry-preparation.test.ts`: a new test. An earlier-plan proposal is prepared only when `keptUnder` says it was kept. With no `keptUnder`, or one that returns false, it is stale and nothing runs.
- `project-build/tests/project-build-facade.test.ts`, run through the real service:
  - An `amend` script. The amend answer keeps `first`; `second` is dispatched; its entry-preparation session ends `succeeded`. The step after that (trial, assembly) is an `it.todo` naming the gap.
  - An `ends` script. A failed build's diagnostic parses as `flow_bootstrap.build_not_finished`, and its ending message is the model's reason as one line.
- `project-build/tests/project-build-reset.test.ts`: a new `ends` case. The reset undoes nothing and the supervisor ends blocked. The failure's ending message equals the recorded reason, including "Still on the target from this build: ...".

## Commands run and observed results

All were run in the Core worktree. Nothing could reach a model provider: every provider was a mock.

- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t590-check.tsbuildinfo`, in `packages/fluxiq`: no output, clean.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: `Test Files 38 passed (38)`, `Tests 255 passed | 1 todo (256)`.
- `node scripts/structure-audit.mjs`, at the Core root: `structure-audit: passed (356 warning(s), 1156 baselined).` The only warnings on touched directories were already there: the file counts of `supervisor/` and `project-build/`, and `supervisor-script.ts`'s export count.

## Not verified

- **The amend path end to end.** A dependent's subflow trial after an amend is refused by `service/subflow-trial/run.ts:175`. In the facade amend run the second builder came back `partial` with "its entry was never prepared, because the proposal of "first" was made against another plan". So the real build still cannot finish that path. The stub supervisor test shows the dependent dispatched and assembled, and the facade shows its entry prepared.
- **Untested failure paths.** The stall path (a thrown stall turned into the recorded ending) and the out-of-money path (`budget_exhausted`) have no test of their own.
- **Fitting long messages.** No test covers fitting a message over 1000 characters.
- No live run and no browser. The full suites were not run, per the twice-a-day rule.

## Open questions or contradictions found

1. **A third plan-digest refusal, outside these files.** `service/subflow-trial/run.ts:175`, `unpreparedEntry`, refuses any predecessor whose `planDigest !== scope.planDigest`. t588 (c) said the trial "probably needs no change". That holds for the detached identity, which binds only refs, but not for this check.
   - Smallest fix: give the trial ports a `keptUnder` hook, wired from `service/project-build/subflow-trials.ts:62` to `input.proposals.keptUnder`. That object is the same one `run.ts` now builds. Then accept a predecessor where `keptUnder(subflowKey, predecessor.scope.planDigest, scope.planDigest)` is true.
   - Alternative: put the kept relation on `AutomationStudioProjectBuildProposals` itself (`proposals.ts`, not owned). Then `predecessors(scope)` answers only usable proposals, and `run.ts` can drop its `Object.assign`.
   - Once fixed, the facade `it.todo` can become a real test asserting `status: "proposed"`.
2. **`assemble-tool.ts` is not owned.** So assembly gets no kept set, and I removed its plan-digest comparison rather than relaxing it. If the supervisor prefers an explicit check, `assemble-tool.ts:33` could pass `state.keptFromEarlierPlans()` and assembly could accept a digest that is either the plan in force's or the kept one.
3. **`dispatch-order.ts:376` wording is now partly wrong** (not owned). It still says "proposals made before project.amend_plan no longer count", but some now do. It is said only for dropped subflows, so the case is right; the general clause is not. Suggested: "its done proposal was dropped by project.amend_plan, which changed it".
4. **The `instanceof` fallbacks can go now that the port is widened.** They are in `whole-trial.ts:68` and `left-on-target.ts:40`, both outside my files. Removing them means moving the stand-in-ledger supervisor tests onto the real-ledger fixture, as t586 suggested. The fixture's stand-in `forBrief` exists only for the type.
5. **Every non-ending failure becomes `not_finished`, including a model's honest `blocked`.** The chat title becomes "Build stopped: the Flow is not finished yet". `not_doable` is reserved for a judge's word that the task can no longer be done, so I did not use it for a model-chosen `blocked`.
   - The code also changes for project builds whose supervisor loop hit a limit, for example `evidence_iteration_limit` becomes `build_not_finished` with the old code under `issueCodes`. The Lab's classification of project-build failures may need to read `issueCodes`.
6. **The chat message carries the model's own ending reason.** `build-ending.ts` says ending messages are Core's words and the person's quotes, never something a tool read off the target. The brief asked for the recorded reason, which holds the model's words and the ledger's `did` lines. Worth confirming that this is intended.
7. **`notAsked` changes are not compared.** A kept proposal was judged against the earlier task spec's `notAsked`, and the whole judged run checks the new one. Since the whole judged run covers it, this seemed acceptable.

---

# Follow-up: the coordinator's message

This section replaces item (2) above where the two disagree. The failure code is no longer replaced, and the person is never shown the model's reason.

## Outcome

Partial. Items 2, 3 and 4 are done.

Item 1 is done in `service/subflow-trial/run.ts`, but nothing passes it the new hook yet. That takes two files outside my files, named under open questions. So the facade test is still an `it.todo`: in the real service the dependent's trial still refuses the kept predecessor.

## What changed and why

### (1) The subflow trial accepts a kept predecessor

`service/subflow-trial/run.ts`:
- New type `AutomationStudioSubflowTrialKept` (`keptUnder?`).
- The `ports` parameter of `runAutomationStudioSubflowTrial` is widened to `AutomationStudioSubflowTrialPorts & AutomationStudioSubflowTrialKept`.
- `unpreparedEntry` accepts a predecessor whose plan digest is the brief's, or one `keptUnder(subflowKey, madeUnder, planDigest)` says was kept.
- A proposal the amendment changed, or one from another build, is still `subflow.trial_predecessor_stale`.

### (2) Removed what is now dead

`whole-trial.ts`:
- The `instanceof AutomationStudioSiteResetProjectLedger` fallback is gone. `reset` is always the per-brief ledgers' reset.
- So is the stand-in's rule: the snapshot refusal and setting `wholeTrialLeftActs` from the trial's acts.

`left-on-target.ts`:
- The `instanceof` check is gone; each owner's ledger is asked `claim(act)`.
- New: making a reason (`reason(said)`) tells `ports.leftAtEnding({ note })`, which is Core's line only.

`dispatch-order.ts`:
- `earlier` is now a map of subflow to what changed, which `dispatch-tool` passes as `state.droppedByEarlierPlans()`.
- The refusal now reads: "...had a done proposal only under an earlier plan, and project.amend_plan dropped it: its parts changed."

`state.ts`: `doneUnderEarlierPlans()` is removed; nothing called it any more.

`assembly.ts` and `assemble-tool.ts`:
- Assembly checks the plan again: a proposal counts when it was made under the plan in force, or under the earlier plan that the new `kept` input names for its subflow.
- `assemble-tool` passes `kept: state.keptFromEarlierPlans()`.

`supervisor-fixture.ts`:
- Every build now uses the real `AutomationStudioSiteResetProjectLedger`; the stand-in snapshot and its `acts` are gone.
- `supervisor-loop.test.ts` was moved onto the real ledger:
  - an act's `did` is now the ledger's own, `trial step 1 "press hold for place_hold"`;
  - after a no, a test of the same revision is refused `candidate.trial_unchanged_after_no`, and the trial's act is in the ledger under `supervisor`.

### (3) The failure code stays

`service/project-build/run.ts`: `endedAs` is replaced by `toldEnding`.
- The failure's code and diagnostic are never changed: an honest ending stays `flow_bootstrap.post_provider_validation_failed` with `issueCodes: ["project.build_<outcome>"]`, and a loop or stall failure keeps its own code.
- `flowBootstrapBuildEndingFailure`, `automationStudioFlowBootstrapFailureState` and the `not_finished` / `budget_exhausted` construction are removed.

### (4) Core's words only

`toldEnding` never reads the recorded reason text, only its outcome. Core's note comes from the new `ports.leftAtEnding`, which `run.ts` holds in `left`.
- **A failure with an ending of its own** (budget, unreadable replies, silent provider): Core's note is appended to its message, fitted within 1000 characters. The code is unchanged.
- **Any other failure**: before it is thrown, a chat `note` row is emitted with status `failed`.
  - Its title is Core's sentence for the ending's kind: "The supervisor ended the build: it could not finish the Flow." for blocked, "...with only part of the Flow built." for partial.
  - Its text is Core's note, or "Nothing this build did is still on the target."
- Questions put to the person (`permission_required`, `user_intervention_required`) are left untouched.
- This applies both on the `!candidate` path and on a stall thrown out of the supervisor loop, where the ending is read from the record.

### Tests

- `subflow-trial/tests/run.test.ts`: new. An earlier-plan predecessor is stale when `keptUnder` returns false and runs nothing. It is run and judged yes when `keptUnder` says it was kept; the hook was asked `find plan.0 <scope plan>`.
- `supervisor/tests/assembly.test.ts`:
  - a kept proposal assembles when `kept` names its earlier plan;
  - it is refused stale with no `kept`, with a different digest, or when `kept` names another subflow.
- `supervisor/tests/dispatch-order.test.ts` and `amend-dispatch.test.ts`: the new dropped wording, with what changed.
- `project-build/tests/project-build-facade.test.ts`, `ends` case:
  - the code stays `flow_bootstrap.post_provider_validation_failed` with `["project.build_blocked"]`, and there is no `ending`;
  - the activity hub shows the blocked row with "Nothing this build did is still on the target.";
  - no activity contains the model's reason words.
- `project-build/tests/project-build-reset.test.ts`, `ends` case:
  - the same code;
  - the row's text is exactly Core's "Still on the target from this build: ..." note;
  - no activity contains the model's reason;
  - the record keeps the full reason.
- The facade `it.todo` stays, with its comment updated to name the remaining wiring.

## Commands run and observed results

- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t590-check.tsbuildinfo`: no output, clean.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/service/subflow-trial`: `Test Files 41 passed (41)`, `Tests 272 passed | 1 todo (273)`.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (356 warning(s), 1156 baselined).` No new warnings on touched directories.

## Not verified

- The subflow trial's kept path through the real service. The hook is not wired (open question 1), so the dependent still comes back partial there. The facade test is still an `it.todo`.
- No test covers a failure that carries its own ending (budget or provider), which is where Core's note is appended to its message.
- No test covers the thrown-stall path of `toldEnding`.
- No live run, no browser, no full suites.

## Open questions or contradictions found

1. **Wiring the subflow-trial hook needs two files I do not own.**
   - `service/subflow-trial/types.ts`: add `keptUnder?: (subflowKey: string, madeUnder: string, planDigest: string) => boolean` to `AutomationStudioSubflowTrialPorts`. Without it, `port.ts` and `subflow-trials.ts` cannot pass it: the object literal there is checked for unknown properties. Once it is declared there, `run.ts`'s widened parameter can go back to `AutomationStudioSubflowTrialPorts`.
   - `service/project-build/subflow-trials.ts:62`: add `keptUnder: (subflowKey, madeUnder, planDigest) => input.proposals.keptUnder?.(subflowKey, madeUnder, planDigest) === true` beside `predecessorProposals`, and widen `input.proposals` to `AutomationStudioProjectBuildProposals & Partial<AutomationStudioProjectBuildKeptProposals>`. `run.ts` already passes that object.
   - Then the facade `it.todo` can assert `status: "proposed"` and assembly from brief-1 and brief-2.
2. **`state.wholeTrialLeftActs` is now never set to true.** Only the stand-in branch set it. It is still read by `left-on-target.ts` and by `completion.ts:53` (`left.lastWholeTrialLeftActs`, not mine) and cleared in `dispatch-tool.ts`. It can go once `completion.ts` stops reading it.
3. **The conversational reply does not get the note.** `conversations/commands/build.ts` reads only `diagnostic.ending.message`, so for a failure without an ending of its own it has no note to say. The chat row carries it there instead.
4. Earlier open questions 2 (assemble-tool), 3 (dispatch-order wording), 4 (the `instanceof` fallbacks) and 6 (the model's words in the chat) are resolved by this follow-up. Earlier 5 (every failure becoming `not_finished`) is withdrawn.

---

# Last step: after the coordinator's wiring

## Outcome

Done. Item 1 now works through the real service, end to end.

## What changed and why

The coordinator made two wiring edits, uncommitted in this worktree: `keptUnder?` is declared on `AutomationStudioSubflowTrialPorts` in `service/subflow-trial/types.ts`, and `service/project-build/subflow-trials.ts` passes it. On top of those:

- `service/subflow-trial/run.ts` is back on `AutomationStudioSubflowTrialPorts` alone. I removed my local `AutomationStudioSubflowTrialKept` type, which nothing else used. `unpreparedEntry` now takes `AutomationStudioSubflowTrialPorts["keptUnder"]`.
- `service/project-build/tests/project-build-facade.test.ts`: the `it.todo` is now a real test. It runs the real service with the `amend` script and asserts:
  - the build is `proposed`;
  - the subflow trial sessions are `first succeeded`, then `second succeeded`;
  - the dependent's `core.test_subflow` answer has `"entryPrepared":true` and no `subflow.trial_predecessor_stale`;
  - its dispatch returns done;
  - assembly is `assembledFrom` brief-1 (`first`, kept) and brief-2 (`second`), calling them in that order.
- Before the wiring, the same run failed: the second builder came back partial on `subflow.trial_predecessor_stale` (first report, Not verified).

## Commands run and observed results

- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t590-check.tsbuildinfo`: no output, clean.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/service/subflow-trial`: `Test Files 41 passed (41)`, `Tests 273 passed (273)`. No todo is left.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (356 warning(s), 1156 baselined).`

## Not verified

- No test covers Core's note appended to a failure that has its own ending, or the thrown-stall path of `toldEnding`.
- No live run, no browser, no full suites.

## Open questions

- Still open from the follow-up: `state.wholeTrialLeftActs` is never set to true now. It can go once `completion.ts:53` stops reading it.

# Report: retry-refusals

## Outcome

Done. The gap was real. Four of the refusals carrying `retry_allowed` were defects, all of them in `project.dispatch`. The trial gates' refusals were not stuck. Driving the loop also found three more defects of the same kind on answers that do not carry the word. All are fixed, each test below was run against the real loop and guard, and nothing was committed.

The lead then asked for `project.dispatch_failed` to say what is known of the target; that is done too ("The second request" below). Doing it also found a defect in my own earlier fix, now fixed: told to end honestly, the model's ending was refused as too soon.

**The cause.** The guard keys a call on its input and its page. A supervisor's own tools report no page, and a builder moves the target without the supervisor's loop seeing it. So after one look, the page in the key stands still for the rest of the build, and a refusal about the build stays refused however the build changes.

**A condition on all the supervisor defects.** The supervisor must have made at least one look that reported a page. With no page seen, the guard records nothing and blocks nothing. The web domain's looks should report one (`stateDigestsOnCalls: true`, and `web.find_on_page` is a tool the supervisor keeps). I read that in the code and did not run it in a browser.

## Verdicts

Method: a scripted model through the real `runAutomationStudioLlmEvidenceLoop` and real guard: refusal, what the refusal said to do, then the identical call.

### Refusals carrying `retry_allowed`

| # | Refusal | Where | Told to | Result before the fix | Verdict | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `project.brief_repeated` | `dispatch-tool.ts` | Change what runs before it, change the plan, or end | Did that; identical dispatch refused `repeat_refused`, though Core's own check would have sent it | **Defect** | Dispatch keyed on the build |
| 2 | `project.repair_unchanged` | `dispatch-tool.ts` | Test again | Test ran; identical repair refused `repeat_refused`, though what stands had changed | **Defect** | Dispatch keyed on the build |
| 3 | `project.reset_repeated` | `dispatch-tool.ts` | Test, or end | Test ran; identical reset refused `repeat_refused`, though the code's header says a test lets a reset run again | **Defect** | Dispatch keyed on the build |
| 4 | `project.dispatch_failed` | `dispatch-tool.ts` | "Try again" | Identical call refused `repeat_refused`, and nothing the model can do changes the failure. It also claimed nothing was applied, even after builders ran | **Defect** | Stops inviting it back, and says what is known |
| 5 | `project.trial_starts_in_end_state` | `whole-trial.ts` | Reset brief, then test | Reset ran; identical test ran. Refused with no call between | Not stuck | None. Named in `PRECONDITIONS` |
| 6 | `candidate.trial_starts_in_end_state`, candidate gate, `beforeTrial` | `candidate/trial/gate.ts` | Undo the act, then test | Undo ran; identical test ran | Not stuck | None |
| 7 | Same code, candidate gate, `admit` | `candidate/trial/gate.ts` | Same | Same, with a fake reset port | Not stuck | None |
| 8 | Same code, subflow gate, `beforeTrial` | `subflow/trial-gate.ts` | Same | Same | Not stuck | None |
| 9 | Same code, subflow gate, `admit` | `subflow/trial-gate.ts` | Same | Same, with a fake reset port | Not stuck | None |
| 10 | Same code, subflow gate, `notRun` with `retry: true` | `subflow/trial-gate.ts`, from `single-subflow-trial.ts` | Same | Same. This is the only code that sets `retry` true there | Not stuck | None |
| 11 | Trial answers with a retest left, both gates | both gates | Test again | Retested on the same page up to the bound | Not stuck | None. `ownRetestBound` from the earlier fix holds |

On rows 7 and 9: `admit` always admits today (`project-reset.ts`), so that branch cannot refuse in production. I tested it with a fake port.

### Found while driving these, not carrying the word

| # | Answer | Told to | Result before the fix | Verdict | Fix |
| --- | --- | --- | --- | --- | --- |
| 12 | `subflow.trial_from_step_first` | Run from the failing step | The run passed; identical whole test refused `repeat_refused`. Stuck on that page since t804, not t826 | **Defect** | Added to `PRECONDITIONS` |
| 13 | `project.assemble_refused` | Send the briefs it needs, then assemble again | Briefs came back; identical assemble refused `repeat_refused` | **Defect** | Assemble keyed on plan and returns |
| 14 | Third trial's `not_judged`, both gates, `retestsLeft: 0` | "Test again" | The gate has no retest left to give | **Defect** (wording) | Says to change and resubmit |
| 15 | Third trial's held yes (`yesUnconfirmed`), subflow gate | "Test this same revision again" | Same | **Defect** (wording) | Says to end the brief partial |
| 16 | Third trial with an unprepared entry, subflow gate | "Test this revision again" | Same | **Defect** (wording) | Says to complete blocked |
| 17 | `project.predecessor_not_done` | Send that brief first | Fixed by row 1's key and tested after the fix, so I did not see it fail | Same cause | Dispatch keyed on the build |
| 18 | Offline yes at `retestsLeft: 0` | "Test this same revision again (retestsLeft says how many times)" | Read, not driven. It defers to the count it shows | Left as is | None |

## What changed and why

- **`supervisor/request-keys/build-keys.ts` (new), with its barrel.** It holds what a dispatch's refusals read: the plan, the returns heard under it, what stands, what is left on the target, and whether a reset came back last. `supervisor-loop.ts` hands this to the loop as the tool's `requestContextKey`. That hook already exists: `core.run_flow` and the test tools are keyed the same way. So this adds no mechanism and needs no change to `evidence-loop*`.
- **Assemble has a narrower key.** It uses only the plan and the returns. Assembling changes what stands, so the full key would have moved on every assemble and lost the existing answer from memory.
- **`project.dispatch_failed`.** It no longer sets `retry` and no longer says "Try again". The dispatcher throws for a record it cannot read, hold or write, sometimes after its builders ran, and nothing typed says the failure is temporary. So exempting it would be false, and the words now say to end honestly. See "The second request".
- **`llm/repeat-guard/outcomes.ts`.** `trial_from_step_first` joins `PRECONDITIONS`, with header notes.
- **`llm/repeat-guard/feedback.ts`.** A loop that drafts nothing is no longer told to change a draft on `same_draft`. Keying dispatch made that outcome reachable for it, in domains that use a digest hook.
- **Both gates, plus `subflow/trial-spent-words.ts` (new).** Past the bound, the answers in rows 14-16 no longer say to test again. The new file exists because `trial-gate.ts` went over its 800-line limit.
- **Comments.** `tool-answer.ts` claimed `retry` kept a call from being answered from memory, which has not been true since t826. Corrected, with the `whole-trial.ts` note.
- **Docs.** `failure-control.md` and `llm-flow-bootstrap.md` already had the `ownRetestBound` line. Both now cover the changes above.

**How this meets the brief.**
- A typed fact, never a word: the key is build state, and `retry_allowed` stays a diagnostic that nothing reads.
- A call that did nothing is never exempt: a refused call records a failure under the key, and only a real change moves the key.
- Repeats stay bounded: with nothing changed the identical call is refused unrun, and a test shows the round stalling with one dispatch run.
- No admission, observation or proof mechanism was added.

**One looseness.** `trial_from_step_first` is lifted by any later call that ran, a look included, as the other trial preconditions are. The gate then answers it afresh at no cost, and the no-progress guard bounds refuse, look, refuse.

## The second request: `project.dispatch_failed` says what is known

| Case | `effectApplied` | `targetsUnchanged` | `failure` | Told |
| --- | --- | --- | --- | --- |
| No builder started | `false` | `true` | None | No builder was started and nothing was done on the target; end honestly |
| Any builder started | `true` | `false` | `ambiguous_or_unknown`, effect `ambiguous`, not retryable | Builders began and their effect is uncertain, `leftOnTarget` is only what is on record, do not send those briefs again, end honestly |

**How "started" is known.** `startedBuilders` in `dispatch-tool.ts` reads the build record: the dispatcher records a brief's allowance just before its builder runs, and a failed write starts none. A record that cannot be read counts every brief as started, so the doubt falls on the safe side. I chose this over a new callback on the dispatch port because `project-agents/dispatch/**` is outside my owned paths and the record already holds the fact. The cost is that it depends on that write order, so the tests pin it with the real dispatcher.

**How the fields are read.**
- **The contract:** `ambiguous` means "it may have happened and only the answer is known to be missing" (`contracts/src/failure/record.ts`), and `prior-nodes/unsettled.ts` already builds the same record.
- **`retry-later.ts`:** does not exempt it. It needs `effectApplied: false` and a transient, retryable, `unacted` failure.
- **Repeat guard:** records it as `failed` because `ok` is false, so the identical call is refused unrun.
- **Loop:** `effectApplied: true` moves its mutation count, so earlier looks are not taken as current, and clears the no-progress count once. The refused repeats that follow still stall the round.
- **Refusal run:** does not count this call, because it counts only calls that applied nothing. The guard's refusals still count.
- **`targetsUnchanged`:** no supervisor or loop code branches on it.

**Not retried blindly.** The guard alone was not enough: once another return moved the dispatch key, the same brief ran its builder again (seen failing, below). Each started brief now keeps a blocked return in this run's state, so a later identical brief is `project.brief_repeated`, with a reason saying its effect is uncertain. A brief does run again if what it starts from has changed, such as an amended plan or a rebuilt predecessor. That is the existing rule for any blocked brief, and the model has been told not to.

**The return's two stand-in values.** The kept return has `calls: 1`, because at least its start counts, and `terminalReason: "stopped"`, because the closed list has nothing closer and otherwise the repair-first rule would hold the ending the model was told to make. It lives only in memory and is never written to the record.

**My own defect.** My earlier change told the model to end honestly, but with no earlier failure `completion.ts` refused that as `project.completion_ended_too_soon`. My first version of the test missed it, because the script ran out of turns and the build ended anyway. The test now requires the model's own reason in the ending, and a new `state.dispatchFailed` lets the ending through until a later dispatch returns.

`retry_allowed` is unchanged on the refusals the table shows are not stuck.

## Commands run and observed results

Run from `packages/fluxiq` unless noted. The machine was shared with other lanes.

**Each new test before its fix.** Paths are where the tests were then; they have since moved.

| Tests | Observed |
| --- | --- |
| Supervisor dispatch | `Tests 6 failed \| 3 passed (9)`. Rows 1 (two scripts), 2, 3: `expected [ 'llm_evidence_loop.repeat_refused' ] to deeply equal []`. Row 4: `expected 'The briefs could not be run, so no re… not to match /try again/iu`. The sixth failure was my own wrong assertion on row 5 (the guard answers before memory does), corrected; row 5 is not a defect |
| Both gates | `Tests 6 failed \| 12 passed (18)`. Rows 14-16: four failures, such as `expected 'The trial was not judged, so this rev… not to match /test it again/iu`. The other two were a counter bug in my candidate-gate test (`expected +0 to be 1`), corrected; rows 6-7 then passed with no gate change |
| Row 12 | `Tests 2 failed \| 1 passed (3)`: `expected [ { ok: false, …(7) } ] to deeply equal []` |
| Row 13 | `Tests 1 failed \| 1 passed (2)`: `expected [ { …(3) } ] to deeply equal []` |

**The second request, before its fix**, through the real dispatch tool and real dispatcher (`tests/refusal-retry/tests/dispatch-failed.test.ts`):

| Stage | Observed |
| --- | --- |
| Before any change | `Tests 5 failed \| 1 passed (6)`. Builder started: `expected { …(5) } to match object { effectApplied: true, …(3) }`. Same brief after another return: `expected [ 'brief-1', 'brief-2', 'brief-3' ] to deeply equal [ 'brief-1', 'brief-2' ]`, so its builder really ran again. No builder started: `expected 'The briefs could not be run through t… to match /no builder was started/iu`. The "record cannot say" failure was a test artefact at this stage: the rejected read reached the test's own summary read. The one that passed was the guard refusing the identical call on an unmoved key |
| Answer fixed, ending not yet | After tightening that test: `Tests 1 failed \| 5 passed (6)`: `expected 'The supervisor stopped before a whole… to contain 'The dispatch failed and the build rec…` |

**Not seen failing first:** the `same_draft` wording test in `feedback.test.ts` and the row 17 test were written with their fixes. The "with nothing changed" and stall tests guard existing behaviour.

**Final checks, on the tree as it stands.**

| Check | Command | Observed |
| --- | --- | --- |
| All ten test paths | `pnpm.cmd exec vitest run src/runtime/llm/repeat-guard src/runtime/llm/evidence-loop/tests src/runtime/llm/tests src/runtime/llm/decision-handlers/tests src/runtime/flow-authoring/bootstrap/candidate/tests src/runtime/flow-authoring/bootstrap/subflow-candidate/tests src/runtime/project-agents/supervisor/tests src/runtime/flow-authoring/bootstrap/candidate/trial/tests src/runtime/project-agents/dispatch/tests src/runtime/project-agents/single-subflow --minWorkers 1 --maxWorkers 2 --reporter=dot` | Exit 0. `Test Files 232 passed (232)`, `Tests 1933 passed (1933)`. `outcomes.test.ts`, which holds `does not interpret result codes or reasons as temporary failure facts`, is in that run and unchanged; the dot reporter does not print test names |
| Typecheck, Core root | `pnpm.cmd --filter fluxiq check` | Exit 0, no `error TS`. `"build-cache":"build"`, 26094 ms, so it really ran |
| Structure audit, Core root | `node scripts/structure-audit.mjs` | `structure-audit: passed (482 warning(s), 1098 baselined).` |

The first audit run failed with five violations from my own files: three directories over 25 files, `trial-gate.ts` at 804 lines, and three `dispatch-` files in one folder. I moved the files; `trial-gate.ts` is now 799 lines.

On the second request, the first re-run failed the typecheck (two errors in my new test) and the audit (`as-never`, `failure-as-empty` in `startedBuilders`, `imports`). I fixed those, and every check above ran on the tree after that, in the order typecheck, tests, audit. The only edit since is this report.

## Not verified

- **No live, browser, Lab or paid run**, as the brief requires. Whether a real supervisor's look reports a page is read from the code.
- **No recorded run shows these.** A search of the extension's `docs/working` for `project.dispatch` or `project.assemble` beside `repeat_refused` found nothing. The search was a simple pattern over the reports, so that is weak evidence either way. Each defect is shown only by a scripted model sending the identical call, and a real model may reword `reason` or `summary`, which would avoid it.
- **An assembled Flow refused (`GUIDANCE.refusals.composedRefused`) and `project.plan_missing`.** They share the keys, but I did not drive them.
- **Downstream.** The web extension was not typechecked or tested. No Core contract changed; the changes are model-facing words and keys.
- **Domains using a digest hook** rather than digests on calls: the `same_draft` wording has a unit test, but no loop run in that mode.
- **Full suites** were not run, as the repository's rule requires.
- **A build resumed after a failed dispatch.** The kept return and `state.dispatchFailed` live only in this run. A supervisor started again on that record sees an allowance with no return, and nothing refuses that brief.
- **A failed reset brief.** It gets the same uncertain answer, and the guard refuses the identical call, but I did not drive one. `project.reset_repeated` does not cover it after a whole test, which is the existing rule.
- **The earlier builders' acts.** `leftOnTarget` reports what the ledger holds. The test has none, so its listing with real acts was not driven.

## Open questions or contradictions found

1. **Where "started" is tracked.** It is read from the record rather than reported by the dispatch port, to stay inside my owned paths. A callback on the port would not depend on write order, but it needs `project-agents/dispatch/**`. If you want that shape, it is a small change.
2. **`retry_allowed` stays on rows 1-3 and 5-11 as a diagnostic.** Nothing reads it. Removing it is possible, but existing gate tests assert it.
3. **The guard's own note** still says "A call that runs after the page has changed is not a repeat". For a dispatch that is true but incomplete. I left the shared wording alone.
4. **A test outside the acceptance command.** `candidate/trial/tests/refusal-retry.test.ts` sits beside its subject, so the brief's command does not match it. I ran it separately, as the table shows.
5. **`effectApplied: true` on an uncertain call** means "may have applied", not "applied". The field is a plain boolean, so `failure.effect: "ambiguous"` is what carries the uncertainty; `prior-nodes/unsettled.ts` records its uncertain calls with `false` in the guard only, so the two differ. I followed your instruction not to claim nothing was applied, and `reset.moved` in the gates already pairs a refusal with `true`.
6. **Audit warnings** read 482. The earlier report saw 477 in another tree. I did not check how many are mine, and `.structure-baseline.json` is off limits.
7. **Package version.** Not bumped, as briefed.

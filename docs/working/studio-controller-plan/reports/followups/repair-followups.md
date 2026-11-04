# Repair follow-ups (t854)

## Outcome

Done. All three leftovers from `repaired-run-rows.md` are closed, with no follow-up that needs the user. Nothing is committed. Nothing has run live, as the brief required, so none of this has been seen on a real task.

| # | Leftover | Result |
| --- | --- | --- |
| 1 | A build paid for and then declined | Fixed. A run where a stated lasting act landed now asks no model for a repair: no build, and no ladder either |
| 2 | A read's own target override thrown away | Fixed. It reaches a judged continuation and is kept only if that run answers. Part of the seam stays refused (listed below) |
| 3 | Other refusing codes | Three codes were on the wrong route and now go to the re-author. `core.result.change_not_proven`, the code the brief named, was not on the ladder at all and is correct as it is |

Fixing these exposed three further defects, all fixed: a second repair attempt was declined on steps that stated nothing, a lasting step in a pass after the first could be missed, and any target override's trial could have a lasting act repeated by its resume.

The coordinator sent back the three things my first report left, all now closed (section 4): a read whose every row was refused now has a route that can fix it, the `run-ending.ts` comment is true, and `package-boundaries.md` has its note. That work also found the t848 test harness failing by the clock, which is fixed.

## What changed and why

### 1. Not paying for a build that will be declined

**The check** is `automationStudioRerunPreflight` (`service/runtime-adaptation/rerun/preflight.ts`). It reads the same graph through the same function as the re-run, and applies the same lasting-act test. Both re-author routes ask it before they spend. The re-run keeps its own check as a guard.

**I also skip the ladder on a refuted run, which goes beyond the brief's wording.** A patch on a refuted run can only be kept by a re-run from the start, and that re-run would be declined, so the ladder's diagnosis and patch calls would be paid for nothing. The real-store test shows `repairCalls(taskKinds)` is `[]`.

**What the person sees** is unchanged: "it saved 3 rows, but the check found they don't answer what you asked, and the fix wasn't run: that would repeat what this run already did." The run records `adaptiveRetry.notResumableCode: repair_rerun.lasting_act_may_have_landed`, and `resultRepair` settles with outcome `not_rerun`. The live feed also gets a line: "Not repairing the Flow: running it again would repeat what this run already did".

**No `resultReauthor` marker is written.** No re-author was attempted, and `run-ending.ts` reads a marker with nothing held as "the repair changed nothing, and the saved Flow is unchanged", which would hide the real reason.

**A read that fails stops nothing.** The check answers `{ unread: "session" | "graph" }`, which is distinct from `{ clear: true }`. A store read that failed once should not give up a repair, and the re-run still answers for it if it fails again.

### 2. A read's own target override

**Why it was refused, and what that protects.** This was deliberate. `mvp-week2-automation-loop-plan/reports/w2-4-resume-point.md` (2026-09-17, in the extension repo) calls it "the most debatable call here" and gives the reason: "1 row captured where 50 were owed, carry on" is the optimistic default that phase existed to remove. Nothing writes a declared minimum, so rows prove the read returned something, not that it returned what was owed. It protects against a partial read becoming the answer unchecked. At that time a verified trial could also be kept on its own; since t249 nothing is applied until a judged run.

**So I kept the refusal and narrowed what it covers.** `resumable` is still false, and the trial still does not vouch for the rows. The one unknown a judged run can answer now has its own code, `records_minimum_undeclared`. A target override or inserted steps carrying that code get `awaitsJudgedRun`, the run carries on, and only the judged yes keeps the fix.

| Part of the seam | Now |
| --- | --- |
| Rows captured, no minimum declared, nothing else unknown, target override or inserted steps | Judged continuation |
| Any patch kind in that state other than those two | Refused, under `records_minimum_undeclared`. t267's rule for what a judged run can vouch for is unchanged |
| A read that captured no rows (`records_none_captured`) | Refused, `check_unknown`: no rows observed nothing |
| A count that cannot be read (`records_count_invalid`) | Refused, `check_unknown` |
| An expected state nobody evaluated, or any other unknown beside the rows | Refused, `check_unknown` |
| The trial went past the change and did something lasting | Refused: no retry at all |
| No resume point | Refused, `no_resume_point` |

**Verification is not weakened.** The trial records what it always recorded. A judged no leaves the Flow as stored; the test proves it. A run nothing judges stays unapplied (`not_judged`), and reports `succeeded` and unverified, which is what t267's path already does.

**A defect this surfaced, which was already there.** The trial is the run's continuation: it runs from the changed node to the end, and a resume then goes over that ground again. `actedLastingly` was only computed for inserted steps, so a target override with a lasting step after it would have repeated that step on resume. It now counts for every patch kind, reading only the attempts a resume would take again. Inserted steps still count whole, because a judged re-run takes them again too. Such a trial is not carried on from.

### 3. The refusing codes

"Ladder could fix it" means: can a reroute, a recovery Subflow call or steps inserted before a node fix this kind of failure? The read then runs as authored, under the same schema, so none of them can add a missing step or change what a step reads.

| Code (`core.result.`) | Verdict, basis | Run | Went to | Ladder could fix it? | Now goes to |
| --- | --- | --- | --- | --- | --- |
| `does_not_answer_request` | no, model | Fails | Re-author | No | Re-author |
| `computed_fact_failed` | no, Core | Fails | Re-author (t848) | No | Re-author |
| `required_values_missing` | no, Core | Fails | **Ladder** | No: it cannot change what a read stores | **Re-author** |
| `every_record_refused` | no, Core | Fails | **Ladder** | No: same schema, same refusal | **Re-author** |
| `requested_output_missing` | unsure, model | Fails | **Nothing** | No: the records need a step that stores them | **Re-author** |
| `verdict_absent` | unsure, model silent | Fails | Nothing | Not applicable | Nothing: nobody judged it |
| `verdict_unavailable` | unsure, unavailable | Fails | Nothing | Not applicable | Nothing: nobody judged it |
| `unreadable` | unsure, unavailable | Fails | Nothing | Not applicable | Nothing: nobody judged it |
| `verdict_unsure` | unsure, model | First call only | Asked again | Not applicable | Asked again |
| `verdicts_disagree` | unsure, disagreed | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `refutation_unconfirmed` | unsure, unconfirmed | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `refutation_contradicted` | unsure | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `refutation_unsupported` | unsure, unconfirmed | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `exclusion_evidence_missing` | unsure, unconfirmed | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `change_not_proven` | unsure, unconfirmed | Keeps status, unverified | **Nothing** | Not applicable | Nothing |
| `build_yes_disagrees` | unsure, disagreed | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `yes_citation_refuted` | unsure | Keeps status, unverified once two calls settle | Nothing | Not applicable | Nothing |
| `answers_with_change_advised` | yes, or unsure and unconfirmed | Passes or unverified | Nothing | Not applicable | Nothing |
| `answers_request`, `no_refuted_by_record` | yes | Passes | Nothing | Not applicable | Nothing |
| `no_model_available`, `verification_did_not_finish` | not performed | Keeps status, unverified | Nothing | Not applicable | Nothing |
| `nothing_to_judge`, `no_records` | historical | Nothing writes them | Nothing | Not applicable | Nothing |

**The brief's premise about `change_not_proven` does not hold.** It says this code goes to the ladder. It goes nowhere, and that is right. It is `model_unconfirmed`, so the run does not fail. `automationStudioRefutedResultAttempt` builds no attempt from it, and the port is only entered with an attempt. `held.ts` states the intent ("nothing fails a run on it, and no repair is built from it"). Its `siteChange` summary comes from the build's own trial, whose judge sends it back to the build. A test pins all of this. So "Others still go to the ladder" was true only of `required_values_missing` and `every_record_refused`.

**`requested_output_missing` was the worst of the three.** It fails the run and nothing repaired it: `attempt.ts` refuses any `unsure` because "a repair planned from it would be a change to a Flow on evidence that nothing was wrong". That reasoning does not fit this one, because Core holds typed evidence. Its origin (`run-mveba82m-fd0616dc`: the Flow read three values one by one and stored no record set) is a missing step. Only this `unsure` now builds an attempt; every other one still builds none, with a test.

**`required_values_missing` had been named before.** The extension's `debugs/run-munnop9n-5475d593.md`, row 8, recorded "The ladder's patch kinds cannot reorder or filter an extraction" and left it open.

**`every_record_refused` is rarely reached.** A read's capture fails at the step (`record_output.records_refused`, `engine/automation/records/capture.ts`), so the result check is never asked. The route is still right for any other writer of those counts. The step failure has its own route: section 4.

**What holds the lists.** `refuted-result/tests/refusing-codes.test.ts` scans every `core.result.*` written under `result-verification` and requires each to have exactly one place, so a new code fails until it is routed. It also fails on a new file that writes a no, and it makes each re-author code with its real writer. The `not_a_wrong_answer` refusal is now only the fail-closed answer, since no code that builds an attempt lacks a route. The ladder's remaining ways in are `flow_unavailable` and a re-author that ended before its first decision, under the same purse and attempt limits as before.

### Two defects found while building item 1

**A later pass was read against the wrong graph.** The re-run read every attempt on the trace against the stored Flow, but a held edit's pass ran another graph. That had two opposite effects:

- A domain step the stored Flow lacks counted as lasting, so a second repair attempt was declined after its build, on steps that stated nothing. With the check now before the build, this would have silently ended every repair after the first on any Flow whose re-author added a step.
- A `builtin.` step the stored Flow lacks did not count, whatever it stated, so a lasting act could have been repeated.

Each pass now reads its own attempts against the graph it ran and leaves its word on the session (`repairRerunPasses`). The first pass is still read against the stored Flow.

**A trial's lasting act was on no trace.** A trial is not part of any pass, so a later re-run from the start could not see what it did, for instance where a second patch was still waiting. Its receipt now says `actedLastingly`, and the check reads that.

### 4. A read whose every row was refused

**Which I found: both, and the first is the normal case.** It is repairable by a different read, and the route now handles the case where it is not.

**The fix is usually a change to the step.** The capture's own comment gives the live case (`run-mueqynzb-ac54aab9`): "the schema beside it declared a column the page can only ever hand back as text as a number". The Flow declares that schema itself, so refused rows mean the step's read and its fields disagree. The capture marks the failure `retryable: false` because "what has to change is the Flow".

**What happened before, traced through the real ladder:**

| Stage | Observed |
| --- | --- |
| Step | Failed, `record_output.records_refused`, category `output_not_observed`, `records.required_missing` |
| Diagnosis | One paid call. `candidateKind: expectation_wait_retry` |
| Patch kinds offered | `temporary_wait_retry`, `add_handler`, `replace_unit` |
| Result | No fix. `repairFailedStep` handed the run back as `not_target_level`, so no build was ever tried |
| What the person read | "it wasn't allowed", from the word `refused` in the code, on the step's row, and a bare "Run failed" |

A wait reads the same rows, so it cannot help. An in-run `replace_unit` could in principle replace the read, so I left the in-run repair asked first, and my earlier "no route can fix it" overstated this.

**What changed:**

- **Route.** The failed-step re-author now takes this one code (`AUTOMATION_STUDIO_RECORDS_REFUSED_CODE`, `step/failure-target.ts`). Other `output_not_observed` failures stay with the ladder, with a test, because a later moment may show them.
- **Limits.** All of that route's limits apply: the ladder must have reached a model, a person's question or a cost bound stops it, one re-author per run, the purse, and the lasting-act preflight. Each has a test.
- **One deliberate difference.** A patch whose trial was contradicted does not block this route, because a wait that read the same rows showed nothing, and its adaptation is rejected. For any other failed step the rule is unchanged, with a test.
- **Brief.** The build is told what actually happened, not "the site has changed". It is told to fix what the step reads or how its fields are read, never to drop or loosen a field the request needs, never to fill a field with a value the site did not give, and to say so if the site's rows do not hold what is needed. The wording is generic.
- **Words.** The step's row now says "the rows it read didn't fit the fields this Flow stores". The final row says "every row it read was refused by the fields this Flow stores, and ...", followed by what became of the repair.

**When it truly cannot be repaired**, the build ends `not_doable`, nothing is kept, and the person reads: "every row it read was refused by the fields this Flow stores, and the repair found no way to read them that fits." A failed step whose fix was declined for a lasting act reads: "a step failed, and the fix wasn't run: that would repeat what this run already did."

**What holds the route.** `refuted-result/tests/records-refused-route.test.ts` makes the code with the real capture and pins the route, its limits, its neighbours and the brief. Three real-store tests in `repair-followups.test.ts` cover a repair that is kept, a lasting act that stops the build, and a repair that finds nothing.

### 5. The other two

- **`run-ending.ts` comment.** It now says no fix usually exists, because the preflight runs first, and that the sentence claims only that none ran.
- **`package-boundaries.md`.** Three added bullets under the existing "target override" entry's "Added" list, tagged t854, and nothing reformatted (`13 insertions`, no deletions). They cover the `verified` marker, `records_minimum_undeclared` and `actedLastingly`.

### 6. The t848 harness failed by the clock

**This is a test defect I found, and it would have hit any lane.** `repaired-run-harness.ts` declared token limits on an unpriced mock. The run budget then reserves a call's worst case at the default model's rates in force now, which double at peak hours (01:00-04:00 and 06:00-10:00 UTC on weekdays), and that reaches the whole ceiling. A second model call is refused, so a judge's second ask never goes out and the run is left `unverified`.

`repaired-run-rows.test.ts` on the harness as it stood, at 01:1x UTC: `Tests 10 failed | 2 passed (12)`. The same file passed in my earlier runs, which were off-peak. With the limits removed it passes, so these tests no longer depend on the time of day.

This does not show that a real run is affected. A real provider prices its own reply, and the reservation is narrowed by that price. I did not test that path.

### Files

- **Moved, because the audit's naming rule asked:** `changedFlow` and the decline codes left `repair-rerun.ts` for `rerun/flow.ts`.
- **`service.ts`:** still 4304 lines; both edits are on existing lines.
- **Docs:** `automation-studio.md` (route table, the pre-build check, the judged continuation, the resume codes) and `automation-studio-native-nodes.md` (what a read override's held rows are).
- **Model-facing text:** no wording changed. A build repairing `requested_output_missing` is told Core's existing sentence for it, through the brief's existing verdict line. That sentence names the build's own declared parts and columns, not a scenario.

## Commands run and observed results

All in the Core worktree, with `--minWorkers 1 --maxWorkers 2` on every vitest run.

**Baseline, before any edit:** the acceptance directories gave `Test Files 97 passed (97)`, `Tests 1152 passed (1152)`.

**Seen failing first:**

| Item | State when it failed | Observed |
| --- | --- | --- |
| 1 | Unchanged code, real store | `expected [ 'evidence_tool_decision', …(2) ] to deeply equal []` |
| 2 | Unchanged code, real ladder | Receipt had `"notResumableCode": "check_unknown"`, `verification { basis: records, status: verified }` and no marker; the next test showed `expected { attempted: false, …(1) } to match object { attempted: true }` |
| 2, lasting act past the read | Unchanged code, real ladder | `expected [ { …(15) } ] to match object [ { …(3) } ]`: no `retryOriginalAction: false, actedLastingly: true` on the receipt |
| 3, route list | The new codes taken out of the list, then restored | `expected [ Array(24) ] to deeply equal [ Array(21) ]`; `expected [ …(5) ] to deeply equal [ …(2) ]` |
| 3, real store | The same | `expected { routed: false, …(4) } to match object { routed: true, applied: true }` for `required_values_missing` |
| Later passes | The session's word ignored, then restored | `expected true to be false` (the second attempt declined); `expected false to be true` (a lasting `builtin.` step missed), twice |
| 4, refused rows | Unchanged routing, real ladder | `expected [ 'runtime_diagnosis' ] to include 'evidence_tool_decision'`; `expected undefined to deeply equal { attempted: false, …(1) }`; `expected undefined to match object { routed: true }` |
| 6, the clock | The harness as it stood, at peak | `Tests 10 failed \| 2 passed (12)` |

**My real-store test of `every_record_refused` failed for a different reason than I expected.** It showed the capture failing at the step, which is what section 4 traces. The second-attempt test passes on the old code too, because the scripted re-author keeps the read's node id, so the evidence for that defect is the unit test, not the real store.

**Final checks, all on the final code.** The only edit after them is this report.

| Command | Observed |
| --- | --- |
| `packages/fluxiq`: `pnpm.cmd exec vitest run src/runtime/adaptation src/framework/automation-service/service/runtime-adaptation src/framework/automation-service/service/adaptations src/framework/automation-service/service/datasets src/runtime/automation-activity/wording src/ui/activity-action/tests/failure-reason.test.ts --minWorkers 1 --maxWorkers 2 --reporter=dot` | `Test Files 122 passed (122)`, `Tests 1466 passed (1466)`, exit 0 |
| Root: `pnpm.cmd --filter fluxiq check` | exit 0 |
| Root: `node scripts/structure-audit.mjs` | `structure-audit: passed (487 warning(s), 1097 baselined).`, exit 0 |
| Beside the changed code, same flags: `src/framework/automation-service/tests/refuted-result`, `tests/service-adaptation`, `tests/live-patch-target-override.test.ts`, `tests/live-patch.test.ts`, `tests/policy-action-target-repair.test.ts`, `tests/in-run-repair`, `tests/training-modes.test.ts`, `src/runtime/result-verification/tests/run-outcome`, `service/runtime-session`, `service/summaries`, `src/runtime/conversations/commands` | `Test Files 87 passed (87)`, `Tests 696 passed (696)`, exit 0 |

These all ran inside a peak window, which is the condition the harness used to fail in. The audit is one warning up on t848's report: `reauthor.ts` is now past the 400-line advisory (422 lines) and has 12 exported values, past the 8-value advisory. Neither fails. `service.ts` stays at 4304 lines. An earlier acceptance run failed on one test of mine, whose fixture already carried a repair marker; I fixed the fixture and re-ran everything above. I passed explicit paths throughout, so no run started the whole package.

## Not verified

- No live, Lab or browser run, as required.
- **A held edit that really adds a step, through the real store.** The second-attempt defect is proven at the unit level only (see above).
- **`requested_output_missing` through the real service.** Tested from its real writer through the repair entry and the brief, not through a service run, because the harness has no saved build declaration.
- **A real `not_doable` ending through the real store.** The scripted build completes without an edit, and that test holds the sentence's opening. The `not_doable` wording is tested from the marker a failed build writes, not from a scripted build reaching that ending.
- **The in-run `replace_unit` fixing refused rows.** I left it asked first and did not script it. The route's tests have the diagnosis ask for no patch.
- **A judged run that never comes.** A read override on a run where no judge can be had ends `succeeded`, unverified, with the fix unapplied. That comes from reading the settle code and t267's tests, not from a new test of this path.

## Open questions and contradictions

Nothing here needs the user. Decisions I made, and what the lead may want to pick up:

1. **Edits outside the owned list.**
   - `service/datasets/tests/repaired-run-rows.test.ts` pinned the old behaviour (a build made, then rejected), so item 1 forced a change.
   - `service/datasets/tests/repaired-run-harness.ts` gained two options and lost its token limits.
   - `runtime/result-verification/run-outcome.ts`: two lines. Its gate reads whether the route takes a failure, before it reads the store, so section 4 could not work without it. I renamed `targetLevel` to `reauthorable` rather than leave a name that was no longer true, and kept the comment beside it true.
   - `ui/activity-action/failure-reason.ts` and its test: one row, because "it wasn't allowed" was false and section 4 asks that the person be told plainly.
   - `run-ending.ts`'s sentence for a failed step, and its test, go past the comment you named, for the same reason.
2. **The refusal code `not_target_level`** keeps its name, though the route now also takes refused rows. It is a recorded code, so I did not rename it.
3. **A wait-and-retry patch verified by rows** is still discarded, under `records_minimum_undeclared`. I kept t267's list of what a judged run can vouch for, as the brief asked only for overrides.
4. **Another build that will always be declined.** A held re-author with no selected Subflow is always refused at its re-run (`held_reauthor_unsupported.no_selected_subflow`). The preflight does not ask this, as the brief named the lasting-act check. It only affects legacy single-graph runs.

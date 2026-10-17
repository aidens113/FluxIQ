# t688: repair lane reruns carried steps

Worker report. Brief: t688-repair-lane-reruns-carried-steps. Core worktree `fxwork/t688/!FluxIQ`, branch `task/t688-repair-lane-reruns-carried-steps`. Nothing committed.

## Outcome

**Partial.**

- (a) is fixed.
- (b) is fixed.
- (d) is traced as far as the trees this worker may edit.
- (c) is fixed for the two duplicated steps I traced to their cause: the navigate and the Pickup filter.
  - The third duplicate, the second read, is not traced to its cause (see Open questions).
- The largest cause behind the 15 one-at-a-time reruns is a separate Core defect in files outside my ownership. Every round stall drops the carried steps' scheduled candidates. It is reported below with the exact fix, and I did not change it.

## What changed and why

The paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### (a) Step 1 `cannot_run_again`: Core now runs the saved first step itself

**Trace.**
- Repair round 0 seeded every saved step with a scheduled candidate.
- The playback run had captured no start for the Flow's first node, the home-page navigate.
- `dry-run-gate.ts` therefore found `noStart` and refused both completions `full_run_required`, step 1 `cannot_run_again`:
  - 0079 → 0080
  - 0085 → 0086
- The round stalled (`unusable_decisions`).
- The rerun of step 1 that the refusal asked for (0088) ran where the page stood (`start_page_unknown`). It recorded that page as the start, so dry run 1's reset (0217) went to the filtered search URL and then sent the same navigate.

**Fix.**
- New `flow-draft/starts-where-it-stands.ts`, exported from the barrel. When the first sent step is an unchanged carried step run as its scheduled candidate, and no start was captured for it, the test sends it where the target stands with no reset. That is how the saved Flow's own playback starts.
- Wired into three places:
  - `flow-draft/dry-run.ts`: `automationStudioFlowDraftReplayable`, which also lets the round-end test run.
  - `llm/node-tools/dry-run-gate.ts`: `noStart`.
  - `llm/node-tools/replay-draft.ts`: no reset call in this case.
- The following are still refused as before:
  - a first step changed since it was seeded;
  - a step this build ran with no `from`.
- The retry, actionability and permission paths are unchanged. Steps are sent through the same executor, and lasting steps are still only verified.

### (b) Page loop next page after "no next page"

**Trace.** There are two separate defects.

1. Dry runs 1-3 (0225-0232, 0260-0267, 0294-0301) sent the next page once for each of the read's 8 rows. Step 14 was `repeat over 13`, a list repeat, written at 0184. Pass 2 answered `core.replay.ended`, and passes 3-8 sent it again. A list or while span never stopped on `ended`.
2. The rerun of step 14 at 0120 put back its place and did the do-while read step 13 again, alone, through `step-place.ts` → `automationStudioFlowDraftReplaySteps`.
   - The run stopped before step 14, so the do-while's members were `[13]` and the ender was the read itself.
   - The loop therefore ran to the Repeat default of 50 passes: `rerun.14.place.13.pass.1..50`, steps 0123-0172, about 2 minutes.

**Fix in `llm/node-tools/replay-span.ts`.**
- In a list or while span, a member that answers `ended` ends the loop and is never sent again. Its status stays `failed`, because a next page done once per row is not the Flow's page loop.
- A do-while that the run cuts off before its `through` step is not planned as a loop, so its steps are sent once.
- A do-while's own last-member `ended` behaves as before.

### (c) Duplicated steps

**Navigate (draft step 15) and Pickup (draft step 16).** Two decisions added them:
- 0095 `core.run_node` navigate with `add: true`. It was driven by the round-1 resume's stale `notRunInThisBuild: [1,2,9,10,11,12,14]`; step 2 had already been rerun at 0092.
- 0108 Pickup with `add: true`, after 0105's `run_by_the_loop` refusal, which offers "run an offered tool as a new call with add true".

Both were appended after the page loop. `flow-draft/second-copy.ts` rule (a) did not catch them, because they started from other page states.

**Fix.** New rule (c) in `flow-draft/second-copy.ts`. A step joining the Flow is a copy of a kept step carried from the Flow being changed when all of these hold:
- the kept step is `f<n>`, or a rerun whose `standsFor` is `f<n>`;
- both have the same node parameters (canonical key order, declarations ignored);
- a kept mutating step lies between them.

"+" pressed twice in a row is still no copy. The copy stays `taken`, through the existing `second_copy` refusal.

**Root of the stale list: not fixed, outside my ownership.** Every round-stall site deep-copies the draft with `structuredClone`, which drops scheduled candidates by design (`scheduled-candidate/tests/candidate.test.ts` "does not lend correspondence to … deep copied steps"). The four sites are:
- `llm/evidence-loop.ts:317`
- `llm/decision-handlers/refusal-run.ts:56`
- `llm/decision-handlers/refused-repeat.ts:119`
- `llm/decision-handlers/searching.ts:56`

Downstream effects:
- `round-ending.ts` `stallCopy` and `judgement.ts` `automationStudioFlowBootstrapRepairSeed` then copy from clones that already lost them.
- So every carried step became `not_run_in_this_build` after round 0 stalled (resume at 0095), and the model reran them one at a time.

Fix: at those four sites, use `const copy = structuredClone(step); if (step.scheduledCandidate !== undefined) { copy.scheduledCandidate = step.scheduledCandidate; automationStudioFlowDraftCopyScheduledCandidate(step, copy); }`, as `stallCopy` does.

**Second read (draft step 17 in dry runs 2-3).** Not traced to its cause.
- Evidence: the `keptStepCount` of 0243 went from 16 to 17 when the round-4 rerun of step 13 (d27) was itself rerun. The round-4 seed then held a 17th proposed step, a read identical to step 13.
- An isolated probe of `automationStudioLlmEvidenceRerunReplaced` on a rerun of a rerun (`llm/evidence-loop/rerun-replacement.ts`, not owned) did not reproduce it. I deleted the probe.

### (d) Trace for the silent 5 minutes

**What the run files show.**
- The reauthor attempt's `durationMs` is 538873, so it ended at about 23:44:59, right after dry run 3. It ended `not_finished` with `noRoute: no_progress`.
- `core.log` has nothing after 23:44:08. Tests and phase transitions were never traced.
- The Lab settled at 23:50:02 (events 81-82).
- So the silence came after the reauthor build returned. It is either in the repair port's caller (`result-verification/run-outcome.ts`, another worker's tree) or on the Lab side. The run files cannot say which.

**Trace added.** Each line uses `[FluxIQ build-trace]` and code-only values:

| File | Lines |
| --- | --- |
| `llm/node-tools/dry-run-gate.ts` | `dry-run start/end attempt= ok= steps= reset=` |
| `flow-bootstrap/unfinished-build/phases.ts` | `round end round= kind= stopped=`, `round-test start/end test=`, `round next`, `build ending round= kind=` |
| `service/runtime-adaptation/refuted-result-port.ts` | `result-repair start/end`, `reauthor-build start/end edit= code=`, `patch-ladder start/end` |

A next stall will show whether the repair returned. If `result-repair end` is followed by silence, the next trace belongs in `result-verification/run-outcome.ts` after the repair port returns. That is another worker's tree, so I did not edit it.

### Tests

**New behaviour tests.** Each of these failed with the fix reverted (observed run below):
- `flow-draft/tests/starts-where-it-stands.test.ts` (new);
- `flow-draft/tests/second-copy.test.ts` (rule c);
- `llm/node-tools/tests/replay-draft.test.ts` (no reset for a carried first step);
- `llm/node-tools/tests/replay-draft-loop.test.ts` (`ended` ends a list loop; a do-while cut short is not looped);
- `llm/node-tools/tests/dry-run-gate.test.ts` (dry-run trace);
- `flow-bootstrap/unfinished-build/tests/never-run-whole.test.ts` (round trace);
- `service/runtime-adaptation/tests/refuted-result-port.test.ts` (repair trace).

**Existing tests changed** to match the intended new behaviour:
- `replay-draft.test.ts`: the "start" case was removed from "refuses missing or invalid %s".
- `draft-from-flow.test.ts`: a first step with no captured start is now replayable.

## Which of the 21 refusals each change prevents

| Refusals | Steps | Prevented by |
| --- | --- | --- |
| `full_run_required` (2) | 0080, 0086 | (a), directly. |
| `repeat_refused` (5) | 0098, 0100, 0102 (step 2 navigate again); 0214, 0216 (step 12 again) | Not by (a) directly: they happened in rounds 1-2, driven by the stale `notRunInThisBuild` list that the stall's candidate loss caused. (a) removes the round-0 stall that started them. The stall-copy fix above (not made) prevents the list after any stall. (c) would have refused 0095's duplicate add. |
| `repeat_body_is_routed` (1) | 0187 | Not prevented. It followed the model's `14 repeat over 13` (0184), which Core's own `next` hint in the 0183 `changes_nothing` refusal suggested (`llm/draft-amendment-feedback.ts:444`, not owned). (b) only removes that wrong loop's cost: 6 extra next-page sends per test. |
| `changes_nothing` (13) | 0078, 0082, 0084, 0183, 0191, 0193, 0195, 0247, 0249, 0251, 0281, 0283, 0285 | None directly. The model resent the step-13 sponsored-condition rerun that was already applied. 0078 came before the first completion. Counterfactually, with (a) the 0079 completion would have been tested and judged, so the 12 after it would probably not have occurred. |

(b) also removes the 50-pass read (0123-0172), which is not counted among the refusals.

## Commands run and observed results

Run in `fxwork/t688/!FluxIQ/packages/fluxiq` unless noted.

**Typecheck.**
- Command: `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t688-check.tsbuildinfo`
- Result: `TSC_EXIT=0`, run after the final edits.

**Changed directories.**
- Command: `npx vitest run src/…/runtime/flow-draft/tests src/…/runtime/llm/node-tools/tests src/…/runtime/flow-bootstrap/unfinished-build/tests src/…/runtime/service/runtime-adaptation/tests`
- Final result: `Test Files 86 passed (86)`, `Tests 950 passed (950)`.
- The first run had 1 failure: `draft-from-flow.test.ts` "refuses a first step with no captured start…". It asserted the old refusal, so I updated it as stated above.

**Adjacent tests.**
- Command: `npx vitest run …/flow-draft/carried-step/tests …/flow-draft/scheduled-candidate/tests …/flow-draft/amendment/tests …/runtime/tests/refuted-result …/llm/tests/evidence-loop-seeded-draft.test.ts …/llm/decision-handlers`
- Result: `Test Files 36 passed (36)`, `Tests 242 passed (242)`.

**Fix-off check.**
- I reverted the 7 source files with `git checkout --` after backing them up to scratch, then ran the 7 new or extended test files.
- Result: `Tests 8 failed | 123 passed (131)`. The 8 failures were exactly the new behaviour tests: second-copy rule c, starts-where-it-stands, the no-reset replay, both page-loop tests, and the three trace tests.
- I then restored the sources from the backup.

**Structure audit.**
- Command, from the Core root: `node scripts/structure-audit.mjs`
- First run: 4 violations, all mine:
  - an `as never` cast;
  - 26 files in `unfinished-build/tests`;
  - a non-barrel import;
  - statement packing.
- I fixed all four. Final result: `structure-audit: passed (393 warning(s), 1155 baselined).`

## Not verified

- No live or Lab run. Whether the first carried step sent with no reset behaves on the real web host is not exercised. Neither is how a repair now proceeds without the step-1 refusal.
- Whether the 5-minute silence was in Core (`run-outcome.ts` after the port) or in the Lab.
- The cause of the duplicated read: the 0243 `keptStepCount` 16→17.
- The stall-copy candidate loss is inferred from code and from the resume entry at 0095. No test was written for it, because its sites are outside my ownership.

## Open questions or contradictions found

1. **The debug note's "the read ran once and the next-page step ran 8 times".** Correct in count, but the cause is a list repeat over the read's 8 rows, not a loop that lost its ended exit. The do-while was replaced by `14 repeat over 13` (0184) and then `13 unrepeat` (0188), prompted by Core's own hint in `llm/draft-amendment-feedback.ts:444` ("If it is the act done to one row step 13 kept, the repeat goes on it: send {"step": 14, "change": "repeat", "over": 13}"). That hint was offered for a next-page step that was inside step 13's do-while span. It needs an owner: either the hint should skip a step inside an existing repeat span, or the amendment should refuse it (a new refusal reason needs feedback text in that same file).
2. **Stall clones drop scheduled candidates.** These sites are outside my ownership and outside the three forbidden trees: `llm/evidence-loop.ts:317`, `llm/decision-handlers/refusal-run.ts:56`, `refused-repeat.ts:119`, `searching.ts:56`. The `round-ending.ts` header (t274-c4b) assumes the stall hands over the loop's own steps, but each site hands over clones.
3. **Trace placement.** I added trace lines in `flow-bootstrap/unfinished-build/phases.ts` and `service/runtime-adaptation/refuted-result-port.ts` under "the trace for (d)". If another worker owns either file, the edits there are trace-only (about 10 lines) and easy to rebase.

# t689: the single-subflow path keeps the conditions Core's record kept

Worker report. Branch `task/t689-single-path-keeps-standing-no`, worktree
`C:/Users/osrs_/FluxStuff/fxwork/t689/!FluxIQ`. Nothing committed.

## Outcome

Done, with one change of approach from the brief, explained under "Open questions".
The coordinator's follow-up decision (repair briefs inherit kept conditions) is also
applied; see "Follow-up". A single-subflow builder's gate now remembers the conditions
the judged whole run's record kept. The builder's own controller then refuses, once, a proposal that drops
one, the same way it does on a plan of several subflows. The supervisor's candidate
gate is unchanged.

## What changed and why

**Cause, confirmed.** `answerOf` (`project-agents/single-subflow/single-subflow-trial.ts`)
built the builder's trial result only from the whole gate's evidence. The whole
candidate gate takes `standingNo` from its port's raw result in `ask` and uses it up
there: it is not in the evidence and not in what `standing()` returns. So the builder's
gate (`subflow-trial-gate.ts` ~:399, `keptConditions.remember`) received no record, the
verdict it kept had no `keptConditions`, and `scoped-submission.ts` / `candidate/submission.ts`
`keptDropped` found nothing to hold. Composed submissions are never held to kept
conditions either (`submitComposed` passes `holdKept = false`), so nothing on the
single path refused the drop.

**Why `standingNo` itself cannot be carried from the owned paths.** The raw
`standingNo` exists only inside the whole gate's private `ask`
(`flow-bootstrap/candidate/trial-gate.ts`) and in the service's whole-trial port
(`service/project-build/whole-trials.ts`). Neither is in my owned paths, and the brief
says to keep the candidate gate unchanged. What the whole gate does expose is
`standing(complete).keptConditions`. It builds that list from the same record, read
against the composed Flow. Kept conditions are matched by how each condition is
written (canonical JSON), and assembly copies step parameters unchanged, so the list
applies directly to the builder's proposal.

Files:

- `project-agents/single-subflow/single-subflow-trial.ts`: after the whole test, `keptOf`
  reads `gate.standing(complete).keptConditions`. It renumbers each condition to the
  proposal of this subflow that its whole revision was assembled from: this brief's
  where this brief made it, otherwise an earlier brief's (see "Follow-up"). It leaves
  out any condition whose whole revision no proposal of this subflow made. `answerOf` then sets
  `trial.keptConditions` on every judged answer, including an empty list, so that a
  condition the whole gate took out again is dropped by the builder's gate too. Header
  paragraph (t689) added.
- `project-agents/single-subflow/assembled-from.ts`: `madeOf(revision)` reads back which
  proposals a whole revision was assembled from, by its number alone, because a kept
  condition names its revision only by number. It is backed by a `byRevision` map
  filled in `note`.
- `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts` (the seam): `ask` reads a
  `keptConditions` list from the port's result (`carriedKept`, which keeps only
  well-formed entries). On a trial whose entry was prepared, `test` replaces its
  `carriedKept` list with that one. The kept conditions on each verdict are now the
  gate's own memory plus the carried ones, each written condition once (`withCarried`).
  Nothing new appears in the model-facing evidence. Header paragraph (t689) added.
  When no port carries the field, as on the multi-subflow path, behaviour is unchanged.

Tests (new):

- `project-agents/single-subflow/tests/gated-single-build.ts`: the supervisor fixture's
  build on a registry with one list-read node. Its builder submits through the real
  scoped controller with its gate's history and tests through the real
  `AutomationStudioSubflowTrialGate` over `AutomationStudioProjectWholeTestPort`. The
  whole trial port's result carries a `standingNo`, as the service's port does.
- `project-agents/single-subflow/tests/single-subflow-kept-condition.test.ts`, 4 cases:
  1. The first test (the whole run) is judged no and keeps condition 1. The next
     proposal, which drops it, is refused with `candidate.kept_condition_dropped`. The
     same drop sent again is accepted, and the build completes.
  2. The condition is named by the builder's revision (2), not the whole Flow's (1).
  3. Repair inheritance (see "Follow-up").
  4. Field-by-field parity between what the builder's gate stands for a scoped trial
     and for the single-path test (details under "Open questions").
- `flow-bootstrap/subflow-candidate/tests/kept-condition-carried.test.ts`, 3 cases:
  1. Carried conditions are kept, never shown to the model, and a drop is refused once.
  2. A later prepared trial's list replaces them; a trial whose entry was not prepared
     leaves them as they were.
  3. They sit beside the gate's own memory with no duplicates, and the gate's own copy
     wins.
- `project-agents/single-subflow/tests/assembled-from.test.ts`: `madeOf`.

## Commands run and observed results

- `node_modules/.bin/tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`): exit 0, no output.
  It also passed earlier, before the tests were added.
- `node_modules/.bin/vitest run src/.../project-agents src/.../service/project-build src/.../flow-bootstrap/subflow-candidate src/.../service/subflow-trial`
  -> `Test Files 105 passed (105)`, `Tests 634 passed (634)`, Duration 131.87s.
- Fix-off check: I disabled only `if (kept) trial.keptConditions = kept;` in
  `single-subflow-trial.ts` and ran `single-subflow-kept-condition.test.ts` (2 cases at
  that point). Both failed: `expected { partial: true, …(8) } to match object { verdict: 'no', …(1) }`
  and `field keptConditions: expected undefined to deeply equal [ { …(4) } ]`. I then
  restored the file from a scratch copy and confirmed with grep that the edit was gone.
- `node scripts/structure-audit.mjs` (worktree root): `structure-audit: passed (393 warning(s), 1155 baselined).`
  The only warning on a touched file is the advisory file-lines warning for
  `subflow-trial-gate.ts`, now 592 lines. It was 557 before, so it was already past
  the 400-line advisory.

## Not verified

- No live or Lab run. I did not replay the towels-like debug run `run-mvblov2i-abb7d82e`.
- The full Core suite was not run (per the brief).
- Kept steps (t666, `kept-step-hint.ts`) on the single path: they are read from the
  trial's `feedback`, which the single path already carries. I did not test whether
  their node ids from the whole Flow resolve against the builder's proposal.
- The fixture's repair builder does not number its revisions on from the build brief's
  (`revisionsAfter`, t658), as the real dispatcher does. An inherited condition is named
  by the build brief's revision, which in a real repair is at or below the revision the
  repair starts from. Here it is the same number as the repair's own first revision.
  The refusal is asserted only by its code, not by its revision words.
- The case where a whole revision was made by no proposal of the subflow (that
  condition is left out) is not tested.
- A repair's first proposal is held to inherited conditions only after its own first
  test. Before that test the brief has no trial result for its controller to read,
  which is the same as a scoped brief before its first test.

## Open questions or contradictions found

1. **The brief asks to carry `standingNo`. That is not reachable from the owned paths.**
   I carried the whole gate's kept conditions, which are derived from it, instead.
   Effects, compared with carrying the record:
   - (a) The controller refusal the brief targets works, as tested.
   - (b) The t633/t634 contradiction weighing is already done by the whole gate, across
     every brief of the build. Weighing the same record again in the builder's gate
     would count it twice.
   - (c) The dispatcher's cross-brief `standingNos` (from `weighed`) gets nothing on the
     single path. The whole gate covers that role for the supervisor run.

   If the supervisor wants the raw record carried anyway, it needs either an accessor on
   the candidate gate or a capturing wrapper on the whole trial port in
   `service/project-build/whole-trials.ts` or `supervisor/dispatch-tool.ts`. Both are
   outside this brief.
2. **Fields that differ on purpose in the parity test** (asserted there):
   - `feedback`: the whole test's own feedback, plus `wholeTest` and `complete`.
   - `acts`: the whole run's acts are recorded under the supervisor by the whole trial
     port. Carrying them would record them twice.
   - `trialRunId`: each run has its own id. Both sides have one.
   - The raw result's `standingNo`: see item 1.

   All other fields of the kept result are equal: `partial`, `scope`, `identity`,
   `revision`, `digest`, `verdict`, `entryPrepared` and `keptConditions`.
3. **Earlier briefs' conditions.** Settled by the coordinator; see "Follow-up". The
   single path now inherits them. The scoped multi-subflow path still keeps only its
   own trials' conditions.

## Follow-up (coordinator decision: repair briefs inherit)

The coordinator decided that on the single path a repair brief rebuilds the same
subflow, and Core keeps conditions from any trial (t633, t644). So a single-path brief
inherits conditions shown on whole revisions from earlier briefs of the same subflow
key. Raw `standingNo` carrying is not needed.

- `single-subflow-trial.ts` `keptOf`: the filter by brief is gone. A condition is named
  by the proposal of the same subflow key that its whole revision was assembled from:
  this brief's if this brief made it, otherwise the earlier brief's. A whole revision
  made by no proposal of the subflow is still left out. The header paragraph is updated.
  The scoped path (`subflow-trial-gate.ts` own memory, `dispatch/trial-port.ts`) is
  unchanged.
- `tests/gated-single-build.ts`: `scripts` may now be a per-brief function. A builder's
  return lists its trials as receipts, and a partial return names its last proposal, so
  the supervisor can send a repair with a `failingReceipt`.
- New case in `single-subflow-kept-condition.test.ts`, "holds a repair brief of the
  subflow to the condition the build brief's judged run kept, refusing its drop once":
  1. Brief 1's judged whole run is no, and its record keeps condition 1.
  2. The supervisor dispatches a repair brief of the same subflow, citing brief 1's
     receipt.
  3. The repair's first proposal keeps the condition. Its whole run is judged no and
     carries no record. Its gate still stands condition 1, named by brief 1's revision.
  4. The repair's next proposal drops the condition and is refused with
     `candidate.kept_condition_dropped`.
  5. The same drop sent again is accepted, its test answers yes, and the build completes.
- Filter-on check: I removed only the `?? from[0]` fallback, which brings back the
  by-brief filter, and ran the test file. The new case failed (`expected { partial: true, …(8) } to match object { verdict: 'no', …(1) }`)
  and the other 3 passed. I restored the file from a scratch copy and confirmed it with
  grep (count 1).
- Reruns after the change:
  - `tsc --noEmit -p tsconfig.json`: the first run found one test-only type error, the
    receipt fields as `JsonValue`. After a cast in the test, exit 0 with no output.
  - `vitest run` on the same four directories: `Test Files 105 passed (105)`,
    `Tests 635 passed (635)`, Duration 157.53s. This ran before that type-only cast; the
    test file rerun after the cast shows `Tests 4 passed (4)`.
  - `node scripts/structure-audit.mjs`: `structure-audit: passed (393 warning(s), 1155 baselined).`
    The only warning on a touched file is still the advisory line count for
    `subflow-trial-gate.ts` (592 lines).

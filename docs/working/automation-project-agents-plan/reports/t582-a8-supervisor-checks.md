# t582 report: a8-supervisor-plan-checks-and-reset

## Outcome

Done. Bigbox debug fixes 7 (plan checks) and 10 (reset before an honest ending) are in Core's project supervisor. Each has stub tests, and no live run was made.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/supervisor/`.

### Fix 7: plan checks (`plan-input.ts`, `plan-tool.ts`, `guidance.ts`)

The plan reader returns `warnings: [{code, path}]` beside a written plan. The write_plan / amend_plan answer carries `warnings` with an `instruction` for each one. When a warning is present, `next` becomes `GUIDANCE.next.afterPlanWarned`, which says to amend the plan before any brief if a warning applies.

- **`project.plan_value_unused`** (path `subflows.N.outputs.M`): an output that no other subflow takes as an input.
- **`project.plan_subflow_constraint`** (path `subflows.N`): in a plan of two or more subflows, a subflow whose parts have no lasting act and which hands nothing on.

**Why warnings and not refusals.** From the plan alone, Core cannot tell the cases apart:
- An unused output may be exactly what the Flow hands back to the person. The existing test "makes one subflow with an output callable too" is such a plan.
- A subflow with no act and no output may be a read the person asked for, whose rows go to the run dataset. The fixture's own `note_shelf` is one. Or it may be a part that only says what must stay unchanged.

A refusal would forbid correct plans. A language heuristic on the goal facts would be fragile and would not be generic.

**What the plan check cannot catch.** In bigbox, the later subflows did take `storeName` as an input; it was their steps that never read it. The plan cannot show that, so `project.plan_value_unused` would not have fired on that value. Only the guidance addresses it. `project.plan_subflow_constraint` would have fired on `preserve_cart`.

Guidance changes (generic, from the lending-library example):
- Way of working, step 1: a part that only says what must stay as it is goes under notAsked and gets no subflow.
- Step 2: hand a value on only when a later step uses it. Something an earlier subflow leaves on the target (a chosen branch, a page left open) is expressed with `after` alone.
- The example gains a line explaining why `titles` is handed on, and shows "leave my other holds as they are" going under notAsked.
- The write_plan description mentions the warnings.
- New entries: `warnings.valueUnused`, `warnings.constraintSubflow` and `next.afterPlanWarned`.

### Fix 10: reset before an honest ending (`completion.ts`, new `left-on-target.ts`, `state.ts`, `supervisor-loop.ts`)

- **`left-on-target.ts`** (new, one export, not barrelled, as with `brief-input.ts`): `automationStudioProjectSupervisorLeftOnTarget(ports, state)` gives:
  - every act the ledger holds in place, plus whether the last whole trial left acts;
  - whether a reset could undo any of it;
  - a note in Core's words: "Still on the target from this build: <did>; <did>." An act that cannot be undone is marked "(cannot be undone by FluxIQ)";
  - `reason(said)`, which adds the note to a reason and keeps it within 2000 characters. When something has to be cut it is the model's text, never Core's note.
- **`completion.ts`**: an `ended` completion is refused with `project.completion_reset_first` (listing `actsInPlace`, and `lastWholeTrialLeftActs` when true) as long as all of these hold:
  - acts are in place;
  - a reset could undo them;
  - the latest brief sent was not a reset that came back.

  The refusal is given at most `MAX_HELD_FOR_RESET = 2` times, so a reset that cannot be dispatched does not hold the build until its ceiling. An ending that is accepted always gets the note added to its reason.
- **`state.ts`**: new `resetCameBackLast()`.
- **`supervisor-loop.ts`**: endings the loop writes itself (out of money, cancelled, stopped short) also name what is left. An ending from the model already has the note, so it is not added twice.
- Guidance: way of working step 7 says to dispatch a reset brief before ending, and that Core adds what is left to the reason. New entry `completion.resetFirst`.

### Tests

**`tests/plan-input.test.ts`**, four new tests:
- a clean plan gets no warning;
- an unused value is warned at `subflows.0.outputs.1`, and the plan is still written;
- a subflow with no act and no output is warned as a possible constraint at `subflows.2`;
- a one-subflow plan is never warned as a constraint.

**`tests/supervisor-loop.test.ts`**, three new tests and one updated:
- The ending is held until a reset came back. `actsInPlace` names `act-1` / "pressed hold for place_hold" / `brief-2`, the act is undone, and the reason is the model's own.
- After two holds, the ending goes through with the reason "The shelf is not shown. Still on the target from this build: pressed hold for place_hold.", and the record's ending holds the same text.
- The write_plan answer carries the constraint warning, and `next` names `project.amend_plan`.
- Updated "completes only on a yes": its judged-no trial left acts, so the end is now held once (`project.completion_reset_first` added to the expected codes). A reset is dispatched before the final end.

The guidance guard test is kept unchanged and passes.

## Commands run and observed results

Run from `packages/fluxiq` in the Core worktree unless noted.

- `npx vitest run src/programs/automation-studio/runtime/project-agents/supervisor`
  - First run: 1 failed, 58 passed. My new warnings test had only one decision, so the plan's answer was never shown to a decision. Fixed by adding a second decision.
  - Rerun: "Test Files 9 passed (9); Tests 59 passed (59)". This includes `guidance.test.ts`, the guard against teaching to the test.
- `npx vitest run src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/role-tools.test.ts` (the other suites that drive the supervisor): "Test Files 9 passed (9); Tests 29 passed (29)".
- `npx tsc --noEmit -p .`: exit 0, no output.
- `node scripts/structure-audit.mjs` (Core root): "structure-audit: passed (356 warning(s), 1156 baselined)". The supervisor directory has two advisories:
  - directory-files: 25 files, which was already past 15 before this task;
  - exported-values in `tests/supervisor-script.ts`, which is unchanged.

## Not verified

- No live run and no provider call, as the brief requires.
- I have not shown whether a real model amends its plan on a warning; warnings are advisory.
- The full Core suite was not run (narrow checks only, per the repository rule).
- The downstream sibling was not touched or checked.

## Open questions or contradictions found

- The brief asks for the plan to refuse or warn on "an interface value no later subflow takes". In bigbox the value *was* taken by the later subflows; it was their steps that never read it. Catching that needs a builder-side check: an input declared by the brief and read by none of the submitted proposal's steps. That would live in `flow-bootstrap/subflow-candidate` (scoped submission), which this brief does not own. It is a candidate follow-up beside fix 9.
- I did not add a refusal for "takes a value only a later or unordered subflow hands on" (no `after`). Existing plans and tests rely on brief predecessors rather than the plan's `after`, so a refusal would change behaviour that is accepted today.
- The supervisor directory is at 25 files against an advisory of 15; a split (for example a `completion/` or `plan/` subdirectory) is outside this brief.

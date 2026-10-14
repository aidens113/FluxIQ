# t598 no-hook-trial-undo: a trial's lasting act is tied to its own item, and Core's own steps leave none

Worker report. Core worktree `fxwork/t598/!FluxIQ`, branch `task/t598-no-hook-trial-undo`, on `9b4c5a38`.
Nothing is committed. No model provider was called. No Lab or live run was made.

## Outcome

Done, against the brief's definition of done. The Core side is complete and tested. On a site with no start hook, a trial step's lasting act is now
recorded with the place its control sat in (`spot`) and the items it created, the same way an explored act is. So a
reset can undo it by item. The stub test the brief asked for passes. Open question 3 is decided: Core ignores the
declaration.

Live it does nothing yet, for one reason. The trial path holds no item tokens today, so Core reads them from new keys
on the step's state diff. The web domain's `inspectStateDiff` does not write those keys yet (Open questions, item 1).
Until it does, a web trial's act is recorded exactly as before, with no item.

## What changed and why

### Where the item tokens come from

- A trial runs no declaration through the build's permission gate. Its trace also has no `startState` reads.
- So the only record of a step's page before and after it is the host runtime's state diff on the attempt,
  `attempt.stateRefs.stateDiff`, which `inspectStateDiff` writes. That is "the step's start-state diff" in the brief.
- Today the web diff has only lines: `added`, `removed`, `documentChanged`, and so on. It has no item tokens.
- I defined two optional keys on that diff, in the forms a declaration and a `startState` read already use:
  - `spot: { item?, dialog? }`: where the step's control sat on the page before it.
  - `items: { before: string[], after: string[] }`: the item tokens each of the two pages listed.
- I chose the diff over a Core-side `startState` read around each trial step for two reasons:
  - The other way needs the binding plumbed into the trial's graph options (`service.ts`), which is outside my brief.
  - It would also add two page reads to every lasting trial step.

### `service/candidate-trial/landed-acts.ts`

- Each act now carries `spot` and `created` when the step's diff gives them. The new exported type is
  `AutomationStudioCandidateTrialLandedAct`, which is `AutomationStudioCandidateTrialAct` plus the place.
- `created` follows exploration's positive-evidence rule (t475/t479). An item counts as created only when all of
  these hold:
  - the step stayed on its document;
  - the page before it listed its items;
  - that list did not have the item;
  - no earlier step of the same trial had shown it.
- A token that does not match the declaration's opaque-token pattern is dropped. A list with even one bad entry is
  not read at all.
- **Open question 3: ignored, not refused.** A step of Core's own node that acts on nothing outside the run
  (`builtin.*` whose `automationStudioNodeSideEffectClass` is `none`, such as a wait) is never a lasting act, whatever
  it declares.
  - Why ignore: nothing on the site carries such an act, and no undo could ever be tied to it. Recording it made every
    reset name it under `cannotUndo`.
  - Why not refuse: the refusal would belong in plan validation or `scoped-submission.ts`, outside this brief.
  - A Core node that does reach outside is read as a domain step is: `builtin.policy.action` (a recorded action) and
    `builtin.database.*`.
  - This rule replaces t593's blanket "never `builtin.*`" exclusion for possibly lasting steps. So a recorded action
    that declared `[]` and changed its page in place is now possibly lasting too.

### `flow-bootstrap/site-reset/contracts.ts`, `ledger.ts`

- `AutomationStudioSiteResetTrialAct` gains `AutomationStudioSiteResetTrialActPlace` (`spot?`, `created?`).
- `trialRan` records them in the act's `spot` and `createdItems`. `target()` then admits an undo of a trial's act:
  - on a created item (`on: "created"`, with its one unasked delete);
  - or on its own spot (`on: "own"`).
- Everything else about the act is unchanged:
  - a trial's act with neither field is recorded as before;
  - another item is still refused `candidate.undo_wrong_target`;
  - a start hook still absorbs the act and names it, as before.
- The ledger header gained a t598 paragraph.

### Trial paths

- No edit was needed in `subflow-trial/run.ts`, `entry-preparation.ts` or `whole-trials.ts`. Each one passes the
  landed acts straight to its ledger's `trialRan`.
- The subflow gate passes `answer.acts` on as it is, so the new fields reach the ledger.
- The whole-candidate gate (`flow-bootstrap/candidate/trial-gate.ts`, `trialActs`) copies each act field by field and
  drops the new ones. So candidate-mode trial acts are unchanged, as the brief asked.

### Fixtures and tests

- `service/project-build/tests/project-build-reset.test.ts`, the DoD test, on the recipe site, which has no hook:
  - The subflow's save is now the site's own `domain.isolated.save-recipe` node, registered through a native runtime.
    The project's domain is `isolated`. It saves `recipe:rye-loaf`.
  - A stub host runtime (`boxDiffs`) snapshots the box around each step and writes `items: {before, after}`.
  - The builder's trial leaves act-1, which carries `created: ["recipe:rye-loaf"]`.
  - The reset agent undoes act-2 (the explored save, on its own item) and then act-1, on the trial's created item. It
    names nothing under `cannotUndo` and comes back done with `lastingActsInPlace: 0`.
  - The whole trial then runs and saves its recipe again. `pressed` is exactly:
    `run Save rye-loaf, Save herb-bread, Unsave herb-bread, Unsave rye-loaf, run Save rye-loaf`.
  - Expectations for the box, for the box when judged, and for the "ends" case follow from this.
  - The header explains it. The shop cases are unchanged: that shop has no state diff, so its trial's add still names
    no line.
- `project-build-brief-ports.test.ts`: a part that asks a lasting act now runs the stub domain's `domain.isolated.save`
  node, registered through a native runtime, with the project's domain set to `isolated`. The expectations are
  unchanged: the hook puts back `["act-1", "act-2"]`.
- `landed-acts.test.ts` has two new cases:
  - spot and created under positive evidence: no list before, a move to another document, a bad token, and items an
    earlier step had shown;
  - a Core wait declaring `create_new`, or `[]`, is not answered, while `builtin.policy.action` is.
- `ledger.test.ts` has a new describe block with three cases:
  - an undo is admitted on a created item and on the act's own spot, and other items are refused;
  - a trial's act is undone, and the next trial admitted, once an undo of it on its created item lands;
  - a start hook absorbs and names these acts as before.

## Commands run and observed results

All were run in `C:/Users/osrs_/FluxStuff/fxwork/t598/!FluxIQ/packages/fluxiq`, with `R=src/programs/automation-studio/runtime`,
unless noted.

1. After the source change, before any fixture change, I ran
   `npx vitest run $R/flow-bootstrap/site-reset $R/service/candidate-trial $R/service/project-build $R/project-agents`.
   - Result: `2 failed | 66 passed (68)` files and `2 failed | 524 passed (526)` tests.
   - The two failures were the builtin-wait fixtures that open question 3 named: brief-ports' hook case and the
     recipe reset case.
2. After the fixtures and new tests, I ran the same command.
   - Result: `Test Files 68 passed (68)`, `Tests 531 passed (531)`.
3. I proved that the DoD test depends on the change.
   - I temporarily made `ledger.ts` `trialRan` pass no spot and no created items, then ran
     `npx vitest run .../project-build-reset.test.ts -t "refuses the whole trial"`.
   - Result: `AssertionError: expected [ 'run Save recipe:rye-loaf', …(3) ] to deeply equal [ …(4) ]`, and
     `1 failed | 6 skipped`. The undo of the trial's recipe was refused, so it never ran.
   - I then restored the file from a backup and confirmed it with grep.
4. `npx tsc --noEmit -p tsconfig.json`:
   - First run: one error, because the stub host runtime lacked `capabilities`. I fixed it.
   - Final run: exit 0, no output.
5. I reran `.../project-build-reset.test.ts` after that fix: `Tests 7 passed (7)`.
6. I ran the adjacent sets: `npx vitest run $R/service/subflow-trial $R/flow-bootstrap/candidate $R/flow-bootstrap/subflow-candidate $R/flow-bootstrap/tests`.
   - Result: `Test Files 44 passed (44)`, `Tests 379 passed (379)`.
7. `node scripts/structure-audit.mjs` (Core root): `structure-audit: passed (360 warning(s), 1156 baselined)`. That is
   the same count t597 reported. The warnings on files I touched are advisory line counts, and each file was already
   past 400 lines:
   - `ledger.ts`: 462;
   - `ledger.test.ts`: 525;
   - `project-build-reset.test.ts`: 556.

## Not verified

- No live or Lab run. The web domain writes neither `spot` nor `items`, so live trial acts still carry no item.
- The full Core vitest run and `pnpm check`, per the twice-a-day rule.
- The trial-reset fixture (t578/t597, `project-build-trial-reset.test.ts`) was left as it was. It binds no host
  runtime, so its trial acts still carry no line and are named under `cannotUndo`. It still passes.
- Whether a saved (withheld) trace would hide `stateDiff.items`. `TRACE_DATA_KEYS` withholds `stateDiff` by value in
  persisted traces. `landed-acts` reads the executed trace, as its existing `added`/`removed` checks already did.

## Open questions or contradictions found

1. **Downstream must write the new diff keys before this works live.** This crosses into the web domain
   (`domain/src/runtime/host-runtime.ts` `inspectStateDiff`, `state-diff/state-diff.ts`). Its snapshots already hold
   the page records that `startState` turns into item tokens (`llm-evidence/control-spot`, `webControlSpotToken`).
   - `items.before` and `items.after`: the record tokens of each snapshot.
   - `spot`: `webTargetSpot(beforePage, the node's target handle)`.
   - Core's host-runtime boundary doc (`runtime/host-runtime.ts`, `inspectStateDiff`) should also name these two keys.
     That file was not in my brief.
2. **A Core wait that declares `create_new` still passes `subflow.lasting_act_missing`.**
   - `scoped-submission.ts` `lastingOf` counts any declared step. So a subflow can still satisfy its part's asked act
     with a wait, which now leaves nothing to undo or report.
   - Refusing that declaration there, with the same `automationStudioNodeSideEffectClass` rule, would close the gap.
     The file is in `flow-bootstrap/subflow-candidate/`, outside my brief.
3. **The drawer risk, as in exploration.**
   - A step that opens a cart drawer on the same document shows lines that were there before the build. Its `before`
     page did not list them, so they would count as created.
   - Exploration has the same exposure, but it also filters out every item any read of the build had seen. A trial
     filters only within its own steps.
   - I did not add a build-wide filter. The web domain's tokens are per record, so a trial that re-adds the product
     exploration added and then undid would get the same token, and the filter would wrongly strip it.
   - A per-line token (an ordinal or a line id) in the domain would make both filters safe.
4. **Candidate mode does not carry the new fields.** The whole-candidate gate's `trialActs` copies acts field by field
   (`flow-bootstrap/candidate/trial-gate.ts`). A single-builder candidate build's trial acts therefore still carry no
   item even once the domain writes the keys. Carrying `spot` and `created` there is a two-line follow-up in a file I
   must not touch.

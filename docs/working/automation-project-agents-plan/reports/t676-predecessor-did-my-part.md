# t676: a predecessor did my part (Fixes A, B, D, E)

Worker report. Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t676/!FluxIQ`,
branch `task/t676-predecessor-did-my-part`, from Core dev `f05a486c`. Nothing
committed. Runtime paths below are relative to
`packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Done. Fixes A, B, D and E are implemented and tested.

- The first hand-back was Partial because `doneBefore` was missing from the
  brief's return.
- The coordinator then gave me `project-agents/contracts/builder-return.ts`
  and its test. The return now carries `doneBefore`: it is read, checked and
  set (see "Follow-up").
- No `supervisor/**` or `project-agents/amendment/**` file was changed.
  Fix C landed in t671 without this field.

## What changed and why

**Fix A: Core checks the claim** (`flow-bootstrap/subflow-candidate/`)

- `contracts.ts`
  - New type `AutomationStudioSubflowDoneBefore = { part; act? }`.
  - New type `AutomationStudioSubflowOutOfScopePart`.
  - `AutomationStudioSubflowScope.outOfScope?` (used by D).
- `done-before.ts` (new)
  - `automationStudioSubflowEntryLeft`: the one shape for the entry note's
    `entry` and `predecessorsLeftOnSite` keys. `brief-ports` writes it and
    the builder loop reads it, so the two cannot drift apart.
  - `automationStudioSubflowDoneBefore`: `{ code, shape, acting(scope),
    check(scope, ended, claim, landed) }`.
  - The check refuses with `subflow.done_before_refused` in these cases:
    - The scope has no predecessors.
    - No scope part asks a lasting act. The words are the report's: "its
      result comes only from this subflow's own steps; build it from this
      page."
    - The ending is `partial`.
    - The claim is malformed. (A missing claim before a try is refused `subflow.ending_too_soon` by the builder loop; see "Follow-up".)
    - The named part is not one of this brief's.
    - The named part has an empty or absent `lastingActs`.
    - `act` is not one the preparation run landed. The words are the
      report's: "this build's act from exploration, which every trial's reset
      undoes; build the step that does it."
  - A part can be named by its id or by its exact text. Core keeps the id.
- `builder-loop.ts`
  - `ENDING_KEYS` now includes `doneBefore`, and `completionSchema` has a
    `doneBefore` object (`required: ["part"]`, `additionalProperties: false`).
  - The opening call's answer is read for the preparation run's act ids
    (`entryActs`).
  - `endingCheck` runs the claim check in two cases:
    - a dependent builder's blocked ending before anything was tried (the
      claim is now required there);
    - any ending that names `doneBefore`.
  - `ended.doneBefore` carries the admitted claim on the outcome.
  - New t676 header paragraph.
- `brief-words.ts` (new; split out of `builder-loop.ts`, which had grown to
  495 lines)
  - `successCheck` and `brief`.
  - Parts are now shown with their ids: `"<text>" (part p1)`.
  - `alreadyDone` gives the "end blocked" words and the `doneBefore` shape
    only when a scope part asks a lasting act. A reading scope is told: "Its
    parts ask for no lasting act, so no subflow before it can have done one of
    them: build them from that page with this subflow's own steps."
- `scoped-submission.ts`
  - The `subflow.lasting_act_missing` words now name the `doneBefore` shape.
- `index.ts`: exports `./done-before.ts`.
- `project-agents/dispatch/ending.ts`
  - A builder's blocked ending with an admitted claim now says, after the
    builder's words: "Core checked the builder's claim: a subflow before this
    one already does this brief's part p3, by the act act-2, which the run
    that prepared this subflow's entry landed, and that part asks a lasting
    act."
  - Ids pass through the `SAYABLE` check.
  - New header paragraph.

**Fix B: possible acts are shown** (`service/project-build/`)

- `brief-ports.ts`
  - `landed` no longer drops possible acts. They are marked `possibly: true`.
  - The note is now built in a new module, and the wrapper that adds Core's
    words to the opening answer uses the shared entry key.
- `entry-note.ts` (new; split out of `brief-ports.ts`)
  - `automationStudioProjectBuildEntryNote(scope, entry, absorbed, landed)`.
  - Possible acts get a sentence of their own.
  - "what they did is already done" and "end the brief blocked naming that
    part and that act" (with the `doneBefore` shape) are said only when a
    scope part asks a lasting act.
  - A reading scope gets "Explore and build from here." and "Your parts ask
    for no lasting act, so none of these is a part of yours: build your parts
    from this page."

**Fix D: other parts are named**

- `project-agents/dispatch/scope.ts`: `outOfScope` holds every task-spec part
  the brief does not hold, as `{ partId, text }`.
- `brief-words.ts` `otherParts` names them and says: doing one while exploring
  is allowed, but it is another builder's part, it changes where that builder
  starts until a reset puts the site back, and no step of this subflow does
  it. Without `outOfScope`, the old sentence stays.

**Fix E: the judge sees possibly lasting steps**

- `service/subflow-trial/run.ts`
  - `possiblyLastingSteps` maps each landed act with `possible: true` to the
    nodeId of its executed step (`automationStudioTrialExecutedSteps`).
  - It passes them as `possiblyLasting` on the judge input
    (`service/subflow-trial/types.ts`).
- `service/project-build/subflow-trials.ts`: passes them on to the checklist.
- `service/project-build/task-checklist.ts`: `subflow(..., possiblyLasting)`
  keeps only the subflow's own steps. Steps in `entry.steps` are dropped.
- `result-verification/build-test/task-checklist.ts` and
  `result-verification/contracts/task-checklist.ts`:
  - New field `possiblyLasting`.
  - New label sentence: "Such a step's own consequences label is no proof it
    left nothing: judge it by what it changed, as a step that may have made a
    lasting act, against asked and outOfScope."

**Tests** (each in the `tests/` folder beside its subject)

- `subflow-candidate/tests/builder-ending.test.ts`
  - The t594 test is rewritten for `doneBefore`.
  - A new describe covers: refused for a reading part; too soon for no part, refused for an
    unknown part; refused for an act that is not the preparation run's, and
    with no entry note; admitted for an acting part with a listed (possible)
    act, the part named by its text and kept by its id; refused with no
    predecessors (after `ending_too_soon` before a try); refused as partial.
- `subflow-candidate/tests/builder-loop.test.ts`
  - Part ids appear in the brief.
  - New test: out-of-scope parts are named, and the "end blocked" sentence
    appears only when a scope part acts.
- `subflow-candidate/tests/scoped-submission.test.ts`: the new words.
- `service/project-build/tests/project-build-entry-note.test.ts` (new)
  - A possible act is listed and marked `possibly`, and
    `automationStudioSubflowEntryLeft.acts` reads the ids back.
  - An acting scope is told to end blocked with the shape.
  - A reading scope gets no "end the brief blocked", with acts left or with
    none.
  - The start and unprepared cases.
- `service/project-build/tests/project-build-brief-ports.test.ts`: the
  end-to-end entry of a reading scope now has no "end the brief blocked"
  sentence.
- `service/project-build/tests/project-build-task-checklist.test.ts`:
  `possiblyLasting` without the entry's steps.
- `result-verification/build-test/tests/task-checklist.test.ts`
  - The key and the label sentence, and none when the list is empty.
  - The scenario-words test now covers the new label.
- `service/subflow-trial/tests/possibly-lasting.test.ts` (new)
  - It wraps the landed acts with `vi.mock` to mark the brief's own act
    possible.
  - It checks the judge gets that step's nodeId, and gets no key when no act
    is possible.
- `project-agents/dispatch/tests/scope.test.ts`: `outOfScope` holds the other
  parts.
- `project-agents/dispatch/tests/brief-return-reason.test.ts`: the reason
  says the checked claim (with an act, and without one), and nothing when
  there is no claim.

Test fixture words avoid every realistic Lab scenario's site, items and acts.
I changed my first draft's "watchlist" and "listing" phrasing for that reason.

## Follow-up: `doneBefore` on the return, and endings before a try

What changed:

- `project-agents/contracts/builder-return.ts`
  - Adds `doneBefore?: { part: string; act?: string }` to
    `AutomationStudioProjectBuilderReturn`.
  - `read()` accepts it: an object with `part` required and `act` optional,
    each read by `shape.id`. An unknown key is refused
    `project.unknown_field`.
  - `issues()` adds `project.return_done_before` at `return.doneBefore` when
    the return is not `blocked`, or when `part` is not one of `brief.parts`.
  - Test: `contracts/tests/builder-return.test.ts` covers it: read with and
    without `act`, a malformed id, an unknown key, a missing part, the brief's
    own part, a foreign part, and a partial return.
- `project-agents/dispatch/ending.ts`
  - `built()` sets `doneBefore` on the builder-ending branch when the return
    is `blocked`.
  - The reason sentence stays as it was.
  - Test: `dispatch/tests/brief-return-reason.test.ts` checks the field with
    an act, without one, and absent when there was no claim.

The question asked: before t676, which other reasons could a dependent
builder honestly end blocked before any submission, and does each still end
honestly now, without `doneBefore`?

Before t676, Core took any blocked ending from a builder with predecessors
before anything was tried (t594), whatever the reason. Now:

- **The person refused a permission, or the site showed a check only a person
  can pass.**
  - Still ends honestly, unchanged.
  - These never go through the completion check. The brief's own `ended`
    signal stops the loop: `brief-ports.ts` `briefEnding`, through
    `run-brief.ts` `untilEnded`. The brief comes back
    `endedAs(brief, "blocked", <the gate's sentence>)`.
- **Its entry was never prepared** (a predecessor has no passing proposal,
  failed, or was made under another plan), so the entry is unreachable.
  - Not before a try any more.
  - An ending without `doneBefore` is refused `subflow.ending_too_soon`. The
    refusal says "For any other reason -- its entry not prepared, or the site
    unable to do what its parts ask -- submit the subflow ... and test it
    first: its trial says why it cannot pass, and the brief can then end
    blocked saying so". An acting brief is also offered the `doneBefore`
    shape.
  - After one submission and one trial, the trial answers
    `subflow.trial_predecessor_missing`, `..._failed` or `..._stale`. The
    blocked ending is then taken, and the return says the trial's account
    (`ending.ts` `entrySaid`).
  - With a predecessor missing, that trial runs no step and asks no judge.
    The extra cost is one submission, one test call and the turns around
    them.
  - This is the t581 path that held before t594.
  - Test: the new builder-ending test "ends a dependent brief whose entry was
    never prepared blocked after one trial says so, never before".
- **A broken page, or a site that cannot do what its parts ask.**
  - Same path as an unprepared entry: refused `subflow.ending_too_soon`
    before a try, then taken as an honest ending after one submission and its
    trial.
- **A builder that keeps sending the refused ending anyway.**
  - The loop's repeat guard ends it.
  - `ending.ts` `stopReason` returns it `blocked`, with the guard's codes and
    the calls it stopped on.
  - Honest, but slower.

One fix in this follow-up: in my first version, a blocked ending before a try
with no `doneBefore` was refused `subflow.done_before_refused`. For a brief
whose parts only read, the refusal said "build it from this page", which is
wrong for an unreachable entry. It is now refused `subflow.ending_too_soon`
with the words above, in `builder-loop.ts` `untriedEnding`. The
`done_before_refused` refusals now answer only a `doneBefore` claim the
builder actually made.

## Commands run and observed results

After the follow-up, from `packages/fluxiq` unless noted:

- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check-t676.tsbuildinfo`
  -> `tsc exit 0`.
- `npx vitest run <runtime>/flow-bootstrap/subflow-candidate/tests <runtime>/project-agents/dispatch/tests <runtime>/project-agents/contracts/tests <runtime>/service/project-build/tests <runtime>/service/subflow-trial/tests <runtime>/result-verification/build-test/tests`
  -> `vitest exit 0`, `Test Files 81 passed (81)`, `Tests 514 passed (514)`.
- `node scripts/structure-audit.mjs` (Core root) -> `audit exit 0`,
  `structure-audit: passed (389 warning(s), 1156 baselined).`

First hand-back (before the follow-up):

All from `packages/fluxiq` unless noted. Final runs, after the last edit:

- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check-t676.tsbuildinfo`
  -> `tsc exit 0`, no diagnostics.
- `npx vitest run <runtime>/flow-bootstrap/subflow-candidate/tests <runtime>/project-agents/dispatch/tests <runtime>/service/project-build/tests <runtime>/service/subflow-trial/tests <runtime>/result-verification/build-test/tests`
  -> `vitest exit 0`, `Test Files 75 passed (75)`, `Tests 446 passed (446)`.
- `node scripts/structure-audit.mjs` (Core root) -> `structure-audit: passed
  (389 warning(s), 1156 baselined).` This matches the 389 warnings it printed
  before any edit.
  - An earlier draft used a `subflow-candidate/done-before/` subdirectory.
    The audit refused it under the 9-segment depth rule, so the feature is the
    one flat file `done-before.ts`.
  - That keeps `subflow-candidate/` at 15 files, inside its advisory
    threshold.

Before the tests were updated, the first run of the same directories showed
the 4 expected failures (the old t594 ending, the brief's part words, the long
parts and the entry note's "end the brief blocked"). That run also confirmed
the change touched nothing else in those directories.

## Not verified

- No live Lab run, and no browser. The changed words and the claim check have
  not met a real model.
- The whole vitest suite and `pnpm check` were not run (the brief limits me to
  the changed directories). Directories outside them could still assert the
  old words.
  - I grepped every package's `.ts` files for the old sentences and for
    `ended: "blocked"`. The only other hits are supervisor completions and
    run-brief repair words, which this work does not change.
- The real executor never makes a possible act in a test.
  `possibly-lasting.test.ts` marks one with `vi.mock`. The mapping from act
  step to nodeId is exercised only through that mock and the real
  executed-steps helper.
- Fix C (the merge carry) is another worker's and was not touched or tested.

## Open questions or contradictions found

1. **Resolved in the follow-up:** the return contract now holds `doneBefore`
   (see "Follow-up").
2. **A claim is now required where none was before.** A dependent builder's
   blocked ending before any submission must carry `doneBefore`. Without one
   it is refused `subflow.ending_too_soon`, and every other reason to end
   reaches its honest ending after one trial, as shown above. Before t676,
   any such ending was admitted (t594). This follows the brief ("admitted
   only when ...").
3. **Where the preparation run's act ids come from.** They are read off the
   builder's opening answer (`entry.predecessorsLeftOnSite`, through the
   shared shape in `done-before.ts`).
   - The other route was a new field from the brief port, which would have
     needed `dispatch/run-brief.ts` or `dispatch/types.ts`. Both were
     off-limits.
   - As built, a builder can name only an act it was shown.
   - A repair or carried opening that `run-brief` wraps keeps the note, since
     that wrapper only adds a key.
4. **`automationStudioSubflowDoneBefore.check` still has a branch for a
   missing claim.** The builder loop no longer reaches it, because it refuses
   that case as too soon first. The branch is kept so the check stays whole
   for any other caller.

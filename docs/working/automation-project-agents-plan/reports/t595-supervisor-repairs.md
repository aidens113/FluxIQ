# t595 supervisor-repairs: worker report

Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t595/!FluxIQ`, branch `task/t595-supervisor-repairs`,
base `6a81a391`. Nothing was committed. No model provider was called and no Lab run was made.

## Outcome

Done. All four items of the brief are implemented and tested:

1. A repair builder now sees the failing trial its `failingReceipt` names.
2. Core refuses briefs that can only spend money on nothing.
3. A plan refusal says what is wrong in words. The plan's answer no longer
   invites copying back Core's `main`, and an amendment that only rewords a
   part keeps that subflow's proposal.
4. `project.build_partial` and `project.build_blocked` have chat words of their own.

## What changed and why

All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### (1) The repair builder is shown the failing trial

- **`project-agents/contracts/subflow-brief.ts`**
  - New optional brief field `failingTrial: { verdict, failedStep?, said }`. It is
    allowed on a repair only, and its verdict can never be yes.
  - The parser bounds it: `said` at 8,000 JSON characters, `failedStep` at 3,000.
  - New method `automationStudioProjectSubflowBrief.failingTrial({verdict, feedback})`.
    - The failed step is the last entry of `feedback.steps` with status `failed`
      (its number, label, node, failure code and `happened`).
    - `said` is the rest of the feedback.
    - Anything over the bound keeps only its plain fields, each text cut to 500
      characters.
    - A trial that passed gives `undefined`.
  - A new value import from `flow-bootstrap/candidate/index.ts`
    (`AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS`). The audit's cycle rule passed.
- **`project-agents/dispatch/run-brief.ts`**
  - A repair brief's loop has its opening look wrapped. The first-call evidence
    (`initial.*`, using `automationStudioLlmEvidenceIsOpeningCallId`) gets
    `repairOf` beside it. `repairOf` holds the receipt, verdict, `failedStep`,
    `said` and a note.
  - The note is generic. It says the step numbers of a whole test count the
    whole Flow, and that the builder should end blocked if the failure is not in
    one of its own steps.
  - The whole test's content comes from the brief (`failingTrial`).
  - A subflow trial's content comes from memory kept per build:
    - A `WeakMap` keyed by the dispatcher input (made once per build) keeps, by
      receipt id, every subflow trial a brief of that build ran.
    - A wrapper around `receipts.wrap(port)` fills it, reading the id receipts
      just assigned (`receipts.list().at(-1)`).
    - It is capped at 200 entries.
  - A receipt that memory does not hold (for example, from an earlier process)
    gets the note "...is not held here". A held trial that passed gets a "passed"
    note.
- **`project-agents/supervisor/dispatch-tool.ts`**, `failingTrials`, before anything is recorded:
  - **`candidate_trial`**: the receipt must be the latest whole test. That means
    the digest of `controller.latest()`, and `gate.standing(latest).trialRunId`
    equal to `receiptId` (any id is accepted if the trial has no `trialRunId`).
    It must also not have passed. The test is then read onto the brief as
    `failingTrial`, so the build record holds it too.
  - **`subflow_trial`**: the receipt must have been listed by a return of that
    subflow, and must not be the last trial of a done return (that is the yes
    the return was done on).
  - Refusal codes, each by its path with words:
    - `project.failing_receipt_not_latest_test`
    - `project.failing_receipt_passed`
    - `project.failing_receipt_unknown`

    Each also carries `wholeTest`, a copyable `{kind, receiptId, digest}`,
    whenever a whole test stands that did not pass.

### (2) Refusing briefs that can only spend on nothing

All in `dispatch-tool.ts`, with state in `state.ts`:

- **`project.brief_repeated`**
  - Applies when a subflow's latest build or repair brief came back `blocked`
    with `calls > 0`, and the new brief's `sentKey` equals the key recorded once
    that return came back.
  - `sentKey` covers:
    - plan digest, kind, subflow and parts
    - `caseId`
    - each predecessor's latest done brief id and revision
    - the excerpt and the receipt
    - what this build has left on the target (`left-on-target` key)
  - The key is recorded after the returns, not at send time. Otherwise a blocked
    builder's own acts would change `left`, and the guard would never fire.
  - The refusal is `retry: true` and says: change what the builder is given, amend
    the plan, or end.
- **`changedNothing` and `project.repair_unchanged`**
  - After a dispatch, the tool checks every build or repair brief that came back
    done with a proposal. It compares that proposal with the subflow's proposal
    from before the dispatch, using `automationStudioCandidateSameBehaviour` with
    names set aside. Each proposal is read through `ports.proposals` and wrapped
    as a one-router plan (`asPlan`).
  - If the two do the same thing:
    - the compact return carries `changedNothing: {sameAs: {briefId, revision}, instruction}`
    - `next` becomes `GUIDANCE.next.afterRepairUnchanged`
    - `state.unchangedRepairs` records the plan digest and a `standingKey`. That key
      covers the latest candidate's revision and digest, the standing trial's run
      id and verdict, and `gate.retestable()`.
  - A further build or repair brief of that subflow, while the plan digest and the
    `standingKey` are still the same, is refused `project.repair_unchanged`
    (`retry: true`). The instruction depends on the state:
    - `repairUnchangedTest` when the latest test can be retested
    - `repairUnchangedAssemble` when nothing is assembled yet
    - `repairUnchangedEnd` otherwise (amend the plan or end)
  - The refusal also carries `latestTest`.
  - A retest, an amendment or a new assembly changes the key and lifts the
    refusal. A done return that did change something clears the mark.
- **`state.ts`** adds:
  - `sentAs` and `unchangedRepairs`
  - `latestFor(subflowKey)`: the latest build or repair answered under the plan in force
  - `answeredFor(subflowKey)`: answered briefs under any plan

### (3) Plan refusals in words, the router entry, and rewording

- **`supervisor/plan-tool.ts`**
  - Every `project.plan_refused` issue carries `why` from the new
    `GUIDANCE.planIssues` when Core has words for its code.
  - The written plan's `subflows` no longer lists Core's router-run subflow. It is
    detected as the router target with no parts. A new `routerAddedByCore` says
    that this subflow is Core's and to leave it out of `amend_plan`.
  - `proposalsKept` entries carry `reworded: [partIds]`.
- **`supervisor/plan-input.ts`**
  - In a plan of several subflows, an entry keyed `main` or `main_<n>` with no
    parts, inputs or outputs is left out, and its key is removed from every `after`.
  - `Written` now carries `at`, so every issue still names the index that was sent.
  - Any other subflow with no parts, or `main` alone, is still refused.
- **`supervisor/state.ts`**: `changes()` now returns `{why, reworded}`. The new
  `partChange` treats a part as only reworded when:
  - its lasting acts and its `sourceId` are the same, and
  - its text's words differ only by at most `EDGE_WORDS = 2` words removed from
    the two ends together (case and punctuation ignored).

  Facts (`goalFacts`) may change freely. Anything else counts as "its parts changed".
- **`supervisor/guidance.ts`**
  - `DISPATCH` is rewritten to fit the 2,000-character bound; it is now 1,956.
    - The old t588 sentence is kept as is.
    - It adds the whole-test receipt form, "It must name a trial that did not pass;
      its builder is shown what that trial said", `changedNothing`, and the three
      not-run cases.
    - The word "digest" is never used, because the guidance test forbids it. The
      receipt's third field is described as "the third field as in the complete
      object it tested".
  - `AMEND_PLAN`: write only your own subflows, the reworded rule, and "amend to
    change what the subflows are, not to get past a refusal".
  - `forward.changeAfterNo` now says to send a repair whose `failingReceipt` names
    that test.
  - New entries:
    - `router.addedByCore`
    - `next.afterRepairUnchanged`
    - `refusals.briefRepeated` and `refusals.repairUnchanged{Test,Assemble,End}`
    - `issues.*`
    - `planIssues`
  - Every string passes the scenario and site word lists.

### (4) Chat words

**`conversations/commands/progress.ts`** adds `SUPERVISOR_ENDING_WORDS`, read from
`diagnostic.issueCodes` before `CODE_WORDS` and before the stage fallback:

- partial reads "the build failed: the supervisor ended it with only part of the Flow built"
- blocked reads "the build failed: the supervisor ended it because it could not finish the Flow"

The stage words remain for a stage failure that carries no ending from the supervisor.

### Tests

New:

- `project-agents/dispatch/tests/repair-opening.test.ts` (3 tests). It uses the
  real builder loop on a scripted model with an opening tool:
  - the first request's opening evidence carries `repairOf` for a whole test on
    the brief
  - it carries `repairOf` for a subflow trial an earlier brief of the same build
    ran (found from memory by the receipt its return listed), and a build brief
    shows none
  - an unheld receipt gets the "not held" note
- `project-agents/supervisor/tests/repair-repeats.test.ts` (6 tests):
  - the whole test is read onto the brief and into the record
  - the three failing-receipt refusals, with `wholeTest` to copy
  - `changedNothing`, then `repair_unchanged` with the Test variant (verdict unsure)
    and the End variant (verdict no), and the refusal lifted after a retest
  - `brief_repeated`, and a changed excerpt running again

Updated:

- `contracts/tests/subflow-brief.test.ts`: `failingTrial` parse, its refusals, and
  the builder's bounds
- `supervisor/tests/plan-input.test.ts`: router entry left out, index paths kept,
  other part-less subflows still refused
- `supervisor/tests/amend-dispatch.test.ts`: rewording keeps the proposal with
  `reworded`; a 3-word cut drops it; an amend refusal carries `why`
- `supervisor/tests/plan-dispatch.test.ts`: the answer lists only the model's
  subflows, plus `routerAddedByCore`
- `supervisor/tests/supervisor-loop.test.ts`: one issue expectation now includes `why`
- `supervisor/tests/guidance.test.ts`: the new dispatch and amend words
- `conversations/commands/tests/plain-failure.test.ts`: the supervisor-ending words

## Commands run and observed results

All run from `packages/fluxiq` unless noted.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` (includes `src/**/*.ts`, tests too) | exit 0, no output |
| `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/conversations` | exit 0, "Test Files 52 passed (52)", "Tests 446 passed (446)" |
| `npx vitest run src/programs/automation-studio/runtime/service/project-build` (a consumer of the plan answer and brief contract; not required by the brief) | exit 0, "Test Files 11 passed (11)", "Tests 44 passed (44)" |
| `node scripts/structure-audit.mjs` (from the worktree root) | exit 0, "structure-audit: passed (358 warning(s), 1156 baselined)" |

The only audit warnings on touched paths were already there before this change:

- `project-agents/supervisor/` at 25 files. No file was added there; it is at the limit.
- `supervisor/tests/supervisor-script.ts` exported values. That file was not edited.

Along the way:

- The first test run after the guidance edit failed with
  `llm_evidence_loop.invalid_configuration` (32 tests). The cause was `DISPATCH` at
  2,019 characters. It was trimmed to 1,956, measured with a Node script in the
  scratchpad.
- `npx biome check` on the changed files reported "No files were processed": the
  repository's biome configuration ignores these paths, so it gives no signal.

## Not verified

- No live or Lab run, as the brief ordered. Whether a real model reads `repairOf`
  and changes its steps is untested.
- The subflow trial memory is in-process only. A supervisor restarted on a build
  already under way gets the "not held" note for subflow receipts. Whole-test
  receipts survive a restart because they are on the recorded brief.
- The "a trial that passed" check for a `subflow_trial` receipt is inferred: it is
  the last trial of a done return. Core cannot read a ref's verdict from its digest.
  An earlier non-last trial in a done return that also passed would not be caught.
  The builder still gets the "passed" note from memory.
- `project.brief_repeated` keys on equal brief content and target state. It does
  not compare the blocked return's refusal codes, which the return does not carry.
- The new chat words were checked only through `automationStudioConversationCallCause`.
  The full chat row, alongside t590's `toldEnding` row, was not rendered.
  The person may now read the supervisor-ending sense twice: t590's row
  ("The supervisor ended the build with only part of the Flow built.") and then
  "The build failed: the supervisor ended it with only part of the Flow built."
  That is true but repetitive.
- `pnpm check` and the full suites were not run, per the twice-a-day rule.

## Open questions or contradictions found

1. **Rewording rule.** Changes to `goalFacts` are always treated as rewording (the
   brief asked for that), so a real change of meaning made only through facts keeps
   the old proposal. The answer flags it under `reworded` and the guidance says to
   re-brief if the meaning changed, and the judged whole test is the backstop. This
   reverses part of t590's rule; the supervisor should confirm the trade-off.
2. **The guidance test's scenario-word loop.** In `guidance.test.ts` it builds
   `new RegExp(`\b${word}\b`)` inside a template literal, so `\b` is a backspace
   character and that per-word check never matches anything. The `SITE_WORDS` and
   `LAB_TASK_WORDS` checks do work. Not fixed: outside this brief.
3. **The repeated-briefs guard is not shown to the supervisor's refusal-run guard.**
   After three refused dispatches in a row, the supervisor's loop stopped before
   showing the third answer (seen while writing `repair-repeats.test.ts`). That is
   existing loop behaviour, and it may shorten a run that hits several of these
   refusals in a row.
4. **Dispatch description length.** `DISPATCH` is at 1,956 of 2,000 characters. Any
   further addition to it needs a trim first.

## Addendum: supervisor decision on open question 1 (goal facts)

Decision: keep t590's rule for goal facts. An amendment keeps a passing proposal only when the
facts of the parts it was judged against are unchanged. The only allowed difference is the
part's text moving by at most two words at its ends. The dropped proposal is reported as
"its facts changed".

### Changes

- **`project-agents/supervisor/state.ts`**
  - `partChange` now returns `same | reworded | facts | changed`, decided in this order:
    1. **changed** when the lasting acts or `sourceId` differ, or the text differs by
       more than the edge allowance.
    2. **facts** when the goal facts differ after normalisation (trimmed, lower case,
       each run of whitespace collapsed to one space).
    3. **reworded** when the text differs only within the edge allowance.
    4. **same** otherwise.
  - In `changes()`:
    - any `changed` part, or a different part set, gives "its parts changed";
    - otherwise any `facts` part gives "its facts changed".
  - A part whose facts differ only in case or spacing, with its text unchanged, counts as
    `same`. It is not listed under `reworded`.
  - The header paragraph is rewritten to give the reason: the proposal's trial was judged
    against the old facts, and the `project.repair_unchanged` refusal is what removes the
    model's reason to reword.
- **`project-agents/supervisor/guidance.ts`**: `AMEND_PLAN` now says:
  - a proposal needs the same lasting acts, facts and words;
  - a word or two moved at either end keeps it, listed under `reworded`;
  - "A part whose facts changed drops it, since its trial was judged against the old facts."
- **Tests**
  - `supervisor/tests/amend-dispatch.test.ts`, the rewording test now covers four cases:
    | Change | Result |
    | --- | --- |
    | Text loses its first word; fact changes only in case and spacing | kept, `reworded: ["p1"]` |
    | Fact changes only in case and spacing | kept, no `reworded` |
    | Facts reworded | dropped, `why: ["its facts changed"]` |
    | Text cut by three words | dropped, "its parts changed" |
  - `supervisor/tests/guidance.test.ts` asserts the new amend sentence.

### Commands run and observed results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`) | exit 0 |
| `npx vitest run .../runtime/project-agents .../runtime/conversations .../runtime/service/project-build` | exit 0, "Test Files 63 passed (63)", "Tests 490 passed (490)" |
| `node scripts/structure-audit.mjs` | exit 0, "structure-audit: passed (358 warning(s), 1156 baselined)" |

The audit warnings on touched paths are only the two that were already there:

- the `supervisor/` directory at 25 files;
- the exported values of `supervisor-script.ts`.

Open question 1 is closed. Open questions 2 to 4 still stand.

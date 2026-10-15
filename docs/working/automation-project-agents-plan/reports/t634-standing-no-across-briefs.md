# t634 standing-no-across-briefs: worker report

Brief: t634, the two open questions of t633. Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t634/!FluxIQ`, branch
`task/t634-standing-no-across-briefs`. Nothing was committed. No live run and no provider call.

## Outcome

**Done.**

- **(1) Across briefs.** The standing nos a brief's subflow gate lets stand are now kept for the build by the dispatcher,
  keyed by subflow and plan digest. They seed the gate of every later brief of that subflow under that plan. A repair's
  gate therefore weighs a no against an exclusion that the build brief before it upheld. The records stay Core-only.
- **(2) The gate's verdict is the one kept.** The gate now tells its port each trial as it weighed it. The following are
  then made from the gate's answer:
  - the brief's receipt (re-made, with the same receipt id and with the gate's verdict and digest);
  - the dispatcher's `TRIALS` memory, which a repair's `repairOf` shows;
  - the spend's last trial, which the brief's thrown-loop return reads;
  - the build's `proposals.trialled`.

  The trial's own `feedback.code` stays first and unchanged.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### The seed hook: `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`

The gate needed a hook. The builder loop (`builder-loop.ts`, not owned) builds the gate from `input.trial.port`, so the
hook rides on the port. This follows the same pattern as `prepareStart`, and builder-loop.ts is untouched.

- **`AutomationStudioSubflowTrialPreparingPort`** gains two optional fields:
  - `standingNos?: readonly unknown[]` is the seed. The constructor weighs each record into the gate's
    `AutomationStudioResultStandingNoMemory` at revisions `-n … -1`. Seeds therefore never collide with this brief's
    revisions, which start at 1 in every brief, and the memory's same-revision filter never skips one. The memory still
    validates each record's shape and keeps only those that upheld rows.
  - `weighed?(trial: AutomationStudioSubflowTrialWeighed)` is told after weighing: `{ answer, standingNo? }`.
    - `answer` is the gate's kept answer.
    - `standingNo` is present only when the answer is a `no` with its entry prepared and a record: a no the gate let
      stand.
- **`AutomationStudioSubflowTrialWeighed`** is a new exported type.
- **`test()` reordered.** The order is now ask → weigh → `port.weighed` → `signal.throwIfAborted()`, so the port is told
  even of a trial that a stop then cuts short. Weighing is pure.
- **`notTaken` words for seeded records.** A contradiction found against a seeded record (revision < 1) gets its words
  from a new `earlierBriefSaid`. It says "A revision of this subflow that an earlier brief tested, read without …" in place
  of "Revision -1". Otherwise the sentence follows `contradiction.ts`: conditions by Core's names, a count of rows, never
  their labels.
- **`CONTRADICTED_RETESTABLE`**: "an earlier no of this brief" now reads "an earlier no of this subflow". This is
  model-facing wording, and it is now true in both cases.
- The header is extended with t634.

### `project-agents/dispatch/`

- **New `standing-nos.ts`**, `AutomationStudioProjectDispatchStandingNos`.
  - `earlier(scope)` gives copies, oldest first.
  - `stood(scope, record)` keeps a record only if `upheldKind` is non-empty, at most 20 per subflow and plan.
  - It is keyed by `[subflowKey, planDigest]`. Records are not carried into another plan; see open question 1.
- **New `trial-port.ts`**, `automationStudioProjectDispatchTrialPort`. It is the brief's gate port and replaces run-brief's
  `kept(heard(remembered(receipts.wrap(port))))`, with the same order and behaviour. It adds two things:
  - `standingNos`: the subflow's earlier records, set when any exist.
  - `weighed`, which does five things:
    1. re-makes the receipt (`receipts.weighed`);
    2. re-remembers it in `TRIALS` under the same receipt id;
    3. replaces `spend.trial` when it is the same trial;
    4. keeps a stood `standingNo`;
    5. chains to the brief's own port's `weighed`, which reaches the build's proposals.
- **`receipts.ts`**: `wrap` remembers the trial it just listed as pending. `weighed(answer)` re-makes that reference from
  the gate's answer when all of the following hold, and returns it:
  - the brief, revision and digest are the same;
  - the verdict or `entryPrepared` differs.

  It is told once: pending is cleared. The digest rule is factored into `refOf`, with the same fields as before.
- **`run-brief.ts`**:
  - adds the `STANDING` WeakMap, one per build's dispatcher, like `ACCEPTED`;
  - `remembered` becomes a `remember(dispatcher, ref, trial)` callback;
  - `kept` and `heard` move into `trial-port.ts`;
  - the header notes t634.

### `service/project-build/subflow-trials.ts`: the one place `proposals.trialled` is read

- The port no longer calls `proposals.trialled` with the port's raw verdict.
- It records each trial it answered, keyed by brief, revision and digest, at most 200.
- Its new `port.weighed` calls `trialled` once, with the gate's verdict, for a trial this port answered.
- The dispatcher chains to it. `brief-ports.ts` hands this port to the dispatcher unwrapped, so nothing else changed
  there.

### Tests

| File | Tests | What it covers |
| --- | --- | --- |
| `project-agents/dispatch/tests/standing-no-across-briefs.test.ts` | 2 | **Definition of done, part 1.** The real builder loop and the real gate run on a scripted model, through the dispatcher, on a garden seed catalogue (not a Lab scenario). Brief 1's trial is a no that upholds a kind exclusion (a seed tray). Repair brief 2's trial is a no asking to drop the two name conditions that leave the tray out. That no is answered `unsure`, and `feedback.code` stays `candidate.trial_judged_no`. `contradictedByBuild` says "an earlier brief tested", names no label and no negative revision, and the instruction says "of this subflow". Brief 2's receipt says `unsure`, and the return reason says "answered unsure (candidate.trial_judged_no)". Nothing the builder saw carries `standingNo`. Control: the same repair in a build with no earlier upheld no stays `no`. |
| `project-agents/dispatch/tests/standing-nos.test.ts` | 2 | Only upheld records are carried, only to the same subflow and plan, as copies, the latest 20. |
| `project-agents/dispatch/tests/receipts.test.ts` | +2 | **Definition of done, part 2.** The port said no and the gate said unsure, so the receipt says unsure, with a digest made from the unsure fields and the same receipt id. It is told once. An agreeing answer, or one about another revision, leaves the reference alone. |
| `service/project-build/tests/project-build-trial-weighed.test.ts` | 2 | Through the real project-build port: proposals are not told before the gate weighs the trial, and are then told once with the gate's verdict. An unsure prepares no entry, and a yes does. |

## Commands run and observed results

All commands ran from `packages/fluxiq` unless noted, with nothing heavy beside them.

- **Typecheck.** `node_modules/.bin/tsc --noEmit -p tsconfig.json`.
  - The first full run flagged my new test, which passed a `byRef` argument without `subflowKey`. I fixed it.
  - Final run: no output, `tsc exit 0`.
- **Brief vitest set, before the new tests.**
  `node_modules/.bin/vitest run <R>/project-agents <R>/service/project-build <R>/flow-bootstrap/subflow-candidate`
  - Result: `Test Files 63 passed (63)`, `Tests 442 passed (442)`.
  - This includes the t633 swing test and the facade, reset and time-limit builds, through the real gates and the
    re-chained `trialled`.
- **Brief vitest set, final run** (with the new tests): `Test Files 66 passed (66)`, `Tests 450 passed (450)`.
  The one new file added after that run (`project-build-trial-weighed.test.ts`) was re-run on its own after the type fix:
  `Tests 2 passed (2)`.
- **Mutation checks.** Each file was restored from a copy afterwards, and a grep for the mutation text finds 0 matches.
  - Gate seeding turned off (`false && this.standingNos.weigh`): the across-briefs test failed, `1 failed | 1 passed`.
  - `receipts.weighed` forced to see no pending trial: the across-briefs test and the receipt test failed,
    `2 failed | 3 passed`.
- **Structure audit.** `node scripts/structure-audit.mjs`, from the Core root: `structure-audit: passed (373 warning(s), 1156 baselined)`.
  The new advisory warnings are:
  - `project-agents/dispatch/` now has 16 source files, past the 15-file advisory threshold.
  - `run-brief.ts` has 403 lines. It was 407 and already past the threshold before this change.

## Not verified

- No live or Lab run. Whether repair builders follow `CONTRADICTED_RETESTABLE` is still unmeasured.
- The full package suite was not run. Only the brief's three directories were run.
- The towels run was not replayed through the cross-brief path. I did not check whether brief 1 and repair brief 2 in
  `run-mv9gbsm5` shared a plan digest. If the supervisor amended the plan between them, this change would not carry the
  record (see open question 1).
- The whole-candidate gate (`flow-bootstrap/candidate/trial-gate.ts`) and `service/project-build/whole-trials.ts` are
  untouched. Their memory is already per build, and the whole-trial receipts were not part of this brief.

## Open questions or contradictions found

1. **Records are carried only within one plan digest.**
   - A record is kept by `[subflowKey, planDigest]`. A repair under an amended plan therefore starts without the earlier
     plan's records.
   - I chose this because the parts, and so the asked kind, may change with the plan. Core refutes only what it measured.
   - If the towels repair ran under an amended plan whose parts for that subflow were unchanged, this is too strict. A
     looser key, the subflow plus its parts' wording, would carry it. That is the supervisor's call.
2. **`proposals.trialled` now depends on the gate's hook.** The build's subflow port tells the proposals only when a gate
   reports `weighed`.
   - Every production path goes through the dispatcher and a gate, which always reports, even when it is stopped.
   - A future caller that uses the build's subflow port without a gate would leave trials untold, and no `passed`
     predecessor would follow.
3. **Directory size.** `project-agents/dispatch/` is now past the 15-file advisory threshold. A later split of the trial
   memory (`trial-port.ts`, `standing-nos.ts`, `receipts.ts`) into a `dispatch/trials/` directory would clear it. I did
   not do that, to stay inside the brief.

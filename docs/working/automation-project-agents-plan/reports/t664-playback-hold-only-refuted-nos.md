# t664 playback-hold-only-refuted-nos: worker report

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t664/!FluxIQ`, branch
`task/t664-playback-hold-only-refuted-nos`. Nothing is committed. Paths below
are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Partial. Three of the four parts are done and tested:

- **Why the hold did not fire (found and fixed).** It was a defect, and it was
  not the revision. The cause is below, with evidence from the run and a
  mutation check.
- **Fix 4, the `because` codes.** Every double no now records one closed code,
  on the run's record and in one build-trace line.
- **Fix 3, the guard.** The hold now sets a no aside only where Core's record
  contradicts at least part of each no. A no that stands whole is never set
  aside.

What is missing is the producer of the per-call weighing that fix 3 reads.
Today a double no carries no structured "Core's record contradicts this no"
fact. `agreement.ts` computes it but keeps it only as words inside the merged
reading's labels. Making it a structured field means editing `agreement.ts`
and `contracts/verification.ts`, and neither is in this brief. So, live, the
hold now never fires: every double no records `nos_not_weighed`. That is the
safe direction. The t660 case is held only at the unit level until those two
files carry the field. The exact change is under "Open questions".

## What changed and why

### Why the hold did not fire in `run-mvahlxuu-760d9e28`

The port named no trial to any routed playback.

- `service.ts` (lines 2622 and 2624) hands every run's result check
  `subflowId: route.selectedSubflow.subflowId`.
- A built Flow's router always selects a Subflow. The run's
  `snapshots/flow-lane.json` records
  `"route": { "selectedSubflowId": "subflow.bootstrap.f38ecc23282cc765.main", "fallbackUsed": true }`.
- t662's `saved-flow-trial.ts` began with `if (input.subflowId) return undefined;`.
  So every playback of a built Flow got "no trial", and the double no refuted.
- t662's service test never saw this, because it called
  `verifyAutomationStudioRuntimeSessionResult` without `subflowId`. Its unit
  test even pinned the defect: a call with `subflowId` "resolves to undefined".

The debug's revision hypothesis is not supported:

- Apply and playback both read the parent through `getFlow`.
  `materializeCanonicalGraphFlow` leaves an unchained parent's
  `graphRevision` off, so both sides read `null`.
- Apply's own parent save does not start a chain. For an unchained Flow,
  `reconcileCanonicalGraphFromDocument` returns early.
- The Lab reads the Flow through `get-flow` (`test-runner/.../graph-read.ts`),
  not the viewport, and only the viewport imports a chain.
- `core.log` for the run has no viewport call.
- The service-level test below shows that, on a real built Flow, apply's
  recorded versions match what the playback records.

The fix, in `build-yes-hold/saved-flow-trial.ts`:

- The `subflowId` refusal is removed.
- A run of the whole Flow is now told apart by what it executed. It must name
  the record's orchestration Flow among its versions (the version with no
  `subflowId`). `service.ts` records that first for every run of a saved Flow.
- A run of one part alone, without that entry, gets `revision_mismatch`.
- The digest is not affected by the Subflow scope. Read with `subflowId`, the
  instruction set is the Subflow's own instructions plus its owner Flow's
  flow-scoped ones plus project and global ones. On a built Flow that gives
  the same digest as apply's whole-Flow read: the service test reached the
  rows and weighing steps, past `request_differs`.

### Fix 4: `because` codes (`build-yes-hold/because.ts`, new)

`AUTOMATION_STUDIO_RESULT_BUILD_YES_HOLD_BECAUSE` is a closed list, in the
order the hold reads its preconditions:

- `no_build_trial`: no record, no port, or the run is the trial itself.
- `revision_mismatch`: not the versions apply saved, or not the whole Flow.
- `trial_not_confirmed`: not a yes from at least 2 calls.
- `request_differs`: no digest, or a different one.
- `rows_differ`
- `nos_not_weighed`
- `no_stands_whole`
- `held`

The record is `{ held, because }`. It is a code only, with no page data.

How it is wired:

- `judged-trial.ts`: the port may now answer
  `{ missing: "no_build_trial" | "revision_mismatch" }`. `undefined` still
  reads as `no_build_trial`, so earlier callers keep working.
- `held-double-no.ts`: `automationStudioResultBuildYesHold` now returns
  `{ outcome, hold? }`. `hold` is present for every double no and absent
  otherwise.
- `run-outcome.ts`:
  - The hold always runs. A missing port reads as `no_build_trial`.
  - The report carries `buildYesHold`.
  - The session's `resultVerification` record gets
    `buildYesHold: { held, because }`.
  - One line is logged:
    `[FluxIQ build-trace] <ISO> result-check build-yes-hold run=<runId> held=<bool> because=<code>`.
    It goes through `automationStudioLlmBuildTrace.line`, the same switch
    (`FLUXIQ_BUILD_PROGRESS_TRACE=1`) whose lines reach the Lab's `core.log`.
  - The file grew from 710 to 717 lines.
- The run detail record (`run-record.ts`) is not in this brief and does not
  carry `buildYesHold`. Only the session's `resultVerification` and the log
  line do.

### Fix 3: only nos Core's record contradicts (`build-yes-hold/weighed-nos.ts`, new)

- `automationStudioResultWeighedNos(outcome)` reads the outcome's `weighedNos`
  strictly. The expected shape is one entry per call that said no,
  `{ call: 1 | 2, recordContradicts?: "whole" | "part" }`. Anything malformed
  reads as unweighed.
- `automationStudioResultEveryNoContradicted` is true only when both call 1
  and call 2 have `recordContradicts` set.
- The hold's new last steps:
  - no weighing gives `nos_not_weighed`;
  - any no without `recordContradicts`, or a missing call, gives
    `no_stands_whole` and returns the outcome unchanged;
  - otherwise the result is `held`.
- The hold still never makes a yes. Its reason sentence now says that Core's
  record contradicts part of each judgement.
- The order puts the store reads (trial, rows) before the weighing. A debug
  then gets the first failing precondition in a fixed order. In the A8 case,
  with this fix, that would have been `nos_not_weighed`, or `no_stands_whole`
  once the weighing exists.

### Tests

The fixtures are a hardware store, a county library and a seed nursery. None
is a realistic scenario.

**`build-yes-hold/tests/held-double-no.test.ts`** (rewritten, 13 tests).

Through the run's result check:

- an unweighed double no on identical rows is refuted with `nos_not_weighed`;
- `rows_differ`;
- `no_build_trial` in four forms: `undefined`, `missing`, the trial's own run
  id, and no port at all;
- `revision_mismatch`, `trial_not_confirmed` (twice) and `request_differs`;
- a yes is neither asked about nor recorded.

Against the hold itself:

- the t660 case, both nos contradicted in part, is held: `unsure` /
  `model_disagreed` / the code, no repair and no failure, with the reading kept;
- whole plus part is held;
- four cases where a no stands whole each give `no_stands_whole`, with the
  identical outcome object returned;
- five malformed or missing weighings each give `nos_not_weighed`;
- `core_observation` and single-no outcomes are neither asked about nor
  recorded;
- the closed list is exactly the eight codes.

**`build-yes-hold/tests/saved-flow-trial.test.ts`** (rewritten, 5 tests):

- the port names the trial with `subflowId` and without it;
- a routed check records `nos_not_weighed`;
- `rows_differ`;
- `revision_mismatch` for a repaired revision, for a run of one part alone
  (also called directly with `subflowId`), and for no versions;
- `no_build_trial` for a Flow without a record and for the trial's own run;
- an unreadable Flow gives `verification_did_not_finish`.

**`service/flow-bootstrap-commands/tests/applied-judged-trial.test.ts`** (t662's
service test, edited; see "Open questions"). This is the definition-of-done
test that the revision recorded at apply matches the one read at playback.

- Its check now passes `subflowId` as `service.ts` does. The value is taken
  from the playback's own recorded Subflow version.
- Identical rows now end `refuted` with `buildYesHold: { held: false, because: "nos_not_weighed" }`.
  That proves a real apply, a real playback and the real stores pass every
  trial precondition (versions, digest under Subflow scope, rows) and stop
  only at the weighing.
- Different rows end `rows_differ`.

## Commands run and observed results

All commands were run from `packages/fluxiq` unless noted, with
`R=src/programs/automation-studio/runtime`.

- **Evidence:** `grep` of `lab-runs/2026-10-15/run-mvahlxuu-760d9e28/snapshots/flow-lane.json`
  found `"selectedSubflowId": "subflow.bootstrap.f38ecc23282cc765.main"`.
  `grep -ci viewport logs/core.log` printed `0`.
- **First typecheck:** `npx tsc --noEmit -p tsconfig.json` after the source
  changes: exit 0, no output.
- **`npx vitest run $R/result-verification/build-yes-hold`:**
  `Test Files 2 passed (2)`, `Tests 18 passed (18)`.
- **The two service tests:**
  `npx vitest run $R/service/flow-bootstrap-commands/tests/applied-judged-trial.test.ts $R/service/project-build/tests/project-build-judged-trial.test.ts`:
  `Test Files 2 passed (2)`, `Tests 3 passed (3)`. The project-build test was
  not edited and still passes.
- **Mutation 1:** I put `if (input.subflowId) return undefined;` back into
  `saved-flow-trial.ts`.
  - `applied-judged-trial.test.ts` then failed 2 of 2. The output was
    `- "because": "nos_not_weighed"` / `+ "because": "no_build_trial"`, and
    `- "rows_differ"` / `+ "no_build_trial"`. That reproduces the A8 run.
  - The file was restored from a scratch copy. `grep -c input.subflowId`
    printed `0`.
- **Mutation 2:** I dropped `&& no.recordContradicts !== undefined` in
  `weighed-nos.ts`.
  - `held-double-no.test.ts` then had 1 failed and 12 passed. The failing
    test was "never sets aside a no that stands whole".
  - The file was restored, and `grep` showed the original line.
- **Brief directories:**
  `npx vitest run $R/result-verification $R/flow-version $R/service/flow-bootstrap-commands $R/service/project-build`
  printed `Test Files 146 passed (146)` and `Tests 1129 passed (1129)`, in
  129.5 s.
- **Structure audit, first run:** `node scripts/structure-audit.mjs` (from the
  repository root) failed with 1 violation: `statement-packing` in
  `held-double-no.test.ts` line 156. I split it.
- **After the split:**
  - The audit printed `structure-audit: passed (386 warning(s), 1156 baselined).`
    That is the same count t662 left.
  - The build-yes-hold tests printed `18 passed`.
  - The typecheck exited 0.
- **Trace line:** `FLUXIQ_BUILD_PROGRESS_TRACE=1 npx vitest run .../saved-flow-trial.test.ts`
  printed six lines, for example
  `[FluxIQ build-trace] 2026-10-16T05:50:15.651Z result-check build-yes-hold run=run-1 held=false because=nos_not_weighed`.

## Not verified

- **The hold firing outside unit tests.** That needs the `weighedNos`
  producer, which is outside this brief. Until it exists, every live double
  no records `nos_not_weighed` and is refuted.
- **The service's own result check inside `runRuntimeSession`.** The service
  test calls the check the way `service.ts` does, with the same port and the
  same `subflowId`. It does not run the service's inline check, which needs a
  configured result-check provider. No live run, as the brief says.
- **A real browser read.** As in t662, the rows are written into both runs'
  stores by the test.
- **`buildYesHold` on the run detail record (`run-record.ts`, not owned).**
  It is on the session's `resultVerification` and in the log line only.
- **Unit-level only:** the debug's other fix 3 guard ("never hold where a
  reading names a stored row fix 1 or 1b flagged") depends on fix 1, which is
  not built.
- I did not run `pnpm check` or the full suites (the narrow-check rule).

## Open questions or contradictions found

1. **The brief assumes a double no carries `recordContradicts`, and it does
   not.**
   - `recordContradicts` exists only on `unconfirmedReading`, for a split or an
     unsure.
   - On a double no, `agreement.ts` `weighedNos(input)` is computed, then
     folded into `bothReadings`' prose labels.
   - Reading those labels would be the gate-reads-words pattern t641
     forbade.

   The producer needs about six lines in two files outside this brief:

   - `result-verification/contracts/verification.ts`, beside `refutedNo`:
     `weighedNos?: Array<{ call: 1 | 2; recordContradicts?: "whole" | "part" }>;`
     with a doc line saying that, on a double no, it is what Core's record says
     of each call's no (t664) and is read by `build-yes-hold/weighed-nos.ts`.
   - `result-verification/agreement.ts`, in the `first === does_not_answer && second === does_not_answer`
     branch, only when `noRecordOf(input)` exists (with no summary, the field
     must stay absent):
     `weighedNos: ([1, 2] as const).map((call) => { const found = weighedNos(input).get(call); return found ? { call, recordContradicts: found.wholly ? "whole" : "part" } : { call }; })`.
   - `weighedNos` weighs each call's own judgement, before the same-words
     dedupe, so both calls always get an entry.
   - Check that a double no rebuilt after the t607 re-ask
     (`refuted-no/reask.ts`, which t663 owns) is recomputed through `agree`,
     so the field describes the re-asked readings.
   - `build-yes-hold/weighed-nos.ts` already reads exactly this field and
     shape, so nothing here changes when it lands. After that, an end-to-end
     test should make a double no whose nos blame a step whose `resultCount`
     before equals after (the debug's t660 case) and assert `held`.

2. **Ownership.** I edited `service/flow-bootstrap-commands/tests/applied-judged-trial.test.ts`.
   - It is not named in "Owns". I took it as one of "their tests": its subject
     is `judged-build-trial` and the hold.
   - It asserted the old behaviour, a plain unweighed no set aside, which this
     brief removes.
   - It also checked without `subflowId`, which is how it missed the defect.
   - The edit is 20 lines, all assertions and the `subflowId`. No source
     outside "Owns" was touched.

3. **`judged-build-trial/**` was not touched.** The mismatch was not there.
   `ran-judged-versions.ts`'s null-parent rule held on the real service path.
   Its standing caveat is unchanged: once something numbers the parent between
   apply and playback (a graph view or a patch), the hold reads
   `revision_mismatch`.

4. **The debug's open question is not addressed.** It asks whether a trial
   yes reached only through the refuted-no re-ask counts as a confirmed yes
   (`calls >= 2`). Fix 3 makes it matter only where both playback nos are
   contradicted.

## Round 2

### Outcome

Done for this round. A trial yes reached by re-asking calls that first said
otherwise no longer holds a playback's double no: the hold answers
`trial_not_confirmed`. A first-ask yes confirmed by exactly two calls still
can hold one. The `weighedNos` producer is t663's, and the hold still reads it
as a field, as in round 1.

### Where the re-ask mark is, and why `calls` carries it

**The marks exist on the verification outcome.** They are `refutedNo.reasked`
(t607) and `contradictedUnsure.reasked` (t503). Each re-asked call's
intervention also carries `metadata.verificationReask: true`
(`verify.ts` `askOnce`).

**None of them reaches apply.**

- `build-test/judge.ts` turns an `answers` outcome into
  `{ verdict: "yes", spent }` only (line 325).
- It judges under a synthetic `build-test.<uuid>` run id, and records no
  intervention on the trial run.
- `service/candidate-trial/run.ts` keeps `judge.calls`.
  `service/candidate-trial/promotion.ts` writes `trial: { runId, verdict, calls }`
  on the proposal's `created` audit event.
- Apply's record (`judged-build-trial/applied.ts`) reads that event.

So the only fact about the yes that reaches the saved Flow is `calls`.

**`calls` is that judge's intervention count** (`judge.ts` `spentBy`).

- A first-ask confirmed yes is exactly 2.
- Every re-ask adds its own call:
  - a refuted no re-asked (t607) gives 4, which is the debugged towels
    trial's `judgeCalls: 4`;
  - a contradicted unsure re-asked (t503) gives 3;
  - a split's no re-asked (t515) gives 3.
- So "exactly two" excludes every re-asked yes.
- It also excludes a yes where a call was asked again after a temporary fault
  or Core's exclusion-evidence recheck. That is the safe side: the hold is
  the act that sets nos aside.

**Why no `reasked` field was added.** A `reasked: true` on the applied record
would need the mark carried through `judge.ts`, the candidate-trial record and
`promotion.ts`. None of these is in my ownership. The count already decides
the case exactly.

### What changed

- `build-yes-hold/held-double-no.ts`: `CONFIRMED_CALLS` (`calls < 2`) is
  replaced by `FIRST_ASK_CONFIRMED_CALLS` (`calls !== 2`). Its doc gives the
  reasoning above. The header's precondition now says "exactly two calls, the
  first asked and the second confirming it".
- `build-yes-hold/because.ts`: `trial_not_confirmed` now also covers "a yes
  reached by asking calls again (more than two)".
- `flow-version/judged-build-trial/contracts.ts`: the record's `calls` doc now
  says it is the hold's re-ask mark, and why the outcome's own marks do not
  survive to apply.
- No code change was needed in `applied.ts`, `metadata-with.ts`,
  `from-metadata.ts` or `service/flow-bootstrap-commands/applied-parent.ts`.
  They already carry `calls` unchanged; the chain test below proves it.

### Tests

**`build-yes-hold/tests/held-double-no.test.ts`:**

- A new test, against the hold with both nos contradicted in part:
  - calls 3 and 4 each give `{ held: false, because: "trial_not_confirmed" }`,
    with the outcome unchanged;
  - calls 2 gives `held`.
- The end-to-end precondition list gains `{ ...TRIAL, calls: 4 }`, which gives
  `trial_not_confirmed`.

**`build-yes-hold/tests/saved-flow-trial.test.ts`**, a new chain test:

1. `automationStudioAppliedJudgedBuildTrial` reads a `created` audit whose
   trial has `calls: 4`. The record carries `calls: 4` and the saved versions.
2. It is written with `automationStudioMetadataWithJudgedBuildTrial` and read
   through the saved-Flow port, routed with `subflowId`. The run's check
   records `trial_not_confirmed`.
3. The same chain from `calls: 2` reaches `nos_not_weighed`, past the
   confirmation step.

### Commands run and observed results (round 2)

All run from `packages/fluxiq`, with `R=src/programs/automation-studio/runtime`.

- `npx vitest run $R/result-verification/build-yes-hold`: `Tests 20 passed (20)`.
- **Mutation:** I put back `trial.calls < FIRST_ASK_CONFIRMED_CALLS`.
  - Result: `Tests 3 failed | 17 passed (20)`. The three failures were the
    chain test, the end-to-end precondition list and the new hold-level test.
  - The file was restored from a scratch copy, and `grep -c "trial.calls !== FIRST"`
    printed `1`.
- **Brief directories:**
  `npx vitest run $R/result-verification $R/flow-version $R/service/flow-bootstrap-commands $R/service/project-build`
  printed `Test Files 146 passed (146)` and `Tests 1131 passed (1131)`.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json`: exit 0, no output.
- **Structure audit:** `node scripts/structure-audit.mjs` (repository root)
  printed `structure-audit: passed (386 warning(s), 1156 baselined).`

### Not verified (round 2)

- **A real re-asked trial through the build.** No test drives a re-asked
  trial through the real build-test judge, the candidate trial and promotion
  to apply. The chain test starts at the audit event promotion writes. I
  verified `calls` against `judge.ts` `spentBy` and `askCheck` by reading the
  code, not with a test.
- **Whether `calls === 2` ever drops a genuine first-ask yes live.** It would,
  for example after a temporary provider retry. I have no count of how often
  that happens.

### Open question (round 2)

- **An exact `reasked` field is a cross-module change.** If you want it
  rather than the count, it needs three edits outside my ownership:
  - `judge.ts` sets `reasked: true` on its yes when `outcome.refutedNo?.reasked`
    or `outcome.contradictedUnsure?.reasked` (t515's re-ask needs its own mark
    checked);
  - `candidate-trial/run.ts` and `contracts.ts` keep it on `judge`;
  - `promotion.ts` writes it on `trial`.

  `applied.ts` and the record would then add one optional field. The count
  rule would stay as the fallback.

## Round 3

### Outcome

Done. With t663 merged, `agreement.ts` writes `weighedNos` on every double no
where it holds Core's record of the result (`contracts/verification.ts`
line 79). It lists both calls, with `recordContradicts` only on a no the
record refutes. The four failing tests assumed no producer. They now drive the
real agreement end to end, and no rule was weakened. No defect showed up in
the hold, the port or the record.

The only source edit is in my own `build-yes-hold/weighed-nos.ts`:

- Its header said the agreement kept the weighing "only as words". It now
  names the real producer (t663).
- It read the field through a cast. It now reads the typed
  `outcome.weighedNos`, still as `unknown`, and still checks each entry
  strictly.

### Why the tests failed, and what they assert now

With the real producer, a judge's bare "no" (no reading at all) gets
`weighedNos: [{ call: 1 }, { call: 2 }]`. That is, it stands whole. So the old
expectation `nos_not_weighed` became `no_stands_whole`, which is the producer
working as specified.

The tests now give the judge a reading through the harness's `said`, and the
real agreement weighs it:

- **Refuted in part:** "Only 5 rows were stored." (Core's record holds 2,
  `refuted-no/count-claim.ts`) beside a claim Core cannot check.
- **Standing whole:** that claim alone.

**`build-yes-hold/tests/held-double-no.test.ts`**, through
`verifyAutomationStudioRuntimeSessionResult`, on identical rows with a
first-ask two-call trial:

- The part-refuted reading is held. The run `succeeded`, recorded
  `unverified` / `model_disagreed` / `core.result.build_yes_disagrees`, with
  `buildYesHold: { held: true, because: "held" }`, no repair and no failure
  record.
- The standing reading is refuted, with `no_stands_whole`.
- The precondition cases (no trial, revision, 1 or 4 calls, unsure, digest,
  rows, no port) now use the part-refuted reading. Each one is therefore
  stopped by its precondition, where it would otherwise have been held.
- **The explicit no-`weighedNos` test is kept**, as a hold-level test: an
  outcome without the field returns unchanged, still `does_not_answer` with
  its failure record, with `{ held: false, because: "nos_not_weighed" }`.
  The real agreement omits the field only without Core's record, which the
  run's check always supplies. So this case cannot be reached through
  `verify()`.

**`build-yes-hold/tests/saved-flow-trial.test.ts`:**

- The routed playback (`subflowId`) with the part-refuted reading is `held`.
  With the standing reading it is refuted, with `no_stands_whole`.
- The apply-to-check chain:
  - apply's real record from a re-asked audit (`calls: 4`) gives
    `trial_not_confirmed`;
  - from a first-ask audit (`calls: 2`), with the same reading, it gives
    `held`.

**`service/flow-bootstrap-commands/tests/applied-judged-trial.test.ts`:** a
real candidate build, apply, real `runRuntimeSession` playback, real stores,
and the check asked as `service.ts` asks it (routed):

- the part-refuted double no on the trial's rows is `held`;
- the same playback with standing nos is `refuted` with `no_stands_whole`;
- different rows give `rows_differ`.

Here the standing claim names a condition ("Condition 1 should not have kept
the hybrid packets."), not a row. A first attempt named a row, and Core's
record refuted that reading wholly: this summary withholds values, so the
row's name is not one Core reads off it. The run then went through the t607
re-ask (4 calls) and ended `core.result.refutation_contradicted`, unsure. I
saw this through a temporary probe line, since removed: `grep -c PROBE`
printed `0`.

### Commands run and observed results (round 3)

All run from `packages/fluxiq`, with `R=src/programs/automation-studio/runtime`.

- **Before any change:** `npx vitest run $R/result-verification/build-yes-hold .../applied-judged-trial.test.ts`
  printed `4 failed | 18 passed (22)`. The hold-test failure diff was
  `Expected "nos_not_weighed"` / `Received "no_stands_whole"`.
- **After:**
  - `npx vitest run $R/result-verification/build-yes-hold`: `Tests 22 passed (22)`.
  - `applied-judged-trial.test.ts`: `Tests 2 passed (2)`.
- **Mutation:** I dropped `&& no.recordContradicts !== undefined` in
  `weighed-nos.ts`.
  - Result: `4 failed | 20 passed (24)`. The failures were the routed
    stands-whole case, the end-to-end stands-whole case, the hold-level
    stands-whole case and the service test.
  - The file was restored, and `grep -c` printed `1`.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json`: exit 0.
- **The five directories:**
  `npx vitest run $R/result-verification $R/flow-version $R/service/flow-bootstrap-commands $R/service/project-build $R/service/candidate-trial`
  printed `Test Files 174 passed (174)` and `Tests 1336 passed (1336)`.
- **Structure audit:** `node scripts/structure-audit.mjs` (repository root)
  printed `structure-audit: passed (388 warning(s), 1156 baselined).`
  - That is two more than round 2. None of the warnings is in a file I
    touched. The new ones are directory and exported-value advisories in
    t663's `refuted-no/` and `request-rows/` areas.

### Not verified (round 3)

- **The weighing on a real browser read's summary.** The service test's
  summary withholds values, so a no that names a stored row is not recognised
  as naming it there. On such a run, Core's record cannot keep a row-naming no
  standing, and refuting the reading's other claims may then make the no
  wholly refuted rather than refuted in part. In this test that led to the
  t607 re-ask and an unsure, not a hold. That is safe, but whether live
  summaries withhold row labels this way was not checked.
- No live run.

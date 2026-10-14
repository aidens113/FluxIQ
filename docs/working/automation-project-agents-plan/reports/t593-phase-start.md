# t593 phase-start: one start for every phase of a project build

Worker report. Core worktree `fxwork/t593/!FluxIQ`, branch `task/t593-phase-start`, on top
of `6a81a391`. Nothing is committed. No model provider was called, and no Lab or live run was
made.

## Outcome

Done.

Every phase of a project build now starts from one start in Core,
`service/project-build/phase-start.ts`, in the order the brief gives:

- (a) the start hook;
- (b) the build's reset over every brief's ledger;
- (c) the arrival at the start location;
- (d) the predecessors' passing proposals;
- (e) a `phaseStart` record telling the phase what ran and on what page it stands.

The phases are a builder's, a repair's and a reset's exploration, entry preparation, a subflow
trial and the whole trial. The copies each phase kept are gone.

Also delivered:

- (2) The assembled Flow's router-run subflow opens with the arrival step.
- (3) A press with an effect but no declared lasting class is recorded as possibly lasting.

The matrix test runs every phase through the shared start on one stub site, with and without
a hook. It passes, as do the named sets, the typecheck and the audit.

## What changed and why

### The shared start (`service/project-build/phase-start.ts`, new; `phase-start-told.ts`, new)

`AutomationStudioProjectBuildPhaseStart` holds the start:

- `hook()`: (a). It is the one hook call in Core, `automationStudioCandidateTrialStart`.
- `reset(own, checks)`: (b). It is the build's one reset.
- `arrival()`: (c). It is the domain's arrival node, but only where the build has a start
  location.
- `onSite()`: (b) when there is no hook. It lists the acts of this build still in place and
  the possibly lasting ones.
- `explore()`: the whole sequence (a) to (e) for builder, repair and reset briefs.
- `trialStart()` (static): (e) for a trial, read off the trial's own feedback. It reports
  `start` and whether the first step after Start was the arrival and succeeded.

`phase-start-told.ts` holds the record type and the words. Every phase is told in the same
shape under `phaseStart`:

- `phase`, `startHook` (`ran`, `none`, `failed` or `unknown`);
- `putBack`, `stillOnSite`, `possiblyOnSite`;
- `arrival` (`loaded`, `opening`, `none` or `not_run`);
- `predecessors`, `standsOn`, and a plain `note`.

The trial wording points at the gate's `absorbedByStartReset` and `startedWith`. This answers
bigbox fix 5: a half start no longer reads as `reset`.

Which phase takes which step:

| Phase | (a) hook | (b) reset | (c) arrival | (d) predecessors | (e) told |
| --- | --- | --- | --- | --- | --- |
| builder or repair (`brief-ports.ts`) | `explore` | `explore` | opening look; `loaded` on a prepared entry | `explore` through `entry-preparation.ts` | opening look, `phaseStart` (plus the existing `entry`) |
| reset brief (`brief-ports.ts`) | `explore` | `explore` | opening look | none | opening look, `phaseStart` |
| subflow trial | gate `prepareStart` | gate, over `phaseStart.reset` | run, `phaseStart.arrival()` | run | `subflow-trials.ts` adds `feedback.phaseStart` |
| whole trial | gate `prepareStart` | supervisor reset, over the same project reset | the assembled Flow's first step | none | `whole-trials.ts` adds `feedback.phaseStart` (project builds only) |

Behaviour changes, in order of weight:

1. **A builder with no predecessors gets the full start.** This is bigbox fix 4 and root cause 2.
   - It used to get `{ kind: "start" }` and explored whatever the last trial left.
   - It now runs the hook, and its ledgers mark this build's acts undone.
   - Without a hook it is told which acts of this build are still on the site, and that they
     are undone before a trial.
2. **A reset brief runs the hook first.** After the hook it usually finds nothing left to undo
   and completes.
3. **The hook now runs before the predecessor checks.** It used to run only after them, so a
   dependent builder whose predecessor had no passing proposal never had the site put back.
   Its reset (b) also now comes before the entry run (d), not after it.

### Entry preparation is step (d) only (`entry-preparation.ts`)

- It is handed the start the phase made (`start`) and runs no hook.
- `startReset` is gone from its answer; the phase start records it as `hook: "ran"`.
- It checks predecessors with the same function the subflow trial uses
  (`service/subflow-trial/predecessor-gap.ts`, new). Each phase keeps its own codes
  (`project.entry_predecessor_*` and `subflow.trial_predecessor_*`).
- `AutomationStudioProjectBuildKeptProposals` stays exported, because `run.ts` imports it.

### The one reset (`flow-bootstrap/site-reset/project-reset.ts`, new)

- The joined reset over every brief's ledger used to be duplicated. It lived in
  `service/project-build/trial-reset.ts` (now deleted) and in
  `project-agents/supervisor/whole-trial.ts`, including duplicate `joined` and
  `joinedStartedWith`.
- It now lives in site-reset, so both project-build and project-agents can import it without
  a cycle.
- `own` is optional: the supervisor has none.
- The supervisor keeps only its repeat-refusal guard.

### (2) The assembled Flow begins with the arrival

- `flow-bootstrap/verification/arrival-node.ts` (new) builds the arrival as one plan step. It
  was moved out of `detached-subflow.ts`, which now uses it, so the trial root and assembly
  cannot write it differently.
- `assembly.ts` takes `arrival`. It puts the step first in every router-run subflow:
  - the one assembly writes (before `s1`);
  - a proposed one: after its single Start, with the Start's edges now leaving the arrival, or
    before its single root;
  - unless it already opens with the same step.
- Parts it calls never get the step.
- `arrival: null` (the domain declares an arrival the registry cannot give) refuses with
  `project.assemble_arrival_unavailable`.
- `assemble-tool.ts` builds the step from `ports.submission`: `binding.runsNodes.arrival`,
  `startLocation`, `registry` and `resolution`. That file was not on my list, but the arrival
  had to be wired from somewhere.

### (3) Possibly lasting presses (`flow-bootstrap/site-reset/ledger.ts` and its recording path)

**The ledger (`ledger.ts`).** The new option `possible` records two things:

- an exploration call that landed, was permitted, is `mutate` on a named control, and declared
  no lasting class (a navigation names no control, so it is never one);
- a trial act marked `possible`.

Such an act is marked `possible`, and its `did` ends `(declared no lasting act, but had an
effect: possibly lasting)`.

There is no new refusal. A possibly lasting act:

- is never in `inPlace`, never asked for and never kept;
- does not count towards a phase's recorded acts, so it never makes a start comparison due
  (which would have produced a new `trial_start_differs`);
- is not answered in `leftOnSite`.

The ledger decides whether it can be undone. An undo of it is admitted and judged like any
other undo. A start hook takes it back. While it may still be there it is answered by
`possiblyInPlace()`.

The hook takes it back unnamed. A build presses many controls that declare `none`, and listing
them all in every trial's `absorbedByStartReset` would only be noise.

**The project ledger (`project-ledger.ts`).** It turns `possible` on for every brief's ledger
and marks `possible` in the snapshot. The candidate-mode ledger default is off, so candidate
builds are unchanged.

**Contracts.** `possible?: true` is added to `AutomationStudioSiteResetNamedAct`, to
`AutomationStudioSiteResetTrialAct` (`site-reset/contracts.ts`) and to
`AutomationStudioCandidateTrialAct` (`flow-bootstrap/candidate/contracts.ts`).

**The trial path (`service/candidate-trial/landed-acts.ts`).** This covers crossborder's actual
case: the coupon was pressed only in trials and entry preparations. A domain step (never
`builtin.*`) whose node declared `[]` and whose own traced diff shows its page changed in
place is answered with no classes and `possible: true`. It needs positive evidence; no diff,
or a move to another document, is not enough.

- The candidate gate's `trialActs` drops such acts (empty classes), so the whole-candidate
  path is unchanged.
- The subflow gate keeps them, and so do entry preparation and the whole-trial port's
  supervisor ledger.

**What a phase is told.** It is told up to the 10 latest possibly lasting presses by name, with
`possiblyOnSiteLeftOut` counting the rest.

### Tests

- `service/project-build/tests/project-build-phase-start.test.ts` (new), the matrix, on one
  stub site. The site has an earlier phase's lasting act and a possibly lasting press in
  place, and the tab is elsewhere; the hook resets server state but not the tab.
  - It runs 12 phase cases, each with and without a hook: builder (no predecessors), builder
    after a predecessor, repair after a predecessor, reset, subflow trial and whole trial.
  - The subflow trial uses the real subflow gate, the real `automationStudioProjectBuildSubflowTrials`
    and a lease scope.
  - The whole trial uses the real candidate gate and `automationStudioProjectBuildWholeTrials`
    on the plan `automationStudioProjectAssembly` writes, validated.
  - It uses the real detached runner throughout.
  - Each case asserts (a) to (e), including the no-hook refusal naming act-1 and not the
    possibly lasting act-2.
  - One extra case checks the cap on possibly lasting presses.
- `project-build-reset.test.ts` gains a service-level case, "a project build told where it
  starts". It runs the real `submitComposed`.
  - The builder's proposal is only Start and End.
  - The whole trial's first step after Start is the arrival, and its `phaseStart` says
    `arrival: "loaded"`.
  - The reset brief's opening carries `phaseStart.stillOnSite`.
- `assembly.test.ts` gains three cases:
  - the composed subflow opens with the arrival and parts do not;
  - the arrival goes after a proposed Start, and a subflow that already opens with it is left
    alone;
  - `null` refuses, and no arrival writes none.
- `ledger.test.ts` gains three cases and `project-ledger.test.ts` one, for (3).
- `landed-acts.test.ts` gains one case, for the trial path.
- Updated to the new contract:
  - `project-build-entry-preparation.test.ts`: no hook there now.
  - `project-build-brief-ports.test.ts`: the put-back now comes before the entry run, and the
    opening carries `phaseStart`.

## Commands run and observed results

All were run from `C:/Users/osrs_/FluxStuff/fxwork/t593/!FluxIQ`, with vitest and tsc run in
`packages/fluxiq`.

1. **Baseline, before any edit.** I ran `npx vitest run` over these folders under `runtime/`:
   - `service/project-build`, `project-agents`, `service/subflow-trial`;
   - `flow-bootstrap/verification`, `flow-bootstrap/site-reset`, `service/candidate-trial`.

   Result: 73 files passed and 1 skipped; 607 tests passed and 2 skipped.
2. **Baseline audit** (`node scripts/structure-audit.mjs`): "passed (358 warning(s), 1156
   baselined)".
3. **First typecheck** (`npx tsc --noEmit -p tsconfig.json`): one error, the old
   `prepareEntry` call in `project-build-entry-preparation.test.ts`. I fixed it.
4. **Named sets after the change**: one failure, the brief-ports put-back ordering. That was
   an expected consequence of (b) now coming before (d); I updated the assertion.
5. **Matrix test, first runs**: 7 of 12 failed, all because of the harness:
   - the fixture's executor clock was fixed at 100 while entry preparation stamps the real
     clock;
   - there was no build record naming the plan, so the trial answered
     `subflow.trial_build_gone`;
   - the supervisor's reset repeats its refusal until a reset brief is back.

   I fixed the harness and the final run passed 12 of 12.
6. **Audit after the matrix**: one failure, the test importing `supervisor/state.ts` and
   `whole-trial.ts` directly. I changed the whole-trial case to the shared project reset,
   which is what the supervisor's reset delegates to. The audit then passed with 359 warnings.
7. **Final named sets plus `flow-bootstrap/subflow-candidate`**: 82 files passed and 1
   skipped; 681 tests passed and 2 skipped.
8. **Final `service/project-build` and `project-agents`**, after the reset-test addition: 39
   files and 276 tests passed.
9. **Adjacent candidate-mode and build sets**, after the last change. I ran these folders under
   `runtime/`, plus `api/handlers/tests/llm-generation.test.ts`:
   - `flow-bootstrap/candidate`, `flow-bootstrap/tests`, `service/flow-bootstrap-commands`;
   - `tests/service-authoring`, `tests/service-bootstrap`;
   - `conversations/commands`, `flow-bootstrap/reachability`.

   Result: 98 files and 747 tests passed.
10. **Final typecheck**: exit 0, no output.
11. **Final audit**: "passed (359 warning(s), 1156 baselined)".
    - The one new advisory is `site-reset/ledger.ts` at 441 lines, past the 400-line advisory;
      the hard limit is 800.
    - `service/project-build/` now has 24 source files (it had 23, and was already past the
      15-file advisory); the hard limit is 25.

## Not verified

- No live or Lab run. Whether the web domain's real navigation node validates and runs as the
  assembled Flow's first step was not checked. The tests used stub arrival nodes, including
  one with a fixed output action as the web domain's has, and the real `submitComposed`
  checks accepted it.
- Whether the Lab's start hook resets a coupon-like state, so that "taken back unnamed" is
  true on crossborder.
- Router rules that read page state: the route is chosen before the arrival step inside the
  subflow runs. With page-state rules, routing would still read the stale page.
- The full suites (`pnpm check`, `pnpm test`) were not run, per the twice-a-day rule.
- Downstream: I grepped it for the changed names and found only unrelated `startReset`
  capability fields. No downstream tests were run.

## Open questions or contradictions found

1. **Files touched outside the brief's list.** Each was needed to remove a copy or wire a
   piece, and none is on the must-not-touch list:
   - `flow-bootstrap/site-reset/{contracts,project-ledger,index,project-reset}.ts`;
   - `flow-bootstrap/verification/{arrival-node,index}.ts`;
   - `project-agents/supervisor/assemble-tool.ts`;
   - `flow-bootstrap/candidate/contracts.ts` (an optional field);
   - `service/candidate-trial/landed-acts.ts` and its test.
2. **The build record does not hold possibly lasting acts.**
   - `acts-record.ts` writes each act with its classes, and the record parser refuses an act
     without one (`project.act_without_class`). Such a write is refused into `unrecorded()`,
     which nothing reads.
   - Holding them would need a record-schema change in `project-agents/record/`.
3. **Left-on-target still names only acts in place.** `project-agents/supervisor/left-on-target.ts`
   does not yet say "possibly still there" for possibly lasting acts, so crossborder's "Nothing
   this build did is still on the target" can still be said when only a possibly lasting press
   remains and there was no hook. A one-line follow-up there would close it.
4. **`service/subflow-trial/start.ts` keeps its own thin wrapper.** It is a no-judge wrapper
   around the same hook function, kept because its port hands the prepared start to the run.
   The hook itself is one function.
5. **Docs.** No architecture document was updated; I own none. Core's project-agents
   documentation should gain the phase start and the `phaseStart` evidence key when this
   merges.

# t612 slowdown-repairs-only: worker report

## Outcome

Done. All three parts are built and tested. Nothing in `flow-bootstrap/candidate/trial-gate.ts` needed to change. No live run and no provider probe.

## What changed and why

### (1) Only a slow-down admits the repair of a passing whole test

What I found first: before this change, t603's admission already went only through the trial gate. `rescuedTest` needed the gate's `candidate.trial_slow_down_unhandled` refusal with a non-empty `slowDown`. The gate (`unhandledSlowDowns`) produces entries only from slow-down fields. A consent-only pass was already refused in practice, and t603's "plain pass" test covered that. The gap was that the supervisor trusted whatever steps the gate named and never checked the record itself. If the gate's rules drift, or it names a step whose record shows only a closed banner, a repair would be spent on nothing.

What changed:
- `project-agents/supervisor/state.ts`, `rescuedTest`: each gate `slowDown` entry is now kept only when the step it names shows a slow-down in the standing trial's own step record. The check is the new `slowedDown(entry, steps, paces)`.
- The test is rescued only if at least one entry is kept. The kept entries are the `unanswered` list the repair brief carries.

How Core tells the two apart. It uses only fields of the recovery record, never page text. A step counts as slowed down when any of these holds:
- an `absorbed` entry has a positive `askedWaitMs`. This is the site's own wait hint, read by the executor from the failure's retry hint into `fault.hintedWaitMs` (`service/candidate-trial/absorbed.ts`);
- an `interruptions` entry has `kind: "rate_limit"`. This is the cleared-layer kind the client reports (`executor/node-execution/cleared-layer.ts`);
- a learned pace under `feedback.paces` matches the step by definitionId, label and control. A pace is raised only from a hinted wait (`executor/step-loop/failed-attempt.ts:82`).

What does not count: a closed layer of kind `consent`, `promotion`, `assistant` or `dialog`, or an absorbed retry with only `waitedMs` (the run's own backoff). None of these is a slow-down.

Tests, in `supervisor/tests/interruption-repair.test.ts`:
- End to end, a whole test that recovered only from a consent banner is refused `project.failing_receipt_passed`. That banner covered the control, was closed by its `wayOut`, and the step was pressed again with `absorbed` showing only `waitedMs`. No second dispatch runs, and the outcome is `candidate` with no `reliesOnRecovery`.
- End to end, a test with a consent step and a slow-down step admits the repair. The brief's `interruptions` lists only step 2.
- A direct `rescuedTest` test uses a typed stub gate that names a consent-only step in `slowDown`. It returns undefined. When the gate names both steps, only the slow-down step is kept. The test also confirms that `askedWaitMs`, a `rate_limit` layer and a learned pace each admit on their own.
- Mutation check: I removed the new filter and re-ran. The direct consent test failed (1 failed, 9 passed). I then restored the filter.

`state.ts` must stay within 400 lines, so I shortened its header (the t595 and t603 paragraphs and the opening sentence) with the same content.

### (2) `state.wholeTrialLeftActs` removed (it was dead)

Proof that it was dead:
- In `packages/fluxiq/src`, the field was assigned only `false`: at initialisation (`state.ts:122`) and when a reset came back done (`dispatch-tool.ts:152`).
- The only `= true`, in `whole-trial.ts`, was removed by commit 8cb86714 (t590). Since then the trial's acts live in the project ledger.
- So `lastWholeTrialLeftActs` was always false, and every branch that read it was dead.
- No reader exists outside the supervisor. I grepped Core `packages`, the extension's `domain/src` and `apps/extension/src`; the only other hits are old reports and plan docs.

Removed:
- the field (`state.ts`) and its reset in `dispatch-tool.ts`, with the module doc sentence about it;
- `lastWholeTrialLeftActs` on the `LeftOnTarget` type, plus its pushed line and its share of `undoable` (`left-on-target.ts`);
- the `state` parameter of `automationStudioProjectSupervisorLeftOnTarget`, which now takes `ports` alone. I updated its callers in `completion.ts`, `dispatch-tool.ts` and `supervisor-loop.ts`, and in `tests/left-on-target.test.ts`;
- the optional `lastWholeTrialLeftActs: true` field on `project.completion_reset_first` and `project.reset_repeated` answers, and the `trial` field of `leftKey`.

The model-facing answers lose a field that was never present, so nothing a model could see changes.

### (3) Promotion test for t608's `endingCodes`

New test in `service/candidate-trial/tests/promotion.test.ts`:
- A `no` draft with `feedback.endingCodes` gives codes `["candidate.trial_judged_no", "project.build_time_limit", "project.a", "project.b"]`. The draft's own code comes first. A duplicate of it is dropped, as are non-identifiers and anything past the first four valid entries.
- A stale-revision yes gives `["candidate.trial_stale_revision", "project.build_time_limit"]`.
- In both cases nothing is proposed.

## Commands run and observed results

All run from `C:/Users/osrs_/FluxStuff/fxwork/t612/!FluxIQ`:
- `npx tsc --noEmit -p .` in `packages/fluxiq`:
  - The first run gave 5 errors, all in my new test (a JsonValue spread and untyped stub fields). I fixed them.
  - The final run gave exit 0 with no output.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/service/candidate-trial`: `Test Files 67 passed (67)`, `Tests 484 passed (484)`.
- `node scripts/structure-audit.mjs`:
  - The first run flagged `[as-never]` on my two stub casts. I replaced them with typed stubs.
  - The final run: `structure-audit: 1 violation(s) across 1 rule(s)`. The one violation is `[working-docs] docs/working/README.md is out of date with the documents' header blocks`.
  - That violation is not from this task: I touched no working doc other than this report. It needs `pnpm structure:baseline` by the supervisor.
  - No new warning names a touched source file, and `state.ts` is 400 lines.

## Not verified

- No live or Lab run, and no browser.
- Whether a real client ever reports a site slow-down notice under a kind other than `rate_limit` (for example `dialog`). If it does, neither the gate nor this check would treat it as a slow-down. That is a domain classification question, outside this brief.
- The full Core vitest suite was not run, by the twice-a-day rule.

## Open questions or contradictions found

- The brief says a dismissed consent banner "admits one too". In the code before this change it did not: the gate never names a consent-only step. The new record check is a second, independent guard. It changes the outcome only if the gate names a step whose record shows no slow-down.
- The brief dates the setter's removal to t593. The commit that removed it is 8cb86714, which is t590 by its message.

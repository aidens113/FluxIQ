# t661 not-shown-routes-back-and-trial-paid (worker report)

Branch `task/t661-not-shown-routes-back-and-trial-paid`, Core worktree `fxwork/t661/!FluxIQ`. Nothing committed.
Sources: downstream debugs `a8-bigbox-cart-run-mvac0ddx-debug.md` (fixes 3 Core half, 4) and
`a8-towels-run-mvac0nmw-debug.md` (fix 8), plus the coordinator's mid-task addition (`noMatchCause`).

## Outcome

Done. All four pieces are built and tested: a control that is on the page but not shown (fix 3), going back to the
step that opened it (fix 4), no trial when the judge calls cannot be paid (fix 8), and `noMatchCause` on the run
detail. The typecheck, the structure audit and the named test directories pass. Nothing was run live.

## What changed and why

**Contract with downstream t656 (read structurally, absence tolerated).** t656 had not started when I checked
(`fxwork/t656`: no source diff), so I chose the shapes below. t656 needs to emit them, or this brief needs a follow-up:
- **Not shown.** The domain's resolution beside the action result,
  `outputs.result.result.resolution.shown === false` (closed boolean, no page words). Only exactly `false` counts. If
  the field is missing, the behaviour is the same as before. Core does not read the `web.target.not_shown` code.
- **Opened by this run.** A cleared layer in the dispatch's own report, `outputs.result.clearedLayers[i].runOpened === true`,
  matched by `kind` + `wayOut`. Core's parser `executor/node-execution/cleared-layers.ts` (not mine) drops unknown
  fields, so `interruptions.ts` reads the raw dispatch report on the attempt instead.

**Fix 3: present but not shown** (`service/candidate-trial/`, gates)
- New `executor/state-routing/target-not-shown.ts`, `automationStudioTargetMeasuredNotShown`. It is the single reader,
  shared by the trial feedback and routing.
- `target-on-page.ts`: the latest try that measured anything decides. If that try was not shown, the step gets these
  fields instead of `targetOnPage`:
  - `targetNotShown: true` and `retryable: false`;
  - happened: "found its control on the page, but the control was not shown";
  - `notShown`: "...a step before it must show it";
  - advice: change the steps that lead to it, not how the step finds its control.

  It never says "the step is right" or "test again".
- `absorbed.ts`: the tries a step got past use the same not-shown words. `feedback.ts` passes the flag through.
- `trial-gate.ts`: new exported `automationStudioCandidateNotShownInstruction(answer, resubmit)`. It comes before the
  near-miss path in both `standingInstruction` and `repeatedInstruction`. `subflow-trial-gate.ts` uses it with
  "submit the subflow with core.submit_subflow".
- `interruptions.ts`:
  - A layer is now worded "<Kind words> ("<layer name>") was over the page"; "The page put" is gone.
  - When the domain marks a layer `runOpened`, the sentence reads ", a layer step N opened," and adds "Closing it undid
    what step N had opened". It also carries `openedByStep`.
  - N is the nearest earlier listed step that acted (succeeded, not skipped, not done by state). `feedback.ts`
    computes it in `openerBefore`.

**Fix 4: route back to the opener** (`executor/state-routing/`)
- New `reopen.ts`, `automationStudioStateReopenOpener`. It returns an opener only when all of these hold:
  - the failing attempt was measured not shown;
  - the failing step recorded a `before` signature;
  - the opener is the nearest earlier attempt in this run that acted and whose node recorded an `after` signature.
    Steps with no record, such as a join or a wait, are passed over;
  - the opener's act does not last (`automationStudioNodeActLasts`). A lasting-act opener is never re-run;
  - the host's `compareRouteSignatures(opener.after, failing.before)` matches. This compares Core's own records only.
- `decision.ts`:
  - The opener is computed before the `no_pre_states` early return. Reopen runs after the own-effect check and before
    candidate ranking.
  - It goes through `repeatRefusal`. A completed lasting act on the walk back refuses it, the refusal is added to
    `refused`, and ranking continues.
  - It then goes through a new per-run memory, `guard.reopen(opener, progressMark)`. If a return to the same opener
    already happened at the same mark, the decision is `stopped`, with outcome `guard_stopped` and a reason.
  - Last comes the existing progress guard `admit`.
  - A successful reopen is `routed` / `backward` with `reopen: true`.
  - The `attempt` input type now also accepts `outputs`.
- `progress-guard.ts`: new `reopen(nodeId, mark)` on the guard. It allows one return per opener until the progress mark
  moves.
- `announcement.ts`: a reopen is announced as "Going back for X: its control was on the page but not shown. Continuing
  with Y, which showed it", not "the page went back".

**Coordinator addition: `noMatchCause`**
- New closed type `AutomationStudioFlowRunStateRouteNoMatchCause` in `model/flow-adaptation.ts`. It is an optional field
  on the run detail's no-match variant. The cause values match the distinctions the decision actually draws:
  - `effect_not_on_page`: the step recorded its own effect, the page did not show it, and no other step had a recorded
    starting page;
  - `effect_route_refused`: the effect was on the page, but going on past it was refused;
  - `matches_refused`: the page matched other steps' starting pages, but a guard refused each one;
  - `matching_steps_already_acted`: the matching steps had already acted;
  - `no_step_matches_page`: no step's starting page matched the page.
- `refusal.ts`: `AutomationStudioGuardedStateRoutingRecord` is now the executor record plus `noMatchCause`. This avoids
  editing `executor/contracts.ts`. `decision.ts` sets the cause at every `no_match`.
- `service/summaries/state-routing.ts` keeps the cause only on `no_match`, and only when it is one of the five codes.
  The reason sentence is still dropped.

**Fix 8: no trial the purse cannot judge** (`service/candidate-trial/judging-fits.ts`, new)
- `automationStudioTrialJudgingShortfall` finds the purse the judge calls would be held against
  (`automationStudioLlmCurrentBuildPurse()`, the same async-chain purse the harness uses). It holds two judge calls
  there at their worst case, then releases both.
  - Input tokens per call are max(standing 8,000, the largest judge prompt per call from earlier trial records,
    `automationStudioTrialLargestJudgePrompt`). The reply is the judge reply reserve, priced at the purse's last-learned
    price.
  - On refusal it restores `refusal` on the purse and every parent, so the loop does not end on a probe call.
  - It returns figures: `judgeCalls`, `judgeCallUsd`, `neededUsd`, `refusedBy`, and `leftUsd` or `callsLeft`.
- Both `run.ts` files check before the start hook or any session.
  - When the purse is short, the answer is `not_judged` with code `candidate.trial_unaffordable` /
    `subflow.trial_unaffordable`. Nothing runs and the record shows `execution: not_run`.
  - The candidate re-judgement path checks too, and keeps its unjudged evidence.
- Both `port.ts` files skip the start hook in `prepareStart` when the purse is short (they return `"none"`), and pass
  the earlier-prompt estimate to the run.
- Both gates treat that code as no trial. The trial is not counted, no verdict is kept, the port is not told a verdict,
  and the gate refuses with the code, an instruction, `notRun` figures and no `retry_allowed`. An identical retest is
  therefore left to the repeat guard.

## Commands run and observed results

All of these ran from `fxwork/t661/!FluxIQ/packages/fluxiq`.

- `./node_modules/.bin/tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t661-check.tsbuildinfo`
  produced no output (exit 0) on the final tree. Earlier runs caught three test type errors, which I fixed.
- `vitest run <runtime>/executor <runtime>/flow-bootstrap <runtime>/service/candidate-trial <runtime>/service/subflow-trial`:
  "Test Files 309 passed | 1 skipped (310); Tests 3296 passed | 2 skipped".
  - This run overlapped with my structure-audit fixes to four new test files, so I reran those directories and files
    below.
- `vitest run` over these:
  - `executor/state-routing`, `service/candidate-trial/tests/judging-fits.test.ts` and `service/subflow-trial/tests`;
  - both new gate tests, and `service/summaries/tests/state-routing.test.ts`;
  - the trial-driving service suites: `service/end-view/tests/passive-result.test.ts`, `service/project-build/tests`,
    five `service/flow-bootstrap-commands/tests/candidate-*.test.ts` and `project-agents/supervisor/tests/reset-next.test.ts`.

  Result: "Test Files 45 passed (45); Tests 231 passed (231)".
- `vitest run runtime/tests/service-bootstrap/tests/generation.test.ts`: 9 of 9 passed.
- An earlier narrow run showed the one expected failure: `interruptions.test.ts` still asserted the old "The page put"
  wording. I updated the test.
- `node scripts/structure-audit.mjs` (repo root): "structure-audit: passed (386 warning(s), 1156 baselined)". The first
  run found 5 violations in my new tests (`as never` and statement packing), which I fixed. There is one new advisory:
  `flow-bootstrap/subflow-candidate/tests/` now holds 16 files, over the 15-file advice.

The new tests and what they prove:
- `candidate-trial/tests/target-on-page.test.ts`: not-shown cases, tolerance of a missing or non-false `shown`, and the
  gate instruction plus same-failure refusal.
- `interruptions.test.ts`: run-opened step, layer name, and no "page put".
- `state-routing/tests/reopen.test.ts`:
  - it routes back once, passing over a join;
  - a second return with no progress stops;
  - after progress it goes back again;
  - a lasting-act opener is never re-run;
  - a lasting act in between is refused;
  - nothing happens without `shown: false`, without an after/before match, or without a recorded opener.
- `state-routing/tests/no-match-cause.test.ts`: each of the five causes, and none on `unobserved` or `no_pre_states`.
- `summaries/tests/state-routing.test.ts`: each cause is carried, page words in the reason or cause never leak, and an
  invalid or off-outcome cause is dropped.
- `candidate-trial/tests/judging-fits.test.ts`: the probe fits or refuses with figures, restores the refusal, leaves
  nothing pending, and estimates from the largest earlier prompt. A candidate trial that is not started opens no
  hook, session, run or judge call. When the purse can pay, it runs as before. `prepareStart` skips the hook.
- `subflow-trial/tests/trial-unaffordable.test.ts`: one judge call affordable gives a refusal before the subflow runs,
  with no judge recorded. Two affordable runs as now. `prepareStart` skips the hook.
- `flow-bootstrap/candidate/tests/trial-gate-not-shown.test.ts` and
  `flow-bootstrap/subflow-candidate/tests/subflow-trial-not-shown.test.ts`: the not-shown instructions, and the
  unaffordable answer is neither counted nor kept, carries no retry reason, and the port is not told a verdict.

## Not verified

- No live run (as briefed). The whole loop has not been seen end to end:
  - routing back to the opener in a real graph run (the step-loop re-runs the opener, the optional step, then the
    failing step);
  - the announcement in the chat.
- No graph-level test runs `runAutomationStudioGraph` through a reopen. Coverage is at the decision level, which is the
  level the brief named.
- Real t656 output was never read. Both downstream fields (`resolution.shown`, `clearedLayers[].runOpened`) are my
  proposed contract.
- **Possibly wrong step number.** The `openedByStep` number is the nearest earlier step that acted. This is Core's
  closest proxy; the domain does not report which press opened the layer.
- The affordability probe holds against the purse on the current async chain. I assumed, without checking in a live
  build, that the trial port runs on the same chain as the judge's harness hold. The code paths read the same way.
- Full `pnpm check` / `pnpm test` not run (twice-a-day rule). `apps/web` was not typechecked. Its
  `attempt-story/state-routing.ts` reads the run-detail union, and an added optional field should be compatible.

## Open questions or contradictions found

1. **Files touched outside my ownership.** `model/flow-adaptation.ts` was required for the coordinator's `noMatchCause`:
   the run detail's type lives there, and the summary must return it.
2. **Leftover gate reset step.** When the purse is short, the gate's site-reset check (`reset.beforeTrial`) still runs
   before the port is asked, because the port type in `flow-bootstrap/candidate/contracts.ts` (not mine) has no
   affordability hook. A build with acts to undo would be told to undo them, and only then told the trial is
   unaffordable. Moving the probe ahead of the reset needs an optional port method in contracts.
3. **Side effect of the probe.** A successful probe hold on an allowance can draw a top-up from the parent purse, which
   stays granted after release. The real judge call would have drawn the same top-up. I left it as is.
4. **Retests after not-shown.** For a not-shown stop the gate still allows retests (`retestsLeft` > 0, `retry_allowed`),
   but the instruction says testing unchanged meets the same hidden control. Closing retests for not-shown would be a
   stricter choice. I left the bound as it was, because a race (like bigbox's) can still pass on a retest.

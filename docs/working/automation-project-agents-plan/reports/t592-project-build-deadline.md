# t592 project-build-deadline: worker report

## Outcome

Done. Core now has one bound on a whole project build: 30 minutes, kept in one place. The supervisor's run enforces it and ends through the t586 honest ending. The Lab's chat deadline for `project` mode comes from Core's export, and candidate and legacy mode wait exactly what they waited before (795 000 ms).

## What changed and why

Core (`C:/Users/osrs_/FluxStuff/fxwork/t592/!FluxIQ`, under `packages/fluxiq/src/programs/automation-studio/runtime/`):

- `loop-limits/project-build-duration.ts` (new): `AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS = 1_800_000`. Its header says where the clock starts and what counts.
  - **Start:** the clock starts when `runAutomationStudioProjectSupervisorLoop` is called, before it reads the build record.
  - **Counted:** the supervisor's decisions, every builder it dispatches with their subflow trials and resets, whole trials and their judges, and Core's reset plus the recorded ending.
  - **Not counted:** the caller's work around the run (generation lock, saving the draft) and the chat.
  - A supervisor restarted on a build already under way starts a fresh clock.
- `loop-limits/project-build-ending-time.ts` (new): `AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS = 300_000`. This is the last 5 minutes of the bound, kept for the ending, so the reset and the recorded ending still happen inside the 30 minutes. The brief did not set this number; I chose it.
- `loop-limits/index.ts`: re-exports both new files.
- `project-agents/supervisor/supervisor-loop.ts`, duration wiring only:
  - The loop takes an optional `timeLimit: { maxMs, endingMs }`, which defaults to Core's two constants. Two timers start at call time and are cleared in `finally`:
    - `work` aborts at `maxMs - endingMs`;
    - `whole` aborts at `maxMs`.
  - The loop, `context.signal` (so dispatches and builders) and whole trials run under person-cancel + `work`. A builder in flight is stopped and comes back stopped, which is the dispatcher's existing behaviour. The loop then ends `cancelled`.
  - When `work` fired and the person did not cancel, the run is treated as out of time rather than cancelled:
    - the ending is `partial`/`blocked`, worded "The build reached its time limit of N minutes before a whole trial passed.";
    - `resetBeforeEnding` runs under person-cancel + `whole`. If the bound stops the reset, the error is swallowed and the ending still records what is left (`left-on-target`);
    - the outcome carries `timedOut: true`.
  - Unchanged: a completion or honest ending reached as the deadline passes still stands; out of money still takes priority.
  - Previously the loop got no signal when no person signal existed. Now it always gets one.
- `service/project-build/run.ts`: a timed-out build with no candidate now fails as `flow_bootstrap.post_provider_validation_failed` with the issue codes `project.build_time_limit` and `project.build_<outcome>`. Before, it would have read as the loop's `flow_bootstrap.evidence_cancelled`. The person is still told the recorded ending through `toldEnding`. The header has a new paragraph explaining this.
- `runtime/index.ts`: **outside the owned list, one line.** It publishes `AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS` through `fluxiq/automation-studio`. `loop-limits` is not otherwise public, and the Lab can only read Core through that entry point. The line goes after the `llm` export, so the existing module-cycle order is unchanged.
- Tests:
  - `loop-limits/tests/project-build-duration.test.ts` pins 1 800 000 and 300 000, checks that the work time is longer than the 540 s loop deadline, and checks the public export.
  - `project-agents/supervisor/tests/supervisor-time-limit.test.ts` covers four stub runs with short limits:
    - a builder in flight is stopped at the work deadline, no further decision is made, Core's reset runs under the un-aborted bound signal and undoes the act, and the ending is `partial` with the time-limit reason, inside the bound;
    - a reset that overruns is stopped at the bound, and the ending is still recorded with "Still on the target ...";
    - a run with nothing done ends `blocked` with no reset;
    - a run that finishes inside its limit is `candidate` with no `timedOut`, and its timers are cleared.
  - `supervisor-script.ts` gained a `timeLimit` passthrough.

Downstream (`C:/Users/osrs_/FluxStuff/fxwork/t592/!FluxIQWebExtension`):

- `packages/test-runner/src/flow-lane/creation/chat/build-deadline.ts` (new): `createdFlowChatBuildDeadlineMs(mode)`.
  - Candidate and legacy: `60_000 + 600_000 + 15_000 + 120_000`, the same expression as before.
  - Project: `60_000 + AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS + 15_000 + 120_000` = 1 995 000 ms.
  - It is exported through `chat/index.ts`.
- `chat/build-from-chat.ts`: `DEADLINE_MS` is removed. The default deadline is now `createdFlowChatBuildDeadlineMs(input.authoringMode)`, and an explicit `wait.deadlineMs` still wins. The mode already reached this function (`input.authoringMode`), so no Lab caller needed changing. `build-proposal.ts` needed no change: it refuses `project` mode before sending anything.
- Tests:
  - `chat/tests/build-deadline.test.ts` pins the project deadline to Core's export (and the export to 1 800 000), and the candidate and legacy deadlines to 795 000.
  - `chat/tests/build-from-chat.test.ts` gained a new test: a project build whose result never comes is waited exactly 60 000 + Core's bound + 135 000 ms on the fake clock, and a candidate build exactly 795 000.
- `docs/architecture/testing-facility.md`: there was no deadline paragraph, so I added one after the chat build record paragraph (`buildEntry: "chat"`).

## Commands run and observed results

- Core `npx vitest run <runtime>/loop-limits/tests <runtime>/project-agents/supervisor/tests` -> 16 files, 99 tests passed. The time-limit tests took 636 ms, 923 ms and 462 ms.
- Core `npx vitest run <runtime>/service/project-build/tests <runtime>/project-agents/dispatch/tests` -> 16 files, 86 tests passed.
- Core `npx tsc --noEmit --incremental ...` (the `fluxiq:check` command) in `packages/fluxiq` -> no output, exit 0.
- Core `node scripts/structure-audit.mjs` (`pnpm structure:check`) -> `structure-audit: passed (358 warning(s), 1156 baselined).`
- Core `pnpm --filter fluxiq build` -> build-cache "build", 62.8 s. The downstream build needs this.
- Downstream `pnpm check` in `packages/test-runner` -> core-build current, domain build, `test-runner:check` exit 0.
- Downstream `test-runner:build` then `node --test dist/flow-lane/creation/chat/tests/*.test.js dist/live-llm/tests/live-llm-plan.test.js` -> 51 pass, 0 fail. A separate run of `build-deadline` + `build-from-chat` -> 20 of 20 ok, including both new tests.
- Downstream `node scripts/structure-audit.mjs` -> `structure-audit: passed (194 warning(s), 639 baselined).`
- Nothing was run that could reach a model provider. No Lab run.

## Not verified

- No test covers the `run.ts` mapping (`project.build_time_limit` issue codes). The service facade tests cannot inject a short limit, and no stub run lasts 25 minutes. The Core service test set still passes.
- The 5-minute ending slice has not been measured live against a real reset brief.
- No live or Lab run, so it is unconfirmed that a real 30-minute social or bigbox build now finishes inside the Lab's 1 995 s.
- No Core domain, web or full suites were run (narrow checks only, as `AGENTS.md` requires).

## Open questions or contradictions found

- Builders in a project build run with no duration budget: `brief-ports.ts` and `run.ts` drop `draft.loop.budget`. Only this new bound and the supervisor's abort stop a long builder. The supervisor model is not told how much time is left, because its loop deliberately takes no `budget` (header: "No `budget` wrap-up"). Showing it the time left would need the evidence loop's budget machinery, which would also switch on cost-based wrap-up. That is out of scope.
- `runtime/index.ts` was edited outside the owned list (one export line), as explained above.
- Core's authored docs for project agents (for example `docs/architecture/automation-studio/...`) were not updated. The supervisor may want a line about the time limit there.
- The new phrase `project.build_time_limit` is an issue code made the same way as the existing `project.build_<outcome>`. No reader of it exists yet; the Lab records issue codes as they come.

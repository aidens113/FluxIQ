# Second attempt: the attempt driver (t870)

## Outcome

Done, provider-free: a scripted model, the fake library, the real service and the real engine. No Lab, browser or real site. An attempt now finds its task's saved Flow, runs it live and judged, carries on from where it stopped, and keeps the Flow only if it is better. One real hole is left open, because closing it needs a file outside my paths: see "Open questions", item 1.

`AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

## What each case does now

| Case | Route | What runs | Path | `result.source` |
| --- | --- | --- | --- | --- |
| Nothing saved | build | rounds, told nothing: as attempt 1 always was | `explore` | `exploration` |
| Notes only | build | rounds, told the notes | `explore` | `exploration` |
| Another task's steps on this Flow | build | rounds, draft seeded, told they are a known start only; nothing runs | `explore` | `exploration` |
| Saved steps do not assemble | repair | rounds, seeded and told; nothing runs | `explore` | `exploration` |
| Flow holds | use | run, one judge call, yes; no decision at all | `run_flow` | `flow` |
| Stops at a step, or judged no or unsure | use | run, then rounds told the step or the reason, from the page it left | see below | `both` |
| ...yes with a forward run reaching the last proposed step, first round | use | as above | `run_flow_then_repair` | `both` |
| ...any other yes, or any fresh round | use | as above | `run_flow_then_explore` | `both` |
| A person says no to the plan | use | nothing sent; rounds look for another way | `explore` | `exploration` |
| Judge refused by the purse | use | run; attempt ends `budget_out` keeping the run's rows | `run_flow_then_explore` | `both` |
| A Stop during the run | use | `stopped_by_person`; says nothing of the Flow | `run_flow_then_explore` | `both` |
| A run's deadline | use | the run ends, the attempt carries on to its result | `run_flow_then_explore` | `both` |

New in `AF/attempt/`: `opening.ts` (task key, route, ordinal, seeds), `opening-row.ts`, `flow-stage.ts`, `round-note.ts` (was `freshNote`), `path.ts`, `remember.ts`, `best-effort.ts`. `AF/task-memory/saved-state.ts` exports `automationStudioAnswerFirstSavedStateOf(memory)`, which takes only the memory. Guidance is `answer-first.2`. `begun-in-chain.test.ts` is placed.

## Decisions the design left open

- **A run that sent nothing did not happen.** "Went out" means `liveSteps` rose, so an engine that refuses to start reads as `explore` and does not count against the Flow.
- **The judge's look stays where the run left the page.** After a run that moved the page, `run.options` becomes `continuingOptions()`. Without this, the look and the end witness would go back to the start location. A mutation test proves it.
- **A Flow's digest covers only the steps it proposes.** A round's opening look is a non-proposed step at its own position, so otherwise the same Flow would read as a different one. An attempt that only looked saves no steps, and its `best` stays as it was. `latest` is still written, with empty steps. `automationStudioAnswerFirstKnownFlow` then answers that Flow, which only reuses a blank Flow.
- **The Flow's act record is overwritten at opening.** `run-acts` keeps one record per Flow. So a new attempt writes its own record (seed or empty) at once, wherever a record already exists. Otherwise an attempt that pressed nothing would leave an earlier attempt's acts to be read as its own. This also ends the older rule for that Flow: a first real run carries the earlier attempt's acts only until a new attempt opens.
- **Attempt 1 on a fresh Flow writes no act record it did not write before.** It does read once more. Its first round's note is still absent.
- **A setup refusal does not count as an attempt.** Its provenance row is removed. After a run that went out, a setup refusal stays a fresh round, because the run has acted on the site, so `setup_needed` cannot throw its rows away.
- **`stopped` with no Stop.** If the Flow run says `stopped` but the signal is not aborted, the attempt goes on to rounds. A stray `AbortError` must not read as a person's Stop.
- **The judge's words never reach a Core note.** They may quote the page. Core notes hold the step number, Core's sentence for it, and how the attempt ended. A person's Stop gets no Core note of its own.
- **A one-line barrel edit outside the list.** `task-memory/index.ts` exports the new file. The structure rules require it. Also, `attempt/contracts.ts`'s `stores.paths` is widened to `"root" | "projectFile"`, which the service already passes.

## Commands and observed output

All from the Core worktree, on the final code unless stated.

- `pnpm.cmd --filter fluxiq check` -> exit 0, 0 `error TS` lines.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (498 warning(s), 1097 baselined).`
- `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first src/runtime/answer-first --minWorkers 1 --maxWorkers 2` -> `Test Files 53 passed (53)`, `Tests 556 passed (556)`, Duration 622.73s, exit 0. The old `attempt.test.ts` and the endings tests are among them, unedited.
- `git status` also shows `packages/fluxiq/src/runtime/conversations/instructions/prompt.ts` modified. That is not mine: it is on my must-not-touch list, and I did not open or edit it.

Mutations, each restored afterwards. Each made its named test fail:

| Removed | Observed |
| --- | --- |
| `continuingOptions` after a run | `expected [ …(2) ] to deeply equal []` |
| The witness before the engine | `expected 0 to be greater than 0` |
| The guard against another attempt's record | `expected [ { …(5) }, { …(5) } ] to deeply equal [ Array(1) ]` |
| The record written at opening | `expected [ { …(13) } ] to deeply equal []` |
| The path's flip on a fresh round | `expected { …(14) } to match object { status: 'achieved', …(1) }` |

## Not verified

- Live browser, Lab, or real domain answers. The saved steps here come from a stub domain, so `resolvePlanNodeParameters` on real saved steps is still unproven (the flow-run report's point).
- The removal of a provenance row on a setup refusal has no test.
- A run's step bound or a child Flow's bound through the real service: only the deadline is driven this way. The flow-run tests cover the step bound and the child Flow's bound at the stage.
- A task with `plain_answer`: its whole run has nothing to judge, so it goes to rounds. By reading only.
- A real process kill between opening and the first row. By reading only: no row counts as unfinished, so acts carry.

## Open questions or contradictions found

1. **A hole, and the change it needs is outside my paths.** Task A ends `budget_out` with an act landed. Task B then runs on the same Flow and replaces that Flow's one act record. When task A runs again, its own acts are gone and it presses them again, which breaks the rule that an act that landed is never repeated. It needs two tasks alternating on one Flow, and the chat's new Flow per ask makes that rare. Today the driver only refuses to seed the other task's acts, and a test holds that. **The fix:** add an `acts?` field to `task-memory/memory.ts`, written at each ending and seeded from there rather than from the Flow's record. It is about ten lines. I did not make it, since `memory.ts` is not on my list. Lead, your call.
2. **The path word on a Stop or budget-out.** The design says "anything else after a run" is `run_flow_then_explore`, so a Stop mid-run reads as "Used what I saved as far as it went, then worked out the rest", though nothing was worked out. I followed the design. Changing it means a word or a rule in `path-words.ts` (t871) or a change to `path.ts`.
3. **`BetterFlow`, same digest.** A same-steps Flow from a Stop or budget-out replaces the kept one with its `unverified` label, keeping `provenWhole`, so `saved-state` still says `ready` with a later `savedAtMs` as its `lastWorkedAtMs`. That date can be slightly late. The table says this, and I left it.
4. **A stale comment I may not touch.** `attempt-store/record.ts` says steps are kept only where they could not be assembled. They are now always kept.
5. **For the next worker.** `opened()` takes `prior` and `segmentStartedAtMs` where `automationStudioAnswerFirstOpening` is called. A carry-on should skip that call and the write at opening.

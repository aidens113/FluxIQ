# Second attempt: carry on, interrupted, acts per task, path (t870)

## Outcome

Done, provider-free: a scripted model, the fake library, the real service, the real engine and real SQL. No Lab, browser, real site or key. Item 3's double press is closed. `AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

## Exports for the client road (all from `AF/index.ts`)

```ts
automationStudioAnswerFirstCarryOn<T>(
  owner: object,
  ports: { paths; flows; projects },   // the same stores as automationStudioAnswerFirstAttemptStoreOf
  request: { projectId: string; attemptId: string; addUsd: number },
  run: (at: { flowId: string; taskId: string }) => Promise<T>   // the client's generate call, answer-first, on that Flow
): Promise<AutomationStudioAnswerFirstCarryOnAnswer<T>>

type AutomationStudioAnswerFirstCarryOnAnswer<T> =
  | { ok: false; refused: AutomationStudioAnswerFirstCarryOnRefusedCode; say: string }
  | { ok: true; attemptId: string; budgetUsd: number; finished: Promise<T> };

type AutomationStudioAnswerFirstCarryOnRefusedCode =
  "unknown_attempt" | "live" | "achieved" | "stopped" | "waiting_for_person" | "no_budget_added" | "later_attempt" | "acts_unreadable" | "unreadable";

automationStudioAnswerFirstAttemptsRead(owner, ports): { list(projectId, flowId); get(projectId, flowId, attemptId); latest(projectId, flowId) }
```

`run` gets the Flow as an argument, because the client's press holds only a project and an attempt. A zero-argument `run` also fits. A rejected `finished` cannot take the process down if nobody awaits it. The barrel also exports `automationStudioAnswerFirstLiveAttemptsOf`, `automationStudioAnswerFirstInterruptedView` and `AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS`. `AutomationStudioAnswerFirstTaskMemory` gains `acts?: { attemptId; flowId; data }`.

## Decisions

- **The tried record:** the loop's record already takes a seed (`automationStudioLlmLoopAttemptRecord(seed)`), so I used it and added nothing. The model is told what was tried through the existing `tried` in the round note.
- **The press writes the row at once:** `working`, raised budget, no `endedAtMs`. If `run` never reaches an attempt (it throws, or a setup step comes before any model call), the row goes back exactly as it was. The budget is not raised and the press can be repeated.
- **The attempt is claimed before anything is read,** so two presses at once start it once (tested).
- **One refusal beyond the brief's list:** `later_attempt`. If a later attempt at the task has started, its record may hold acts this one lacks, so carrying on could press them twice. Lead, your call whether to keep it.
- **`acts_unreadable`:** an attempt whose row shows acts, with no record left to hold them, is refused rather than pressed again.
- **The first row is written earlier.** A hang in the first round used to leave no row at all, so there was nothing to read as interrupted. `decide.ts` now keeps the row after each decision. `flow-stage.ts` keeps it when the run's first step goes out. Neither can orphan a setup refusal: one needs spending and the other a step sent. The row's spend is now stale by at most one model call.
- **The ending of a person-only check with nobody to ask** is told apart from a question left open by a restart by its `missingWhat` words (`interrupted/check-missing.ts`, used by `ending.ts`). No other mark survives a restart, and I may not touch `attempt-store/**`.
- **Ceiling:** remaining plus added, held under the host's total and the Lab's test ceiling. The $5 default and the Flow's own limit do not hold it, because the press is explicit. Adding the Lab ceiling goes beyond the brief; explicit limits hold.
- **`budget.usd`:** old plus added, less whatever the host's total held the purse below that, so the row says what the attempt really has. The press's immediate `budgetUsd` cannot know the host's total and says old plus added.
- **Acts:** memory first, the Flow's record only when the row is the Flow's latest, as the brief says. A new attempt's seed reads the status of the attempt that owns the acts, through the facade.
- **Rows:** a batch per page, keyed by a hash of source run, dataset and part, with the result's dataset copied last. A store that cannot be read, or no store, falls back to the row's preview rows, marked truncated if short, and a failed read says part of the record was not written. The copied rows count as a run's rows, so a judge's no in a carry-on takes their standing away (`round.ts`, `run.prior` only). Otherwise a wrong list could outrank the right one forever.
- **Path:** a press is a fresh start, so a carried-on attempt that reaches its result reads `run_flow_then_explore`, never `run_flow_then_repair`, if a run went out. `run_flow` now appears on `budget_out` and `stopped_by_person` rows with `source: "flow"`.
- **Page:** a carried-on attempt with live steps goes on from the page as it stands, with no start location. The round's opening look is what clears a may-have-landed act for a retry.
- **A setup refusal during a carry-on** does not remove its provenance row.
- **`waitingFor` not widened:** only the sweep writes `interrupted`, so `state.ts` did not need it.
- **File moves:** `attempt/` was at its 25-file limit, so `carried-opening.ts` and `prior.ts` live in `carry-on/`.

## Edits outside "new tests" (test helpers only)

- `tests/later-attempts.ts`: `restart` option, `restart()`, `resolver` extras.
- `tests/fake-library.ts`: a fault may answer a promise.
- `tests/later-attempt.test.ts`: the path word, and the double-press test.
- `tests/endings/tests/person.test.ts`: it read a row once just after the ask appeared, and failed once in a full run under load. It passed 3 of 3 alone. It now waits for the row. That read was already a race before this work, by reading only: the row is written just after the question shows.

## Commands and observed output (final code)

- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first src/runtime/answer-first --minWorkers 1 --maxWorkers 2` -> `Test Files 58 passed (58)`, `Tests 605 passed (605)`, Duration 432.29s, exit 0.
- `pnpm.cmd --filter fluxiq check` from the worktree root -> exit 0, 0 `error TS` lines.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (499 warning(s), 1097 baselined).`, exit 0.

## Mutations

Each was applied by script, its tests run, and the file restored. After restoring, the final run above passed. They ran before three test-only edits: `carry-on.test.ts` and `interrupted.test.ts` typing fixes, and the memory store test.

| Mutated | Observed |
| --- | --- |
| Ceiling: `askedUsd` is the old remainder only | 10 failed: `expected { 'Atlas of Rivers': 1, …(1) } to deeply equal { 'Atlas of Rivers': 1, …(3) }` |
| Ceiling ignores the scope | 2 failed: `expected { …(14) } to match object { status: 'budget_out', …(1) }` |
| Row copy removed | 7 failed: `expected undefined to match object { …(2) }`, `expected undefined to be 4` |
| Flow stage not skipped on a carry-on | 2 failed: `expected 3 to be 1` (reads) |
| Seed ignores the task's memory | double-press test: `expected 2 to be 1` |
| Memory never written through | double-press test: `expected 2 to be 1` |
| Live not released at the ending | 3 failed: `expected true to be false` |
| Person-only check's words check removed | 1 failed: the row changed |
| Carried page goes to the start location | 1 failed: `expected [ …(6) ] to deeply equal []` |
| `spend.ms` counts from the start | 1 failed: `expected 2507 to be less than 1108` |
| First row not written at the run's first step | 1 failed: the row did not read interrupted |

## Not verified

- A real process kill. The restart is a second service in one process, over the same data dir and SQLite files, with the old one abandoned. A real browser page after a restart is also untested.
- A Lab-scoped run: under `withFlowPurse` the Flow's purse also holds the attempt, so a carry-on there may be held lower.
- The fallback to preview rows is unit-tested only, not through the service.
- The client road and the chat: nothing outside tests calls the press or the facade yet. `ports` needs the service's private `projectPaths`, `flowPaths` and `projects`, which the tests reach by a cast.
- A failed memory write followed by a crash can leave `acts` one write stale, since memory is read first. It is tried again at the next persist, but a crash before that loses the newest act.

## Open questions or contradictions found

1. **`run_flow` on rows that did not reach a result.** The chat's path words (t871) must not read that as "it worked".
2. **The judge's before-state.** A carry-on reads a new "before" witness at its first lasting act, after earlier acts landed. The judge still gets the acts record, but the witness difference shows only this segment. By reading only.
3. **Permission on a carry-on.** The gate is new, so what a person allowed earlier holds only if the client passes it as `permittedConsequences`. Otherwise it asks again at the start of the carry-on.
4. **Changed words.** If the Flow's instruction changed before the press, the attempt keeps its task id and acts but works from the new words. I did not refuse this.
5. **Another attempt live on the same Flow** is not refused by a press, as with a new attempt today.
6. **The record's position.** `save` keeps a carried-on row where it was, so with another task on the Flow, `latest()` still answers the other task's row while this one works.
7. **A dropped declaration.** A record output's `process` declaration is not readable from a dataset summary, so copies get default processing over rows already processed.
8. **Stale comment.** `attempt-store/record.ts` still says steps are kept only where they could not be assembled (not mine to touch).

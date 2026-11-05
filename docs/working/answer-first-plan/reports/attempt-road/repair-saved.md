# Repair: a budget ending read as "Nothing saved yet"

## Outcome
Done for the cause I own. Two further defects found that sit in files I may not touch (below).

## Cause
`SVC/answer-first/attempt-store/outcome-of-record.ts` line 28 (before the fix): `if (record.candidateId !== undefined) outcome.saved = savedOf(...)`. `saved` was read from `candidateId` alone. `candidateId` exists only when the draft assembled through the completion check (`attempt/draft-save.ts`, kind `kept` otherwise). A draft the check refuses is kept on the attempt row (`steps`, written by `ending.ts` line 89) and in the task's memory, but the read then said nothing, so the card showed "Nothing saved yet" and the Lab wrote `saved: null`. The purse is not involved: the save is not a model call and draft assembly never touches the purse (checked in `runtime/llm/harness-options/bootstrap-completion.ts`). I reproduced it with a draft the check refuses (a read naming a parameter its node does not take): before the fix `saved` was undefined on a `budget_out` and on an achieved run alike.

## Fix
`outcome-of-record.ts`: `saved` is now `partly_works` (unproven) when a draft was saved; `notes_only` when the attempt wrote steps of its own that could not be assembled (they stay on the row and in task memory); nothing when it wrote none. A saved draft that never ran is never `ready`. Mutation check: with the new branch taken out, the two "could not be assembled" tests fail (`expected undefined to match object { state: 'notes_only' }`); restored and identical to the fixed file.

## Each ending, through the real service with a scripted model
Test: `SVC/answer-first/tests/endings/tests/saved-on-every-ending.test.ts` (helper `tests/endings/saved-read.ts`). The read is `automationStudioAnswerFirstOutcomeOfAttempt`, the function `get-task-attempt` calls, and `list-conversation-task-attempts` calls the same `outcomeOfRecord`.

| Ending | Result |
| --- | --- |
| achieved, draft with a repeat | `partly_works`, candidate saved, repeat kept in task memory |
| budget_out, purse gone mid-round | `partly_works`, repeat kept, a note says the budget ran out |
| budget_out, purse gone at the judge | `partly_works`, no judge call made, written steps kept |
| stopped_by_person | `partly_works`, repeat kept |
| provider failing after the last decision | budget_out, `partly_works`, one press only, kept |
| budget_out, draft cannot be assembled (the paid run's shape) | `notes_only`, result rows still returned, plain line "The steps were not saved as a Flow" said in chat |
| achieved, draft cannot be assembled | `notes_only` |
| did nothing | `saved` absent |

waiting_for_person: the service ends only `waiting_for_check` through `ending.ts`. Permission, key locked and stuck wait on a live attempt and write the row through `keep.ts`, which carries `steps`; they now read `notes_only` while waiting. I did not add a per-reason test (the existing `person.test.ts` covers the waits and was re-run green).

## Where each thing lives
- Draft: candidate store (`candidateId`), only when assembled. Steps always: attempt row (`steps`, `attempt-store`) and `memory.best` / `memory.latest` in task memory.
- Notes: `memory.notes` (task memory), written by `attempt/remember.ts`: the model's own, else Core's ("budget ran out", "needed a person"). A Stop writes no note.
- Recording: the act record, `run-acts` store plus `memory.acts`; rows in the run's dataset.
- Next attempt reads: `memory.best` steps (seed), notes, acts, and the row's `tried`.

## Lab
`packages/test-runner/src/attempt-lane/live/live-driver.ts` `savedOf` and `run-attempt-command.ts` line 167 pass Core's `outcome.saved` straight through (`?? null`). They were correct; `null` was Core's answer. No change.

## Found, not fixed (files not mine)
1. A balance failure at the judge is not an ending. Only `attempt/decide.ts` (line 28) and `runtime/answer-first/keep-going/` map `llm.provider_balance_exhausted`. Thrown from the judge it reads as "not judged", and the attempt kept deciding until the test's 400-decision guard stopped it. Needs the same mapping in `completion/**` or the judge call.
2. `task-memory/saved-state.ts` still says `partly_works` for any memory with steps, which disagrees with the new honest `notes_only` for an unassembled draft. It is unused by the card read I fixed; reconcile when that chip is wired.
3. Why the paid run's draft was refused is not in the run's folder (the refusal codes are not logged). Worth logging the codes on the trace.

## Commands
- `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2 <attempt, attempt-store, task-memory, tests/endings>` (from `packages/fluxiq`) -> 27 files, 146 tests passed (before the helper import fix); `saved-on-every-ending.test.ts` re-run alone afterwards -> 8 passed.
- `node scripts/structure-audit.mjs` -> passed (one real failure of mine, an import into `programs/` and a packed line, was fixed first).
- `pnpm.cmd --filter fluxiq check` -> first run completed with no type errors; the second run reported "reuse: inputs and outputs match the stamp", so it did not recheck after my last helper edit.

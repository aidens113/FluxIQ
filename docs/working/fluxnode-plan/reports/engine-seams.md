# P2a Engine Seams: worker report

Worker: worker-heavy (Opus 5.5). Worktree `fxwork/t884/!FluxIQ`, branch `task/t884-engine-seams`. Nothing committed.

## Outcome

Done. All seven per-call seams are built. Each one is optional, and when it is absent the attempt behaves exactly as before. The existing answer-first and attempt-purse tests all pass, so the chat path is unchanged.

**How a caller drives it.** It calls `service.generateFlowBootstrapAdaptation(request, options)`, where `options` is `AutomationStudioAnswerFirstCallerOptions` (in `flow-bootstrap-commands/contracts.ts`).
- Passing a second argument makes the call answer-first. No `authoringMode`, no `evidenceGuided` and no `FLUXIQ_AUTHORING_MODE` is needed.
- A request body cannot reach the second argument, so nothing sent over the API can raise a budget or inject a check.
- For a typed result, also pass `authoringMode: "answer-first"`; that is the only reason to pass it.

## What changed and why

| Seam | Where | Behaviour |
| --- | --- | --- |
| 1 Task key | `task-key/task-key.ts`, `attempt/opening.ts` | `callerKey` hashes in its own space (`["caller", key, ""]`), apart from the instruction digest. Keys made from instructions are unchanged; a test pins the old value. |
| 2 Mode | `service.ts:1483` | The options turn on answer-first by themselves. |
| 3 Model | `service.ts` (the `modelId` line) | `options.model` overrides the Flow's `llmModel` when the resolver is called. |
| 4 Budget | `attempt-purse/budget-usd.ts`, `attempt/ceiling.ts`, `service.ts` (the ceiling line) | `callerUsd` replaces only the $5 default, so it may go above it. A Flow's chosen limit, the Lab ceiling and the resolver's total still lower it. An invalid value leaves the default in place. |
| 5 Judge and check | `completion/check.ts`, new `completion/caller-check.ts` | The check runs after Core's free refusals (nothing to judge, rows not read, same evidence) and before any judge. A pass confirms with no model call (`confirmedBy: "check"`). A "no" is refused with its reason, like a judge's no, and the digest is kept. A check that throws or returns `false` counts as a no. `always` runs the judge after a passing check. `auto` runs the judge only when there is no check. `off` with no check takes the result unverified. A check's answer counts in `timesChecked`. |
| 6 Person-ask sink | new `caller/person-sink.ts`, `caller/applied.ts` | The sink has `raised(ask)` and an optional `answer(ask, wait)` callback, and it replaces the conversation port for every question: person-only checks, stuck asks, and permission asks when no scope is given. A sink without `answer` parks the attempt in `waiting_for_person`. |
| 7 Scope | `caller/applied.ts`, new `caller/scope-gate.ts` (top of the call chain) | The scope's consequences replace the request's, and the gate has no ask port. The scope gate refuses, without running it and without asking anyone, any call that declares or meets (through the domain's `permission` check) a class the scope does not grant. It also refuses a call naming an http(s) address off the site list, or made while the page is off the list, unless the call navigates back. Site matching uses `fluxNodeScopeAllowsSite`. The refusal (`answer_first.outside_scope`) goes back to the model, and the rounds look for another way. |

Also changed:
- `caller/options.ts` checks every field strictly (it reuses FluxNode's model and budget rules and `fluxNodeScopeSchema` for sites). An invalid field fails at the request reader's line as invalid input, before any purse opens.
- The answer gained `confirmedBy?: "check" | "judge" | "none"`, set only for a caller's attempt.
- `rounds.ts`, `flow-stage.ts` and `ending.ts` gained the internal ending `taken_unverified`.
- **`service.ts` is line-neutral:** 4304 lines, no extra packed statements, 7 lines edited in place.

**Hard rule.** No new failure ending. A check that throws, an out-of-scope act and a refused site all go back into the rounds. `off` with no check ends with the result in hand.

## Commands run and observed results

- `node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/framework/automation-service/service/answer-first src/runtime/answer-first/attempt-purse`
  - parallel: `Test Files 49 passed (49)`, `Tests 368 passed (368)`
  - real-sql: `Test Files 52 passed (52)`, `Tests 391 passed (391)`
  - `all groups passed`
  - This includes the new scripted tests in `attempt/tests/caller-seams.test.ts` (11):
    - a check passes with 0 judge calls and no answer-first flag;
    - a check fails, its reason (`answer_first.check_no`) reaches the next decision, then the check passes (0 judge calls, `timesChecked` 2);
    - `off` with no check gives 0 judge calls, `stopped_by_person`/`unverified`/`confirmedBy: "none"`;
    - `always` gives 1 judge call, `confirmedBy: "judge"`;
    - empty options give 1 judge call;
    - a $12 budget opens at $12 and spends more than $5 to reach `achieved`, while the same script without it ends `budget_out` at $5;
    - the model per call reaches the resolver;
    - the sink grants a `send_or_publish` ask by callback;
    - an off-site call and an ungranted `modify_existing` press are both refused unrun, nobody is asked, and the attempt still ends `achieved` from a read;
    - a caller key across different words: attempt 2 replays the saved Flow with `asked` 0 (no provider request at all), `spend.calls` 0, `path: run_flow`; the same words without the key are a new task.
  - Also new: unit tests in `caller/tests/` (3 files) and `completion/tests/caller-confirm.test.ts`. The task-key and purse tests were extended.
- Free memory: 3.1 to 4.2 GB before each run.
- `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental ...` in `packages/fluxiq` gave `TSC_EXIT=0` with no output, both before and after the last edits.
- `node scripts/structure-audit.mjs` gave `structure-audit: passed (535 warning(s), 1097 baselined)`. The first run failed on 4 packed lines in my new tests; I fixed them and reran.
- After the reformat, I reran the two reformatted test files and `caller/`. That result is in the return contract.

## Not verified

- No live browser or Lab run (none was asked for).
- Not run: the full `pnpm check` and `pnpm test`, Core's whole vitest run, `apps/web` route tests.
- The scope gate does not cover a saved Flow's engine replay: plan steps still meet the permission gate, which asks only about money, delete and send.
- I did not inspect what the web domain puts in answers' `location` beyond the existing call-chain comment.

## Open questions or contradictions found

1. **Contract contradiction.** "`off` with no check confirms … labels unverified, never confirmed" conflicts with the frozen `checkAutomationStudioTaskAttemptResult`, which allows `achieved` only for a confirmed result.
   - I store that ending as `stopped_by_person` + `unverified` + `missingWhat: "Nothing checked this result: checking was turned off for this task."`, and the answer carries `confirmedBy: "none"`.
   - P2b should map this to FluxNode `achieved` with an unverified verdict. The chat's task list would show it as stopped.
2. **Ownership deviation.** I created `answer-first/caller/`, a new directory outside the named paths.
   - `attempt/` is at the 25-file limit, and `attempt/<sub>/` breaks the 9-segment depth limit.
   - I did not edit `answer-first/index.ts`, so `service.ts` imports `./service/answer-first/caller/index.ts` directly.
3. **The permission gate only gates destructive classes.** A "change" is enforced only by the new scope gate, which is why a scope with `permittedConsequences: []` refuses `modify_existing`.
4. **Left for P2b:**
   - `budgetUsd: 0` (replay only): `flow-stage.ts` skips a replay when the ceiling is 0, and I left that unchanged.
   - A resume (Carry on) or Run again re-enters without caller options; `run-again.ts` recomputes the key from words, so a caller key would be refused as `other_task_on_flow`.
   - The start location is not checked against the site list.

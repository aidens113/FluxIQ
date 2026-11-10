# P2b Engine fixes: worker report

Worker: worker-heavy (Opus 5.5). Worktree `fxwork/t886/!FluxIQ`, branch `task/t886-fluxnode-runner`. Nothing committed. S = `packages/fluxiq/src/framework/automation-service/service`.

## Outcome

Done. All five fixes are in, on the one attempt loop. No new ending was added: every refusal goes back into the rounds, or is invalid input refused before an attempt opens.

Every acceptance check passes. The one exception is the fluxiq typecheck, which fails only in another worker's pipeline paths.

## What changed and why

### 1. Judge `off` with no check ends `achieved`, labelled `unverified`

**Contract.** `packages/contracts/src/task-attempts/` changed additively, and the contracts version is unchanged (0.17.0).
- `AutomationStudioTaskAttemptFields` gains an optional `checkingOff?: true`. The parser accepts only `true` and refuses anything else with `task_attempt.invalid_checking_off`.
- `checkAutomationStudioTaskAttemptResult` takes an optional `checkingOff`. It accepts `achieved` with an `unverified` result only when the marker is set. A `refuted` result, or no result, is still refused.
- New tests cover both.

**Engine.**
- `attempt/keep.ts` sets `checkingOff` on every row of an attempt whose caller set `judge: "off"` and gave no check.
- `attempt/ending.ts` stores `taken_unverified` as `achieved`, never `stopped_by_person`. `missingWhat` still says checking was turned off, and `confirmedBy: "none"` is kept.
- `attempt/remember.ts` marks acts done for `taken_unverified`, as it does for `achieved`.
- `attempt-store/outcome-of-record.ts` does not count a checking-off replay as a whole-run proof (`ready`), because nothing judged it.
- The `confirmedBy` comment in `flow-bootstrap-commands/contracts.ts` is updated.

**FluxNode.** `S/fluxnode/result-of.ts` already maps `confirmedBy: "none"` to `achieved`/`unverified`, so no FluxNode change is needed.

### 2. `budgetUsd: 0` means replay only

`attempt/flow-stage.ts` no longer skips the Flow stage when the ceiling is 0, because a replay calls no model.
- A caller's check, or checking turned off, can then end the attempt `achieved` with no call.
- Anything that needs the judge meets the empty purse and ends `budget_out` with what the replay read.
- With no saved Flow, or with steps that do not assemble, the rounds already return `budget_out` at once (`rounds.ts`, ceiling ≤ 0).

### 3. The scope over a replay, and over the start

**Shared rule.** New `caller/scope-rule.ts` holds one reading of classes and sites. `caller/scope-gate.ts` was refactored onto it, and its behaviour is unchanged: its existing tests pass.

**Replay.** New `caller/replay-scope.ts`, wired into `flow-run/flow-run.ts`:
- **Before the run.** A plan step that declares a class the scope does not grant, or names an http(s) address off its sites, keeps the Flow from running. It returns the new outcome `{ kind: "outside_scope", said }` (`flow-run/outcome.ts`). The rounds are told `said` (`attempt/round-note.ts`) and look for another way. The classes checked are the domain's declarations made during assembly plus the node's own `consequences`.
- **During the run.** The scope wraps the `nativeNodeExecutor` and `effectDispatcher` outside the act gate. A step whose resolved parameters name an off-site address is refused unsent: failed, `blocked_by_capability_or_policy`, `answer_first.outside_scope`, not retryable, `unacted`. This covers input-bound addresses, which take this run's value only at run time.

**Start location.** It is checked where the options are read, so a start off the sites is the same `flow_bootstrap.invalid_input` refusal (`setup_needed`) as an invalid option. Nothing is spent, asked, run or written. Only an http(s) start counts as a site. A FluxNode spec already refuses this at registration (`spec.start_out_of_scope`).

### 4. Carry on and Run again keep the caller's options

**What is kept.** New type `AutomationStudioAnswerFirstKeptCallerOptions` in `contracts.ts`: `taskKey`, `model`, `budgetUsd`, `judge`, `scope` and `inputs`.
- New `caller/kept.ts` makes the copy.
- It is written to each attempt's provenance in task memory (`task-memory/provenance.ts` `caller?`), at the opening (`attempt/opening-row.ts`) and the ending (`attempt/remember.ts`).

**How it is restored.** New `caller/held.ts` exports `automationStudioAnswerFirstCallerOptionsHeld(given, { projectId, flowId, startLocation })`:
- The call's own options win.
- Otherwise a Carry on press takes its attempt's kept options, from `hold.kept`.
- A Run again press takes the task's latest attempt's kept options, which `run-again.ts` now puts on its hold (`run-again/hold.ts` `caller?`).
- Kept options go through the same strict reader. If they no longer read, the press is refused as invalid input.

**Run again key fix.** `run-again.ts` now computes the `other_task_on_flow` key with the kept `callerKey`, so a caller-keyed task is no longer refused.

**The function-valued options** are not kept, because they live in the caller's process. When a person presses in the panel:
- There is no `check`. The kept judge mode applies without one: `auto` and `always` run the judge, and `off` takes the result unverified (`achieved`, `checkingOff`).
- There is no `personAsk`. Any question goes to the Flow's conversation in the panel, where the person who pressed is.
- With a kept `scope`, a permission question cannot arise anyway, because the scope is the grant.
- A FluxNode's own resume passes fresh options, so its check and sink apply as before.

**`service.ts`.** One in-place edit, still 4304 lines. Line 1493 now calls `automationStudioAnswerFirstCallerOptionsHeld(answerFirst, { projectId, flowId, startLocation })` instead of the conditional `...OptionsRead(answerFirst)`, with a trailing comment.
- **Why it was unavoidable:** a panel press reaches the service with no second argument. The model (line 1532) and the caller budget are read only from `answerFirstOptions` there, so restoring them anywhere else would miss them.

### 5. Repair rounds use this run's inputs

**Cause.** `core.run_flow` and the forward run resolve each saved step's `$state` binding against `{earlier outputs, item}`, never the caller's inputs (`runtime/llm/node-tools/replay/span.ts`, `resolveAutomationNodeParameterValues`). So the binding fell back to its `fallback`, which is the learned value.

**Fix, inside the owned paths.** New `flow-run/input-valued-steps.ts`. At the start of the rounds (`attempt/rounds.ts`), each binding to an input the caller supplied takes this run's value as its fallback, in both `run.steps` (the loop's seed) and `run.startedWith`.
- Other bindings and fixed values are untouched.
- The Flow stage is untouched, because the engine resolves against `options.inputs` there.
- An attempt that achieves at the Flow stage keeps its saved digest unchanged.

**Fixture.** `tests/fake-library-engine.ts`: the engine's `READ_LOANS` gained the optional `shape` parameter its by-hand twin already had, so a draft that uses `shape` can be assembled and replayed. All answer-first tests still pass.

### Tests

**Scripted, in new `attempt/tests/caller-replay.test.ts`:**
1. Budget 0 with a saved Flow and a check: `asked` 0, `achieved`, `run_flow`, spend 0.
2. Budget 0, judge only: `budget_out` with 3 rows, `asked` 0.
3. Budget 0 with no Flow: `budget_out` with an empty `partial`, `asked` 0, no read.
4. A saved card press outside the scope: no engine press, no engine read; the rounds were told "an act this task may not do (modify_existing)"; `achieved` by reading.
5. A start off the sites is refused (`setup_needed`) with no target call and no row; a start on the sites is `achieved`.
6. Repair: the engine's read fails, and the round's `core.run_flow` re-sends the read with `shape: "fancy"`, the new input, where the Flow learned `"plain"`. The attempt is `achieved`, `run_flow_then_repair`.
   - **Probe:** with the rounds fix switched off, this failed with `expected [ 'plain' ] to deeply equal [ 'fancy' ]`.
7. Run again with no options: same `taskId`, `checkingOff`, `confirmedBy: "none"`, 0 judge calls, `budget.usd` 7, `run_flow`, the contract check ok, and both attempts' provenance keep `{taskKey, judge, budgetUsd, model, scope, inputs}`.
8. Carry on with no options: same attempt, `achieved`, `checkingOff`, `confirmedBy: "none"`, 0 judge calls.

**Other test changes:**
- `caller-seams.test.ts`: the judge-off case now expects `achieved` + `checkingOff`, and the contract check passes.
- `drivenBy` moved to the shared `attempt/tests/caller-driven.ts`.
- New unit tests: `caller/tests/held.test.ts` (5), `caller/tests/replay-scope.test.ts` (4), `flow-run/tests/input-valued-steps.test.ts` (3).

## Commands run and observed results

Free memory before the heavy runs was 0.39 to 4.77 GB. When it was low, only narrow runs were made.

**Acceptance run.** From `packages/fluxiq`:
`node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/framework/automation-service/service/answer-first src/framework/automation-service/service/fluxnode src/runtime/answer-first/attempt-purse`
- parallel: `Test Files 53 passed (53)`, `Tests 384 passed (384)`
- real-sql: `Test Files 56 passed (56)`, `Tests 414 passed (414)`
- `[vitest-groups] all groups passed: parallel, real-sql`

**After the last `held.ts` change:**
- `--groups=parallel src/.../answer-first/caller`: `Test Files 5 passed`, `Tests 22 passed`.
- `--groups=parallel,real-sql src/.../attempt/tests/caller-replay.test.ts src/runtime/answer-first/result`: parallel `49 passed`, real-sql `8 passed`, `all groups passed`.

**Contracts.** From `packages/contracts`:
- `npx vitest run src/task-attempts`: `Test Files 10 passed (10)`, `Tests 98 passed (98)`.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: exit 0, no output.

**fluxiq typecheck.** From `packages/fluxiq`, `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental -p tsconfig.json`: exit 2. **Every error is in another worker's paths:**
- `src/components/automation/data/pipeline/step-node.ts(20,41)`: TS2353, `'description' does not exist in type 'AutomationNodePort'`.
- `src/framework/automation-service/service/fluxnode/pipeline/tests/pipeline-runs.test.ts`: 4 errors (lines 47, 79×2, 122): `scope.sites` optional against required, and `entry.stepId` possibly undefined.
- None are in my paths.

**Structure audit.** `node scripts/structure-audit.mjs` (worktree root):
- The first run failed on `[failure-as-empty] caller/held.ts`: a catch that read kept options as none. I fixed it so unreadable kept options refuse the press.
- The rerun gave `structure-audit: passed (537 warning(s), 1095 baselined)`.
- Advisory warnings on my paths:
  - `attempt/` has 25 files (I added none);
  - `attempt/tests/` has 16;
  - `flow-run/` has 19.

## Not verified

- **No live run, Lab run or browser.** No full `pnpm check` or `pnpm test`, and no Core-wide vitest run.
- **The panel's handlers were not run through end to end** (`programs/automation-studio/api/handlers/task/attempt-carry-on.ts`, `attempt-run-again.ts`). The tests call `automationStudioAnswerFirstCarryOn` and `RunAgain` with a generator that passes no options, which is what those handlers do.
- **Restoring the model on a press is shown only indirectly.** The kept provenance holds it, and the service reads `answerFirstOptions.model`, but no test captures the resolver's `modelId` on a press.
- **The replay scope does not track where the page goes during a replay.** An engine step reports no location, so a step that follows a link off-site is not caught. The model's own calls are still held by `scope-gate.ts`.
- **The runtime site gate reads only the resolved `parameterValues`** of a step, never its input row.
- **Not checked for the chat's own task cards** (`ui-components`): how they show an `achieved` attempt with an `unverified` result and `checkingOff`. Only caller attempts can reach that state.

## Open questions or contradictions found

1. **A FluxNode run sees an invalid start or invalid options as `setup_needed`.** The service returns `status: "setup_needed"` with `code: "flow_bootstrap.invalid_input"`; it is not a throw.
   - `S/fluxnode/run-fluxnode.ts:69` keeps a result only when `generated.status === "answered"`, so a `setup_needed` return becomes `answered = undefined`, and the result is built with no attempt. I did not run that path.
   - The exact change needed is in `S/fluxnode/` (not touched): read `automationStudioAnswerFirstSetupOf(generated)` from `answer-first/setup/`, and end the run with its `say` and `code` as a refused start, never as a failure of the task.
   - For web nodes this cannot happen, because the spec refuses an off-scope start at registration.
2. **A repaired Flow's saved defaults change.** After a repair with new inputs, the saved Flow's binding defaults are that run's values, so its `stepsDigest` differs from the Flow it repaired. That is consistent with the repair having learned with those values. A replay that achieves keeps the digest unchanged.
3. **Behaviour change for a chat attempt with a $0 ceiling.** Its saved Flow is now replayed at no cost before it ends `budget_out`, where before it ended at once. This can only happen if a Flow's own limit or a Lab ceiling is 0.

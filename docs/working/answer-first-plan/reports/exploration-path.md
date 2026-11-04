# The Exploration lane: one exploration that reaches the result (t861)

Worktrees `fxwork/t861/!FluxIQ` and `fxwork/t861/!FluxIQWebExtension`, branch `task/t861-exploration-path`. Provider-free: no model, Lab or browser ran. `S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`.

Worker reports and the design are in `exploration-path/`: `design.md`, `acts.md`, `judge.md`, `forward.md`, `keep-going.md`, `rows.md`, `driver.md`, `endings.md`.

## Outcome

**Partial: the path is built and every ending is proven with a scripted model, and nothing has seen a real model.** `authoringMode: "answer-first"` runs one live exploration through the real service to a judged result, and a task ends only with its result, its budget gone, or a person's Stop. Three things are not delivered: "add budget and carry on", and two call sites waiting on other lanes (below).

**The double act is real on today's path.** On a `candidate` build through the real service, the build's trial pressed a stub target once and the applied Flow's first run pressed it again, two presses for one ask, and nothing stopped it (`SVC/answer-first/run-acts/tests/double-act.test.ts`). With an act record in place, that run does not press, the chat gets an `already_done` step, and a second run does press. `legacy` and `project` were not run; by reading they behave the same.

## What each item came to

| Item | State |
| --- | --- |
| 1. One exploration, no trial, reset or dry run | Done. A new mode, `answer-first`, beside the others, on the single evidence loop with no project supervisor. A `replay: "reset"` is refused mechanically. Permission asks pause and it continues in place |
| 2. Forward runs (D2) | Done with stub targets. `core.run_flow` in forward form, offered with `dryRun: false`: runs from the page it is on, excludes rows the act record holds, a lasting step really acts on a new row |
| 3. Reads are kept | Done. Row sink through `recordBatchHandler`, in a session marked `explorationAttempt`. Only a read's answer can store a row. Witnesses before the first lasting act and at the end |
| 4. It ends with the result | Done. Own completion, `{ summary, answer? }`, one Flow-less judge call. `achieved` needs `confirmed`, and the ending writer calls `checkAutomationStudioTaskAttemptResult` |
| 5. Keep going | Done. Every row of the table has its own test through the real loop (`exploration-path/endings.md` has the table). Budget gone is the only failure ending |
| 6. One act record (D6) | Done. Four mergers, persisted per Flow, carried across rounds and into the first run |
| 7. One purse per attempt | Done. See "Money" |
| 8. Loop detection | Done. t859 merged and wired: `attemptRecord`, `loopSignal`, `askedRepeats` |

The lead's added items: the `flow.createHere` announce promises the result in this mode, with the exact words tested. `askedRepeats` is filled from the person's words. `output_not_observed` is tested in 8 forms, and that found a real defect, now fixed: a refusal with `ok: false` holding rows stored those rows as the result. The nine gap words are in `offline-first/words.ts`.

## What I decided, for you to overrule

1. **`askedRepeats` reads the saved instruction, which I checked is the person's.** The endings worker worried a chat interpreter's words could lift the rule. Core already refuses to save a task from a command's argument (`SVC/flow-bootstrap-commands/save-goal.ts`) or count one as a task (`SVC/instruction-led/task.ts`), and a person turn saves the person's own message. It reads digits to three places, the words two to twelve, "twice" and "thrice". Anything else stays at one, which errs toward not repeating, so **"a dozen" or "3x" spends the budget rather than doing it**.
2. **A round has no time limit.** I took the build's nine minutes off this path, so nothing here needs the wait clock (see "Clocks").
3. **The first run after an attempt carries the record once.** A first run that does not succeed gives its acts back, because running it again is the same ask. A later run acts normally, because a person asking again means it. An unreadable record refuses one run and is moved aside.
4. **An undeclared press with an effect** is recorded may-have-landed, never refused for that, and stays out of a result's acts: D6's disclosed limit.
5. **A person-only check with no thread at all** returns `waiting_for_person` with no end time. It is the one return that is not an ending. Otherwise every round would meet the check forever at no cost.
6. **A Flow limit of exactly $0.25 is read as the old default, not a choice,** because new Flows store it as a default. A person who deliberately sets $0.25 gets $5. This needs a real "chosen" marker if it matters.
7. **`same_act` counts under `exact_repeat` in `loopsCaught`,** since the contract has five patterns. Adding a slot is your call: it is a contract change.
8. **A not-confirmed result is only ever `rows` or `partial`.** Acts and words stay on the record; only the kind claims less.
9. **Setup steps travel under the old result type by a cast,** because widening that union broke other lanes' types.

## Clocks

Checked against the code. None can end an attempt.

| Clock | Reached here? | What I did |
| --- | --- | --- |
| A Flow build's 9 minutes (`budget.maxDurationMs`) | Yes, per round | **Removed from this path** (`attempt/round.ts`). It only ever ended a round, never a task, but a key wait would have cost a round's context. A test jumps the clock three hours mid-round; put back, that test fails |
| A result check's deadline (120 s or more) | Yes, as the Flow-less judge's | **The deadline now stops its call** (`flow-less/judge.ts`), so nothing is spent behind it, which t865 named as the one that costs money. A check cut off is `not_judged`, is not held against its evidence, and the model is asked again. Tested. It already gives back the attempt's own person and provider waits; a key wait needs t865 |
| A permission ask's two-minute cap, a parked ask's expiry | Yes | Removed by a port wrapper: no timeout on this path. Stop wins (tested) |
| Provider per-call timeout | Yes | Reads as silence: backoff, never an ending. Backoff of 5 s doubling to 60 s, without end |
| Project build 30 minutes | No | Old modes' (`supervisor-loop.ts`). Left as it is |
| Recovery and exploration 10 minutes | No, during an attempt | A saved Flow's run: **the Second Attempt lane will reach these** |
| Result check deadline on a run (`run-outcome.ts`, `build-test/judge.ts`) | No | Old modes', left as it is. Its unread call on a key unlock remains there |
| Child Flow bound | No | A forward run walks draft steps, not a composite. A later attempt's run could reach it |
| Workspace eviction (hosted) | Outside this lane (`apps/web`) | Named for you: a waiting attempt can read as idle |
| A Core restart | Not a clock | An attempt is in memory, so its row stays `working` for ever after one. Needs durable tasks |

## What is waiting on other lanes: one line each

- **t865's clock.** `SVC/answer-first/attempt/ports.ts`, the line `const made: AutomationStudioAnswerFirstAttemptPorts = { sleep: wallClockSleep };`. Add `personHeldMs: (scope) => automationStudioPersonWaitClock.heldMs(scope)`. `attempt/run-attempt.ts` already reads it for the judge's deadline. Without it the only cost is that a judge cut off during a key wait is asked again.
- **t866's library.** `SVC/answer-first/attempt/draft-save.ts`, line 32, the `return { kind: "saved", record: await input.stores.drafts.save(...) }`: call `saveProjectPartsOfAppliedFlow` there, once the record is saved. A library failure must not lose the result, so keep it inside that function's `try`. **One thing to check when it lands:** its name says an applied Flow, and this saves an unapplied draft, so it needs the draft's graph.

## What the Answer lane must call

```ts
const store = automationStudioAnswerFirstAttemptStoreOf(service, { paths, flows, projects });
await store.get(projectId, flowId, attemptId);   // also latest(), list()
// each: { attempt, result?, tried, steps?, candidateId? }; throws AutomationStudioAnswerFirstAttemptsUnreadable on a file it cannot read
```

- `generate.ts` answers `{ ok: true, payload: { answered } }` or `{ ok: true, payload: { setupNeeded } }`. `S/api-contracts` does not declare them, since it is not this lane's.
- **Lookup is per Flow**, and `ChatResultsAttemptQuery` has only `projectId` and `attemptId`, so the port needs a Flow id or an index.
- **No gateway route reads this store yet.** The extension's results adapter still reads `runDetail` then `exportDataset`. The Lab lane's report also says its live attempt driver needs this read. The row is written while it works, so a `working` row can feed the meter.
- `explore.ts` stays a candidate build in this mode, because widening the shared return would break it. If "explore" should answer too, it needs the same few lines as `create-here.ts`.

**"Add budget and carry on" is not built.** Rows sit under an ended, processed session, so a new session's first read would become the result and drop what was read before. The ceiling must also be read before the purse opens, and the request needs new fields. Steps, tried record and acts are kept ready for it. Until then a person's press has nothing behind it.

## The first paid run

**What it must set.** Put `FLUXIQ_LLM_RUN_COST_CEILING_USD=5` in the Lab's own environment or `.env.local`. This is the one that matters: the Lab starts Core in test scope, whose default is **$0.10**, and the attempt's budget is the smaller of $5 and that ceiling, so without it an attempt budgets out almost at once. `--llm-cost-ceiling-usd` and `--llm-max-cost-usd` only lower it, so neither can raise it. Core's maximum is $10. Also pass `--authoring-mode answer-first`, and do not set a low `--llm-max-calls`: a call cap sits on the purse, so reaching it reads as budget out. Provider per `AGENTS.md`: Claude, `CLAUDE_API_KEY` in `.env.local`.

**Before it, confirm the Lab's chat road.** The chat sends `configured` and `generate.ts` resolves it. Each side is tested, but nothing has driven chat to route to service to chat. Whether the gateway passes `payload.answered` through is not traced.

**What it should exercise,** in this order of what is least proven:

1. **A task with a lasting act per row.** This is the only way to test what I trust least: the first row by hand, then `core.run_flow` on the rest. Check the first row is not pressed twice. Row ties were read from the domain's source (`actedOn`, the row's page) and never exercised. A Lab double-act oracle should cover it.
2. **A real draft saving with a repeat in it.** The fake's plan assembled and saved. No real draft has, and none has been run.
3. **The judge on real rows under the Flow-less prompt.** How it reads the question is unmeasured. Spurious noes spend budget. Watch for a yes citing a wrong cell, which reads as unsure and then stalls on the digest rule until new evidence comes.
4. **The guidance.** Core's prose still surrounds it, with the sentence about a build's goal now removed. Does the model do a first row and go forward, or press everything by hand?
5. **A multi-page read,** so `readBack` and dedupe run on real rows, and a filtered read, to see whether the model asks for rejected rows. The Engine lane needs that, and it is guidance only.
6. **Witnesses.** The free look relies on handles staying stable across a recapture, which was read and not exercised.
7. **Cost per attempt** against the $1.12 to $1.89 measured on `legacy`, and the Engine lane's stop lines over the recording, which apply only after this run.

## Per-worker summary

| Worker | Tier | Brief | Outcome and what I verified |
| --- | --- | --- | --- |
| acts | `worker-heavy` | Act record, two gates, double-act probe | Done. Re-ran tests, `check`, audit |
| judge | `worker-heavy` | Flow-less judge, result writer | Done. Re-ran tests. I added the deadline's stop |
| forward | `worker` | Forward form of `core.run_flow` | Done. Re-ran tests |
| keep-going | `worker` | Endings table, purse numbers | Done. Re-ran tests |
| rows | `worker` | Row sink, session, witnesses | Done. Re-ran tests |
| driver | `worker-heavy` | Wiring through the real service | Partial, as reported. I applied its outside-path items and re-ran tests and the old-mode guard |
| endings | `worker-heavy` | t859, `askedRepeats`, every ending | Partial for the setup step only, which I finished. Re-ran everything. **One worker past the "about 6" you allowed;** both follow-ups touched lasting acts and shared files |

The endings worker reports a slip of its own: a mutation script split multi-word test filters, so several early runs covered far more than one file (801 tests in one summary), against the narrow-check rule. No provider call was involved, and it confirmed the mutated files were restored.

## Integration changes I made

- `flows/authoring/model/authoring-mode/`: the mode. An extend resolves to `candidate`.
- `runtime/llm/provider-task/system-prompt.ts`: the judge gets the Flow-less branch, and the exploration's decisions leave out "Your goal is to produce the final structured result, not to execute the workflow". Tested for every other request staying as it was.
- `runtime/automation-activity/build.ts`: an attempt no longer ends "Your Flow is ready". It starts "Working on your task" and ends "Finished", "Reached this task's budget", "Stopped", "Waiting for you" or "Before I can start".
- `generate.ts`, `conversations/commands/build.ts`, `create-here.ts`: a setup step reaches a person as an answer rather than a failure.
- `flow-less/judge.ts`, `attempt/round.ts`, `attempt/ports.ts`: the clocks above. `guidance.ts`: one sentence asking for what a filtered read left out.
- `offline-first/words.ts`: the nine gap words.
- `docs/architecture/automation-studio/llm-flow-bootstrap.md`: "The answer-first attempt". Extension `authoring-mode-env.ts`: the mode's comment and its error message.

## Commands run and observed results

Core, on the tree committed as `de2cae627` (dev with t859, t862, t864 and t867 under it), with the Core libraries rebuilt first (`pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> exit 0):

```text
(packages/fluxiq) pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first src/runtime/answer-first
  src/runtime/result-verification/flow-less src/runtime/llm/node-tools/run src/runtime/llm/provider-task/tests
  src/runtime/llm/tests/flow-less-diagnosis.test.ts src/runtime/automation-activity/tests/build-answered.test.ts
  src/runtime/automation-activity/tests/build-ending.test.ts src/runtime/conversations/commands/tests/answer-first-create-here.test.ts
  src/framework/automation-service/service/flow-bootstrap-requests/tests/generate-answer-first.test.ts
  src/runtime/flow-authoring/bootstrap/offline-first/tests/words.test.ts src/flows/authoring/model/authoring-mode/tests
  src/runtime/llm/repeat-guard/loop-detection --minWorkers 1 --maxWorkers 2
 Test Files  50 passed (50)
      Tests  502 passed (502)

(packages/fluxiq) pnpm.cmd exec vitest run src/runtime/flow-authoring/bootstrap/candidate/tests src/runtime/project-agents/supervisor/tests
  src/framework/automation-service/service/project-build/tests --minWorkers 1 --maxWorkers 2
 Test Files  95 passed (95)
      Tests  638 passed (638)

(root) pnpm.cmd --filter fluxiq check             exit 0, 0 "error TS" lines
(root) node scripts/structure-audit.mjs           structure-audit: passed (494 warning(s), 1097 baselined).  exit 0
(root) wc -l packages/fluxiq/src/framework/automation-service/service.ts    4304
```

The old-mode run predates only the removal of the round's time limit, which is in `answer-first/attempt/round.ts` and read by no old mode.

Each acceptance check, by test (`SVC/answer-first/tests/`):

| Acceptance check | Test |
| --- | --- |
| Reaches its result, rows from reads, one act record, no trial or reset, draft saved | `attempt`: "(a) reaches its result: rows from a read, read back, confirmed once, one act on the record, a draft saved, and no trial or reset" |
| A failing step | `endings/tests/steps`: "a failing step is told to the model, and the task reaches its result" |
| A judge's no | `endings/tests/judge`: "a judge's no goes back with its reason, and the task reaches its result" |
| A stall | `endings/tests/stalls`: "a repeat-without-progress stall changes approach: ..." |
| Provider errors | `endings/tests/stalls`: "a provider silent then back is waited out with backoff, said in chat, with no act repeated" |
| All of those in one script | `endings/tests/stalls`: "a task with a failing step, a judge's no, a stall and provider errors all in one still reaches its result" |
| Budget exhausted | `endings/tests/budget`: "budget exhaustion by the purse ends budget_out with the best result and the draft" |
| A forward run acts on remaining rows only | `attempt`: "(b) a forward run acts on the rows not yet done, and an already-done row is not acted on again" |

Extension, on `d0e608ea` (Extension dev merged under it), with `domain`, `test-contracts` and `test-evidence` rebuilt:

```text
(root) pnpm.cmd --filter @fluxiq-web-extension/domain check        exit 0, 0 "error TS" lines
(root) pnpm.cmd --filter @fluxiq-web-extension/test-runner check   exit 0, 0 "error TS" lines
(root) node scripts/structure-audit.mjs                            structure-audit: passed (235 warning(s), 553 baselined).  exit 0
(packages/test-runner) node --test dist/live-llm/tests/authoring-mode-env.test.js    # pass 6, # fail 0
```

**One Extension test had to change, and this edit is not committed yet.** `packages/test-runner/src/live-llm/tests/authoring-mode-env.test.ts` asserted that `answer-first` is refused "until Core's resolver takes it". Core now takes it, so that test would have broken on this merge, and neither `check` catches it. I restored the old assertion for one run to confirm: `Missing expected exception`, 5 pass, 1 fail. It now asserts the mode is accepted and an unknown word is refused. It sits one file beside the path your brief named. **The Extension's whole test-runner suite was not run;** any other test holding the same "refused until" assumption would not have shown here. A grep of `src` for it found no other.

## Not verified

- **Any real model, browser or Lab run.** No provider call and no paid call. Every web shape was read from the domain's source and restated in stubs.
- **Row identity between a real read and a run's For Each item.** If a Flow's record output reshapes a row, the digests differ and that row would press again. This is the biggest open risk on lasting acts, and the Lab's double-act oracle must cover it.
- **The forward test's parameters are not `$row` bound,** so a real row-bound repeat is unproven.
- **The chat's whole road,** as above.
- **Most of the 61 pre-model codes through the service.** Seven paths are driven; the rest are table entries, exhaustive by compile and by test.
- **Old modes byte for byte.** Guarded by mode, and the suites named in your brief pass; no whole package suite ran, per the twice-a-day rule.
- **`legacy` and `project` double acts,** and a repair's rerun from the start, whose acts live only for one engine run. The run gate does not cover those, and the engine is not this lane's.

## Open questions

1. **`explore.ts`:** should "explore" answer too in this mode? It is a few lines.
2. **A `same_act` slot in the contract's `loopsCaught`?** A contract change, so yours.
3. **The Lab's default** stays `legacy` and yours to flip at merge. `labAuthoringModeValue([])` is still tested as `legacy`, so that test moves with the flip.

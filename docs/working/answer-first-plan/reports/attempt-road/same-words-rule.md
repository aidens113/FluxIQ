# The same words again, and Run again (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. `S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `AF/` = `SVC/answer-first`. No provider, no paid call, no key, no `dist` rebuild, no browser.

**The rule below is the lead's call, reported to the person, who may overrule it. It is recorded as the supervisor's call, never as the person's rule.**

## Outcome

Done from source, with the real service and scripted models. The browser proofs are the lead's to run (below).

- The same words typed again carry every act that landed or may have, however the attempt before ended. A repeat is not pressed: the Flow run reads it as already done, a press by hand is refused, and the result says "Already done earlier: …".
- Run again on an attempt's answer works now. It goes through a new route, `run-task-again`, and starts a new attempt with an empty act record. That the person pressed it travels by a scope only the route sets, so it is never a request field.
- A repeat asked for in words takes the chat's existing question-back. The person's answer becomes part of the words the command saves, so it is another task with its own empty record.
- Carry is a union across attempts. Attempt 3 carries what attempt 1 landed even when attempt 2 landed nothing, and even after a Run again.
- The undeclared-press part of your choice is built:
  - A press that declared nothing is carried only when its own answer says it changed something that stays. It is then held to a look.
  - A press that changed nothing, or only moved the view, is not carried, and the Flow presses it as often as it says.
  - A saved step on a control its attempt saw flip gets `ensureState`. It is kept beside the saved steps and left off by Run again.
- With the seed change taken out, 6 of the 7 new service tests failed. Restored, `cmp` says it is identical.

**Two calls of mine that you should check:**

1. **Run again leaves off Core's own `ensureState`.** Without that, "Run again presses again and the toggle unsaves" cannot happen, because the step would see the state and skip. The cost is that on a real model a toggle Run again leaves the tables unsaved. A judge then says no to "Save these", and the rounds cannot press again because this attempt's own record refuses it, so the attempt spends until its budget is gone. A step the model itself wrote with a state, such as `again-check`'s `set Saved to checked`, keeps it on Run again.
2. **After a Stop cuts a Run again short, the same words press nothing more.** The union carries attempt 1's rows too. A person who wants the Run again finished presses Run again again. `double-act-on-run.test.ts` (f2) now says this.

## The rule as built

| How the attempt started | Its act record | Where |
| --- | --- | --- |
| Same words as before, whatever the last attempt ended as | Seeded from the union of what the task landed or may have | `S/runtime/answer-first/act-record/seed.ts`, `AF/attempt/opening.ts` |
| A person's Run again | Empty. What it was spared is kept as `acts.earlier` in the task's memory | `AF/run-again/`, `AF/attempt/run-attempt.ts` |
| The person's own words asking again | Another task key, so its own record | `AF/task-key/`, unchanged |
| A carry-on of the same attempt | The same record | Unchanged |

**What carries, by act:**

| Act | Carried? | In the next attempt |
| --- | --- | --- |
| Declared or claimed, landed or may-have-landed | Yes | Refused as it always was. Said as "Already done earlier: …" or "May already be done: …" on the result. The words are added only where a person reads them, never to what is persisted |
| Undeclared, and its answer says it changed something that stays | Yes, as `heldOnRepeat` | Refused until a look, as a may-have-landed act is. Kept off the result. Within its own attempt it is pressed as often as the Flow says, so `plain-press.test.ts` stands |
| Undeclared, nothing says that | No | Pressed as often as the Flow says |
| Undone or not done | No | Did not stand |

**What "changed something that stays" means:** the press flipped its own control (`toggle`), or a line of the page it stayed on now reads otherwise or rose. A line that only appeared or went is what opening a menu or dialog does, so it does not count. A press that moved the page does not count either. At run stage only `toggle` is available, because the engine's answer carries no page comparison. Where it is read: `gate/read-answer.ts` (`changedState`) and `run-acts/node-answer.ts` (`flipped`).

**What a round is told:** each carried act is marked `carried: true` in `acts`, and a new `earlierActs` line says: "The acts marked carried were done by an earlier attempt at this same request. Asking in the same words is not asking for them again: do not press them again. Check on the page that they stand, and answer with what stands." These are Core's words and teach nothing about any site.

## Each road

### Who calls the seed

Only `AF/attempt/opening.ts` (`seedOf`). It reads the task memory's `acts` (`data` and `earlier`), or else the Flow's own record when its latest row is this task's last attempt. A carry-on never comes here: it takes `hold.acts`. The status argument is gone from the seed.

### Run again, from the press to the attempt

1. `packages/ui-components/src/chat/answer/view/handlers.ts` calls `results.runAgain({ projectId, taskId })`. No change was needed in ui-components.
2. Extension port, `results-port.ts`:
   - A run this panel read from a dataset, with no attempt behind it, still runs its Flow as before.
   - Anything else goes to the new `run-task-again.ts`, which sends `AUTOMATION_PANEL_MESSAGES.runTaskAgain` with `{ projectId, taskId }` and nothing else.
   - The old "I can't run this one again from here." now applies only to a dataset run with no Flow.
3. Relay, `background/automation-relay/automation-relay.ts`, calls `run-task-again` with exactly `{ projectId, taskId }`. Stray fields are dropped, and this is tested.
4. Token route, `apps/web/src/lib/program-route.ts`: the route is on the allowlist and narrowed to `projectId` and `taskId`. Any other field is refused by name.
5. Core route, `S/programs/automation-studio/api/handlers/task/attempt-run-again.ts`:
   - `flows.write`, `authoring`, `studio:RunTaskAgain`, and it asserts domain access first.
   - It refuses any field outside `projectId`, `taskId` and `authSessionId`.
   - It is registered beside carry-on, from inside `registerCarryOnTaskAttemptEndpoint`, so `llm-generation.ts` was not touched.
   - The IAM catalog was regenerated: one line in `packages/contracts/src/iam/actions.generated.ts`.
6. `AF/run-again/run-again.ts`:
   - Reads the task's memory to find its Flow and its `startLocation`, which the memory now keeps (written at opening).
   - Refuses, in a person's words: a task it does not have, a task still going, and a Flow whose goal is now another task's.
   - Claims the task so that two presses start one attempt.
   - Mints the attempt id, answers `{ attemptId }` at once, and runs the ordinary generation request inside `automationStudioAnswerFirstRunAgainScope`.
7. `AF/attempt/run-attempt.ts` and `opening.ts` read that scope:
   - The attempt uses the minted id, starts with no seed, keeps the spared seed as `setAside`, and persists it as `acts.earlier`.
   - It marks `askedAgain`, which goes on the provenance row so a carry-on of it keeps it.
   - Its Flow run gets no `stated`.

How the press is proven to reach the attempt:
- Route test: the stub generation sees the scope `{ projectId, flowId, taskId, attemptId, opened: false }`, with the same `attemptId` the press answered.
- Service test: `again.answer.attempt.attemptId === again.pressed`, the card was pressed a second time, and the provenance says `askedAgain: true`.

### A repeat asked for in words

Nothing new was needed. `person-wait.ts` and the permission asks are mid-attempt questions, so they are the wrong place for this. The chat's model already has a question-back (`clarify`). `runtime/conversations/person-words.ts` reads every person turn up to the command, and a `clarify` does not close what was asked. So "Save the tables" → "Do you want them saved again?" → "yes, again" saves the instruction "Save the tables\n\nyes, again". That is another key, so it gets an empty record. These are the person's own turns; a model's argument is used only when no person turn started the command.

The one change is a generic sentence in `S/runtime/conversations/commands/answer-first/summary.ts`, the capability summary the chat's model reads. It is a capability description, not attempt guidance:

> The same request again checks what it already did and reports that, and does not do it twice. Where a person asks for something done before to be done a second time, first ask them once whether they want it done again, and start only when they answer yes.

There is no PIN. This happens in the chat, before any command, so never mid-Flow.

**Limit:** "do that again" with no task in it, followed by "yes", gives words with no task in them. That attempt starts blank and has no saved Flow to use. The chat's question can ask what to do again, and Run again is the reliable way.

### "Again" in the words is a different key

`task-key` normalises Unicode, collapses runs of whitespace, trims, and keeps case. So "Save X" and "Save X again" are two keys, and so are "Save X" and "save x". A carry-on keeps its own record. This needed no change.

### Across many attempts

The seed is a union by act id, keys and rows merged, with the latest state winning, over `earlier` (what a Run again spared) and `data`.

Proven:
- `seed.test.ts`: 1 lands 3, 2 lands none, 3 carries 3. A Run again's new row and the spared rows both carry. The same row pressed again by a Run again is one act.
- `same-words.test.ts`, through the service: attempts 3 and 4 press nothing. After Run again the next same words press nothing. A Run again that pressed nothing still leaves attempt 1's card carried.

### Rows across attempts

- `seed.test.ts`: a carried row read again under renamed columns with a whole address is still that row, and a new fourth row is not held done. A row attempt 1 never pressed is still asked.
- Service: a saved repeat over loans renews three. A fourth loan appears, and the same words renew only the fourth, once (`same-words.test.ts`, "a row that was not there the first time").

### `ensureState` on an answer-first Flow

- Worked out at the draft save (`AF/attempt/draft-save.ts`) from the build's own explored toggles. Those are the by-hand presses, plus the Flow run's trace, now fed in with `exploredToggles.trial` in `flow-run.ts`. It uses the same tie as candidates, through `flow-run/stated-toggles.ts`. The state chosen is the one the latest tied press left, checked against every observation with `automationStudioToggleStateChoice`.
- Kept by step id on the saved Flow (`saved.stated`). It is written into the draft candidate (laid out again, as `relaid` does) and into a later attempt's run plan (`flow-run/stamped-plan.ts`). The steps' digest does not move.
- A Run again neither uses nor learns states.
- Observations that disagree, a node that cannot take `ensureState`, and a step that already holds one are left as they are. A plan that will not validate stays plain, with a step log note. It never refuses anything.
- `S/runtime/flow-authoring/bootstrap/explored-toggles.ts` needed no change.

Proof, `flow-run/tests/stated-toggles.test.ts`, on a toggling "hold shelf" in the library fixture:
- The run sees a flip and the state is derived.
- A later run with the state presses nothing ("skipped").
- With no state, as Run again runs, it presses and the switch goes back.
- Disagreeing observations get no state.
- A flipping undeclared press is carried as `heldOnRepeat` and not pressed by a later run.

### Tests that encoded the old rule

Many existing proofs relied on "after an achieved attempt the record is empty" just to make a saved Flow press again. Their second and later attempts now start by Run again (`runAgain: true` on `laterAttempts`), which is that press. Their own assertions are unchanged except:
- `later-attempt.test.ts`: the achieved-carry test is rewritten to the new rule, with a Run again test beside it. "An attempt that presses nothing" now proves that carried acts say so, and that a Run again leaves none.
- `second-attempt-proof.test.ts`: one title now says "a Run again".
- `dropped-act.test.ts`: one test is renamed to Run again.
- `double-act-on-run.test.ts`: the (f) repeat test now expects the union, as above.
- `interrupted.test.ts`, `apply-proven.test.ts`: as above.

## The browser runs for you

First rebuild Core, the domain, the extension and the test-runner in the t869 trees, once the other worker's files settle. Run each command as `FLUXIQ_ATTEMPT_SCRIPT_FORM=<form> pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model --attempts 2`.

**1. `again-press`: now expect exit 0 (it was exit 1).**
- `attempt-2/site.json`: `"change": {}`, and no `unsaved` in `activity`.
- The attempt 2 line: `answer right`, `It changed nothing on the site`, and `found already done: The three cheapest dining tables saved`.
- `attempt-2/answer-turn.json` `siteLines`: three lines starting "Already done earlier: Save".
- If the Flow ran whole: path `run_flow` with 0 decisions in `model/`, and the step log shows each Save as "Already done".
- If it stopped on the way: the rounds' by-hand Saves come back `attempt.act_already_done`, and the step log's note shows `earlierActs`.

**2. `again-check`: expect exit 0.** Same as before. The one change: `siteLines` are now three "Already done earlier: …" lines, not none.

**3. `run-again` (new): expect exit 0, and this proves the Lab still catches what is a repeat.**
- Attempt 2 starts with the log line `[attempt] pressing Run again on the answer of attempt.…`. No instruction is typed.
- `attempt-2/site.json`: `unsaved` three times in `activity`, and `change` at -1 on `saved:1003207682554201`, `saved:1054419573499480` and `saved:1055628457179429`.
- The attempt 2 line reads `answer right. You asked to do it again (Run again): it did again: The three cheapest dining tables saved, so these are no repeated acts.`
- `attempt.json` row 2 carries `askedAgain: { pressedAgain: [...], notPressed: [] }` and `repeatedActs: []`.
- What it means: the same change scored as typed words fails `judgeLaterChange` with `unaskedChanges` on three names. That is what `again-press` would report if Core let the presses through.

**4. `plain`: expect exit 0.** The saved Save is carried, so nothing is unsaved. This differs from `saved-flow-defects.md`, which expected exit 1.

## Commands run and observed results

Core, from `packages/fluxiq`, with `--minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"`:

```text
vitest src/runtime/answer-first/act-record          Test Files 18 passed (18)  Tests 316 passed (316)
vitest flow-run/tests/stated-toggles.test.ts         Tests 6 passed (6)
vitest tests/same-words.test.ts                      Tests 7 passed (7)
seed change taken out (an all-landed record carried nothing):
  same-words.test.ts                                 Tests 6 failed | 1 passed (7)
  restored: cmp seed.ts seed.ts.orig -> "cmp: identical"; md5 a6fa2785b13404d8b65954e79fe67977 before and after
vitest later-attempt, second-attempt-proof, interrupted, apply-proven   58 passed after the Run again changes
vitest double-act-on-run.test.ts                     35 passed (the (f) test rerun alone: 3 passed)
vitest handlers/task, task-attempt-wiring, task-attempt-routes, domain-scope, endpoint-classification, iam/catalog
                                                      44 passed, 1 failed: task-attempt-routes "answers one attempt …"
                                                      expects no stepsDigest on `saved`; it is there at HEAD
                                                      (620bafdfc). Not mine; that file is not in my paths
FLUXIQ_REGENERATE_IAM_CATALOG=1 vitest src/platform/iam/catalog   11 passed; +1 line studio:RunTaskAgain
(root) pnpm.cmd --filter fluxiq check                exit 0
(root) node scripts/structure-audit.mjs              structure-audit: passed (529 warning(s), 1097 baselined).
apps/web: npx tsc -p tsconfig.json --noEmit          exit 0
apps/web vitest                                      not run: "Core's library build is 81 minute(s) behind its source"
                                                      (no dist rebuild allowed)
```

Final acceptance run, one command over `src/framework/automation-service/service/answer-first`, `src/runtime/answer-first`,
`api/handlers/task`, `task-attempt-wiring`, `task-attempt-routes`, `domain-scope`, `endpoint-classification`,
`platform/iam/catalog` and `runtime/conversations/commands`:

```text
Test Files  2 failed | 126 passed (128)
     Tests  4 failed | 1295 passed (1299)
```

- 3 of the 4 were `attempt/tests/draft-save.test.ts`. Its stub plan has no subflows, and the stamp threw, which cost the draft.
- I fixed that in the code: working out the states is now best effort, with a step log line, and never costs a draft.
- Reran `draft-save`, `stated-toggles` and `later-attempt`: `Tests 33 passed (33)`. Then `pnpm.cmd --filter fluxiq check` exit 0, 0 `error TS`.
- The 4th is the `task-attempt-routes` `stepsDigest` failure that is already at HEAD (above).
- I did not rerun the whole command after the draft-save fix. The fix touches only `draft-save.ts`.

Extension:

```text
apps/extension: npx tsc -p tsconfig.json --noEmit        exit 0
apps/extension: npx tsc -p tsconfig.test.json --noEmit   exit 0
domain: npx tsc -p tsconfig.json --noEmit                exit 0
apps/extension: node scripts/test-extension.mjs panel/chat/transport background/automation-relay/tests
                                                         # tests 61  # pass 61  # fail 0 (the 4 new ones included)
test-runner: npx tsc -p tsconfig.json --noEmit           exit 0
test-runner emitted to a private .sw-t869-dist (deleted after), then node --test on the save-dining-tables script,
  result-line, judge-asked-again, judge-later-change, attempt-series and follow-attempt tests: # tests 59 # pass 59 # fail 0
(root) node scripts/structure-audit.mjs                  structure-audit: passed (244 warning(s), 552 baselined).
```

## Not verified

- Any browser, real page, paid run or real model. In particular:
  - That the stamp ties a real web Save step: the tie is through `handleViews` and the toggle's resolved target.
  - That a real panel draws Run again on an attempt's answer and the press reaches Core.
- The apps/web route tests: the stale-dist gate refused them. Typecheck only.
- The `changedState` reading against real domain answers (`draft.changed`, `evidence.toggle`, `outputs.toggle`). It was proven on stubs of those shapes.
- What a real judge does on a Run again that toggles off: see call 1 above.
- The Lab `run-again` form end to end. The press helper and the judgement are unit-proven only.

## Paths outside the literal list

- `apps/web/src/lib/tests/program-route.test.ts` and `apps/web/src/app/api/programs/[programId]/[endpoint]/tests/route.test.ts`: both pin the allowlist, so they gained `run-task-again`, plus one narrowing test.
- `S/programs/automation-studio/api/handlers/task/tests/run-again-route.test.ts` (new, under the owned handlers path).
- `docs/architecture/automation-studio/llm-flow-bootstrap.md` ("Which acts carry", "Running again") and `client-gateway.md`.
- Extension `docs/architecture/extension-client.md`.
- Updated tests: `run-acts/tests/settling.test.ts`, `act-record/tests/{foreseen,look-after-refusal,seed}.test.ts`, and the `AF/tests/**` files listed above.

## Open questions

1. Should Run again leave off Core's `ensureState`? I did, because the proof asks for the unsave. The alternative is to keep it, so a person's Run again of a toggle never undoes their saves; the Lab proof would then need a form whose Save no toggle answer covers.
2. Should a Run again cut short by a Stop be finished by the same words? With the union, it is not.
3. A real judge says no after a toggle Run again, and the attempt then spends to its budget. Should a Run again's judge be told the person asked for a repeat?
4. `task-attempt-routes.test.ts` fails at HEAD on `stepsDigest` (from 620bafdfc). It should be fixed by whoever owns that file.

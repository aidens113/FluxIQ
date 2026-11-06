# Run again keeps the checked state, the routes test, and a real restart between attempts (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. `S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `AF/` = `SVC/answer-first`. Provider-free throughout: no paid call, no real key, no `.env.local` opened, no git mutation.

## Outcome

Done, with one finding the lead must route: a saved plain-press Flow cannot run whole on any later attempt (section 4).

1. **Run again keeps `ensureState`.**
   - A Run again starts with an empty act record and runs the saved Flow with the states Core stamped on it.
   - A control already in its asked-for state is checked and not pressed. A count's add presses again.
   - In the browser, the toggle task's Run again changed nothing and answered right (exit 0).
2. **The routes test was wrong, not the read.** It now gives its row real steps and expects their digest.
3. **A real Core restart between attempts** is `--restart-between`.
   - With the real domain and service, attempt 2 after the restart found the saved Flow, assembled the saved read with no "did not assemble" line, ran it, pressed nothing, and answered right (exit 0).
   - With the read's saved binding taken out, attempt 2 after the restart does not assemble, and goes to repair.
4. **Found on the way, not fixed (outside this brief):** a saved Flow whose repeat opens each row by its address stops on every later run. It stops at that open step with `executor.parameter.unresolved_state_path`.
   - This happens on Run again and on the same words typed again.
   - It happens with the stamp taken out and with the binding taken out, so it is neither of those.
   - It is why the `run-again` form now uses `again-check`'s Flow, and why Core's stamp on a plain-press Save has not been seen working in a browser yet.

## What changed and why

### 1. Run again keeps the state (Core)

- **The source: `AF/attempt/flow-stage.ts`.** It now passes `route.saved` whole, so `stated` goes with it. Before, a Run again passed only `{ steps, stepsDigest }`. The header now says a Run again checks stated controls first, and why.
  - `AF/attempt/` is outside the owned list, but it is where the strip was, and the brief said to change it at the source. The edit is 8 lines, plus one doc-comment line in `attempt/state.ts`.
- **Unchanged: `draft-save.ts`.** A Run again still learns no new state. If a Run again ever flipped an unstamped toggle, learning from it would stamp the wrong state. It keeps the states it held.
- **`AF/flow-run/flow-run.ts`:** header comment.
- **Doc:** `docs/architecture/automation-studio/llm-flow-bootstrap.md`, one sentence: a Run again keeps it too.
- **`AF/tests/same-words.test.ts`, new test** "keeps each step's checked state…":
  - Real service, real engine. A saved read plus a hold switch stated `on`.
  - Attempt 1 by words presses once. A Run again then runs `run_flow` with 0 decisions, the switch stays on, there is 1 press in all, and the state is kept.
  - **Shown to fail:** with the old strip put back (copy, edit, run, restore), it failed with `expected false to be true` (the switch went back off). Restored: `cmp: identical`.
- **`AF/flow-run/tests/stated-toggles.test.ts`:** the third test no longer says it is "as Run again runs it". It is what the state is there to stop.

### 2. The routes test (Core)

- 620bafdfc put `stepsDigest` on `saved` on purpose. The contract (`saved-state.ts`) and the read's own test (`attempt-store/tests/outcome-of-record.test.ts`) pin it.
- The routes test pinned the old shape. Its row had a draft with no steps, which no real attempt writes (the draft is saved from the attempt's steps), so the read digested an empty list.
- The test now gives the row two steps (`savedStep`) and expects `stepsDigest: automationStudioAnswerFirstStepsDigest(STEPS)`.
- Another worker has since added `leftOut` to `saved`. It is absent when nothing was dropped, so this test holds; it was rerun after their change.

### 3. `--restart-between` (Lab)

- **`commands.ts`:** the flag. It needs `--attempts 2`, and a second copy is refused. The dry run reports `restartBetween`.
- **`attempt-lane/run-attempt-series.ts`:** `beforeLater(ordinal)` runs once before each later attempt, after `mayGoOn` lets it go on, and never when the series stops short.
- **`attempt-lane/live/attempt/restart-core.ts` (new, exported from the barrel):**
  1. `topology.restartCore()`, the coordinator's own: the same ports and stores.
  2. The Lab's control client signs in again, since its session belonged to the Core that stopped.
  3. It waits for the extension's own reconnect, then reads the model key's readiness.
  4. It reads the open chat's scope. If the chat that was open can take a message, it is used as it stands. Only otherwise is the panel opened again, as a person would.
  5. It returns what happened, and the run writes it as `restartedBetween` in `attempt.json` and as the first line of the report.
  - Nothing in the browser is touched while Core is down.
- **`attempt-lane/live/run-attempt-command.ts`:** wires it, and writes the line.
- **Tests:** flag parsing (`lab-attempt-command.test.ts`) and the hook's order (`attempt-series.test.ts`).
- **Doc:** `docs/architecture/testing-facility.md`, the flag and Run again. I also fixed its stale paragraph that still said the act record starts empty after an achieved attempt.

### The Run-again oracle (Lab)

- **`flow-lane/creation/site-change/later/judge-asked-again.ts`, rewritten.** It now takes `(asked, left, change)` and returns a `SiteChangeJudgement`. Each asked act is one of:
  - **pressed again:** it moved again the asked way, a count. No repeat.
  - **found as asked:** it stood as asked and did not move. Right.
  - **undone:** it moved back. Wrong, named in `unaskedChanges`.
  - **not pressed:** never done. Missing.
  - An earlier attempt's undone part is held to the plain oracle. An unasked name is wrong.
- **`flow-lane/creation/answer/judge-answer.ts`:** `askedAgain` uses it. The live driver no longer overrides the score, so rows, final state and the shown answer count on a Run again like any attempt. Before, they were set to `not_declared`.
- **`driver.ts`:** `AttemptAskedAgain`.
- **`result-line.ts`:** new words, for example `You asked to do it again (Run again): it found already as asked and pressed nothing: …`.
- **Tests rewritten:** a toggle pressed off on a Run again is wrong; standing saves are right; a count moved again is right.
- **Its limit:** the Lab's lasting view does not say which name is a count. A count left as it stood therefore reads as found as asked here, and Core's own test is what holds that a count presses again. This is said in the code and the doc.

### The `run-again` script form (Lab)

- `local-classifieds-save-dining-tables.ts`: no form presses again on a Run again any more. `run-again` is now `again-check`'s Flow (the Save is `set Saved to checked`) started by Run again.
- It refuses any round after the saved Flow's run, and its judge reads the real rows.
- It moved off the plain-press Flow because of the defect in section 4. The header says so.

### A Core step-log note (Core)

- **`AF/flow-run/stopped-note.ts` (new), called from `flow-run.ts`.** When a saved Flow's run stops short, the step log gets the step, its code, and the failed node's definition with its category and code, innermost child first. It never includes a failure's words.
- **Why:** the attempt's row and the round's note carry only Core's sentence, so nothing kept said why step 13 failed. Core's own rule (`draft-save.ts`) is that codes belong in a step log.
- **Test:** `AF/flow-run/tests/stopped-note.test.ts`. A failing renew inside a repeat is noted with its code and without the message's secret; a whole run notes nothing.
- **Also added:** `AF/flow-run/tests/stamped-plan-repeat.test.ts`. A stated step inside a repeat: the re-laid plan equals the assembly's apart from `ensureState`, every pass runs, and the switch is pressed once.

## The browser runs

All runs were after the brief's rebuild. The Lab twice refused Core as changed (my test files and the other workers' edits), and each time I rebuilt and ran again. Every run used a visible Chrome and the real chat. Evidence folders are under `fxwork/t869/!FluxIQWebExtension/test-runs/attempts/`.

### `again-check --attempts 2 --restart-between`: exit 0, `run-mw3z9cn0-6b368c14`

```text
[attempt] restarting Core between the attempts: the browser and the chat stay as they are
[attempt] the extension connected again 12 s after the restart began
[attempt] the browser's model key reads unlocked after the restart
[attempt] the open chat carried on by itself after the restart
[attempt] Core restarted between the attempts: the extension connected again after 12 s, the model key read unlocked, and the chat carried on by itself.
[attempt] local-classifieds-save-dining-tables attempt 1: answer right. Ended achieved, 5 rows stored, 5 shown, 33 live steps, 27 calls, 0% of input from cache, $1.3986, 68 s. NOT LIVE, stand-ins: model, spend.
[attempt] local-classifieds-save-dining-tables attempt 2: answer right. It ran against what attempt 1 left, with no reseed; it found already done: The three cheapest dining tables saved. It changed nothing on the site. It took the run of the saved Flow, and needed nothing else. It started from the first attempt's saved work, proven by the digest. Ended achieved, 5 rows stored, 5 shown, 14 live steps, 1 calls, 0% of input from cache, $0.0093, 37 s. NOT LIVE, stand-ins: model, spend.
```

- `attempt-2/site.json`: `"change":{}`, `"activity":[]`.
- The card's site lines: `Already done earlier: Save: Round pine dining table, 90cm.`, `Already done earlier: Saved: Glass dining table with chrome legs.`, `Already done earlier: Saved: Dining table, industrial style, 160cm.`
- The step log has no "did not assemble" line, and no note at all.
- Attempt 2's one call is the judge. Its request holds the three tables in the rows the saved read returned in the restarted Core.
- `restartedBetween`: `{"reconnectedAfterMs":11534,"modelKey":"unlocked","panel":"carried_on","panelBefore":"ready, composer ready"}`.
- **The attempt-2 picture, which I read:**
  - Saved items: 5, with the three tables "Saved just now", and the panel connected.
  - The answer says the three "Already done earlier" lines and "Left out 2 that looked already done".
  - It says "Used what I saved. No steps had to be worked out again." and "This time 37s and $0.01. First time 1m 8s and $1.40".
- **Things in that picture that are not mine:**
  - "Checked: 5 rows, 3 acts on the site" counts the carried acts as acts.
  - "Saved today: the steps, except the one that did "Save" (it was left out of the Flow)" is the other worker's `leftOut` line. The hand press was left out, but the Flow does save, by a check.
  - The Run again button's "Running this again may repeat what was done on the site" is no longer true of a stated toggle.
  - The page's "Working on your task · Step 11 of 11" strip still shows after the end.

### `again-check --attempts 2` (no restart): exit 0, `run-mw3zi7o8-a855da8a`

- Attempt 2's line is word for word the same as above, apart from the numbers: 14 live steps, 1 call, $0.0094, 36 s.
- `"change":{}`, `"activity":[]`. The same three "Already done earlier" site lines. No "did not assemble" line.

### `run-again --attempts 2`: exit 0, `run-mw4244vy-ef1ea1bd` (`again-check`'s Flow, see above)

```text
[attempt] pressing Run again on the answer of attempt.300dd9c7-e898-4442-9d20-a4b46dfe29c8
[attempt] local-classifieds-save-dining-tables attempt 2: answer right. You asked to do it again (Run again): it found already as asked and pressed nothing: The three cheapest dining tables saved. It ran against what attempt 1 left, with no reseed; it found already done: The three cheapest dining tables saved. It changed nothing on the site. It took the run of the saved Flow, and needed nothing else. It started from the first attempt's saved work, proven by the digest. Ended achieved, 5 rows stored, 5 shown, 16 live steps, 1 calls, 0% of input from cache, $0.0092, 41 s. NOT LIVE, stand-ins: model, spend.
```

- `attempt-2/site.json`: `"change":{}`, `"activity":[]`.
- The card's site lines: `[]`. The record started empty, so nothing is carried; the card says "On the site: I recorded no changes".
- The row's `askedAgain` is `{"pressedAgain":[],"foundAsAsked":["The three cheapest dining tables saved"],"undone":[],"notPressed":[]}`. Change, final state and records all `held`.
- **The picture, which I read:** 5 saved items with the three tables, "On the site: I recorded no changes", and the page strip says "Finished".

### The first `run-again` on the plain-press Flow: not judged (exit 1), `run-mw3zmaae-1db28761` and `run-mw40lrug-54a96b77`

- The saved Flow's run stopped at step 13. The script refused the round, as the form is meant to.
- The new note gives the cause: `The saved Flow's run stopped at step 13: executor.parameter.unresolved_state_path; web.output.browser-navigate (graph_validation_or_unknown_node/executor.parameter.unresolved_state_path)`.
- Step 13 is the repeat's "open the table by its own address", bound to `{"$row":"url"}`. Step 14 is the Save.

### The failure proof for item 3: `again-check --attempts 2 --restart-between` with the binding taken out, `run-mw41nybp-7235b6c0`

- **The edit:** `domain/src/runtime/llm-evidence/plan-resolution/extraction/saved-list.ts` was copied to the scratchpad. `webPlanWithExtractionBinding` returned its parameters unchanged, so no step was saved with a binding. Then domain, test-runner and extension were rebuilt.
- **After the restart:** the extension reconnected in 22 s and the chat carried on. Then the step log said:

```text
The saved steps did not assemble, so this attempt repairs them and does not run them: flow_bootstrap.evidence_completion_parameters_unresolved, web.handle.unknown at plan.subflows.0.nodes.4.parameters, web.handle.unknown:extractList at plan.subflows.0.nodes.4.parameters, web.handle.unknown at plan.subflows.0.nodes.13.parameters, web.handle.unknown:extractList at plan.subflows.0.nodes.13.parameters
```

- **What happens then:** the attempt goes to the rounds to repair, so it costs model calls; the route is `repair`. Here that was request 26, a decision. `again-check`'s script refuses any round, so the run ended "not judged" (exit 1) and the repair's cost was not measured. That cost, re-detecting the list and rewriting the read, is a model's, so only a paid run shows it.
- **Old drafts on disk** hold no binding, so they take this same road after a restart.
- **Restored:** `cp` back, `cmp: identical`, no `TEMPORARY` line left, `git status` shows `plan-resolution/` clean, and domain, test-runner and extension were rebuilt.

## Section 4: the defect found, with its evidence

**What it is.** A saved Flow whose repeat opens each row's page by `$row.url` stops at that step on every later run.

**Its code.** `executor.parameter.unresolved_state_path` on `web.output.browser-navigate`: the step finds no `item.url`.

**Where it was seen:**

| Run | What attempt 2 was | Where it stopped |
| --- | --- | --- |
| `run-mw3zmaae`, `run-mw40lrug` | a Run again | step 13 |
| `run-mw401g9k` | the same words typed (`again-press`) | step 13. It still exits 0, because the rounds' presses are refused as already done |
| `run-mw412dv3` | typed, with the stamp taken out of every later run | step 13, same code, so it is not the stamp. `flow-stage.ts` restored, `cmp: identical`, rebuilt |
| the binding-out build | typed, same process, binding taken out | step 12 there, same code, so it is not the saved binding |

**What it means:**
- Attempt 1's forward run from the read, inside the build, worked on the same steps. The difference is a whole run from the start against a run from the read step.
- This is in Core's draft assembly or the engine's repeat state, outside this brief. I did not trace further.
- **Impact:** a later attempt of such a Flow never runs whole. It reaches the rounds and spends model calls; the same-words carry keeps it from unsaving. Core's stamp on a plain-press Save inside such a repeat has been proven only in Core tests (`stated-toggles`, `stamped-plan-repeat`, `same-words`), never in a browser.

## Commands run and observed results

**Core, from `packages/fluxiq`.** Every vitest run used `--minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"`.

```text
vitest answer-first/ + programs/automation-studio/api/      Test Files 123 passed (123)  Tests 947 passed (947)
vitest routes, same-words, stated-toggles, attempt-store  (after the other workers' leftOut change)
                                                          Test Files 6 passed (6)  Tests 44 passed (44)
final, after the last edits:
vitest task-attempt-routes, same-words, flow-run/, attempt-store/, attempt/, later-attempt, second-attempt-proof, double-act-on-run
                                                          Test Files 26 passed (26)  Tests 200 passed (200)
mutation, old Run again strip put back: same-words "checked state" test   1 failed: expected false to be true; restored, cmp: identical
(root) pnpm.cmd --filter fluxiq check                     exit 0 (run twice, the second after the last edits)
(root) node scripts/structure-audit.mjs                   structure-audit: passed (530 warning(s), 1097 baselined).
```

**Extension:**

```text
packages/test-runner: npx tsc -p tsconfig.json --noEmit        exit 0
node --test (from dist) judge-asked-again, judge-later-change, result-line, attempt-series, lab-attempt-command,
  local-classifieds-save-dining-tables, follow-attempt, can-go-on        # tests 71  # pass 71  # fail 0
pnpm.cmd --filter @fluxiq-web-extension/test-runner --filter @fluxiq-web-extension/test-contracts check   exit 0
node scripts/structure-audit.mjs                       structure-audit: passed (244 warning(s), 552 baselined).
                                                       (first run failed on a packed statement in attempt-series.test.ts; split, then passed)
```

**Builds.** Each was run as the brief gives, before each browser run; every build exited 0.

**No process of this task is left.** No Node or Chrome process has `t869` on its command line, and the one Chrome running is not the Lab's.

## Not verified

- **Core's stamped `ensureState` on a real web Save**, plain press, in a browser. It is unreachable until the section 4 defect is fixed.
- **The cost of a repair after a restart** with an old draft. The scripted model cannot repair; a paid run would show it.
- **A count's Run again in a browser.** It is held by Core's `same-words` test only, and the Lab cannot tell a count from a state.
- **`--restart-between` with `run-again`**, and with a paid model. A panel that cannot carry on after a restart: this run's carried on, so the reopen path has not run.
- **Firefox.** The full suites; narrow checks only, as asked.

## Open questions or contradictions

1. **Section 4's defect** belongs to whoever owns the draft's row bindings and repeat state. Until it is fixed, every later attempt of a Flow that opens rows by address goes to the rounds.
2. **The answer card says "Running this again may repeat what was done on the site"** on a task whose Save is a stated toggle, where a Run again now repeats nothing (`ui-components`, not mine).
3. **"Checked: … 3 acts on the site"** counts carried acts on an attempt that changed nothing. The `leftOut` line says the Save was left out of a Flow that saves by a check. Both are other workers' areas.
4. **Paths outside the owned list I touched:**
   - Core: `AF/attempt/flow-stage.ts` (the source the brief named) and `AF/attempt/state.ts` (a comment).
   - Core: `AF/tests/same-words.test.ts` (named in acceptance) and `docs/architecture/automation-studio/llm-flow-bootstrap.md` (one sentence).
   - Extension: `packages/test-runner/src/flow-lane/creation/answer/judge-answer.ts` (where the Run-again judgement is applied) and `packages/test-runner/src/commands.ts` (the flag).

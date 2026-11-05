# The attempt road: a task from the chat to its result, proven provider-free (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`, branch `task/t869-attempt-road`. `S/` = Core `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`. Worker reports are in `attempt-road/`: `loop-and-counts.md`, `purse-and-eviction.md`, `road-and-read.md`, `attempt-driver.md`, `small-fixes.md`, `row-identity.md`, `same-row-merge.md`, `wiring.md`, `toggle-proof.md`, `re-aim.md`, `count-and-part.md`.

## Outcome

**Done. A task typed into the real extension chat runs on `answer-first` and its result comes back to that chat, in a visible browser on realistic sites, with a lasting act landing exactly as often as asked.** A script made every model choice, so this proves the road and the record and says nothing about how a real model behaves. No paid call, no real site and no real key was used.

**The road's own hops were sound; the double presses were not.** `payload.answered` passed through every hop. What was missing was a route to read an attempt and a tie from a thread to its attempts. Lasting acts were the larger finding: driving the road found three separate ways a row could be pressed wrongly, each real and each now fixed:

1. **A row that changed shape.** In 6 of 8 cases through the real service the first row pressed twice: renamed columns, fewer columns, a trimmed field, a derived field, a field the read had not, and a row the press itself changed.
2. **A control that is the row's whole link.** Every pass opened the first row and pressed its Save again. On a toggle site that undid the act and never reached the other rows. No rule was edited to get this; it is the most natural design a real model could write.
3. **An act known only by a word such as "Accept".** Once two lanes' rules merged, that held every row done, so an "accept each" task would have stopped after its first press.

## The final proofs

On the final code, one at a time, with everything rebuilt. Every line below ends `NOT LIVE, stand-ins: model, spend`, and its dollars are the stand-in's usage priced by Core, not spend.

```text
pnpm lab attempt <site> --task <task> --authoring-mode answer-first --scripted-model
FLUXIQ_ATTEMPT_SCRIPT_FORM=<form> selects reshape, thin or row-link
```

| Task | Form | Exit | Result | Evidence (`test-runs/attempts/`) |
| --- | --- | --- | --- | --- |
| `company-website-apprentices` (read) | | 0 | right, 4 rows stored, 4 shown, 11 calls, $0.4034, 27 s | `run-mw35u6tv-85908599` |
| `professional-network-accept-messaged-invitations` | plain | 0 | right, 3 rows, 13 calls, $0.5098, 32 s | `run-mw360dlz-9c2028a5` |
| | reshape | 0 | right, 3 rows, 15 calls, $0.6086, 33 s | `run-mw3625mo-82e008aa` |
| | thin | 0 | right, 3 rows, 13 calls, $0.5081, 32 s | `run-mw363wng-ced308ab` |
| `local-classifieds-save-dining-tables` (toggle) | plain | 0 | right, 5 rows, 23 calls, $1.1321, 57 s | `run-mw365my0-a0ac967c` |
| | reshape | 0 | right, 5 rows, 24 calls, $1.2007, 60 s | `run-mw367xqg-ce19010c` |
| | row-link | 0 | right, 5 rows, 23 calls, $1.1335, 61 s | `run-mw36aacp-6c4a5853` |

**I read these myself.** In the toggle reshape and row-link runs and the accept reshape run, `site.json` shows each asked-for item changing by 1 and nothing else, `repeatedActs` is empty and `actsWithNoRow` is 0. The toggle runs' activity is `saved pine, saved glass, saved industrial`, with no `unsaved`. In the row-link picture the card shows the three Saves, the check line, "Left out 2 that looked already done", the saved line and the toast's "Finished". I re-ran the seven forms; the checks below marked "worker" I did not.

**The proof can fail.**

| What was taken out | Exit | What it showed | Evidence |
| --- | --- | --- | --- |
| Row-identity rule, toggle reshape | 1 | `saved pine, unsaved pine, saved glass, saved industrial`; a missing act, since the toggle undid the press | `run-mw2vyrxd-f31dc2a3` |
| Re-aim fix, toggle row-link | 1 | `saved, unsaved, saved pine-round-table` | `run-mw2y3y2i-7439f655` |
| Nothing: a script landing a counted act twice | 1 | `repeated_act`, `{ asked: 1, landed: 2 }` | `run-mw2haj1y-96abb1b5` |
| Part's stop, new part spec | fail | status `succeeded`, the heart landed | `count-and-part.md` |

**Why the toggle matters.** On the accept task a second press has no effect on the site, so there "not pressed again" rests on Core's step log. On the toggle task a second press undoes the act, so the site's own record shows it.

## What was built

**The road.** `flow.explore` answers in this mode as `flow.createHere` does. Routes `get-task-attempt`, `list-conversation-task-attempts`, `carry-on-task-attempt` and `get-task-known-flow`; panel message `fluxiq.panel.taskOutcomes`; the extension's real results adapter. An index ties an attempt to its Flow and a thread to its Flows, written before the attempt starts. The paired token's allowlist needed the routes. A closed popup keeps its result: `readThread` asks Core on each read, pinned by a test.

**The Lab.** `pnpm lab attempt`, a live attempt driver, and a scripted model behind the real provider wire (`attempt-lane/scripted-model/`): a local server speaking the provider's streaming replies, reached through a `NODE_OPTIONS` preload in the Core child, with everything else leaving the machine thrown. The chat port reads the answer from the panel's DOM, so a right answer that never reached the person fails. `model` is a named stand-in, and a row naming it can never count as live.

**The ceiling.** `--authoring-mode answer-first --llm-max-cost-usd 5` reaches `FLUXIQ_LLM_RUN_COST_CEILING_USD` with no variable to remember. No default was raised. A lower configured ceiling is still refused, and `--llm-cost-ceiling-usd` still only lowers it. A scripted run's own record says `budget.usd: 5`.

**Your open items.**

| Item | Now |
| --- | --- |
| `explore.ts` | Answers too |
| `same_act` | Its own contract slot. Records written with five patterns read it as zero |
| `asked-count` | Reads "3x", "x3", "a dozen". "a 3x zoom lens", "2x4 boards", "half a dozen" stay at one |
| `attempt-purse` | A person's choice is marked, not read from the value. A deliberate $0.25 holds. The settings form sends the mark only when the limit field was edited |
| Workspace eviction | A waiting attempt counts as busy, through a count that does not depend on tracing |

**Lasting acts.**

- **One sameness rule** (`act-record/same-row.ts`). Two rows of one read are never one row. A word, long id or address must tie them, and a bare number or date never does. Where a read showed either row, that list decides by best fit; where none did, every value must hold. Rows left over are held by elimination. Where more than one is left over, the answer is "cannot tell" and the press is refused rather than guessed.
- **A pass presses its own row's control, or says it could not** (`apps/extension/src/content/action-runtime/pass-row/`). It re-aims by the row's link or words, never by position, and refuses on another row's own page. A row it cannot find is told to the model by name and the run goes on.
- **A link not shown to be the row's** may still go, but no later lasting step of that pass lands. This holds on the forward run, a saved Flow and a part.
- **A press that leaves no mark** now counts: `actsWithNoRow` on the attempt and a plain line in the step log (see "Known limits").
- **A forward run ends with one look at the page**, or says it could not read one, so a model does not act on a stale view.

**What a person reads.** These were untrue or claimed more than the record knows:

| Was | Now |
| --- | --- |
| Toast "Flow ready" on an attempt | "Finished", or how it ended. Only "Finished" may carry a tick |
| "Checked: Checked once against..." | "Checked: 5 rows, 3 acts on the site, once against what was asked for." |
| "They only partly work, so next time I will fix what changed." on steps never run | "They have not run on their own yet, so next time I will try them and fix what fails." |
| "On the site: nothing changed" | "On the site: I recorded no changes" |
| "Skipped 2 as already done" | "Left out 2 that looked already done" |
| "Accept (On the site)." under that heading | "Accept." |
| "so next time is quicker" | "I'll save how I did it for next time." |
| A forward run's "Testing: Click" | Not called a test |

Carry-on's refusal words, the endings and the setup step read true, with no codes, and stay.

**t870's seams, landed.** `create-here` reuses the known Flow, reads go through `AttemptsRead` so a dead Core's row reads as `interrupted`, `addBudgetAndCarryOn` carries on, and Keep going on an `interrupted` attempt calls carry-on with no budget added. Carry-on runs under the chat's mapped session. `provenance` is filled and carried.

## The first paid run

```text
FLUXIQ_LAB_INSTANCE=t869-live FLUXIQ_TEST_ENV_FILES=none pnpm lab attempt company-website --task company-website-apprentices --authoring-mode answer-first --live-llm --llm-model claude-sonnet-5-5 --llm-max-cost-usd 5
```

| | |
| --- | --- |
| **What it runs** | Attempt 1 only, one read task on a realistic local site, typed into the real extension chat, visible browser. No lasting act is asked for |
| **The most it can spend** | **$5.00 by Core's purse**, with two ways past it, below. Nothing decides a task is impossible, so a task that cannot finish spends the whole $5 |
| **Spend ceiling** | $5 is the smaller of the attempt's default, the run ceiling and the Flow's limit, all $5 here |
| **`FLUXIQ_LLM_RUN_COST_CEILING_USD`** | 5, in test scope, from the flag or the worktree's `.env.local`, which also says 5. The flag above it would be refused |
| **Model** | `claude-sonnet-5-5`, $2 in, $10 out and $0.10 cached per million tokens. The dry run confirms Core is started on it, so it cannot fall through to DeepSeek |
| **Key** | `CLAUDE_API_KEY` from the running worktree's `.env.local`. I checked the name is there and did not read the value. It goes in through Secret Keys, as a person's does |
| **Expected cost** | Unknown on this mode. The earlier measure on `legacy` is $1.12 to $1.89 per task, a different path. The stand-in's $0.40 is not a prediction |
| **Logged** | Each model call and tool step in `lab-runs/<date>/<runId>/steps/`; `attempt.json`, `answer-turn.jpg`, `answer-turn.json`, `site.json` and the report under `test-runs/attempts/<runId>/`; the run's start, finish and spend in `lab-slots/spend-ledger.jsonl`; provider failures, so an empty balance stops later live runs |

**Two ways past $5.** Each is small, and the first is already measured by the purse.

1. A reply is not capped, so its length is unknown until it arrives. The ceiling can be crossed by the part of one reply beyond what was held for it, and then nothing more fits. It is recorded as `budgetOvershootUsd`.
2. **A request is cut at 45 s whole** (`S/runtime/models/providers/anthropic/messages.ts:43`), up to 3 tries. A reply cut off before its usage arrives never reaches the purse, whatever the provider bills. I have not measured this on Sonnet. A long string of these timeouts is one of the stop signs below.

**Stop it if you see:**

- A balance or quota error. The guards stop later runs too.
- `site.json` showing any change. This task asks for none.
- Spend past about $3 with no rows read, or calls climbing with live steps flat.
- The chat saying "Waiting for the model service" or provider timeouts, repeatedly. See the 45 s point.
- A loop line repeating, or `waiting_for_person`, since nobody is coming in this lane, and the driver stops on it.
- The same refused call three or more times: the repeat guard refuses a second identical press where a site swallowed the first. I left that as the standing rule and want to see how a real model takes it.

The Lab's own watch stops the run after ten minutes with nothing moving, closes Core and judges nothing. The longest model call plus its retries is under about 2.5 minutes, so a working call cannot trip it. A provider outage over ten minutes does, with nothing spent.

**The dry run,** on a stand-in key, read no key from any file and made no call:

```text
{"status":"ready","providerCallCount":0,"lane":"attempt","entry":"chat","task":"company-website-apprentices","authoringMode":"answer-first",
 "live":{"provider":"anthropic","model":"claude-sonnet-5-5","coreDefaultModel":"claude-sonnet-5-5", ... "maxTotalEstimatedCostUsd":5, "permittedConsequences":[]}}
exit 0; spend ledger 461061 bytes before and after
```

Its `maxCalls: 26` is the plan's print and does not reach Core: `lab attempt` passes a call limit only when `--llm-max-calls` is typed (`run-attempt-command.ts:141`), because a call cap sits on the purse and reaching it reads as budget out. Do not type a low one.

**Before launch.** The live guards refuse a tree behind dev, so land and sync first. `FLUXIQ_LAB_INSTANCE=t869-live` has no earlier run in the ledger, so the debug rule has nothing to ask for. The instance builds its own bundles, and that build ran in the dry run.

**After it.** A paid form has never run past its dry run. It does not settle through `LiveLlmRun`'s per-call snapshot: it writes the attempt's own spend and ceiling, and the ledger reader is held to that by a test.

## The second paid run: the per-row task

```text
FLUXIQ_LAB_INSTANCE=t869-live FLUXIQ_TEST_ENV_FILES=none pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --live-llm --llm-model claude-sonnet-5-5 --llm-max-cost-usd 5
```

This is the toggle task, so a double press shows on the site. Stop it on any `unsaved` in the run's activity. It holds a real test of the swallowed Apply: the radius picker swallows its first press and the repeat guard refuses an identical second, so a model must vary the call. Report `actsWithNoRow` from it. It has the same $5 limit and the same two ways past it, and it will cost more than the read task.

## Known limits

- **A press that leaves no mark on any read, and whose row has no kept words,** holds no row, so its row may be pressed again. This is the one place where "never hold a row done that was not pressed" and "never press twice" truly conflict. Accepted for now on your decision, because the other way stops "accept each". It is unmeasured until paid runs report `actsWithNoRow`. **If it is common, it needs revisiting: the person's rule is never to repeat a lasting act.**
- **The rule can leave a row out:** a pressed row gone and new rows arrived sharing half their words, or a row wrongly held done. It is told on the card as "Left out N that looked already done", which is a count and does not name the rows. A person's check and a judge's no are what bring it back.
- **The rule can still press twice,** beyond the case above: a row's address changing while its other fields are all common words, and a trimmed field with no read to compare against. Each has a test stating today's answer, or the report names it (`same-row-merge.md`, `re-aim.md`).
- **The driver has no Lab person.** A permission ask stops the proof as `waiting_for_person`. No task here asked.

## For attempt 2

Attempt 2 stays off paid runs until t870's double-act proof passes. Before it:

1. **The two-attempt, no-reseed command** you agreed comes after the first paid run. `run-attempt-command.ts:164` passes `attempts: 1`, and the series reseeds between attempts, so a repeat across attempts is not caught yet. The result line must also say what an act-doing task means when the site already holds attempt 1's acts.
2. **A saved Flow stops at a row it cannot do,** rather than going on, as a forward run does. That is an answer the attempt carries on from, not a task ending, but the remaining rows wait for the next attempt. The seam is the For Each's failed route. A part does the same, and t866's own test pins it.
3. `get-task-attempt` carries no digest of the saved draft, so `proveContinuation` refuses a second attempt until Core says what an attempt started from.
4. `run-gate.ts` compares a refreshed row to the link step's row by JSON. A re-read row whose fields changed would miss that comparison. The browser case reaches the stop through the pass in hand, so this path is unproven.

## Per-worker summary

**Eleven workers, against the "about 5" you first allowed.** You approved the additions as they came (six, then eight, then the re-aim worker). My count ran one behind: `re-aim` was the tenth and `count-and-part` the eleventh.

| Worker | Tier | Brief | Outcome, and what I verified |
| --- | --- | --- | --- |
| `loop-and-counts` | `worker` | `same_act`, asked counts | Done. Re-ran tests |
| `purse-and-eviction` | `worker` | Purse marker, eviction | Done. Re-ran tests, including the two it could not confirm |
| `road-and-read` | `worker-heavy` | Road, attempt read, adapter | Done. Re-ran Core and extension tests |
| `attempt-driver` | `worker-heavy` | Scripted model, driver, Lab entry, ceiling | Done. Re-ran the read proof, read the picture |
| `small-fixes` | `worker` | Settings mark, panel, toast, stale words | Done. I replaced its budget-out tick |
| `row-identity` | `worker-heavy` | Per-row proof, reshape | Done. Found the first double press. Re-ran the reshape proof |
| `same-row-merge` | `worker-heavy` | One rule from two lanes, elimination | Done. Re-ran both lanes' tests. I made "cannot tell" refuse |
| `wiring` | `worker` | t870's functions, provenance, truth words | Done. Re-ran tests |
| `toggle-proof` | `worker` | The toggle task | Done on the address design. Found the second double press |
| `re-aim` | `worker-heavy` | Re-aim, stale view, t870's clause, `matches` | Done. Re-ran the row-link proof, read `site.json` |
| `count-and-part` | `worker` | `actsWithNoRow`, a part's stop | Done on its second pass. Re-ran the part spec |

## Integration changes I made

- Moved `pacer.ts`'s attempt line away from t871's edit, and made only "Finished" carry a tick (`attempt/finished.ts`).
- "Cannot tell" refuses rather than presses (`same-row.ts`), with its tests and the doc paragraph.
- Carry-on under the chat's mapped session, with a test.
- The wording pass above.
- `live-launch-default-mode.test.ts`, so the flip of the product default fails loudly until the guard's restated word moves with it.

## Commands run and observed results

Mine, on the final tree:

```text
pnpm lab attempt ... (the seven forms above)                           7 of 7 exit 0, answer right
pnpm.cmd run test:content left-behind-job-board.spec.ts --headed --workers=1      1 passed (1.5m)
  (a first attempt under my own 170 s timeout was killed, exit 143: my limit, not a result)
the paid form above with --dry-run, stand-in key                       exit 0, ready, providerCallCount 0, ledger unchanged
service/answer-first, runtime/answer-first, project-parts/run/tests, task-attempt-wiring
                                                                       93 files, 1003 passed
pnpm.cmd --filter fluxiq --filter @fluxiq/contracts --filter @fluxiq/ui-components check     passed
pnpm.cmd --filter @fluxiq-web-extension/test-runner --filter .../extension --filter .../test-contracts check   passed
node scripts/structure-audit.mjs   Core passed (524 warnings, 1097 baselined); extension passed (243 warnings, 552 baselined)
wc -l service.ts                   4304
```

Mine, before the last worker's edits and not repeated since:

```text
ui-components chat/answer, testing/results, answer-in-chat             6 files, 74 passed
```

The worker's, read and not re-run:

```text
part-run-job-board, pinned-calls-job-board, left-behind-job-board specs          5 passed (11.8m)
contracts task-attempts   91 passed; ui-components ports   3 passed
```

**Whole-package suites were not run,** per the twice-a-day rule, apart from the two `answer-first` folders you asked for.

## Not verified

- **Any real model, key or provider.** How a real model reads this road, writes a repeat, or takes the judge is what the paid run is for.
- **The paid form past its dry run.**
- **A saved Flow's repeat in a browser.** Engine and stub-page tests only. No stored Flow has run from its start in a browser on this road.
- **In a browser, by tests only:** a row that cannot be found, the wall on another row's page, a read with no link column, Keep going on an interrupted attempt, and a carried-on attempt that really continues.
- **A cut-off reply's cost** against the 45 s limit, on Sonnet.
- **Firefox.** The popup shares the port; only a test pins the closed-popup case.
- **The web panel's settings mark and Explore line** in a browser: pure functions and tests only.
- **`renderAttemptSeries`** does not print `actsWithNoRow`. `attempt.json`, the result line and the row carry it.

## Open questions

1. **Run again on an attempt's card:** t870 said it stays with its lane. I have not re-checked what it does now.
2. **The card's Save lines do not name the row** ("Save." three times), and a hand press's wording is generic. The seam is `SVC/answer-first/attempt/call-chain.ts`, `wordsOf`, which you passed to t870.
3. **An undeclared press** stays out of a result's acts by design, so the card can read "I recorded no changes" beside a site that changed. The sentence is now true of the record, but a person may still read it as the site. The paid runs will show how often.

## The repair round, after the first two paid runs

The read task passed at $0.42. The toggle task ended `budget_out` at $4.84 with its acts right: exactly three saves, no double press. Every repair below was traced to its cause first and is proven provider-free. Reports: `attempt-road/repair-{rows,refusal,saved,forward,words-and-context,cache,seams}.md`.

| What the run showed | The cause | Now |
| --- | --- | --- |
| A later correct read did not become the result | Every read was stored as an addition. `rows/row-sink.ts:106` ignored `replace`, and `dataset-of-read.ts:21` split one list into two datasets | The latest read of a list decides rows and order. Pages merge. The judge and the person read the same |
| `complete` refused three times, about $0.14 each, `loopsCaught` 0 | `complete` never reached the loop watch, and its words were false about what the check reads | Steered, then a fresh round, then the person with money left. The model sees what the result holds |
| `saved: null` after real work | `saved` was read from `candidateId` alone. Its steps were kept but not read | True on every ending. A refused draft's reason is now logged |
| Forward run stopped at the first row | No pass ever ran. `{from: 23}` left the list out of range, and a Flow's dispatch refused `dedupe` on an `intermediate` read so it held no rows | The whole repeat and its list run. A failing step ends that row's pass only |
| Two malformed replies | **Not known: the raw text was never logged.** Truncation and a stream fault are ruled out | Common damage is repaired and billed once. The raw text is now logged, screened, so the next run answers it |
| Card words | The counts line went in `checkedWhat` for every verdict, and act words held no item | A no shows the judge's words. "Save: <item>". The card says when a later read got smaller |
| A balance error at the judge | Read as "not judged", so the attempt kept deciding | Ends the attempt, once |
| The prompt cache | Markers on blocks that change every call, plus an automatic one after them | See below |

**The cache.** Markers now sit on the end of the head, on the last entry before the first that moves, and one 19 entries back, so up to 38 entries can be added. The automatic marker is gone except on the panel's chat. The text sent is byte-identical on 51 of 51 logged requests. Replaying the toggle run's requests in the new shape: 50 of 50 pairs hit, 83% from cache, **an estimated $1.73 against $4.85 logged.** That assumes the model decides the same way. The old-marker replay read about 6% low against billing. **The real number comes only from the next paid run.**

**I checked this on requests the new code really sent,** in the scripted runs: `run-mw3gp5f5-5800a4fd` 23 of 23 pairs, `run-mw3gjgbr-f44f0616` 21 of 21 and `run-mw3g3a3g-f868c06b` 9 of 9 each match up to the previous marker, with at most 4 markers, no top-level marker, and markers only on the head and on stable history (`core.route_state`, `core.run_node`, a structure read). The scripted model reports no cache use, so these runs print "0% of input from cache", which is true of them and says nothing about Claude.

**`core.flow_draft` is not sent only on change.** It changed on 39 to 40 of 51 calls, not about 11: I diffed the logged entries, and it grew on 34 of 39 changes because each step taken by hand adds to it. Keeping an appended copy per change costs $0.36 more. Its constant guidance moved to the head instead, which takes the replay from $1.79 to $1.65. About $0.33 of what is left is the draft's steps; going lower means sending changes rather than the whole draft, which changes what the model reads. That needs a decision and is not recommended without one.

**Pricing was right.** The official page says Sonnet 5.5 cache reads are $0.10 per million, and the claude-api skill's $0.20 is stale. No number changed. Haiku's tier holds, and its 100,000 line reads the whole prompt, cached parts included.

### Behaviour changes to know

- A stuck attempt with nobody to ask now waits (`waiting_for_person`), spending nothing, instead of running to `budget_out`.
- A draft-loop model that ignores the budget entry in its last 3 decisions spends a decision on a tool that does not run. Tools stay listed so the head stays stable.
- An amendment asked for before there is a step to amend is refused rather than unlisted.
- A hand read with `dedupe` on an `intermediate` output is refused where it is written, which costs the model one call.
- A by-hand read's declared `process` now shapes its result, as a saved run's does.
- Existing tests that expected the old endings or forward rule were changed to the new rule (`saved-shapes`, forward-run stops, stuck endings).

### The final proofs of this round

All eight on the final code, each `NOT LIVE, stand-ins: model, spend`, all exit 0 and answer right:

| Task | Form | Result | Evidence |
| --- | --- | --- | --- |
| `company-website-apprentices` | | 4 rows, 11 calls, 27 s | `run-mw3g3a3g-f868c06b` |
| `professional-network-accept-messaged-invitations` | plain | 3 rows, 13 calls, 33 s | `run-mw3gaaom-208b1459` |
| | reshape | 3 rows, 15 calls, 39 s | `run-mw3gc8n4-f8f153a3` |
| | thin | 3 rows, 13 calls, 33 s | `run-mw3gel8i-132e4716` |
| `local-classifieds-save-dining-tables` | plain | 5 rows, 22 calls, 60 s | `run-mw3ggjlv-b6ed8ed5` |
| | reshape | 5 rows, 23 calls, 62 s | `run-mw3gjgbr-f44f0616` |
| | row-link | 5 rows, 22 calls, 65 s | `run-mw3gm9sz-fb899698` |
| | open-save-back, this model's own shape | 5 rows, 25 calls, 71 s | `run-mw3gp5f5-5800a4fd` |

In the open-save-back and row-link runs I read, the activity is `saved pine, saved glass, saved industrial` with no `unsaved`.

Also on the final code:

```text
vitest: answer-first (both), runtime/llm, runtime/models, flow-less, candidate, supervisor, project-build, deepseek-bootstrap    458 files, 4458 passed
contracts src/task-attempts    92 passed
ui-components chat/answer, chat/ports, chat/stream/step, testing/results    22 files, 188 passed
test-contracts attempt-score   6 passed; test-runner shown-answer, attempt-series, answer-first-ceiling    25 passed
pnpm.cmd run test:content part-run-job-board.spec.ts pinned-calls-job-board.spec.ts left-behind-job-board.spec.ts --headed --workers=1    5 passed (13.7m)
pnpm.cmd run test:e2e photo-act-ledger.spec.ts --headed --workers=1    1 passed (2.2m), the site-reset scripted provider that reads the tool list
checks and structure audits in both repositories    passed
Sonnet and Haiku paid forms with --dry-run, stand-in key    ready, providerCallCount 0, ledger unchanged
```

### The next paid runs

**Sonnet, the toggle task again:**

```text
FLUXIQ_LAB_INSTANCE=t869-live FLUXIQ_TEST_ENV_FILES=none pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --live-llm --llm-model claude-sonnet-5-5 --llm-max-cost-usd 5
```

**Haiku, the same task:**

```text
FLUXIQ_LAB_INSTANCE=t869-live FLUXIQ_TEST_ENV_FILES=none pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --live-llm --llm-model claude-haiku-5-5 --llm-max-cost-usd 1 --llm-cost-ceiling-usd 1
```

**`--llm-cost-ceiling-usd 1` is required for Haiku.** The worktree's `.env.local` holds a $5 ceiling, and a real launch refuses `--llm-max-cost-usd 1` without it. A dry run with both env-file switches off passes without it and would have hidden this; I tested it the way a real launch reads the file. With it: ready, `claude-haiku-5-5` as model and as Core's default, $1. Nothing outside the catalog names another model, so it cannot fall through. Haiku is $0.10 and $0.50 per million up to 100K prompt tokens, $0.50 and $2.50 beyond, on the whole prompt, so a late call past that line costs five times as much. A purse of $1 may simply run out; that is a result, not a defect.

**What I expect from Sonnet, with low confidence on the dollars:**

- A cache share around 80%, and a cost of about $1.70 to $2.50 if the model behaves as it did. Below 50% from cache means the fix did not hold on the real provider: stop and read `cacheWriteInputTokens` in `steps/*/meta.json`.
- Three saves, one each, no `unsaved`.
- Sorted rows on the card. If not, the raw reads in `steps/` show whether the model asked for them.
- Either the loop forward over rows 2 and 3 or, if the model does them by hand, `actsWithNoRow` read and reported.
- `saved` filled. A draft refusal's reason, if any, is in a step-log note.
- Reaching `achieved` is likely but not proven: the judge's noes last time were correct and specific, and the rows they were about are what changed.

**Stop it on:** a balance error; any `unsaved`; spend past about $3.50 with the three saves already landed; a loop line repeating; or a wait for a person, since nobody is coming. A malformed reply no longer needs a stop: its raw text is now logged.

### Still open

- **The next attempt.** A saved Flow stops at a row it cannot do, and the two-attempt, no-reseed command is the next worker, as agreed.
- **A row wrongly left out** reaches the card only as a count.
- **`readingWords`** still drops the judge's located defects, and its summary when `changed` is given.
- **A rung that ends a round answers `{ ok: true }` from the check** to keep the round's rows. Nothing is accepted by it, since only `state.achieved` counts, but a direct call would read better.
- **The fresh round's real cost** is not measured.
- **Cost past the 45 s cut** is still not measured.

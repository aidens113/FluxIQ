# A real attempt from the real chat: `lab attempt` (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. `attempt-lane/` = Extension `packages/test-runner/src/attempt-lane`, `S/` = `packages/fluxiq/src`.

## Outcome

**Done.** `pnpm lab attempt` exists. The proof ran in a visible browser, on `company-website-apprentices`, from the real extension chat through the real service, with a scripted model and no provider. The four apprentices appeared in the chat and matched the oracle row for row. The whole road worked with **no Core change**, so nothing here touches Core but this report.

```text
pnpm lab attempt company-website --task company-website-apprentices --authoring-mode answer-first --scripted-model
exit 0
[attempt] company-website-apprentices attempt 1: answer right. Ended achieved, 4 rows stored, 4 shown, 10 live steps, 11 calls, $0.3983, 32 s. NOT LIVE, stand-ins: model, spend.
evidence: C:\Users\osrs_\FluxStuff\fxwork\t869\!FluxIQWebExtension\test-runs\attempts\run-mw29udwb-93dff3b8
picture:  ...\run-mw29udwb-93dff3b8\answer-turn.jpg
```

I read the picture. The side panel shows the rows (Rhian Taverner, James Whitlock, Ollie Pratchett, Megan Ashdown), CSV and JSON, "On the site: nothing changed", "Took 32s · $0.40", "Saved, and it partly works", and FluxIQ's closing line. The third column is off to the right of the 360 px table, behind its scrollbar; `answer-turn.json` holds all three, read from the DOM.

The score's parts in `attempt.json`: records held, final state held, change held, shown held, stored 4, shown 4, flow unproven. **The $5 reached Core:** the attempt's own `budget.usd` is 5, and it would be 0.1 had the flags not reached the child.

**It proves the road, not a model.** A script made every choice. The $0.3983 is arithmetic on made-up usage. The row says `live: false` and names `model` and `spend`.

## How the seam works

Your design worked as written, with one change: the wrapper tells a model call by its shape, not its host.

1. `scripted-model/model-server.ts`, in the Lab's process, speaks Anthropic Messages with `stream: true`. It answers in the JSON the request's `output_config` schema asks for, wrapping in `result_json` when the schema is the JSON-text one. Usage is bytes over four, so Core's real pricing runs on it.
2. `scripted-model/fetch-preload.ts` goes into the Core child through `NODE_OPTIONS=--import`, passed in `TopologyOptions.environment`. **The host's process inherited it**, so no Lab-owned host wrapper was needed. `next start` keeps it, and `withSourceMappedStacks` appends to it rather than replacing it.
3. `route-model-call.ts`: loopback passes, a POST to `/v1/messages` over https with `anthropic-version` goes to the server, and everything else leaving the machine throws. A rebuilt `Response` has an empty `url`, which is what Core's redirect check lets past.
4. The fake key goes in through `ensureLiveLlmSecretKey`, then `reauthenticate`, as a live run's does. The server returns 401 for any other key, so a call that arrived was signed with what Secret Keys released.

**Why not the exact URL, as you asked.** The structure audit refuses the provider's host written anywhere in this repository outside its allow list, `scripts/structure-audit/config.mjs` is not in my paths, and Core does not export the constant. Nothing is lost for safety: whichever host such a call names, it can only reach the loopback server, and any other provider's host throws. **To overrule:** add `route-model-call.ts` to the allow list and compare against the literal; it is one line.

**A refusal is loud.** A request the script has no reply for, or whose reply throws, gets a 400 with its kind and count, and the watch stops at once with `AttemptScriptRefused`. Nothing is answered with junk. The result says "not judged" and exits 1.

**The driver** (`attempt-lane/live/live-driver.ts`, implementing `AttemptDriver`):

- It sends through `sendChatMessage`, so the `append-turn` is the extension's own.
- It follows the thread with `list-conversation-task-attempts`, then reads the ending with `get-task-attempt`.
- It stops on `achieved`, `budget_out`, `stopped_by_person` or `waiting_for_person`. A wait with no person coming fails the proof.
- There is no build deadline. Only ten minutes with nothing moving stops the watch, and that says where it stood and judges nothing. What counts as moving is the attempt's record or Core's step count.
- `panel-answer-port.ts` reads `li.answer-turn[data-attempt-id]` from the panel's DOM, opening "Show all" as a person would. **The route supplies only the label-to-id map for the columns**, because the oracle keys by id and the DOM prints labels. It decides what a cell is called, never what it says.
- Stored rows come from `result.rows.{runId,datasetId}` through `readRunDatasets`. Site state comes from `readSiteBaseline` and `lastingViewOf`.

**The ceiling** (`live-llm/cost-ceiling-env.ts`): with nothing configured, an answer-first run's `--llm-max-cost-usd` is the fallback, ahead of Claude's $5 and Core's $0.10. Tests in `answer-first-ceiling.test.ts` cover each rule you listed. **One addition you did not ask for:** with both `FLUXIQ_TEST_ENV_FILES=none` and `FLUXIQ_PROVIDER_KEY_FILES=none`, no env file is opened for the ceiling. This worktree holds a `.env.local`, and the old code would have opened it on a provider-free run, against your rule. A real isolated run sets only the first switch, so it still reads its file's ceiling; a test holds that. A dry run with both switches ignores a file ceiling a real launch would obey, so it can pass where the launch refuses.

**Stand-ins:** `model` is added. `AttemptReportRow` gains a required `live`, and validation refuses `live: true` with any stand-in. A score naming `model` must name `spend`. The report table gains a "counted as" column. The bench's rates already excluded any stand-in.

## How to write a script for a new task

Add `scripted-model/scripts/<task>.ts` and list it in that folder's `index.ts`.

- `panel_command`: `{ do: "flow.createHere", with: { instruction: request.message } }`.
- `evidence_tool_decision`: one function repeated up to a cap works best. It looks at `currentPageOf(request)` and takes the first step not yet done, because the site's popups come on timers. `pressOf(request, summary, callId, /words/)` finds a handle by its page line and throws if it is not there. `toolCall(...)` is any other call. To finish: `{ kind: "evidence_tool_decision", summary, decision: { kind: "complete", result: { summary } } }`.
- `loop_verification`: `{ kind: "diagnosis", diagnosis: { answersRequest: "yes", defects: [] }, summary }`.

For a lasting act: the scripts decide `add`, `consequences` and row ties as a model would, and a `{ kind: "complete" }` is judged by the real gate. **A permission ask needs a person, and this lane has none yet:** `live-driver.ts` stops on `waiting_for_person` and fails. The per-row worker will need to press Allow through `panel.press`, as `run-scenario/chat-build/chat-entry.ts` does, if its task asks.

Every request's decoded body is in the run's `model/` folder and Core's in `steps/`, which is the way to read the page words a step needs. Read one before writing regexes.

## Browser runs, honestly

| Run | Outcome | How far it got |
| --- | --- | --- |
| 1, 2 | Refused before any browser | My `coreWebBuildCacheRoot` pointed Next's build at a path over 80 characters. My defect; removed |
| 3 | Refused before any browser | `FLUXIQ_CORE_WEB_BUILD_CACHE=F:/fxcache` is on another drive from the checkout. Core's default works here |
| 4 | Not judged, exit 1 | Chat, attempt, 8 decisions and every step landed. My script's field lookup missed the first card's role ("Managing Director"). The loud failure worked as designed |
| 5 | Right, exit 0 | The whole road, on the code before the audit's restructure |
| Proof | Right, exit 0 | The exact command, on the final code, no instance set |

## Defects found

No defect stopped the road. These are outside my paths, or for you to decide:

1. **The page says "Flow ready" on an attempt.** It is in both pictures, bottom left: "Flow ready / Finished", beside a card saying "Saved, and it partly works". `S/ui/activity-status/headline.ts:92`, `DONE.build`: an attempt's activity has subject kind `build`, and `runtime/automation-activity/build.ts:79` changed only the detail line to "Finished". It is untrue, since no Flow is proven. Fix: a headline for an attempt's ending that reads its authoring mode, as `build.ts:22` already does for its start.
2. **A thread holds no attempt until the first round ends.** The log read "no attempt yet" for the whole 32 s, and `list-conversation-task-attempts` returned nothing, because `keep.ts` writes between rounds and at waits (`SVC/answer-first/attempt/rounds.ts:60`, `ending.ts`). So no working card can show during a first round, and a Core that dies in it leaves no row. Seam for the attempt lane: one `automationStudioAnswerFirstKeep` after `opened` and before the first round. It is in `attempt/**`, so I did not touch it. My watch counts Core's step log for this reason, or a long paid first round would have looked stuck.
3. **The paid form's default call cap would have read as budget out.** The Lab's default `maxCalls` is 26, and a call cap sits on the purse. I fixed it on my side: `lab attempt` gives Core a call limit only when `--llm-max-calls` was typed. `lab run` still passes it always (`run-scenario.ts:251`), which matters if anyone runs answer-first that way.
4. **`scripts/lab/live-guards/live-launch.mjs:17` still says the default mode is `legacy`.** The runner's default became `project` in t861, so a launch naming no mode is ledgered under the wrong word, and the `unchanged` rule compares it to the wrong runs. `live-campaign/arguments.mjs:18` passes `legacy` explicitly, a separate choice. `admit-live-run.test.mjs:147` pins the old word. `lab attempt` always names its mode, so I left this; `environment.ts:121` has the same stale comment and is outside my paths.

**Seams for the next worker:**

- `get-task-attempt` gives no digest of the saved draft, so `saved.draftDigest` is `null`, and `startedFrom` is always `null`. `proveContinuation` will therefore refuse a second attempt until Core's read says what an attempt started from. The series runner takes this driver unchanged.
- Run again on an attempt's card is road-and-read's open item 1, unchanged.

## What the paid form would do

`pnpm lab attempt <scenario> --task <id> --authoring-mode answer-first --live-llm --llm-max-cost-usd <n>`. **Not run.** Parsed, guarded and dry-run only.

1. `run-lab.mjs` admits it through the live-run guards, ledgered as `<scenario>/<task>` in `answer-first`.
2. `beginLiveLlmRun` plans it, reads the key from the environment or the checkout's files as any live run does, and `assertChatBuildable` passes. With nothing configured the ceiling is `<n>`.
3. It opens `lab-runs/<date>/<runId>/steps/`, starts Core on the same road as the proof, and installs the real key through `chatBuildAuthorizer`.
4. It types the instruction, follows the attempt to its ending and scores it the same way, with `standIns: []` and `live: true`.
5. It writes `run.json`, `snapshots/live-llm.json` and `provider-failures.local.json` for the ledger, the last from the step log, so an empty balance stops later live runs. `paid-attempt-bundle.test.ts` holds this against the ledger's own reader.

**It does not settle through `LiveLlmRun`'s spend snapshot.** The bundle holds the attempt's own spend and ceiling, and `assertLiveLlmBudgetHeld` is not run. The purse is Core's, so nothing goes unbounded, but the richer per-call snapshot a `lab run` writes is absent. No per-build rows reach `lab-runs/index.md` beyond what `LabRunRecord` reads from the steps.

**Stuck watch and money.** On ten minutes of nothing moving the run stops, and closing the session stops Core, so nothing keeps spending unattended. A single model call longer than ten minutes would be cut off this way. I did not find one that long in what I read, and did not measure it.

## What changed and why

Extension only:

- `packages/test-runner/src/attempt-lane/scripted-model/**`: server, wire reader, stream, router, preload, child environment, key, scripts, tests.
- `packages/test-runner/src/attempt-lane/live/**`: driver, follow, DOM read, shown answer, session, stage, command, paid bundle, tests.
- `packages/test-runner/src/attempt-lane/report.ts`, `index.ts`, `tests/`.
- `packages/test-runner/src/commands.ts`, `cli.ts`: the `attempt` command, narrow hunks. `commands.ts` is 401 lines, one past the advisory threshold.
- `packages/test-runner/src/live-llm/`: `cost-ceiling-env.ts`, the comments in `authoring-mode-env.ts`, `build-cost-ceiling.ts` and `live-llm-plan.ts`, and `tests/answer-first-ceiling.test.ts`.
- `packages/test-runner/src/tests/cli-llm.test.ts`: the dry-run tests, placed there because that file is on the audit's allow list for naming a key.
- `packages/test-contracts/src/attempt-score/**`: `model`, `live`, `attemptCountsAsLive`.
- `scripts/lab/`: `run-lab.mjs`, `provider-free-run.mjs`, the scenario guard, `live-guards/live-launch.mjs`, tests.
- `docs/architecture/testing-facility.md`: "A real attempt from the chat".

The old `scripted/` driver and proof are kept beside it, still named. `flow-lane/` and `extension-chat-check/` were not edited.

## Commands run and observed results

```text
(packages/test-runner) node --test dist/attempt-lane/tests/attempt-series.test.js dist/attempt-lane/tests/lab-attempt-command.test.js
  dist/attempt-lane/live/tests/follow-attempt.test.js dist/attempt-lane/live/tests/shown-answer.test.js dist/attempt-lane/live/tests/paid-attempt-bundle.test.js
  dist/attempt-lane/scripted-model/tests/model-server.test.js dist/attempt-lane/scripted-model/scripts/tests/company-website-apprentices.test.js
  dist/live-llm/tests/answer-first-ceiling.test.js dist/live-llm/tests/cost-ceiling-env.test.js dist/live-llm/tests/cost-ceiling-reach.test.js
  dist/live-llm/tests/max-cost-within-ceiling.test.js dist/live-llm/tests/authoring-mode-env.test.js dist/live-llm/tests/live-llm-run.test.js
  dist/live-llm/tests/live-llm-plan.test.js dist/tests/cli-llm.test.js
# tests 141  # pass 141  # fail 0

pnpm.cmd --filter @fluxiq-web-extension/test-runner check      exit 0 (no "error TS")
pnpm.cmd --filter @fluxiq-web-extension/test-contracts check   reuse: inputs and outputs match the stamp
(packages/test-contracts) node --test src/tests/attempt-score.test.mjs    # tests 6  # pass 6  # fail 0
node --test scripts/lab/scenario-guard/tests/lab-scenario-refusal.test.mjs scripts/lab/live-guards/tests/live-launch.test.mjs scripts/lab/tests/provider-free-run.test.mjs
  # tests 15  # pass 15  # fail 0
(Extension) node scripts/structure-audit.mjs    structure-audit: passed (237 warning(s), 553 baselined).
(Core) node scripts/structure-audit.mjs         structure-audit: passed (494 warning(s), 1097 baselined).
node scripts/check/core-mirror.mjs              1 mirror set(s) match

FLUXIQ_PROVIDER_KEY_FILES=none FLUXIQ_TEST_ENV_FILES=none CLAUDE_API_KEY=<stand-in> pnpm.cmd lab attempt company-website --task company-website-apprentices --authoring-mode answer-first --live-llm --llm-max-cost-usd 5 --dry-run
  exit 0
  {"status":"ready","providerCallCount":0,"lane":"attempt","entry":"chat","model":"live","authoringMode":"answer-first", "live":{... "coreAuthoringMode":"answer-first", "authorized":{"maxEstimatedCostUsd":5,"maxTotalEstimatedCostUsd":5} ...}}

Spend ledger before and after the proof: 461061 bytes, Nov 3 03:13, both times.
Get-CimInstance Win32_Process filtered on t869: no process left over.
```

The audit's first pass failed on six things of mine (`as never`, two classes in a file, failure-as-empty twice, a test file past 800 lines, a shared filename prefix). All are fixed, not baselined. The test lines above were run on the code after those fixes, and so was the proof.

## Not verified

- **Any real model or provider.** How a real model reads this road is what the first paid run is for.
- **The paid form past its dry run.** Steps 3 to 5 above have never run.
- **A wrong answer in a browser.** The DOM-to-oracle path is tested with a wrong cell, a short count and no turn (`shown-answer.test.ts`), and only the right case has run live. The per-row worker's run is the first that could fail live.
- **`waiting_for_person`, `budget_out` and a stuck proof in a browser.** Tested with a scripted control only.
- **The wrapper refusing a real call from inside the Core child.** Tested as a function. The child's log is removed with its run state, so I have not seen one refused there, and I do not know whether Core tried any other outgoing call.
- **That `.env.local` stayed closed.** By reading the code paths and a test with a temporary file, not by watching file access. I did not open it.
- **Firefox**, and a second attempt.
- **The whole-package suites**, per the narrow-check rule.

## Open questions and contradictions

1. Your brief says only the exact URL goes to the loopback. The audit forbids naming it. I chose the shape, above.
2. `road-and-read.md` says the `$0.00` on a run-derived card needs a line in t871. This attempt's card read a real-looking `$0.40`, as it should for an attempt, and the same figure is made up here only because the model is.
3. The stuck watch's ten minutes is my number, and it stops a run that may still have been working. You said a stuck proof reports where it stood, and did not say after how long.

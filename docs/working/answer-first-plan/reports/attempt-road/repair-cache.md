# Repair: the prompt cache

Task t869. Provider-free: no paid call, no real key, `.env.local` not opened, no browser, no `dist` rebuilt.

## Outcome

Done, with one finding against the brief. Replayed through the new code, the logged toggle run hits the cache on 50 of 50 consecutive pairs, 83% of input from cache, an estimated **$1.73 against the $4.85 logged**. That is an estimate: the old markers replayed the same way came to $4.49 against the $4.76 billed for those decisions, so it reads about 6% low. **The real number comes only from the next paid run.**

The finding: `core.flow_draft` changed on **40 of the 51 calls**, not about 11, measured on the exact text. Sending it only when it changes costs more, so I did not build that. What I built instead is under item 4.

## What changed and why

### 1. Marker placement

- `cache-content.ts`: the markers go on the end of the head and on the last entry before the first one that changes. The text is untouched.
- `llm/evidence-moves/evidence-that-moves.ts` is the one place naming the entries that change. It has no imports, so the window and the adapter can both read it. A test reads the loop's source and fails if a new kind of note is taken out of the window without being named there.
- `request-body.ts`: the top-level automatic marker is gone. Only the panel's chat keeps it (`markLastBlock`), because its last block is what the next turn sends again. One-call requests such as the judge now pay no write on their user message.
- Lookback: the official page says a marker checks at most 20 positions, itself first. So there is a second marker 19 entries before the last, which covers up to 38 entries appended between two requests. Beyond 38 it reads only the head, once. The most any logged run appended was 2.
- At most 4 markers: system, head, that second one, the last.

### 2. Keeping the head stable

**`describedNodes` at step 39.** The cause: the look Core takes after an act (`core.attempt_look.N`) runs the library through the describing wrapper, its result reaches no window entry, and so the wire put the node in the head.
- `describing-failures.ts`: a call in Core's own `core.` namespace now describes nothing. The model never asked about that node.
- `provider-task/described-nodes.ts`: no definition is in the head any more. One an earlier round described goes on `core.described_nodes`, the window's first entry. Any other unnamed one rides after the window on `core.newly_described_nodes`, so a future caller of the same kind costs a little rather than a full re-send.
- The DeepSeek path shares this code through `automationStudioLlmTaskMessages`. `request-shape.ts` still measures what it sends, and its tests pass.

**The schema at step 118.** The cause: a draft loop's wrap-up offered no tools, which removed the `tool_call` branch from the schema and the tools from the head. I stopped it, as t503 did for candidates:
- every loop keeps its list, and withholds calls at dispatch;
- the budget entry says no tool runs;
- amending also stays in the schema when it is not on offer, and is refused if asked. That fixes `run-mvwx2cob`'s head change at step 17.

The schema is not enforced on the model in this mode (`jsonText`), so it only ever worked as words the model reads.

### 3. One-shot check entries

Put after the marker, not made append-only. Staying would keep stale notes in front of the model, which is what `supersede.ts` exists to stop. `context-window.ts` now orders the window: results, then Core's passing notes in the order they arose, then the current view, Flow, history, draft and budget. This covers the four named and eight more of the same kind.

The dry run's entries stay among the results, on purpose. They can be large, and only a new completion attempt removes them, so they cost one rewrite per attempt rather than an uncached read on every call. The test names them as the exception.

### 4. `core.flow_draft`

What I found, as a cache simulation over the logged requests, at the confirmed $0.10 read price:

| Run | Draft text changed | Draft stays in the tail | One copy per change, kept | One copy, moved on change | Parked once it stands still |
| --- | --- | --- | --- | --- | --- |
| `run-mw37vz9n` (toggle) | 40 of 51 | $1.79 | $2.15 | $1.75 | $1.75 |
| `run-mvwx2cob` | 18 of 24 | $1.11 | $2.14 | $1.13 | $1.11 |
| `run-mw0jw263` | 17 of 18 | $0.77 | $0.89 | $0.79 | $0.77 |

Keeping a copy per change also took the toggle run's input from 2.35M to 6.44M tokens, since every copy stays in every later request. Moving or parking one copy changes the bill by at most $0.04, for a new stateful placement and a marker slot. Neither pays.

What does pay: the draft's guidance is about 4K constant characters out of each entry. `provider-task/draft-guide.ts` sends it once in the head, which takes the toggle run from $1.79 to $1.65. The steps stay whole in the tail.

**What the model reads, before and after:**

| | Before | After |
| --- | --- | --- |
| Steps of the draft | All of them, on `core.flow_draft`, every decision | The same |
| Draft guidance | On `core.flow_draft.value.instruction`, every decision | Same words under `evidenceLoop.flowDraftGuide` in the head, with one lead sentence saying it is about that entry. The entry keeps only what is said conditionally |
| Page, current view | Unchanged | Unchanged, as the standing rule requires |
| A node's definition | On the describing call's entry, or the head | On that entry, or on the window's first entry if an earlier round described it. Never the head |
| A node Core's own look ran | Its definition appeared in the head | Not shown. The model never asked for it, and its own first run still describes it |
| Core's passing notes | Where they arose, among the results | After every result, before the current view. Each names what it answers |
| Wrap-up | Tools vanish from the list and schema | The list stays. The budget entry says "no tool runs now: every tool is still listed, but a call to one is answered without running and spends a decision" |
| Last decision | "only complete is offered" | "only complete can be taken, whatever else is listed" |
| A tool called in the wrap-up | "only the tools offered now can run" | "no tool runs now: this tool is still listed, but this call was not run" |

**Which modes get this.** Every evidence decision on both providers, because all of it is in the shared projection, the window or the loop:
- answer-first attempts, evidence-guided builds and repairs, and project builders and the supervisor: all of the above that applies to them;
- candidate and subflow loops: everything except the guide, because they keep no draft;
- the marker change itself: Anthropic only.

Their tests are in the commands below.

### 5. Visibility

- The step log's `usage` now has `cacheWriteInputTokens`. It comes through the transport observer, because the usage summary is held by strict field checks in seven places that have no need of it.
- `attemptCacheShare` sums each step's `meta.json`. The result line reads "7 calls, 83% of input from cache, $0.1234".
- `attempt-report.txt` has a "from cache" column.
- `attempt.json` has `row.cacheHitPercent` and `cache` with the read and written tokens. The contract has the optional field and validates 0 to 100.

### 6. Pricing

I reached the official page, https://platform.claude.com/docs/en/about-claude/pricing.md, on 2026-11-05. The prompt-caching page agrees.

- **Sonnet 5.5 cache hits are $0.10 per million.** The table says so, and a footnote says hits on Opus 5.5 and Sonnet 5.5 are 0.05x input. `pricing.ts` was right and **the skill's $0.20 is stale**. No number changed. The lead's $2.10 to $2.40 estimate was at $0.20 or thereabouts.
- **Haiku 5.5 is right too**, up to and including 100,000 tokens: $0.10 input, $0.125 write, $0.20 hour write, $0.01 hit, $0.50 output. Over that: $0.50, $0.625, $1, $0.05, $2.50.
- **The line reads the total prompt.** The page says it "counts all of its input tokens, including cache reads and cache writes", and `inputTokens` in `pricing.ts` is that total (`automationStudioAnthropicUsage` adds them up). Both sides of the line are now tested, cached parts included.

## Replay

The script is `C:/Users/osrs_/AppData/Local/Temp/claude/bc302d3e1bd85154/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/cache-worker/replay.mjs`. It runs the real `cache-content.ts` and prints no page text.

**How the old shape is accounted for.** The logged requests were reshaped to the new one before replaying:
- `describedNodes` deleted from the head, because the only one there came from Core's own look;
- the first decision's schema and tools held throughout;
- the guide lifted from the draft entry;
- notes moved after the results.

That assumes the model would have decided the same way, which an estimate cannot show. It models the 5-minute lifetime; the longest gap between decisions in the toggle run was 0.8 minutes.

| | Pairs that hit | Byte prefixes | From cache | Decisions | Whole run | Logged |
| --- | --- | --- | --- | --- | --- | --- |
| `run-mw37vz9n`, old markers (a check on the estimate) | 0 of 50 | 0 | 36% (the API reported 31%) | $4.49 | | $4.76 decisions |
| **`run-mw37vz9n`, new** | **50 of 50** | 50 | **83%** | **$1.65** | **$1.73** | **$4.85** |
| `run-mvwx2cob`, new | 23 of 23 | 23 | 80% | $0.69 | $0.70 | $1.71 |
| `run-mvx43ff7`, new | 19 of 23 | 19 | 78% | $0.60 | $0.61 | $1.37 |
| `run-mw0jgf2o`, new | 15 of 15 | 15 | 80% | $0.36 | $0.54 | $1.16 |
| `run-mw0jw263`, new | 15 of 17 | 15 | 73% | $0.63 | $0.79 | $1.56 |

At the skill's stale $0.20 the toggle run's decisions would come to $1.85.

**What breaks the misses.** Each is one rewrite, and none is on the toggle run:
- `run-mvx43ff7`, 0041 and 0072: a dry run's entries taken away by the next attempt (read 69K and 73K characters, wrote 8K and none);
- `run-mvx43ff7`, 0050 and 0091: a route situation placed behind entries already sent (read 58K and 47K, wrote 15K and 5K);
- `run-mw0jw263`, 0046: a new stage's `promptVersion`, which is a new window anyway. 0048 follows it with a head that differs again on a 3-block window; I did not trace that one further, and it wrote 58K characters once.

**Byte-identical text.** 51 of 51 logged requests, split by the new code on their old text, concatenate to exactly what was sent. Each is also its own JSON parse and re-stringify, so the replay's reshaping starts from the same bytes.

## What is left

The toggle run's remaining $1.73 is about:
- $0.64 output;
- $0.69 uncached tail, of which by size: the draft's steps about $0.33 (the draft was $0.49 with its guidance), current view $0.16, history $0.12, budget $0.01;
- $0.13 writes and $0.20 reads, plus $0.08 for judges and chat.

The tail is what changes on every call. Going lower means changing what the model reads (a draft sent as changes rather than whole), which I did not do and do not recommend without a decision.

The head still changes, once each and cheaply, on:
- completion first being offered on a loop with no opening call, and the first decision of a repair round, which may not complete;
- looks withdrawn after an ignored redirect;
- `core.run_nodes` first offered, or dropped in a wrap-up;
- a new stage;
- the draft guide first appearing, on a loop that opens with no draft to show. An old-mode build with no acts pays this once, early.

None of these occurred on the toggle run.

A route situation can still be placed behind sent entries (`build-routing.ts`, `firstPlacement`, its `sent` count). I left it: it is not owned here, and it costs under 15K characters when it happens.

## Commands run and observed results

Run from `packages/fluxiq` unless noted.

| Command | Result |
| --- | --- |
| `npx vitest run --minWorkers 1 --maxWorkers 2` on `src/runtime/models/providers/anthropic`, `llm/anthropic`, `llm/deepseek`, `llm/harness`, `llm/provider-task`, `llm/evidence-moves`, `llm/node-tools`, `llm/step-log`, `llm/decision-context`, `llm/evidence-loop`, `llm/decision-handlers`, `llm/evidence-progress`, `llm/prior-nodes`, the named `llm/tests` files (`context-window`, `evidence-loop`, `-draft-shown`, `-provider`, `-seeded-draft`, `-tool-failure`, `unusable-decision`, `draft-amendment-feedback`, `provider-cache-prefix`, `loop-budget`, `deepseek-evidence-preflight`, `routing-context-packet`, `recovery-context-packet`), `flow-authoring/draft`, `flow-authoring/bootstrap/candidate/tests`, `project-agents/supervisor/tests`, `framework/automation-service/service/answer-first`, `tests/deepseek-bootstrap`, `tests/service-bootstrap/tests/generation.test.ts`, `route-state` | `Test Files 376 passed (376)`, `Tests 3481 passed (3481)`, exit 0 |
| Earlier in the work, before the last file moves: `src/framework/automation-service/tests/service-bootstrap/tests/cost-ceiling.test.ts`, `creation-spend.test.ts`, `tests/refuted-result`, and `judged-build`, `rejections`, `unreadable-replies`, `earlier-output`, `subflow-candidate/tests/builder-loop.test.ts` | `cost-ceiling`, `creation-spend`, `refuted-result`: 16 files, 158 tests passed. The rest: 87 of 88 files passed. The one failure was `answerability.test.ts`, fixed and passed since |
| `pnpm.cmd --filter fluxiq check` | exit 0 |
| `node scripts/structure-audit.mjs` in Core | `structure-audit: passed (528 warning(s), 1097 baselined).` |
| `node scripts/structure-audit.mjs` in the Extension | `structure-audit: passed (243 warning(s), 552 baselined).` |
| `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` | **Refused, exit 1, as the brief allowed.** "Stale: Core's build cache would rebuild ui-components:build ... Rebuild Core's libraries" |
| In its place, `tsc -p tsconfig.json --noEmit` in `packages/test-runner` and `packages/test-contracts` | exit 0, both |
| The runner's tests, compiled to its git-ignored `node_modules/.cache/t869-cache-out` so `dist` stays alone | `cache-share.test.js`: 2 of 2. `attempt-series.test.js`: 8 of 9; the failure, "the report's paths and simulation words are still Core's", is that compile folder's depth breaking its relative path to Core |
| The result line and contract validation, by scratch scripts against those compiles | Line read "7 calls, 83% of input from cache, $0.1234"; validation holds 83, refuses 101 and 8.5 |
| `node --experimental-strip-types replay.mjs` | The tables above |

## Not verified

- **Any real cache behaviour.** No paid call was made. The hit counts are the simulation's reading of the documented rules, and the real number comes from the next paid run, whose `attempt.json` now says it.
- `shown-answer.test.js` in the Extension could not load from the compile folder (a relative path to `scripts/`), so its new test has not run. The same assertion ran by scratch script and passed.
- `packages/test-contracts/src/tests/attempt-score.test.mjs` imports `dist`, so its two new assertions will **fail until that package is built**, because the built copy does not know `cacheHitPercent`. Build it when `dist` is free.
- `apps/extension/e2e/site-reset/scripted-provider.ts:109` reads an empty tool list, and so do Core's `service/project-build` test mocks. They are candidate loops, whose list already stayed, so I expect no change. Not run.
- The full suites were not run, per the standing rule.

## Open questions or contradictions found

- The brief's "only about 11 of 51 calls changed" the draft does not match the log: 40 of 51 by exact text. So item 4 is delivered differently from how it was written: the draft is not sent only on change, and the numbers above say why. If you want it reconsidered, the option that would move the needle is sending changes rather than the whole draft, which changes what the model reads.
- **Behaviour changes worth a look, all needed for a stable head:**
  - a draft loop's model that ignores the budget entry in its last 3 decisions now spends a decision on a tool that does not run. The reply path existed before, and candidates have run this way since t503;
  - an amendment offered in the schema before there is a step to amend is refused rather than unlisted.
- The claude-api skill's Sonnet 5.5 cache-read price is stale against the official page.
- Leftover compile folders, both git-ignored: `packages/test-runner/node_modules/.cache/t869-cache-out` and `packages/test-contracts/node_modules/.cache/t869-contracts-out`. Safe to delete.

## Return contract

```text
Outcome: Done
Changed: Core packages/fluxiq/src/runtime/models/providers/anthropic/{cache-content,request-body,pricing,messages}.ts, models/transport/observation.ts, llm/evidence-moves/**, llm/provider-task/{described-nodes,draft-guide,request-messages,index}.ts, llm/context-window.ts, llm/evidence-loop.ts, llm/loop-budget.ts, llm/evidence-loop/answered-request.ts, llm/anthropic/{request,panel-command}.ts, llm/node-tools/{describing-failures,node-descriptions,described-nodes-key}.ts, llm/harness/context-packet.ts, llm/step-log/model-step.ts, flow-authoring/draft/entry.ts, their tests, docs/architecture/automation-studio/{evidence-window,llm-flow-bootstrap}.md. Extension packages/test-runner/src/attempt-lane/{report.ts,live/result-line.ts,live/run-attempt-command.ts,live/attempt/{index,cache-share}.ts}, packages/test-contracts/src/attempt-score/**, their tests, docs/architecture/testing-facility.md
Validation: vitest on the acceptance paths -> 376 files, 3481 tests passed; `pnpm.cmd --filter fluxiq check` -> exit 0; both structure audits -> passed; `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` -> refused, Core's dist is stale, so `tsc --noEmit` ran instead -> exit 0
Not verified: real cache hits (no paid call); shown-answer.test and attempt-score.test.mjs need a built dist; full suites not run
Report: C:/Users/osrs_/FluxStuff/fxwork/t869/!FluxIQ/docs/working/answer-first-plan/reports/attempt-road/repair-cache.md
Notes: Replay: 50 of 50 pairs hit, 83% from cache, an estimated $1.73 against $4.85 logged. The draft changed on 40 of 51 calls, not 11, so sending it only on change costs more; its guidance moved to the head instead. Pricing was right; the skill's $0.20 is stale.
```

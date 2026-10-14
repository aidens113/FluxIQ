# t574 a8-judge-evidence: worker report

Paths are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`
unless they say otherwise. No live run and no provider call. The only replays
were offline: recorded judge replies run through Core's verdict code.

## Outcome

Done. All five parts of the brief are built and tested. The three named test
sets, the package typecheck and `pnpm structure:check` pass.

Three tests outside my ownership still expect the old condition names. They
fail now and need one-line expectation updates (listed under Open questions).

The judge's system instruction in `llm/diagnosis-instructions.ts`, which I must
not touch, still says every left-out row needs a quote beside it. Core no
longer holds a yes to that for settled rows, and the judge's own copy says so
on each settled condition. That one sentence should still be brought in line.

## What changed and why

### (1) A called part's read is told by its authored node

`result-verification/read-account/accounts.ts`:
- **Before:** `authored()` returned nothing for any attempt with a `parentAttemptId`.
- **Now:** it looks the read's node up in `flowNodes`. A trial passes the called
  graph's nodes there, merged in by `service/candidate-trial/frame-evidence.ts`.
- **The node is refused (counts only, as before) when** the root frame ran a step
  of the same id, the node's `definitionId` differs from the attempt's, or its
  authored `where` length differs from the read's own `rejected` count length.
- **This restores, for every subflow-trial read:** the condition wording, the tested
  value beside each left-out row, `testedLabel` (and with it
  `leftOutNamingTheItem`), `dedupes`, `dedupeBy`, `paginates`, `pageLimit` and
  `dropsEarlierPageRepeats`. The value readings and the settled rows below
  depend on these.
- **Repeat node:** a loop's Repeat node in the called frame is looked up the same
  way, for `pageLimit`.

### (2) One index per condition, with its wording

- **Each read-account condition now carries `number`** (its place in the authored
  `where`, counting from 1). So does each processing condition
  (`processing-account.ts`), and so does a looped account (`looped-account.ts`).
- **Witnesses drop their own index.** A witness placed under its condition drops
  the domain's 0-based `conditionIndex`. The new type is
  `AutomationStudioResultLeftOutObservation`.
- **One name everywhere:** `condition N (wording)`, or `condition N (wording withheld)`.
  It comes from a new leaf, `read-account/condition-name.ts`. It is used in:
  - Core's read sentence (`read-account/sentence.ts`)
  - the request-rows names (`request-rows/summary-reads.ts`, read and processing conditions)
  - Core's `checked` lines (`request-rows/checked-rows.ts`, which now say `the condition N (...)`) and their parser (`checked-rows-named.ts`)
  - the rerun sentence (`rerun-rows.ts`)
  - the kept-number entries (`left-out-stating-a-kept-number.ts`)
  - the verdict's lines (`verdict.ts`: unaccounted, unquoted, kept-number)
  - the repair findings and fixes (`repair-directive.ts`)
  - `leftOutNamingTheItem[].condition`, which takes the summary-reads name.
- **Build-test replays:** the domain's `conditionIndex` is sent to the judge as
  `number` (`conditionIndex + 1`), and its witnesses lose `conditionIndex`
  (`build-test/read-rows.ts`). A condition the replay did not number is named
  `condition "<field>"`, so its line reads exactly as before.
- **Trial feedback, outside my directory:** `service/candidate-trial/reads.ts`
  changed one line plus its import. The builder's feedback now names a condition
  `condition N (wording)`. Its test `service/candidate-trial/tests/reads.test.ts`
  needed matching expectations, so I updated that too (three expectations).
- **Line-limit split:** `contracts.ts` went past its 800-line limit, so the
  condition and witness types moved to `result-verification/read-condition.ts`.
  `contracts.ts` re-exports them, so importers are unchanged.

### (3) Core settles left-out rows that already fail a numeric bound

- **New module:** `result-verification/value-readings/settled-rows.ts`, called from
  `value-readings/summary-readings.ts`.
- **Which conditions:** only those that compare nothing but numbers (a bound, or
  `equals` a number).
- **Which rows are settled:** a left-out row is settled when it says
  `label — column: value`, its value reads as a number, and
  `automationStudioRecordConditionHolds` (the domain's own semantics) says the
  condition fails on that value.
- **Never settled:** rows with no number, empty or withheld values, and every
  row of a text or presence condition.
- **What the judge's copy gains:** the condition gets `leftOutSettled` (the rows)
  and `settled`, a sentence. The sentence says Core settled these rows, so no
  quote is needed beside each one. It also says what a yes must still show:
  one quote of the request's words stating the bound, in a sentence that names
  `condition N (...)` or the column. If the request states no such bound, the
  rows are ones it asks for.
- **How the yes is checked** (`request-rows/unquoted-rows.ts`):
  - Settled rows are skipped in the per-row check.
  - A settled condition is held, as one `bound: true` entry, only if no sentence
    that quotes the request (or sits beside one, see (5)) names it. A naming is
    `condition N`, the column (whole or split from camel case), or a number its
    wording writes.
  - `verdict.ts`'s line for that entry asks for the one quote and lists no rows.
- **Recheck:** `exclusion-evidence/recheck.ts` explains this to the judge. Its
  lines are Core's lines, so settled rows are never listed there.

### (4) A presence test shows both sides

- **New module:** `read-account/presence.ts`, used by `accounts.ts`.
- **Applies to:** a condition whose only relation is `is: "present"`, not
  negated, where Core knows the column or attribute it reads.
- **The `presence` sentence says** the read found a value on every row it kept
  (with the read's `seen` value, screened like a condition's wording), and none
  on each row it alone left out.
- **Each left-out row** is said `label — <column>: (no value)`.
- **Claimed nothing** when any witness of a left-out row says `present`, or when
  no keys were declared.
- **The condition wording itself is unchanged**, so `left-out-stating-a-kept-number`'s
  parsing of `(read "…" on a row it kept)` still works.

### (5) Quote pairing

`request-rows/unquoted-rows.ts`, rewritten:
- **Empty pairs:** `""` and `“”` count as empty quotations, so they no longer shift
  every later pair.
- **Breaks inside quotes:** quotations are found over each whole line before
  sentences are split, so no sentence ends inside a quotation.
- **Neighbouring sentences:** a row named in a sentence is accounted for by a
  request quote in that sentence, or in the sentence right before or after it on
  the same line. The neighbour only lends its quote if it names no row of its own.
- **Why that last limit:** a looser version let a quote beside one row vouch for
  the row next to it. Two existing tests ("refuses a reason in the judge's own
  words", "refuses a quote of the words the request searched by") caught it, and
  both pass unchanged.

### Request sections that changed (candidate and subflow trials share this judge)

All of these sit in the judge's `resultSummary`. They change for both modes:
- `reads[].conditions[]` gains `number`, `presence`, `leftOutSettled` and `settled`.
- Its `leftOutObservations[]` lose `conditionIndex`.
- A presence condition's `leftOutOnlyByThis` rows gain `— col: (no value)`.
- `recordSets[].processing.conditions[]` gains `number`.
- `leftOutNamingTheItem[].condition` becomes `condition N (wording)`.
- `buildTest.steps[].observed.readRows.leftOutOnlyByThis[]` gains `number` in
  place of `conditionIndex`.
- `recheck` has new intro text, and its lines use the new names, plus the bound line.
- The repair's `checked`, `findings` and `fix` lines, and the builder's
  `reads[].conditions[].condition` and `said`, use the new names.

For subflow trials only, the read's wording, values, `testedLabel` and dedupe
facts now appear at all.

### Tests added

- `result-verification/read-account/tests/called-read.test.ts`:
  - A called part's looped read carries the same account as the same read in the root frame: wording, tested values, `testedLabel`, dedupe and `presence`.
  - It is told by counts only when the root frame ran the same id.
  - It is told by counts only when the node has another definition or another condition count.
- `result-verification/read-account/tests/presence.test.ts`: the kept and left-out sides, an attribute presence test, screened `seen` values, no sentence for other conditions, a contradicting witness, and the no-keys case.
- `result-verification/tests/judge-sees-the-read.test.ts` gained two `describe` blocks. I folded them in rather than add files, because `tests/` is at its 25-file limit.
  - The stub subflow trial: `summarizeAutomationStudioRunResult` plus `leftOutNamingTheItem` for a read under Call Subflow equals the whole-candidate read.
  - Settled rows: numeric-bound rows need no quote but the bound needs one; text and presence rows still need theirs; a row stating no number is never settled; the recheck text.
  - The guard that the new model-facing sentences name no realistic scenario, site or task.
- `request-rows/tests/unquoted-rows.test.ts`: neighbour sentence accepted, quote two sentences away or on another line refused, an empty `""` pair, and a quotation containing a full stop.
- Existing expectations were updated for `number` and the new names across the result-verification tests and the trial feedback test.

## Commands run and observed results

- Baseline before edits:
  `npx vitest run …/result-verification …/service/candidate-trial …/service/subflow-trial`
  printed `Test Files 86 passed (86)`, `Tests 766 passed (766)`.
- After edits, the same command printed `Test Files 88 passed (88)`, `Tests 785 passed (785)`.
- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq) returned exit 0, no output.
- `pnpm structure:check` printed `structure-audit: passed (353 warning(s), 1156 baselined).`, exit 0.
- Earlier structure runs caught real defects, all fixed:
  - **An import cycle of 127 modules.** `request-rows` imported the `read-account` barrel, which reaches `llm`. This showed up at run time as `TypeError: undefined is not a function` in `columnKeys`, which made trial summaries `candidate.trial_result_unreadable`. request-rows now imports the leaf `read-account/condition-name.ts`, which the rule allows exactly when the barrel would close a cycle.
  - `tests/` went over its file limit.
  - An `as never` cast.
  - A packed statement.
- Neighbour sets outside the brief, run because they consume these strings:
  `flow-bootstrap/unfinished-build`, `llm/evidence-loop/tests/rerun-place.test.ts`,
  `recovery/refuted-result`, `service/summaries`, `llm/node-tools`,
  `llm/tests/diagnosis-channel.test.ts`.
  Result: `Tests 3 failed | 746 passed (749)`. All three failures are name expectations, listed below.
- Offline replay (scratchpad `t574_replay.mts`, run with
  `node --experimental-transform-types`; it imports the worktree's `verdict.ts`
  and feeds it the recorded `request.json` and `response.json`):
  - **Social run, step 0072** (`run-mv7vmvhd-b0c18c5a/steps/0072-judge`):
    - New code: `"verdict":"answers","code":"core.result.answers_request","unquotedConditions":[]`.
    - The pre-change `unquoted-rows.ts` (from `git show HEAD:`, in the scratchpad) on the same reply: `"unquoted":[{"condition":"condition 1 (wording withheld)","rows":4}]`.
    - The same old code with `""` removed: `0`. This matches t570.
    - That recorded summary also shows the Call Subflow defect: `wording withheld`.
  - **A8 run** (`run-mv7vor5f-ea4d08b4`, steps 0063-0065, 0072-0074, 0085, 0086):
    - Verdicts are unchanged; 0073 is still `unsure`.
    - Every recorded summary has `condition N (wording withheld)` and bare labels. The recorded summaries were built without the authored node, so nothing can be settled from them offline. The step folders do not hold attempts, so they cannot be rebuilt.

## Not verified

- No live run, so it is not shown that a real subflow trial's judge now gets the evidence. The stub tests build the summary the way `subflow-trial/run.ts` does (attempts without the container, merged nodes), but do not go through `runAutomationStudioSubflowTrial` itself (`service/subflow-trial/`, not mine).
- Not verified that judges will follow the `settled` sentence while the system instruction still demands a quote per row.
- `pnpm check`, `pnpm test` and the full Core vitest run were not run; that is the twice-daily sweep.
- I did not check that the web domain's replay really sends `conditionIndex` 0-based; I relied on `condition-observation/parse.ts`.
- Real Flow runs with Call Subflow parts (`run-outcome.ts`) pass only the root Flow's nodes, so a part's read there is still told by counts, unless a part node shares an id and definition with an unexecuted root node of the same condition count. That residual risk is guarded but not removed.

## Open questions or contradictions found

1. **Three tests outside my ownership need one-line updates** for (2):
   - `flow-bootstrap/unfinished-build/tests/judged-wrong-rows.test.ts:68` and `:101`: `condition: "name"` becomes `condition: "condition \"name\""` in `checkedRows`.
   - `recovery/refuted-result/tests/brief.test.ts:74`: the expected text becomes `condition 1 (attribute data-sponsored is absent) rejected 13 rows; condition 2 (rating atLeast 4) rejected 20 rows; condition 3 (price lessThan 50) rejected 27 rows; condition 4 (name not contains ["ear tips", "charging case"]) rejected 16 rows`.
2. **`llm/diagnosis-instructions.ts` (must not touch):** the sentence "Hold every row a condition alone left out … a yes that leaves any such row without its quote is not taken as a yes" should gain an exception: rows in a condition's `leftOutSettled`, for which the yes quotes the bound once, as `settled` says. It could also mention `presence` and `number`.
3. **`service/candidate-trial/processed-out.ts:29`** still names a saved answer's condition by its wording alone (`condition N (wording withheld)` only when withheld). It should call `automationStudioResultConditionName(entry.number ?? index + 1, entry.condition)`. I left it, because the brief allowed one trial-feedback module.
4. **Not in the brief, and not built:** the audit's optional point 5, re-asking a no whose named row Core's `checked` refutes.
5. **Docs:** `docs/architecture/` describes the judge's request. I did not update it, because it is not in my paths.

## Follow-up (coordinator message): open items closed

Outcome: Done. Items (a) to (e) are done. The six named test sets, the package typecheck and `pnpm structure:check` all pass. No live run and no provider call.

### What changed and why

- **(a) Real Flow runs with Call Subflow parts.**
  - New `result-verification/called-nodes.ts`. For each Call Subflow attempt in a judged run, it reads the called graph through the run's own Subflow source (the executor's `subflowGraphs`, which reads each graph once per run). It keeps the graph only when the graph's `flowId` and revision equal the attempt's `subflowTarget`. The result is keyed by that attempt's `attemptId`, which is the `parentAttemptId` of every attempt in its frame. If the source throws, that frame is told by counts and the verification goes on.
  - `run-outcome.ts` gains the input `calledGraphs`. Repair re-runs spread the input, so they carry it too. `run-outcome.ts` passes `calledNodes` to `summarizeAutomationStudioRunResult`.
  - `read-account/accounts.ts`: a called read whose frame is in `calledNodes` is matched in its own graph, with the same refusals (another definition or another condition count). Other called reads fall back as before: the merged trial graph, and counts only where the root frame ran the same id.
  - `accounts.ts` also returns `authoredNodes`, aligned with `reads`. `value-readings/summary-readings.ts` uses that very node, never one re-found by id, and also reads a saved answer's processing declared on a part's node.
  - **`runtime/service.ts`, one in-place change in the `verifyRunResult` closure:** `request` becomes `graphOptions?.subflowGraphs ? { ...request, calledGraphs: graphOptions.subflowGraphs } : request`. This was unavoidable: it is the only place both the request and the run's own Subflow source are in hand. Dev's later `service.ts` change does not touch this line (read-only `git diff HEAD dev`).
- **(b) `llm/diagnosis-instructions.ts`.** After the quote-every-left-out-row sentence, the instruction now says:
  - rows in a condition's `leftOutSettled` need no quote each; a yes quotes the bound once, in a sentence naming the condition, as `settled` says; if the request states no such bound, those rows are ones it asks for. The example is a library's books "of at most 300 pages".
  - conditions are numbered, and named `condition N (wording)`.
  - `presence` means the read found a value on every kept row and none on each left-out row, written `(no value)`; such a row lacks the marker, which is not a broken read.
  - Header note added. Tests in `llm/tests/diagnosis-channel.test.ts`: the rule appears in both judge prompts, after the rule it qualifies; it states its parts; and a guard rejects price, currency, shop, earbud, friend, job, listing, rating, plus, sponsor and mutual, and requires the library example.
  - `llm/deepseek/tests/system-prompt-pins.json`: only the two `loop_verification` pins moved, by exactly the inserted text. The file's comment says pins move when Core's prose does. The byte-identical test passes against the new pins.
- **(c) `service/candidate-trial/processed-out.ts`.** It now uses `automationStudioResultConditionName(entry.number ?? index + 1, entry.condition)`. Its test expectations were updated.
- **(d) Outside tests.**
  - `flow-bootstrap/unfinished-build/tests/judged-wrong-rows.test.ts`: in both places, `checkedRows[].condition` is now `condition "name"`. This is how Core's own lines name a test condition the replay did not number, so the line and the structured rows agree.
  - `recovery/refuted-result/tests/brief.test.ts`: the brief now reads `condition 1 (attribute data-sponsored is absent) rejected 13 rows; condition 2 (rating atLeast 4) …`. That is each condition with its number and wording, the reading the audit asked for.
- **(e) `docs/architecture/automation-studio.md`** ("Judging a finished run's result"): a new paragraph on Call Subflow matching (trial and whole run), condition numbering and `condition N (wording)`, settled rows and what a yes must still show, the presence sentence, and quote pairing.
- **Test for (a)**, in `result-verification/tests/judge-sees-the-read.test.ts`, which is at the directory file limit, so the test went into an existing file:
  - A whole run whose root calls a part with a filtered read, judged through `verifyAutomationStudioRuntimeSessionResult`. The judge's request carries the part's wording, its tested values, `leftOutSettled`, its dedupe facts and `leftOutNamingTheItem`.
  - The counterpart: a graph at another revision, a source that throws, or no source each give counts only, and the judge is still asked.

### Commands run and observed results

- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq) returned exit 0.
- `pnpm structure:check` printed `structure-audit: passed (354 warning(s), 1156 baselined).`
- `npx vitest run` on `runtime/result-verification`, `runtime/service/candidate-trial`, `runtime/service/subflow-trial`, `runtime/llm`, `runtime/flow-bootstrap/unfinished-build` and `runtime/recovery/refuted-result`:
  - Final run: `Test Files 322 passed (322)`, `Tests 3044 passed (3044)`.
  - The run before it failed 4 tests in `llm/deepseek/tests/system-prompt.test.ts`, the two pins of my changed prose in two forms each. They pass after the pins moved.

### Not verified

- No live run, so the whole-run path is shown only through the run-outcome harness. `service.ts`'s `runRuntimeSession` was not exercised by a test, only typechecked.
- This worktree is based on `d8133285` and does not contain t570 or t575 from `dev`. A read-only `git diff HEAD dev` shows `dev` changed none of the files here except `runtime/service.ts`, and not my line. A merge of `dev` and a rerun of these sets is still the supervisor's to do.
- In-run repairs of a part: if a kept repair changed a part's graph, its revision differs from the attempt's, so that part's reads are told by counts. This is safe but less rich. Not exercised.
- Full suites not run.

### Open questions

None left from this brief. The audit's optional point 5 (re-asking a no whose named row Core refutes) is still not built and was not asked for.

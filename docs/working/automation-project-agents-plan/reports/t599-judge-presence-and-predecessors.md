# t599 judge-presence-and-predecessors: worker report

Worktree `fxwork/t599/!FluxIQ`, branch `task/t599-predecessor-in-trial`. Nothing is committed. No model provider was
called and no live run was made.

## Outcome

Partial. All four items are implemented and tested, and the typecheck and structure audit pass. One test file is still
red: `llm/deepseek/tests/system-prompt.test.ts` (4 tests). It pins the judge's system prompt byte for byte in
`llm/deepseek/tests/system-prompt-pins.json`. I changed `llm/diagnosis-instructions.ts`, which the brief allows, and
that moves the pin. But the pins file is under `llm/**`, which I must not touch. A re-pinned file is ready in the
scratchpad (see "Open questions").

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### (1) Core settles rows that a presence or absence test left out, when it measured them

- **`result-verification/value-readings/settled-rows.ts`**
  - Adds a presence-test path. A presence test is a condition with no bound, text test or `equals`, so it only asks
    whether the value is there.
  - It settles each left-out row whose witness (`leftOutObservations`, the domain's own reading of that row) shows
    the value the condition leaves out:
    - `absent` for a test that keeps rows with the value (`is present`)
    - `present` for a test that keeps rows without it (`is absent`; `not` is taken into account)
  - A witness of `unavailable` or `withheld`, or no witness, settles nothing.
  - The sentence says that a yes quotes, once, in a sentence naming the condition, the request's words asking for
    rows with (or without) that value. If the request asks no such thing, those rows are ones it asks for.
  - `column` is now optional. A numeric bound still needs a column, and its sentence is unchanged.
- **`value-readings/summary-readings.ts`**
  - Passes each row's witness. Witnesses are used only when their count equals the row count.
  - A condition whose read maps to no column is now parsed under a stand-in field name. Only the presence path can
    settle such a condition's rows.
- **`request-rows/summary-reads.ts`, `boundNames`**
  - A presence wording's column is now a name for the condition, so a sentence that names it counts.
  - A presence wording gives no number name.
- **`verdict.ts`, `unquotedLine`**
  - The `bound` line for a presence test now asks for "the request's words asking for what that condition tests",
    not for a bound.
- **`read-condition.ts`**: doc comment only.

### (2) A short id for a left-out row that a judge must still name

- **`request-rows/row-id.ts`** (new)
  - Defines `AutomationStudioRequestRowId.of(label)`: six letters and digits, alternating, from an FNV hash of the
    label. Letters and digits a judge could copy wrong (I, L, O, 0, 1) are not used.
  - The id comes from the label, not from the row's position. So the judge's copy and the checks compute the same id
    and nothing has to be passed between them.
  - The row is written as `[row K4R7M2] <row>`. That form is not a locator shape.
- **`request-rows/summary-with-row-ids.ts`** (new)
  - On the **judge's copy only**, puts the id before each unsettled `leftOutOnlyByThis` row of every read condition
    and every record-set processing condition.
  - Settled rows and withheld labels get no id.
  - The summary it is given is never changed, and running it a second time changes nothing.
  - Wired last in `verify.ts`'s `judged` chain. The verdict still reads the rows without ids.
- **`request-rows/row-naming.ts`**
  - A row's naming ids now include its Core id, unless another row of the read has the same id or holds it in its
    text. The old prefix and real-id naming are unchanged.
  - `unquoted-rows.ts` and `unaccounted-rows.ts` accept the id with no code change.
- **`request-rows/checked-rows.ts`**
  - The check of a "no" reply now maps an id that no row holds to the one label whose Core id it is.
- **`request-rows/summary-reads.ts`**
  - `automationStudioRequestRowLabel` takes off an id written before the row.
- **`exclusion-evidence/recheck.ts`**
  - The recheck now also says that a row may be named by the bracketed id. The existing phrase "full displayed name
    or exact distinguishing identifier" is kept.

### (3) A predecessor's reads in a subflow trial are not part of the trial's quote obligation

- **`result-verification/contracts.ts`**
  - `AutomationStudioResultTaskChecklist` gains `entry?: { subflows; steps }`.
- **`request-rows/summary-reads.ts`**
  - `automationStudioRequestRowsReads(summary, withEntry = false)` skips read accounts whose nodeId is in
    `summary.taskChecklist.entry.steps`.
  - It also skips record sets whose passes are all entry steps.
  - Every row check reads through this function, so all of them are affected: unquoted, unaccounted, the kept-number
    check, the naming-the-item flag and checked-rows.
  - `request-wording.ts` (the request's search words) still reads every read, by passing `true`.
- **`service/project-build/task-checklist.ts`**
  - `AutomationStudioProjectBuildTaskChecklist.entry(summary, predecessorProposals)` finds the entry steps in two ways:
    - Summary steps and reads whose nodeId ends in `.<subflow key>.<node key>` of a predecessor proposal's subflow,
      the `part` helpers included. That is the id a plan node is minted with (`flow-bootstrap/adaptation.ts:219`).
    - Steps whose `parameters.subflowId` ends in `.<one of those keys>`. These are the trial root's calls.
  - `subflow(source, scope, entry?)` carries `entry` into the checklist.
- **`service/project-build/subflow-trials.ts`**
  - The judge port computes `entry` from `input.proposals.predecessors(scope)` and passes it to the checklist.
  - When an entry is found, the scope instruction says: 'This trial ran the subflow "X" of a larger Flow, after the
    earlier subflows that prepare its entry (taskChecklist.entry), which are not judged here.'
  - Otherwise it keeps the old 'This trial ran only the subflow "X" of a larger Flow.'

### (4) t594's out-of-scope rule no longer applies to the entry

- **`result-verification/build-test/task-checklist.ts`**
  - The checklist type gains `entry`.
  - With an entry, the out-of-scope sentence reads "A step of this subflow, one entry.steps does not hold, that does
    what an outOfScope part asks...". An `ENTRY` sentence is added: the entry's steps are not this subflow's, and
    what they read, kept, left out or pressed "is never a reason to answer no, never a step to remove or change", and
    a yes need not account for their rows.
  - With no entry, the section is byte for byte what it was.

### The judge instruction (`llm/diagnosis-instructions.ts`, allowed)

The settled rule now:

- covers a presence condition's settled rows;
- adds one sentence on how such rows are quoted once;
- adds one sentence on the `[row K4R7M2]` id.

The example is still the library one. The guard test's required phrases are kept, and it passes.

## Changes to the candidate trial's judge request

Everything else in the request is unchanged.

1. **System prompt** (`loop_verification` and `loop_verification_build_test`): the settled-rule paragraph is longer,
   as described above. This is what moves the pins.
2. **`resultSummary.reads[].conditions[]`**: a presence or absence test whose left-out rows have witnesses now carries
   `leftOutSettled` and `settled`.
3. **`resultSummary.reads[].conditions[].leftOutOnlyByThis`** and
   **`recordSets[].processing.conditions[].leftOutOnlyByThis`**: each unsettled row starts with `[row XXXXXX] `.
4. **Recheck text**: the extra id clause in `RECHECK`. For a settled presence test, the new `bound` line wording.
5. **`taskChecklist`**: none in a candidate build, so unchanged. In a subflow trial with predecessors: `entry`, the
   `ENTRY` sentence, the out-of-scope variant, and the new scope-instruction wording.

## Commands run and observed results

Run from `fxwork/t599/!FluxIQ/packages/fluxiq` unless noted.

- **Typecheck.** Ran `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t599-check.tsbuildinfo`
  three times, the last after all edits. Each printed nothing and exited 0.
- **Structure audit.** `node scripts/structure-audit.mjs`, from the Core root.
  - The first run failed twice, both on my new test file: one `as never` cast, and `result-verification/tests/` at 26
    files against a limit of 25.
  - I moved the cases into `tests/judge-accounts-for-rows.test.ts` and the fixture into
    `request-rows/tests/presence-catalogue.ts`.
  - Rerun: `structure-audit: passed (360 warning(s), 1156 baselined).`
- **First run of `result-verification`** (`npx vitest run .../result-verification`): 2 failed and 625 passed.
  - The `recheck.test.ts` phrase: fixed by keeping the original phrase in the source.
  - `judge-accounts-for-rows.test.ts:158`, which asserted the judge's copy of a processing row with no id: assertion
    updated to expect the id.
- **The five named sets** (`npx vitest run $R/result-verification $R/service/candidate-trial $R/service/subflow-trial
  $R/service/project-build $R/llm`), last run: `Test Files 1 failed | 302 passed (303)`,
  `Tests 4 failed | 2851 passed (2855)`.
  - All 4 failures are in `llm/deepseek/tests/system-prompt.test.ts`: the byte-identical pin and the domain-instruction
    pin, for `loop_verification` and for `loop_verification_build_test`.
- **The new and changed tests on their own**, all passed:
  - `judge-accounts-for-rows.test.ts`: 16 tests (7 new t599 cases)
  - `project-build-subflow-entry.test.ts`: 6 tests
  - `judge-sees-the-read.test.ts`: 18 tests, with the scenario-word guard extended to the presence and absence
    settled sentences
- **Pin diff.** `node --experimental-transform-types scratchpad/t599-pins.ts`, which loads the llm barrel and then
  `deepseek/system-prompt.ts`, and diffs against the pins.
  - The only difference is the inserted settled-rule text, in `loop_verification` and `loop_verification_build_test`.
  - It wrote the re-pinned file to `scratchpad/t599-system-prompt-pins.json`.
  - `diff --strip-trailing-cr` of the committed pins against that file differs on lines 9-10 only.

### What the definition-of-done tests show

- **Replay-style test** (`judge-accounts-for-rows.test.ts`, "a yes over rows a presence or absence test left out"):
  - A read with an `is present` condition (4 rows, witness `absent`), an `is absent` condition (2 rows, witness
    `present`) and a text condition (1 row). All labels share a 9-word start.
  - Both presence conditions are settled. A yes with one quote per presence condition gets `answers`.
  - Without the absence quote, the yes is held with one `bound` line that lists no rows.
  - With an `unavailable` witness, nothing is settled and the yes is held as before.
  - Through `verifyAutomationStudioRunResult` with a scripted provider, both judge calls receive the
    `[row ID] ` row, and the yes naming it gets `answers`.
- **Short-id naming counts.** A yes naming the text row only by its id gets `answers`, and so does the whole label
  start (the old naming). Four shared words are held.
- **Subflow trial, predecessor not held** (`project-build-subflow-entry.test.ts`):
  - **Through the real port** (`automationStudioProjectBuildSubflowTrials` around the subflow-trial fixture, with
    predecessor `find`): the judge request carries `entry: { subflows: ["find"], steps: [... ".find.press", the root's
    call to find] }`, with no `.add.` step. It also carries the `ENTRY` sentence and the out-of-scope variant, and the
    instruction says "after the earlier subflows". With no predecessor, nothing changes.
  - **Over a summary shaped like the social trial** (a predecessor read with an unsettled "no votes shown" row, a
    press, and the target read): with `entry`, a yes that accounts only for the target's rows gets `yes`. Without
    `entry`, the same yes is `not_judged`. A yes that does not account for the target's own rows is still
    `not_judged`.

## Not verified

- **No live or provider run.** That judges actually name rows by the id, or quote a presence condition once, is
  untested against a real model.
- **No offline replay of the archived A8 judge replies.** `run-mv8id5vg` would show how many of the 48 yeses now pass.
  The yes I replayed is synthetic. The debug report's own replay says settling clears 12 of 14 rows. The other 2 (the
  accessory rows) still need naming, and a 10-word start or the new id does that.
- **The build-test replay path is not covered.** That is `buildTest.steps[].observed.readRows`, a candidate build's
  step replay. It gets neither presence settlement nor ids, as t574's numeric settlement did not either.
- **The entry is found through the minted-id naming convention.** A predecessor proposal reused with an assembled
  graph's `nodeIdByKey` would not be found. Today a trial calls every proposal as a part, so none is reused.
- **Two labels of one read with the same Core id** are not given different ids. Neither can then be named by it, and
  naming falls back to the label start. Within a read of 50 rows the chance of a clash is about 2 in 10,000.
- **Full `pnpm check` and the full vitest run were not run** (twice-a-day rule).

## Open questions or contradictions found

1. **The pins file is outside what I own.** Changing the judge instruction necessarily moves
   `llm/deepseek/tests/system-prompt-pins.json`, under `llm/**`. A drop-in re-pin is at
   `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/ce93e033-0087-42fc-bf77-9757937d964a/scratchpad/t599-system-prompt-pins.json`.
   It differs only on lines 9-10, and the repo file's line endings need keeping when it is copied. Alternatively,
   revert the `diagnosis-instructions.ts` hunk. The per-condition `settled` sentence and the recheck already say what a
   yes needs, but the standing instruction would then still say settled rows are numeric only.
2. **The brief names `service/project-build/task-checklist.ts:48-50` for t594's out-of-scope rule.** The rule's text
   is in `result-verification/build-test/task-checklist.ts:48-50`, which is what the social debug cites. I changed
   both: the service file supplies `entry`, the result-verification file words the rule.
3. **The entry exclusion goes further than the brief's "quote obligation".** It is applied where all row checks read,
   so it also takes the predecessor's reads out of the unaccounted, kept-number and checked-rows checks and out of the
   naming-the-item flag. I judged this consistent with "already judged in their own trial". The search-word reading
   still sees every read.
4. **Social's 0054-style replies may still be held.** That trial's yes named the target's four left-out rows without
   a quote of the request beside them, so the text rule still holds it. The brief keeps text conditions row by row.

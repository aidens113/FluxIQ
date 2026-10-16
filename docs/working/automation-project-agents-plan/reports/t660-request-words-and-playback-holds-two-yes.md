# t660 request-words-and-playback-holds-two-yes: worker report

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t660/!FluxIQ`, branch
`task/t660-request-words-and-playback-holds-two-yes`. Nothing is committed.
All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Partial. All four parts are built and tested, but two of them do nothing in a
live run until someone outside this brief wires them:

- **Fix 5, presence tests (`X is absent`).** This case needs one change in
  `refuted-no/record.ts` `requestQuotes`, which this brief marks as t659's
  file. Negated text tests (`X not contains "t"`) already work end to end.
- **Fix 9.** This needs the run service to supply the new
  `judgedBuildTrial` port.

Both gaps are described below, with the exact change each one needs.

## What changed and why

### Fix 5: a presence or negated condition is accounted by the request's exclusion words

- New file `result-verification/refuted-no/request-exclusion-test.ts`, exporting
  `automationStudioResultRequestExclusionTest(wording, witness, requestText, says)`.
- It covers two kinds of condition:
  - **Presence tests that keep the rows lacking a value.** The forms are
    `<subject> is absent`, the lacking form `... is absent (a row is kept only
    when it has no "...")`, and `<subject> not is present`. The text tested is
    the value Core read on the left-out row (its witness). With no witness, it
    returns nothing.
  - **Negated literal text tests.** The relations are `not contains`, `equals`,
    `startsWith` and `endsWith`, never `matches`, with quoted text only. The
    text tested is the condition's own text.
- Every such text must run word for word in the request. At every place the
  request says it, an exclusion cue must come within 3 words before it in the
  same clause, and that cue must not itself be negated:
  - one-word cues: exclude/excluding, without, no, not, never, except, skip,
    omit, avoid;
  - two-word cues: leave/leaving/left/filter/rule/weed/cut + "out", and
    rather/other + "than";
  - a cue does not count after "not", "no", "never", "dont" or "nor" ("do not
    leave out").
- The texts come back spelled as the request writes them.
- `refuted-no/request-text-test.ts`:
  - `automationStudioResultRequestTextTest` takes an optional fourth parameter,
    `witness`.
  - Any wording that is not a positive literal text test now goes to the
    exclusion test.
  - The header gains a t660 paragraph.
  - The existing callers are unchanged: `record.ts` and
    `unsure-doubts/narrowing.ts` call it with 3 arguments.
- **Effect today, with no change to `record.ts`.** A negated text test whose
  text the request excludes now marks its settled rows `quotesRequest`. The
  record's conditions then account for them `by: "request_words"`. This is
  proven through `automationStudioResultNoRecord` in the test.
- **Not live yet: presence tests.** `record.ts` `requestQuotes` computes the
  texts once per condition, before it looks at the rows, so it never passes a
  witness. The change it needs is to move the call into the per-row loop:
  `automationStudioResultRequestTextTest(condition.condition, requestText, says, witness.value)`.
  That loop already requires `witness?.state === "present"`. The row's
  `quoted.read` already carries the witness value, and `left-out-finding.ts`
  then reads correctly: "that condition tests the request's own words "X", and
  Core read "X" on that row, which fails it as written."
- The debug's `standing-no/tests/kept-condition-presence.test.ts` is not
  written. It depends on that `record.ts` change, and `standing-no/` is not in
  my ownership.

### Fix 7: excluding what is not the request's own item is not an unstated exclusion

- `result-verification/request-rows/unstated-exclusions.ts`: `unstated()` now
  also requires `!negatesTheItem(target, wording)`.
- `negatesTheItem` reads the exclusion's kind: the words before an example cue,
  as t628 reads them, or the whole exclusion where the part before the example
  has no words of its own.
- It looks for a negation (non, not, but, except, or the "than" of "other
  than" or "rather than") followed in the same clause by words the request says
  (`wording.says`). Words that carry nothing are skipped first.
- Where it finds one, it drops each such "non" (the only negation that is a
  word of the exclusion's own) and the pointing words (anything, everything,
  something, thing, whatever, else).
- If what remains has no words of its own but the request's, the exclusion
  counts as stated.
- "Excluding accessories that are not <item>" stays marked, because
  "accessories" is a kind of its own. The existing t515 test still passes.
- The header gains a t660 paragraph.

### Fix 8: the judge prompt says what `resultCount` means

- `llm/diagnosis-instructions.ts`: one sentence added to
  `AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION`, directly after
  "...already_shown: the page already showed it).". It reads:
  "Its resultCount, where present, is the number of results the page itself
  stated just before that step (before) and just after it (after), as Core
  read them off the page: where both are given and after equals before, the
  step removed no row, whatever its words say, so no row the request asks for
  can be missing because of it; where after is smaller, the page stated that
  many fewer results once the step had acted, and the rows it no longer counts
  never reached the read."
- The sentence gives no example and mirrors no scenario. A comment paragraph
  says why it was added.
- **The pins that moved, by name:** `llm/deepseek/tests/system-prompt-pins.json`
  `loop_verification` and `loop_verification_build_test`.
  - A script inserted exactly that sentence after the same anchor in each.
  - `git diff --word-diff=porcelain` shows only those two insertions. No other
    pin changed.
- The header of `system-prompt.test.ts` records the re-pin.
- New pin test in `llm/deepseek/tests/system-prompt.test.ts`
  (`a verification's system message, on a narrowing step's result count`). It
  checks that:
  - the sentence appears exactly once in both verification prompts, right
    after the `narrowedBefore` effects;
  - no other task kind's prompt contains `resultCount`.
- **Version bump:** `llm/harness/task-kind.ts` `loop_verification` changes from
  `automation-studio.loop-verification.v2` to `v3`, with a comment. The pinned
  uses were changed in that string only:
  - `llm/deepseek/tests/verdict-before-cut.test.ts`
  - `llm/harness/tests/request-evidence-check.test.ts`
  - `llm/tests/deepseek-evidence-preflight.test.ts`
  - `result-verification/build-test/tests/{change-lines,pass-lines,read-rows,stores,summary}.test.ts`
- A grep for `loop-verification.v2` across `packages/` (excluding `dist/`)
  finds nothing left.

### Fix 9: a playback's double no beside the build's two yeses on the same rows is unverified

- **Module.** The post-playback check is `result-verification/run-outcome.ts`
  (`runVerification` calls `verifyAutomationStudioRunResult`, then
  `agreement.ts`). This is result-verification code, not one of the
  must-not-touch directories. The new logic lives in a new directory,
  `result-verification/build-yes-hold/`:
  - `judged-trial.ts`: the type `AutomationStudioResultJudgedBuildTrial`
    (`trialRunId`, `verdict`, `calls`, `instructionDigest`) and the port type
    `AutomationStudioResultJudgedBuildTrialPort`. The port takes `projectId`,
    `flowId`, `subflowId?`, `runId` and `flowVersions`.
  - `same-stored-rows.ts`: `automationStudioResultSameStoredRows(left, right)`.
    - It compares the record sets in order and requires each to be whole: a
      schema, the rows read, not truncated, and `rows.length ===
      summary.recordCount`.
    - The schema field ids must match in order, and the rows must match in
      order, value for value. Values are compared canonically, so object key
      order does not matter.
    - Dataset and node ids are ignored, because a saved Flow gets new ones.
    - It is false when there are no rows at all.
  - `held-double-no.ts`: `automationStudioResultBuildYesHold` and the code
    `AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES` =
    `"core.result.build_yes_disagrees"`.
    - **When it applies.** The outcome must be a double no:
      `does_not_answer`, basis `model`, at least two `does_not_answer`
      verdicts. A Core-observation refutation is never held.
    - **What it checks.** The port must answer a trial with verdict `yes`,
      `calls >= 2` and the same instruction digest, and with a run id other
      than this run's. Core then reads that trial's rows with the same
      `readRecordSets` and compares them to this run's.
    - **What it records.** `verdict: "unsure"`, `basis: "model_disagreed"`
      and the code above. It drops `repair` and `failure`, keeps the no's
      reading as `unconfirmedReading`, and keeps `verdicts` and `calls`.
    - It never produces a yes.
    - The port and the trial's store are read only for a double no.
  - `index.ts`: the barrel.
- **`run-outcome.ts`:**
  - A t660 header paragraph.
  - A new optional port, `judgedBuildTrial`.
  - In `runVerification`, the result of `verifyAutomationStudioRunResult` now
    passes through the hold, inside the same deadline, before `withResult`.
  - With no port, behaviour is exactly as before.
  - The file grows from 683 to 710 lines.
- **Not live yet.** Nothing in Core supplies `judgedBuildTrial`. The service
  builds the ports at `service.ts` around line 2485, and that file is not in
  my ownership. It would have to map the executed graph versions to the
  build's promoted candidate and its yes trial: the proposal carries
  `candidate.trial.runId` and `calls`
  (`flow-bootstrap/authoring-result/parse.ts`), and the candidate trial record
  is in `service/candidate-trial/contracts.ts`. It would also need the digest
  of the request that trial was judged against.

## Commands run and observed results

All commands were run from the worktree.

- `npx vitest run <R>/result-verification/request-rows`: first run 1 failed,
  82 passed. My own test's expectation was wrong: "accessories that are not
  hardcover atlases" was already stated before this change, because the
  request says "atlases". I fixed the phrase. Rerun:
  `request-rows/tests/unstated*` 2 files, 15 tests passed.
- `npx vitest run .../refuted-no/tests/request-exclusion-test .../refuted-no/tests/request-words`:
  4 files, 33 tests passed.
- `npx vitest run <R>/result-verification/build-yes-hold <R>/llm/deepseek/tests/system-prompt`:
  first run 1 failed, 37 passed. The failure was an assertion on
  `context.judgements`, which stays empty because the harness session records
  no flow versions. I removed that assertion. Rerun: build-yes-hold 6 tests
  passed. system-prompt passed 32 of 32 in the first run.
- Mutation checks, each file restored afterwards (`git diff --stat` confirmed):
  - Removing `&& !negatesTheItem(...)`: 3 of 5 tests in
    `unstated-exclusions-non-item` fail.
  - Making request-text-test return `undefined` in place of the exclusion
    test: 3 of 7 tests in `request-exclusion-test` fail.
- **Final run of the brief's directories:**
  `npx vitest run <R>/result-verification <R>/llm/deepseek <R>/llm/harness <R>/llm/tests/deepseek-evidence-preflight.test.ts`
  printed `Test Files 158 passed (158)` and `Tests 1381 passed (1381)`.
- **Typecheck:** `npx tsc -p tsconfig.json --noEmit` in `packages/fluxiq`.
  - The first run gave 1 error: TS18048 at
    `request-exclusion-test.test.ts(90,12)`, `record.conditions` possibly
    undefined. I fixed it with `?.`.
  - Rerun: exit 0, no output.
  - The test file was rerun after the fix: 7 passed.
- **Structure audit:** `node scripts/structure-audit.mjs` printed
  `structure-audit: passed (385 warning(s), 1156 baselined).`
  - `refuted-no/` now holds 25 source files, which is exactly the 25-file
    limit. It shows only as a warning today.

## Not verified

- No live run, as the brief says.
- Fix 5 for `is absent` through `record.ts`, `kept-conditions.ts` and
  `advice-condition.ts`: it cannot work until the `record.ts` change above is
  made. Only the unit level is tested.
- Fix 9 end to end in the service: there is no service wiring. The test drives
  `verifyAutomationStudioRuntimeSessionResult` with the port supplied directly.
- Whether a build's candidate trial and its later playback store rows that are
  identical under `same-stored-rows.ts`. The debug found the names and the
  price, unitPrice and rating values identical. I did not check whether the
  stored rows also carry a field that differs per run, such as a timestamp or
  a link with a session token, which would stop the hold from ever firing.
- I did not run `pnpm check` or the full suites (the narrow-check rule).

## Open questions or contradictions found

- **Ownership conflict on fix 5.** The debug names `refuted-no/record.ts`
  `requestQuotes` as an owner of fix 5, but the brief gives every other
  `refuted-no/**` file to t659. The presence half of fix 5 needs the one-line
  per-row change described above. Whoever owns `record.ts` (t659, or the
  supervisor at integration) must make it and then add the debug's
  `standing-no/tests/kept-condition-presence.test.ts`.
- **Directory limit.** `refuted-no/` is at the 25-file limit with
  `request-exclusion-test.ts`. If t659 adds a source file (not a test) to
  `refuted-no/`, the merged tree fails the `directory-files` rule. One option
  is to move the two request-word tests into a `refuted-no/request-words/`
  subdirectory.
- **Who supplies `judgedBuildTrial`?** The port needs the build's yes trial
  for the executed graph version, plus the instruction digest it was judged
  against. I did not find that link stored on the saved Flow or its graph
  version. It probably runs from the applied adaptation's
  `candidate.trial.runId`, but that is the service's and
  `flow-bootstrap`/`service/candidate-trial`'s to supply, and both are outside
  this brief.

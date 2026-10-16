# t659: judge claims weighed by what Core measured

Worker report. The Core worktree is `fxwork/t659/!FluxIQ`, on branch
`task/t659-judge-claims-weighed-by-what-core-measured`, based on `4e51c1da`.
Nothing was committed.

## Outcome

**Partial.** All the logic is built and tested: fixes 3, 4 and 6 from the
`run-mvac0nmw` debug, and fix A from the `run-mvac1av6` debug (the
narrowing-step claim plus the advice to remove such a step).

- **Fixes 3, 4 and 6 work in production as soon as they merge.**
- **Fix A cannot fire in production yet.** One fact is missing: whether the
  step only added a choice. Core's narrowing record does not carry it, and the
  two files that would produce it are outside my brief. Until those files
  change, the narrowing claim refutes nothing, so it is safe. The details and
  the exact producer change are under "Open questions".

## What changed and why

All the changes are in `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/refuted-no/`.

### Layout

There are no new source files. The structure audit sets two limits that rule
them out:

- `refuted-no/` may hold at most 25 files. HEAD has 24, and t660 adds the 25th.
- Any subdirectory of `refuted-no/` breaks the 9-segment path-depth limit. I
  tried `step-claims/`, `row-clauses/` and `label-link/`, as the coordinator
  suggested, and each failed `[naming]` with 10 path segments.

So each new piece of code was folded into the existing file that owns its rule:

| New code | Folded into | Why that file |
| --- | --- | --- |
| The clause reading (`automationStudioResultRowClauses`, private `automationStudioResultSaysMissing`) and the kept-row claim (`automationStudioResultKeptRowClaim`) | `missing-claim.ts` | It owns what "missing" means. |
| `automationStudioResultNarrowingStepsNamed`, `automationStudioResultStepRemovedNoRow`, `automationStudioResultNarrowingStepClaim` | `unseen-row-claim.ts` | It owned the rule that a sentence blaming a step stands; t659 adds the exception. |
| `automationStudioResultAdviceSteps` | `advice-condition.ts` | It owns the weighing of advice. |
| `automationStudioResultLinkSpellsLabel` | `label-tested-condition.ts` | It owns the label-test rule. |

Each folded section keeps its own header comment. Every file stays under 400
lines, and the most exported values in any one file is 3, against a limit of 15.

### Fix 3: a missing claim is scoped to its own clause (`missing-claim.ts`, `weigh.ts`)

- **The clause reading.** `automationStudioResultRowClauses` splits a sentence
  outside quotes and brackets: at ";", ", but", ": " and " and " just before a
  quote. Each clause is marked by what it says of its rows:
  - `missing`: the existing `MISSING` words;
  - `left_out_by`: the subject is a condition, a filter or "it", followed by
    "left out", "dropped", "excluded" and the like;
  - `kept`: "includes", "contains", "kept" or "keeps".
- **Clauses with no words of their own.** Such a clause shares the words of:
  1. the clause a colon ends before it;
  2. else the next clause that says something;
  3. else the last clause that did.

  It never shares across ", but". A semicolon cuts a clause but not a list, so
  "Missing rows: A; B" still calls both rows missing. The t651 hardware test
  needs that, and it caught my first version, which treated ";" as a hard
  boundary.
- **The missing claim with a record.** When `record` is given,
  `automationStudioResultMissingClaim` counts only the rows of `missing`
  clauses. It reads the sentence whole, as before, in two cases:
  - a clause cut loses a row that the whole sentence names;
  - the words for missing span a cut.
- **The kept-row claim.** `automationStudioResultKeptRowClaim` stands
  (`refuted: false`) when a sentence has a `missing` or `left_out_by` clause and
  also a `kept` clause that names a stored row. In `weigh.ts` it is asked only
  when the excluded-kind claim made no claim, so t607's excluded-kind
  refutations still hold. The effect on the step 0125 sentence: the left-out
  row's settled finding is still given, but the reading is no longer wholly
  refuted. It is at most `recordContradicts: "part"`, so no retest is advised.

### Fix 4: a stored label is never missing (`missing-claim.ts`)

- A `left_out_by` clause whose rows are all stored is refuted when each of
  those rows also has a left-out copy in the record. The finding reads:
  "\"<label>\" is in the stored rows: another copy of it was kept."
- The left-out copy is required, so that "Condition 3 excludes holders, but
  <stored row> got through", which says the row was kept, is not refuted.
- A stored row called missing in a `missing` clause gets the same finding when
  a left-out copy exists. Otherwise it gets the old one: "is in the stored rows."

### Fix 6: a test read on the row's own link is a label test (`label-tested-condition.ts`)

- **What counts as such a link.** `automationStudioResultLinkSpellsLabel` is
  true when all of these hold:
  - the value starts `http(s)://` or a single `/`;
  - its decoded path (before any `?` or `#`) contains the label's words in
    order;
  - the label has at least two words.
- **Where it is applied.** `automationStudioResultConditionTestsLabel` now also
  returns true in two cases:
  - a left-out row's witness is such a link to that row;
  - the value read on a kept row is such a link to a stored row.

  The existing t651 code then quotes and accounts nothing for that condition,
  so nothing holds it. A lender line of its own, which is not a link, still
  settles as before.

### Fix A: a no, or advice, blaming a step Core measured as removing no row

- **The type and the record.**
  - `types.ts` adds `AutomationStudioResultNoNarrowingStep`, which is the
    contract's step plus an optional `addedChoice`.
  - The record adds `narrowing: { steps, readNodeIds }`.
  - `record.ts` fills `narrowing` from every read's `narrowedBefore`, each step
    once, leaving out the reads of a subflow trial's entry.
- **Naming a step.** `named-rows.ts`: a quote that is a narrowing step's
  label, control words (with or without the "(32)" count), chosen option or
  group is no longer counted as a row Core cannot find. Without this, the
  candidate run's quote "4 & up" would have left the sentence standing.
- **How a sentence names a step** (`automationStudioResultNarrowingStepsNamed`):
  - by its full node id;
  - by a unique trailing short id such as `s10`;
  - by its label;
  - by its control words;
  - by the option it chose.

  A group's name alone does not name a step. Node ids of other steps that are
  not reads come back as `others`.
- **When Core says a step removed no row**
  (`automationStudioResultStepRemovedNoRow`). All of these must hold:
  - `resultCount.before === resultCount.after`, with both present;
  - `group` and `chose` are present;
  - `addedChoice === true`.

  The finding follows the debug's words: "Step \"<label>\" chose \"<option>\"
  in \"<group>\": the page stated N results before it and N after, so it
  removed no row; no row the request asks for can be missing because of it."
- **The sentence claim** (`automationStudioResultNarrowingStepClaim`). A
  sentence is refuted when it says something is wrong (`BLAMES`) only of such
  steps. It is not refuted when it also names:
  - a row (stored, left out, or one Core cannot find);
  - a condition, by number or as a bound or threshold;
  - another step that is not a read.
- **The advice claim** (`automationStudioResultAdviceSteps`). Advice is refuted
  when every sentence either keeps what it names, or removes, unchecks, clears
  or replaces only such steps and asks for nothing more. Asking for more
  includes "add", "choose", "tighten", "exclude", "sort", "instead" and
  "replace … with". `weigh.ts` counts it as a refuted claim, as it counts
  `advised` conditions.
- **The outcome.** The existing re-ask in `reask.ts` then applies: a no Core
  still refutes after the re-ask is unsure. It is never a no and never a yes.

### Tests (all new, in `refuted-no/tests/`)

| File | What it covers |
| --- | --- |
| `missing-claim-clause.test.ts` | Fix 3. The bookmark sentence, with and without a colon, gets no "is in the stored rows" finding. Its weighing is not wholly refuted and still carries findings. The clause marks. A stored row called missing, alone or in a "Missing rows:" list, is still refuted. Two such nos through the build-test judge stay a no after 2 calls, labelled "contradicts part", never "contradicted by Core's record". |
| `missing-claim-copy.test.ts` | Fix 4. A library `reserve is absent` read: "Condition 1 … left out \"<stored title>\"" is refuted with the copy finding, alone and in a list. The same sentence over a title that is not stored stands. A stored title with no left-out copy is not refuted. |
| `label-tested-link.test.ts` | Fix 6. A link on a left-out row's witness is a label test, and so is a link read on a kept row, absolute or root-relative. Words out of order, a protocol-relative link, a label only in the query, and plain words are not links to the row. The record quotes and accounts nothing for the link condition. A lender line of its own is still settled by the request's words. |
| `narrowing-step-claim.test.ts` | Fix A. The no and its advice are refuted with the stated counts. Naming by node id, short id, label, control and option, but not by group. These stand: a step whose count changed (52→40); no `addedChoice`, `addedChoice: false`, a missing count, or no group; a sentence that also names a row Core cannot find, a condition, or a step whose count changed. Advice that asks for more is not weighed. Through the judge: two nos are re-asked with the finding and end `unknown`, never `no`. Two nos about a step whose count changed stay `no` after 2 calls. |

All fixtures are a library catalogue or atlas search. None is the towels site,
its sellers, products or answer.

## Commands run and observed results

All of these ran in `fxwork/t659/!FluxIQ`.

- **Baseline, before any change.**
  `npx vitest run src/…/result-verification/refuted-no` (in `packages/fluxiq`)
  printed `Test Files 13 passed (13)`, `Tests 100 passed (100)`.
- **The new tests fail on HEAD.**
  - Method: I backed up my changes to my scratchpad, then overwrote the 7 files
    I had modified with `git show HEAD:<path>`. A whitespace-insensitive diff
    against HEAD was then empty. With the four new test files in place, I ran
    `npx vitest run` on just those four. Afterwards I restored my versions.
  - Result: `Test Files 4 failed (4)`, `Tests 14 failed | 8 passed (22)`.
  - What passed on HEAD: the 8 converse cases, which must behave as before: a
    stored row is still refuted, a title that is not stored stands, the
    no-copy guard, a lender line still settles, and the steps whose count
    changed.
  - What failed on HEAD: all the new behaviour, every one of the 14 by
    assertion or a missing export.
  - This ran before the layout fold. The fold moved code between files without
    changing its logic, and the same tests pass after it.
- **After the change.**
  - `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`): exit 0.
  - `node scripts/structure-audit.mjs` (Core root): `structure-audit: passed
    (385 warning(s), 1156 baselined)`. `refuted-no/` holds 24 source files and
    `refuted-no/tests/` holds 24. Both are only warnings past the advisory
    threshold of 15.
  - `npx vitest run src/…/result-verification/refuted-no`: `Test Files 17
    passed (17)`, `Tests 122 passed (122)`.
  - `npx vitest run src/…/runtime/result-verification
    src/…/runtime/service/candidate-trial src/…/runtime/service/subflow-trial`:
    `Test Files 124 passed (124)`, `Tests 1049 passed (1049)`, 148 s. Nothing
    else ran beside it.
- **Earlier layout attempt.** With the subdirectories, the audit printed 10
  `[naming] … 10 path segments exceeds the 9-segment depth limit` failures.
  Before that, with the files at top level, it printed `[directory-files]
  refuted-no/: 31 source files exceeds the 25-file limit`. That is why the code
  was folded.

## Not verified

- **Fix A in a real run.** No producer sets `addedChoice`, so in production the
  narrowing claim and the step advice return nothing. The tests set the field
  by hand. No live run was made, as the brief says.
- **Whether t660's merge keeps `refuted-no/tests/` within 25 files.** It holds
  24 now. One more test file from t660 makes 25, which is allowed; two would
  fail `directory-files`.
- **The scoping against the original step 0125 sentence.** I did not replay
  `missing-claim.ts` on it. The test reproduces its shape on a library fixture.
- **Behaviour against t660's changed `request-text-test.ts`** (its fourth
  `witness` argument). Nothing in my diff calls that function with new
  arguments.
- **What the judge sees of `addedChoice`.** Once a producer adds the field to
  `narrowedBefore`, it reaches the judge's copy of the summary. That is a
  change to the judge's input.

## Open questions or contradictions found

1. **Fix A needs one fact the record does not carry.** The rule is "the step
   only added a choice: its group had no option chosen before it, and exactly
   one became chosen". Two things stand in the way:
   - The contract `AutomationStudioResultNarrowingStep` (`contracts/read-account.ts`)
     carries `group`, `chose`, `leftOptions` and `resultCount`, but not what
     was chosen before the step.
   - In a switch, the option that was chosen before shows up in `leftOptions`,
     just like an option that was never chosen. The same goes for a sort or a
     site default.

   So Core cannot tell an added choice from a switch. A switch can state the
   same count with different rows, and refuting on it would claim something
   Core never measured.

   **The producer change needed, outside my brief:**
   - In `result-verification/narrowing-group.ts`, set `addedChoice: true` only
     when the option came from `flipped()` (exactly one option chosen after
     that was unchosen before) and the same group in the `before` snapshot had
     no option chosen.
   - Add `addedChoice?: boolean` to `AutomationStudioResultNarrowingStep` in
     `contracts/read-account.ts`.

   `refuted-no` already reads it through `AutomationStudioResultNoNarrowingStep`,
   so no further change is needed here. Because the field would reach the
   judge's payload, t660, which owns the judge prompt, should know.
2. **The coordinator's layout cannot pass the audit.** A subdirectory of
   `refuted-no/` breaks the 9-segment depth limit. I folded the code into
   existing files instead. The other way out would be sibling directories
   under `result-verification/`, which are outside my paths.
3. **The narrowing claim also refutes a no saying a step is too broad.** The
   candidate run's 0060 said the step was "broader than the request". The
   debug asks for this, and I followed it. But "it removed no row" answers
   "rows are missing", not "rows got through". The no is re-asked, not
   overturned, so the worst outcome is unsure.

## Round 2

The coordinator merged `dev` (t660, t658, t656) into this worktree and
widened what I own. Nothing was committed.

### Outcome

**Done.**

- **Fix A is on.** Core's narrowing record now says when a step only added a
  choice.
- **t660's presence half is wired in.** A presence test ("X is absent") is
  accounted by the request's exclusion words.
- **No `loop_verification` pin moved.**

### What changed and why

1. **Fix A's fact is now recorded.** `result-verification/narrowing-group.ts`
   sets `addedChoice: true` only when all of these hold:
   - the option was found by its flip: exactly one option was chosen after the
     step that showed unchosen before it;
   - its group showed no option chosen before the step;
   - its group shows exactly one option chosen after it.

   It is never inferred from a control's words.
   - **Contract.** `contracts/read-account.ts` gives
     `AutomationStudioResultNarrowingStep` the field `addedChoice?: boolean`,
     with a doc comment.
   - **refuted-no.** `refuted-no/types.ts`: `AutomationStudioResultNoNarrowingStep`
     is now an alias of the contract type, because the field lives there.
   - **One test outside my listed paths.** `result-verification/tests/narrowed-before.test.ts`
     compares a whole step with `toEqual`. Its Hardcover case is a real added
     choice (nothing chosen, then Hardcover chosen), so I added
     `addedChoice: true` to its expected value. That file is not on my listed
     paths, but it tests `narrowing-group.ts`, which I now own; the change is
     one line.
2. **t660's presence half.** In `refuted-no/record.ts` `requestQuotes`, the
   text test moved into the per-row loop. It is now called as
   `automationStudioResultRequestTextTest(condition.condition, requestText, says, witness.value)`,
   so a presence test's text is the value Core read on that row. The header
   says so. `request-text-test.ts` was not touched.
3. **Tests.** No file was added to `refuted-no/` (25 source files) or to
   `refuted-no/tests/` (25).
   - **End to end, appended to my existing
     `refuted-no/tests/narrowing-step-claim.test.ts`.** The input is the page's
     own `groups` and `resultCount` on the step's before and after snapshots.
     They go through `automationStudioResultNarrowedBefore` and
     `narrowing-group.ts`, into the summary, then Core's record, then the
     weighing:
     - an added choice with the count unchanged (40 before, 40 after) is
       recorded with `addedChoice: true`, and the no blaming it is wholly
       refuted with the step's finding;
     - a switch from Paperback to Hardcover with the same count carries no
       `addedChoice`, and the no stands;
     - a choice added beside one already chosen carries no `addedChoice`.
   - **New `standing-no/tests/kept-condition-presence.test.ts`.** A library
     search whose request says "leaving out reference copies". Condition
     `reference is absent` alone left out 4 copies of stored rows and 1 row
     whose witness is "Reference". From an unsure trial (no standing call):
     - its `keptOut` is 4 rows `also_in_result` and 1 `request_words`
       `["reference"]`;
     - the memory keeps it;
     - a plan that drops it is refused, with "Core refuses this once, not twice";
     - the same plan with that condition already refused is accepted
       (`undefined`).

     It is not kept when the request says "including reference copies", or
     when the witness is "Staff pick".
4. **Pins.** `addedChoice` reaches the judge only as data: the read's
   `narrowedBefore`, which `result-summary.ts` attaches to the summary. It
   does not touch the system prompt, which is what
   `llm/deepseek/tests/system-prompt-pins.json` pins. `llm/deepseek` passed in
   full, so no pin moved.

### Commands run and observed results

All of these ran in `fxwork/t659/!FluxIQ`.

- `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`): exit 0. The first
  run caught one type error in a test helper, which I fixed before this run.
- **The new tests fail without the round 2 source.** My scratchpad script
  backed up the two files, put back HEAD's `narrowing-group.ts`, and reverted
  only the `requestQuotes` hunk in `record.ts`. It then ran
  `npx vitest run <kept-condition-presence.test.ts> <narrowing-step-claim.test.ts>`
  and restored both files. Afterwards I checked with `grep` that each
  restored file holds its new code.
  - Result: `Tests 3 failed | 11 passed (14)`.
  - The 3 that failed are the positive cases: the presence `keptOut`, the kept
    condition and its drop refusal, and the added choice being refuted.
  - The converse cases passed both ways: the switch, the choice beside one
    already chosen, "including" and "Staff pick".
- `npx vitest run src/…/runtime/result-verification
  src/…/runtime/service/candidate-trial src/…/runtime/service/subflow-trial
  src/…/runtime/llm/deepseek`: `Test Files 142 passed (142)`,
  `Tests 1221 passed (1221)`, 139 s. Nothing else ran beside it.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (386 warning(s),
  1156 baselined)`. Directory counts: `refuted-no/` 25 source files,
  `refuted-no/tests/` 25, `standing-no/tests/` 3.

### Not verified

- **A live run.** None was made, so whether the domain's real snapshot `groups`
  mark a single-choice facet's earlier choice is untested on a real page. If a
  site keeps a default option chosen, such as "All", in the same group, Core
  records no `addedChoice`. That makes it conservative there: such a no stands.
- **A judge reading `addedChoice`.** The field is now in the judge's data, but
  the judge prompt does not explain it; t660 owns that prompt. I did not check
  how a judge treats it.

### Open questions or contradictions found

- **`narrowed-before.test.ts` is outside my listed paths.** I edited it because
  its `toEqual` pinned the old record shape of the file I now own. Please
  confirm that is acceptable.

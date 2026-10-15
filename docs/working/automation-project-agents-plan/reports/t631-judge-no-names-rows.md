# t631 judge-no-names-rows: weigh a judge's "no" by what it references

Worker report. Branch `task/t631-judge-no-names-rows`, Core worktree
`C:/Users/osrs_/FluxStuff/fxwork/t631/!FluxIQ`. Nothing was committed. No live run and no provider call.

## Outcome

Done.

Core now weighs a judge's "no" first by what it references, not by how it is worded:

- **The conditions its advice changes.** A "no" whose advice only changes, removes or loosens
  conditions Core names is refuted when, for each condition, Core's read account shows that removing it
  alone brings back no row the request could ask for.
- **The rows it names.** The rows a sentence names are weighed on those rows, whatever the sentence says.

The t607 and t629 wording patterns still exist, but only as the fallback.

The judge instruction gains one generic sentence, the converse of the existing filter sentence. Its
two pins were moved to match.

Stub-judge replays of the wave 8 shapes give the expected results:

- A "no" asking to drop conditions that left out nothing is refuted, and the exact Flow is then
  confirmed.
- The 0109 wording ("dropped rows ... which the request does not exclude") is refuted by the rows it
  names.
- A "no" naming a row the read wrongly left out still stands.
- Every existing test passes unchanged.

## What changed and why

All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### New modules in `result-verification/refuted-no/`

- **`advice-condition.ts`** (`automationStudioResultAdviceConditions`): brief item (1). It reads the
  advice sentence by sentence, with Core's condition wording removed.
  - The advice qualifies when each sentence does one of two things:
    - It keeps what it names, such as "Keep the filter at `<step>`".
    - It changes, removes or loosens conditions by number, and does nothing else. That means no named
      row, no unknown quote, no step other than the read that holds those conditions, no standing claim
      about pages or order, and no adding or tightening word. The tightening words checked include
      add, tighten, restrict, ensure, exclude, dedupe and only.
  - Each condition number must resolve to exactly one condition, within the reads the sentence names.
  - A condition is cleared when the read counted the rows it alone left out (`alone`) and sent all of
    them, and each of those rows is one of these:
    - also a row of the result (`also_in_result`);
    - settled by a condition that tests the request's own words (`quotesRequest`, which is
      `request_words`).
  - When `alone` is 0, there is nothing to clear.
  - Core's finding states what it measured. For example: "Condition 4 (...) left out no row by itself:
    each of the 3 rows it rejected, another condition rejected too. Removing or loosening it alone
    brings back no row."
- **`record-conditions.ts`**: every condition of every read account, and of every saved answer's
  `process.where`, including conditions that left out no row by themselves.
  - Each row a condition left out is recorded with how Core accounts for it.
  - Entry reads and record sets of a subflow trial are excluded, as in `summary-reads.ts`.
  - Wired in through `record.ts` as `record.conditions`.
- **`condition-references.ts`**: the condition numbers a sentence names. It handles these forms:
  - `condition 4`
  - `conditions 4, 5 and 6`
  - `conditions 4-6`
  - `conditions (4, 5, 6)`
  - `5/6`
  - Bracketed condition wording is removed first. A singular "condition" takes one number, so "3 rows
    by condition 4, 2 by condition 5" never reads as condition 2.
- **`row-reference-claim.ts`**: brief item (2). It applies to the named rows, whatever the wording:
  - Every named row is left out and settled against the request's own words: the sentence is refuted.
  - A named left-out row that Core did not settle: the claim stands.
  - A sentence that says its named rows are in the result ("stored N rows including", "the result
    includes"), never says rows are out of it, and every named row was left out: refuted. Core's
    finding is "is not in the stored rows".
  - Anything else (a stored row, a row settled only by a numeric bound, an unknown row) is left to
    the wording claims.
- **`node-ids.ts`**: finds node ids whole, longest first, so `.s11` is never read as `.s1`.
  - `named-rows.ts` now removes node ids before it names rows. The hex run in
    `node.bootstrap.0d95f29b9e370ec8...` had been read as a row id that Core could not find.
- **`left-out-finding.ts`**: the settled-row sentence, moved out of `missing-claim.ts` so that both
  claims say it with identical words, and the finding appears once.

### Edits to existing modules

- **`named-rows.ts`**: a quote is no longer treated as a row Core has no record of when it is a value
  Core read on some row and is not any row's label. This uses the new `record.isValue`, built in
  `record.ts` from three sources:
  - stored cells other than the label;
  - tested values said after a left-out label;
  - witness values.

  This was the cause in step 0109: "Pickup tomorrow" made the sentence name an unknown row.
- **`weigh.ts`**:
  - `automationStudioResultRowReferenceClaim` is added to each sentence's claims.
  - When the advice qualifies, it counts as one refuted claim, with its findings appended last so the
    first findings of older tests do not change.
  - Each `observed` sentence that names only conditions (no row, no unknown quote, no other step) is
    the reason for that advice. It is refuted when it uses the existing `NEGATIVE` words, and rests
    otherwise.
  - Without qualifying advice, a sentence that names conditions in the plural now counts as naming
    something, so it stands where it says something is wrong. Before this change it rested.
  - The header explains the reference-first order and the fallback.
- **`index.ts`, `types.ts`**: the new exports and types (`AutomationStudioResultNoCondition`,
  `AutomationStudioResultNoAccounted`, `record.conditions`, `record.isValue`). The header is updated.

### Judge instruction (`llm/diagnosis-instructions.ts`)

The new sentence goes right after "A step whose words keep exactly what a clause of the request asks
for, or that narrows nothing (a notice closed, a page opened), is correct.":

> "The converse holds too: a site's own filter or option whose words look like a clause of the
> request can keep rows that clause does not ask for, when the site counts a row in it for a reason of
> its own, so check each kept row against the request's own words, not the filter's label."

It contains no banned scenario word.

Re-pinned in `llm/deepseek/tests/system-prompt-pins.json`:

- line 9, `loop_verification`;
- line 10, `loop_verification_build_test`.

Nothing else in the pins file changed. The same sentence was inserted at the same place in each
(`git diff -U0` shows `@@ -9,2 +9,2 @@`).

### Tests (new, in `refuted-no/tests/`)

- **`campsite-fixture.ts` and `campsite-readings-fixture.ts`**: a park service's campsite search. It
  is another kind of site and mirrors no scenario.
  - The fixture has five conditions that match the wave 8 shapes:
    - a promoted marker whose rows are copies of stored rows;
    - a text test of the request's own words that settled three rows;
    - a rating bound;
    - two name conditions with `alone: 0`.
  - With `nameDrops`, the name condition alone leaves out a campsite the request asks for.
  - The readings replay these steps:
    - 0053 and 0086: drop the name conditions.
    - 0085: one sentence that keeps conditions 1 to 3 and calls condition 4 extra.
    - 0109: "dropped rows ... which the request does not exclude".
    - 0110: a left-out row called stored.
  - They also cover:
    - a stored row called the wrong kind;
    - a row that was wrongly left out;
    - advice that adds a condition;
    - the yes.
- **`references.test.ts`** (12 tests) covers:
  - parsing condition references;
  - how the record accounts for each condition;
  - when advice is refuted, and when it stands: an unaccounted row, a numeric bound, a request that
    offers an alternative, rows not sent, an add or dedupe, another step, a named row, a "keep";
  - the 0109 wording, which no MISSING pattern matches (asserted), refuted by rows both with and
    without its advice;
  - an unsettled row that stands;
  - "stored" called of a left-out row, which is refuted;
  - the wrong kind called of a stored row, which stands.
- **`references-route.test.ts`** (10 tests: 5 shapes, each as a candidate trial and as a subflow
  trial) runs through `automationStudioBuildTestJudge`:
  - Trial 0051's shape: a yes plus a no that drops conditions gives a re-ask, then yes.
  - Trial 0084's shape: two nos that drop or relax conditions give two re-asks, then yes, yes.
  - Trial 0108's shape: two 0109-style nos give re-asks, then yes.
  - The same nos repeated on the re-ask give unknown, never no.
  - A no naming a row that was wrongly left out stays a no, with no re-ask.

A mutation check shows the new tests measure the change. With the advice path and the row-reference
claim turned off in `weigh.ts`, 12 of the 22 new tests failed. Every expected refutation failed, and
every "stands" case still passed. `weigh.ts` was then restored from its backup.

## Commands run and observed results

- `node_modules/.bin/tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`): exit 0, no output. Run
  once before the tests were added and once after.
- `node_modules/.bin/vitest run <runtime>/result-verification/refuted-no` before the new tests:
  6 files, 48 tests passed. These are the existing t607, t624, t628 and t629 tests (weigh,
  request-words, reask, judge-route, request-words-route, condition-wording), unchanged.
- The brief's set:
  `vitest run <R>/result-verification <R>/service/candidate-trial <R>/service/subflow-trial <R>/flow-bootstrap/candidate <R>/llm/deepseek <R>/llm/tests/diagnosis-channel.test.ts`
  gave `Test Files 134 passed (134)` and `Tests 1231 passed (1231)`. It was run twice, the second
  time after the fixture's exports were trimmed. Nothing heavy was running beside it.
- `node scripts/structure-audit.mjs` (Core root):
  - First run: 1 FAIL, because `campsite-fixture.ts` had 17 exported values against a limit of 15.
    The two name-condition wordings were merged into one `NAME_CONDITIONS` object, and `CAMP_SEARCH`
    was no longer exported.
  - Second run: `structure-audit: passed (371 warning(s), 1156 baselined)`.
  - New warnings:
    - `refuted-no/` has 22 source files; the advisory threshold is 15 and the hard limit 25.
    - `campsite-fixture.ts` has 15 exported values; the advisory threshold is 8.
- Scratch replay of the real wave 8 judge readings against Core's record.
  - Method: `node --experimental-transform-types` running the scratch script `replay.mts`. It read
    each step's `request.json` and `decision.json` from `lab-runs/2026-10-15/run-mv9gbsm5-2957581c`.
    It was not committed.
  - Results:

    | Step | Wholly refuted? | Detail |
    | --- | --- | --- |
    | 0053 | yes | Conditions 4, 5 and 6 advised |
    | 0085 | yes | Condition 4 advised |
    | 0086 | yes | Conditions 4, 5 and 6 advised. Its "Keep the retailer filter at s8" sentence is skipped as a keep. |
    | 0109 | no | See below |
    | 0110 | no | It names stored "Kindleaf Unbleached ..." as not ValueRidge-sold, a claim Core cannot measure |

  - Step 0109 in detail:
    - The condition 2 sentence is refuted by the rows it names (five rows, `rowRef: true`).
    - Condition 2 is advised (8 of 8 rows are `quotesRequest`).
    - The sentence "The filtered page shows "13–23 of 23 results" but only 9 rows were kept." still
      stands, because that quote is no row and no value Core holds.

## Not verified

- No live run or Lab run. No check of the effect on a real trial's gate beyond the stub replays.
- The scratch replay used the judge's copy of the summary taken from `request.json`. That copy carries
  `leftOutAlsoInResult` and row ids, which the verdict's own summary does not. The record does not read
  those fields, so the results should match, but I did not run it on the uncopied summary.
- Whether trial r5 (0108) would now pass. 0110 still stands, so that pair stays "no". Its Kindleaf
  claim needs the debug's fix 3 (misread check in the other direction in `checked-rows.ts`), which is
  outside this brief.
- Build-test summaries (`buildTest.steps[].readRows`) carry no `alone` count, so the advice path never
  clears a condition there. That is conservative, and it is untested beyond the type level.

## Open questions or contradictions found

1. **Removing several conditions at once is not fully measured.** The brief's rule is per condition:
   each condition's `leftOutOnlyByThis` is empty or accounted for. Removing conditions 4, 5 and 6
   together can bring back rows that only those conditions rejected jointly, and no read account lists
   such rows. In this run, the holder was rejected by conditions 4 and 5 together. So advice to remove
   them all would bring back exactly the 10-row Flow the judges rightly rejected.
   - I implemented the brief's per-condition rule. The finding says what was measured: "each of the N
     rows it rejected, another condition rejected too".
   - The harm is bounded. A refuted "no" is asked once more and at worst becomes unsure, never a yes
     made by Core.
   - The supervisor may want a joint guard: refuse the path when the advice names more than one
     condition of the same read and any of them has `rejected > alone`. With that guard, 0053 and 0086
     would no longer be refuted; only 0085 would be. Debug root cause 2 (an exclusion that has stood
     holds across trials) is the complementary fix.
2. **Settled numeric bounds are not counted as accounted for.** Core reads that such a row fails the
   bound as written, never that the bound is the request's. That is consistent with t629. I read the
   brief's "(text conditions with `quotesRequest`)" as qualifying "settled".
3. **Step 0109's "13–23 of 23 results" sentence still keeps the real 0109 "no" standing.** The read
   account (`itemsSeen: 29`, `pagesRead: 2`, `stop: ended`) contradicts the claim, but no claim checker
   reads a page-count quote. This is a possible follow-up.
4. **Advice qualification still reads remedy verbs:** change, remove or loosen, against add, tighten
   or only. This is a small closed list about the direction of the remedy, not about rows. A
   tightening phrased as "change condition 3 to ..." would pass the verb gate. Even then, a reading
   that names a stored row it calls wrong still stands through its row sentence.
5. **`refuted-no/` is at 22 of the 25-file hard limit.** The next addition should move the t631
   reference modules (`advice-condition`, `condition-references`, `record-conditions`,
   `row-reference-claim`, `node-ids`, `left-out-finding`) into a `refuted-no/references/` subdirectory
   with its own barrel.

## Follow-up: guard for conditions that may have left a row out together

The coordinator asked for the joint guard proposed in open question 1. I built the guard; I did not
merge Core `dev`.

### Outcome

Done for the guard, with two limits:

- **Core `dev` was not merged.** I did not run the merge.
  - Worker rules forbid any git command that changes history, and a merge moves the branch.
  - The merge is conflict-free. `git merge-base HEAD dev` is `be766f29`, which is this branch's `HEAD`.
    So `dev` (`775579e1`, the t632 merge) is a pure fast-forward.
  - `git diff --stat HEAD dev` shows that t632 touches 12 files under `flow-bootstrap/candidate/` and
    `flow-bootstrap/subflow-candidate/`, plus its report. None of them is a file I changed.
  - The supervisor can run `git merge --ff-only dev` here. My vitest runs therefore did not include
    t632's code.
- **The "joint row the request does not ask for (settled) is refuted" case cannot be measured, so it
  is not implemented.** Core cannot see which conditions left out a row that more than one condition
  rejected:
  - The domain's extraction metadata sends only per-condition `rejected` and `alone` counts, plus the
    labels of the rows a condition left out by itself.
  - `read-account/accounts.ts` builds the account from exactly that.
  - So no read account names a jointly excluded row or the conditions behind it, and Core has
    nothing to settle such a row with.

  Per the instruction ("If the read account cannot say which conditions left a row out, do not refute
  multi-condition advice by condition references at all"), the counts are used only to show whether
  such a row can exist. The case that can be measured, and that the tests cover, is this: the counts
  prove that no row was left out by the named set together, so the advice is refuted.

### What changed

`refuted-no/advice-condition.ts` gains a guard, `mayLeaveOutTogether`, which runs after the
per-condition clearance:

- Named conditions are grouped by read, so a read's conditions and a saved answer's `process.where`
  conditions on the same node are kept apart.
- For each read where the advice names two or more conditions:
  - If any named condition has no `rejected` count, the account cannot say. The advice is not
    weighed by its conditions.
  - If two or more named conditions rejected more rows than they alone left out, a row that only
    they left out together may exist, and the account cannot say. The advice is not weighed by its
    conditions.
  - Otherwise no such row can exist. A row left out only by the set together is rejected by at least
    two members, so each of those members has `rejected > alone`. The advice is weighed as before.
- When the guard declines, the "no" falls through to row references and to the wording fallback in
  `weigh.ts`.
- The header comment states the rule and why.

Fixtures and tests:

- `campsite-fixture.ts`:
  - Condition 5 now rejects 0 rows by default, so the two name conditions cannot have left out a row
    together.
  - A new `together` option makes it reject 1 row that another condition also rejected. The comment
    describes a campsite the request asks for that only the two name conditions left out; Core cannot
    see it.
- `references.test.ts` (now 14 tests):
  - Advice to drop conditions 4 and 5 is refuted when the counts show no row left out together. The
    finding for condition 5 changes to match the 0-row case.
  - The same advice stands on the `together` run: `{ wholly: false, findings: [] }`. On that run,
    advice that relaxes only condition 4 is still refuted.
  - Multi-condition advice stands when a named condition's `rejected` count is deleted. Advice naming
    a single condition is still weighed.
- `references-route.test.ts` (now 12 tests): for both a candidate trial and a subflow trial, two "drop
  4 and 5" nos on the `together` run come back as a no after 2 calls, with no re-ask.
- Mutation check: with the guard call removed, exactly the 4 new "stands" tests failed (2 unit tests
  and 2 route tests); the other 22 passed. The file was then restored from its backup.

### Effect on the real wave 8 readings

I re-ran the scratch replay against `run-mv9gbsm5-2957581c`:

| Step | Before the guard | With the guard | Why |
| --- | --- | --- | --- |
| 0053 | refuted | **stands** | It advises removing conditions 4, 5 and 6. Their counts are 3/0, 2/0 and 1/0 (rejected/alone), so the counts allow a row the three left out together. |
| 0086 | refuted | **stands** | Same as 0053. |
| 0085 | refuted | refuted | It names condition 4 only. |
| 0109 | stands | stands | Its condition-2 sentence is refuted by the rows it names, but the "13–23 of 23 results" sentence still stands. |
| 0110 | stands | stands | Its Kindleaf claim is one Core cannot measure. |

0053 and 0086 standing is the correct result under "Core refutes only what it measured". The holder in
that run is exactly such a jointly excluded row: conditions 4 and 5 left it out together. Debug root
cause 2 (an exclusion that has stood holds across trials) remains the fix for the cycle between the two
Flows.

### Commands run and observed results

- `vitest run` on the brief's set (result-verification, service/candidate-trial, service/subflow-trial,
  flow-bootstrap/candidate, llm/deepseek, llm/tests/diagnosis-channel.test.ts):
  `Test Files 134 passed (134)`, `Tests 1235 passed (1235)`, exit 0.
- `vitest run .../refuted-no`: 8 files, 74 tests passed.
- `tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `node scripts/structure-audit.mjs`: `passed (371 warning(s), 1156 baselined)`.

### Not verified

- Behaviour with t632's code present, because the merge was not run.
- A joint row that the account names. No producer of that data exists, so neither a test nor an
  implementation is possible without a domain extraction change: per row, the set of conditions that
  rejected it. That change would cross the wire protocol and is outside this brief.

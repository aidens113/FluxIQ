# t629 report: the judge refutes "missing" claims about settled rows

Worker report for brief t629. Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t629/!FluxIQ`, branch `task/t629-judge-refutes-missing-settled-rows`. Nothing was committed. No live run, no provider call.

## Outcome

Done. A no that calls rows "missing" is now refuted when those rows were left out by a condition that only repeats the request's own words, and Core's read found a value on each row that fails it. Step 0080's claim that such a row's value is the text the condition looks for is refuted too, against the value Core read. The existing re-ask path does the rest: the refuted no is asked once more, two yeses confirm, and a no that is still refuted becomes unknown, never a no. So `candidate.unchanged_after_no` cannot ban the exact revision on these nos. That needed no change to the candidate gate.

## What changed and why

All under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/refuted-no/`:

- `request-text-test.ts` (new): `automationStudioResultRequestTextTest(wording, requestText, says)`. It decides whether a condition tests the request's own words, and returns those words if so. To count, the condition must:
  - have exactly one relation, `contains`, `equals`, `startsWith` or `endsWith`. `matches` (a pattern) does not count.
  - not be negated, and have plain quoted text as its operand.
  - test only texts that `wording.says` finds word for word in the request.
  - never sit, wherever the request says those texts, within 3 words before or 2 words after a cue in the same clause. The cues are not, no, without, except, exclude, leave/left, skip, omit, avoid, rather, instead, or, nor, either, neither, unless, other, but.
  - The operand is read by regex, not `JSON.parse` in a try/catch, because the structure audit's `failure-as-empty` rule refuses a swallowed parse error.
- `types.ts`: `AutomationStudioResultNoLeftOutRow` gets two fields:
  - `quotesRequest: boolean` (required)
  - `quoted?: { texts; read }`: the request's words, and the value Core's read found on that row.
- `record.ts`: `requestQuotes()` goes through `summary.reads`. It skips a subflow trial's entry steps, as `summary-reads.ts` does, and any read that kept 0 rows. For each condition with `leftOutSettled` that passes the test above, it pairs each settled `leftOutOnlyByThis` row with its matching `leftOutObservations` witness, which must be `present`. Rows are keyed by condition name and label; a key that would get two different readings gets none. Only settled rows can be `quotesRequest`.
  - The 0-kept guard is there so that a field selector reading the wrong text (revision 4 of the run) is never refuted on the strength of its own reading.
  - `automationStudioResultConditionName` comes from the `read-account` barrel, the same way `value-readings/settled-rows.ts` already imports it. The structure audit refuses the leaf import.
- `missing-claim.ts`:
  - `MISSING` now also matches:
    - "missing:"
    - "missing [qualifier words] rows/records/items/entries/listings/products", where the qualifiers are generic: qualifying, required, several, a number and so on
    - "not included"
    - "should/must (have been|be) included/kept/stored/listed/returned/in the result"
    - "left it/them/these/those/both out"
    - "dropped/omitted/excluded/removed/left out/filtered out [N] [word] rows including/such as/like"
  - The dispute exemption now lifts only when every named left-out row is `settled && quotesRequest`.
  - Such a row's finding names the request's words and the value Core read.
  - New guard: a sentence naming a stored row and using a cell word (column, value, field, cell) is not refuted. The wider "not included" pattern would otherwise turn "X's rating value is not included" into "X is in the stored rows".
- `value-claim.ts` (new): `automationStudioResultValueClaim`. For each named left-out row with `quoted`, a sentence that writes one of the condition's texts as that row's value is refuted, with the value Core read. It counts as written as the value when it appears:
  - in brackets of the judge's own that do not quote the request, or
  - after "value is/being", "reads", "shows" or "says".
  - A read value that itself contains the text is never refuted.
- `weigh.ts`: adds the value claim to the claims each sentence is checked for, and updates the header.
- `index.ts`: exports the two new modules and updates the header.
- Tests in `refuted-no/tests/`. The fixtures are a library catalogue: a request for titles "available to borrow today" read by `availability contains ["Available to borrow today"]`, and witnesses "Available tomorrow" and "On hold until Monday". There are no towels, pickup, bigbox or scenario words.
  - `library-fixture.ts` holds the run. `library-readings-fixture.ts` holds the judge readings, shaped like steps 0068, 0071, 0072 and 0080, plus a no about an unread row and the yes. It was split so that no fixture file exports more than 15 values.
  - `request-words.test.ts` has 10 tests. They check:
    - which rows get `quotesRequest`, and the cases that must not: text the request does not say, negated, a pattern, a second relation, the request saying "today or tomorrow", a read that kept 0 rows
    - that the 0068, 0071, 0072 and 0080 shapes are refuted, with the expected findings
    - that a dispute of a condition whose words the request does not state still stands
    - that the "or tomorrow" request still stands
    - that a no naming an unread, unsettled row stands, on its own and beside refuted claims
    - that a stored row said to lack a value stands
  - `request-words-route.test.ts` has 8 tests: 4 cases, each through a candidate trial and a subflow trial, using the build-test judge with a scripted provider:
    1. Step 0066 shape: yes, then a refuted no, then the re-ask answers yes. Verdict yes after 3 calls, and the re-ask's request carries Core's finding.
    2. Step 0070 shape: two refuted nos, both re-asked, two yeses. Verdict yes after 4 calls.
    3. The unchanged-after-no case: the same nos come back on the re-asks. Verdict `unknown`, never `no`.
    4. A no naming a row the read wrongly left out, unread and so unsettled, given twice. Verdict no after 2 calls, with no re-ask.

On (4), the file is `runtime/flow-bootstrap/candidate/trial-gate.ts`. Line 252 reads `if (answer.verdict === "no") this.closedDigests.set(answer.digest, answer.feedback);`. Those closed digests are the only thing behind both `candidate.trial_unchanged_after_no` and, through `refutedFeedback`, the `candidate.unchanged_after_no` refusal in `submission.ts` / `unchanged-submission.ts`. A refuted no that is still refuted on the re-ask arrives as `unknown`, so it never closes a digest. Nothing needed changing there, and I changed nothing outside `result-verification`.

No judge prompt text changed, so the `llm/deepseek` pins did not move.

## Commands run and observed results

All run from `C:/Users/osrs_/FluxStuff/fxwork/t629/!FluxIQ/packages/fluxiq` unless noted, with nothing else heavy running beside them.

- `npx vitest run src/programs/automation-studio/runtime/result-verification/refuted-no`: 5 files, 40 tests passed. This was before the route test was written.
- `npx vitest run .../refuted-no/tests/request-words-route.test.ts`: 1 file, 8 tests passed.
- `npx vitest run $R/result-verification $R/service/candidate-trial $R/service/subflow-trial $R/flow-bootstrap/candidate $R/llm/deepseek`, with `R=src/programs/automation-studio/runtime`:
  - Run 1: "Test Files 131 passed (131), Tests 1180 passed (1180)".
  - Run 2, after the audit fixes: "Test Files 131 passed (131), Tests 1180 passed (1180)", Duration 87.64s.
- `npx tsc --noEmit -p tsconfig.json`: exit 0 with no output, both times.
- `node scripts/structure-audit.mjs`, from the Core root:
  - The first run failed 3 rules: `exported-values` (the fixture had 19 values), `failure-as-empty` (the JSON.parse catch) and `imports` (the leaf import of condition-name). All three were fixed.
  - The second run printed "structure-audit: passed (370 warning(s), 1156 baselined).", exit 0.
  - New advisory warnings: `refuted-no/` now has 16 source files, past the 15-file advisory threshold. `library-fixture.ts` exports 10 values, past the 8-value advisory threshold; `lamps-fixture.ts` already had 12.

## Not verified

- No live or Lab run, as the brief says. Whether real judges answer yes when re-asked with the new finding is up to the model.
- I did not replay the actual 0066-0072 request JSON through the code; the replay uses a fixture of the same shape. I traced the real sentences by hand against the new patterns:
  - 0068 matches "missing qualifying rows".
  - 0071 matches "Missing qualifying rows:".
  - 0072 matches "dropped 8 rows including".
  - 0080 matches "were dropped" with the condition named, and the value claim on "(4.7, Pickup today)" and "value being".
  - In 0068, "page-2 pass kept only 3 rows" is refuted by the existing count claim (Core stored 9 rows, not 3), which is not this task's change.
- I did not add a trial-gate test of its own showing that an `unknown` trial verdict leaves the digest open. `flow-bootstrap/candidate/tests/` is outside what I own. The route test proves the verdict is `unknown`, and `trial-gate.ts:252` was read rather than tested.
- The optional prompt-side change from the debug (section 4, point 5: quote the request's phrase in `settled`) was not done.

## Open questions or contradictions found

- The new cell-word guard in `missing-claim.ts` also narrows a refutation that existed before t629. A pre-t629 sentence like "X is missing; its rating value ..." naming a stored row used to be refuted as "X is in the stored rows". It now stands. I think this is the safer reading ("Core refutes only what it measured"), but it is a behaviour change beyond the brief.
- When a sentence also names stored rows, the missing claim still refutes it with "X is in the stored rows", even when what the sentence says about X is something else, such as 0072's "not visible on the read pages". That behaviour predates t629 and is unchanged.
- `refuted-no/` is now past the 15-file advisory threshold. A later split, for example moving the claim files into a `claims/` subdirectory, may be worth scheduling.

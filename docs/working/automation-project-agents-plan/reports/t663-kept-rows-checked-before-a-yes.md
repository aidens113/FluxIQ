# t663 kept-rows-checked-before-a-yes

Worker report. Core worktree `fxwork/t663/!FluxIQ`, branch `task/t663-kept-rows-checked-before-a-yes`, based on `917ca845`. Nothing is committed.

## Outcome

**Partial.** Fixes 1 and 1b are done and wired into the verdict. A yes that does not name a flagged kept row, in a sentence quoting the request, is now held. It becomes unsure with code `core.result.exclusion_evidence_missing` and is never turned into a no. This also applies to the yes a refuted-no re-ask returns, because every re-asked call goes back through `verdict.ts`.

Fix 2 is done in `recheck-words.ts` but only half reaches a live run:

- **Reaches live runs now:** the new sentence saying Core's record covers only the rows it names.
- **Built and tested, but not wired:** the list of flagged kept rows. The live re-ask passes no flags yet, so the list stays empty. Wiring it needs about three lines in two files outside my ownership (`refuted-no/reask.ts` and `agreement.ts`), listed under Open questions.

## What changed and why

All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/`.

### New modules

- **`request-rows/kept-without-asked-column.ts`** (fix 1): `automationStudioResultKeptWithoutAskedColumn(summary)`.
  - **Which record sets:** only a set whose every row was sent. That means `sampleRows.length === recordCount`, and the set is neither `truncated` nor `columnsWithheld`. Sets that only a subflow trial's entry collected are skipped, as `summary-reads.ts` skips them.
  - **Which columns:** the answer's columns. These come from the record output's `process.columns`, taken from `flowShape[].parameters` for that `datasetId`. Where the Flow does not state them, the set's stored `columns` are used instead.
  - **Whether a row has a value:** the same rule as `result-summary.ts` `carriesValue`.
  - **Threshold for flagging a column:**
    - at least 1 and at most `max(1, floor(rows/10))` rows lack it;
    - at least 4 other rows carry it.
  - So a column that is empty on every row is never flagged, and neither is a short list or an optional column that is empty on several rows.
  - Rows are named by their first text column, the way `summary-reads.ts` names them. A row with no text is not flagged, because nothing could name it.
- **`request-rows/kept-not-naming-the-item.ts`** (fix 1b): `automationStudioResultKeptNotNamingTheItem(summary, phrases)`.
  - **Which rows:** each read's kept labels from `automationStudioRequestRowsReads`. A run with no read account uses its stored labels instead.
  - **Writing the phrase:** a label writes a request phrase when its raw words, lowercased, match the request's first wording of that phrase exactly, plural included. So "Paper Towel Holder" does not write "paper towels". The existing phrase matcher ignores plurals, so it would have treated the holder as naming the item; that is why 1b needed its own exact comparison.
  - **Threshold:**
    - at most `max(1, floor(kept/10))` kept rows lack the phrase;
    - at least 4 other kept rows write it.
  - When several phrases qualify, each row is flagged once, under the longest phrase.

### Changed modules

- **`request-rows/types.ts`:** new `AutomationStudioRequestRowsKept`, with `kind` (`column` or `item`), `datasetId`/`step`/`nodeId`, `missing`, `rows`, `of` and `pool`.
- **`request-rows/request-wording.ts`:** `AutomationStudioRequestWording` gains `phrases`, the request's phrases. The verdict reads 1b from it, so neither the verdict input nor the contracts change.
- **`request-rows/unquoted-rows.ts`:**
  - New export `automationStudioResultKeptRowsUnquoted(flags, reply, wording)`. A flagged row counts as accounted for when it is named (`row-naming.ts`, with the flag's `pool`) in a sentence that quotes the request, or beside such a sentence under the existing lending rule.
  - What counts as a quote here: words that run word for word in the request and include at least one word that carries meaning. Unlike left-out rows, quoting the search words is allowed, because the item phrase usually is the search.
  - The sentence and lending logic was pulled into an internal `accountingSentences` so both checks share it. The left-out behaviour is unchanged.
- **`request-rows/index.ts`:** exports the two new modules, and the header now mentions them.
- **`verdict.ts`:**
  - A yes now computes the flags (`keptFlags`) and the flagged rows the reply left unnamed (`kept`).
  - The held branch is now `(unquoted || kept) && !unaccounted && !keptNumber`. The refusals that existed before still take precedence.
  - New `keptLine` gives Core's line for each unnamed flag. It never uses "the condition", so `checked-rows-named.ts` cannot read the row as one the request asks for.
  - New `heldYesReason`. With only unquoted rows, the reason text is unchanged word for word.
  - Header paragraph added (t663).
- **`refuted-no/recheck-words.ts`** (fix 2): the signature is now `(findings, kept = [])`.
  - After the record it always adds: "That record speaks only of the rows it names: it says nothing of whether each row the result keeps is one the request asks for."
  - When flags are passed, it adds "Of the rows the result keeps, Core measured only this: <row> has no value in the column "x", which every other row carries; …". It never tells the judge which verdict to give.

### Tests

New tests in `request-rows/tests/`. `refuted-no/tests/` and `result-verification/tests/` are both at the 25-file limit; `request-rows/tests/` already holds verdict and refuted-no tests (`checked-rows.test.ts`, `kept-condition-advice.test.ts`).

- **`kept-rows-fixture.ts`:**
  - a library: 9 atlases plus "Atlas Bookmark Set" stored without `pages`;
  - a hardware store: 9 "… Wood Screws …" packs plus "Ironleaf Wood Screw Organizer Case".
- **`kept-without-asked-column.test.ts`** (9 tests):
  - the bookmark set is flagged;
  - a yes that does not name it is held (unsure, `exclusion_evidence_missing`, `yesUnconfirmed`, no repair, the row in the line);
  - a yes naming it without a quote is held;
  - a yes naming it beside `"every hardcover atlas"` is taken;
  - a list with every column filled flags nothing, and its yes is taken;
  - a column empty on every row is not flagged;
  - 2 of 10 rows lacking a column is not flagged, and neither is a list with only 3 carrying rows;
  - `process.columns` restricts the check to the answer's columns, and the stored columns are the fallback;
  - a set whose rows were not all sent is not measured.
- **`kept-not-naming-the-item.test.ts`** (6 tests):
  - the organizer is flagged, missing "wood screws";
  - a list where every row writes the phrase flags nothing;
  - 2 of 10 lacking flags nothing, and neither do 3 writers plus 1;
  - a list whose names share no request phrase flags nothing;
  - a yes is held, and is taken once it names the organizer beside a quote;
  - a plain yes over an ordinary list is taken.
- **`kept-rows-recheck.test.ts`** (3 tests):
  - the re-ask names the flagged row and its column;
  - the re-ask names the flagged row and the item phrase;
  - with no flags, the scope sentence is still there, no row is named, and the text never says "answer yes".

## Commands run and observed results

All from `fxwork/t663/!FluxIQ/packages/fluxiq` unless noted.

- `npx vitest run src/.../result-verification/request-rows/tests/kept-` printed `Test Files 4 passed (4)`, `Tests 22 passed (22)`. That is the 18 new tests plus `kept-condition-advice.test.ts`, which also matches the filter.
- `npx vitest run src/.../runtime/result-verification src/.../runtime/service/candidate-trial src/.../runtime/service/subflow-trial` printed `Test Files 134 passed (134)`, `Tests 1114 passed (1114)` (102 s). This was before the barrel-import fix described below. Afterwards I re-ran only the recheck test: `3 passed`.
- `npx vitest run` on `flow-bootstrap/candidate/tests/trial-gate-unsure.test.ts`, `flow-bootstrap/subflow-candidate/tests/subflow-trial-unsure.test.ts` and `.../unchanged-after-no-words.test.ts`, which quote the recheck words, printed `3 passed`, `12 passed`.
- `npx tsc -p . --noEmit` exited 0 with no output. The first run caught a duplicate `quotes` identifier, which I fixed.
- `node scripts/structure-audit.mjs` (Core root):
  - **First run:** one FAIL. The recheck test imported `../../refuted-no/recheck-words.ts` instead of the barrel. I switched it to `../../refuted-no/index.ts`.
  - **Re-run:** `structure-audit: passed (388 warning(s), 1156 baselined)`.
  - **Advisory warnings on my paths:**
    - `request-rows/` has 24 source files;
    - `request-rows/tests/` has 19;
    - `kept-rows-fixture.ts` has 12 exported values;
    - `verdict.ts` is 485 lines (it was 438, already past 400).

## Not verified

- **No live run** (brief). I did not replay the towels trial's judge payloads (0039, 0040) through the new verdict. That the holder would be flagged by both checks is inferred from the debug's account:
  - 10 rows sent;
  - the holder alone has no `unitPrice`;
  - nine labels write "Paper Towels".
  
  I did not check whether `flowShape[].parameters` on that trial carried `process.columns` after screening. If it did not, the stored columns are used, and those include `unitPrice`.
- **The recheck a held yes receives.** A held yes is rechecked by `exclusion-evidence/recheck.ts`, which is not mine. Its fixed `RECHECK` header talks about "exclusion evidence" and "the request's own words excluding that row". My lines say clearly what is wanted for a kept row, but the header around them does not fit kept rows. I did not test how a judge reads the two together.
- **Build tests.** Fix 1 never fires on a build test (draft trial), because a build test's summary has no record-set rows with values, only `buildTest.stores` labels. Fix 1b does run on a build test's read rows (`readRows.rows`).

## Open questions or contradictions found

1. **Fix 2's flag list is not wired (needs files outside Owns).** `reask.ts` builds the recheck from `findings` alone. The `AutomationStudioResultNoRecord` it receives carries no flags, and its stored rows keep text cells only. The wiring, which I did not make:
   - In `refuted-no/reask.ts`, add `kept?: readonly AutomationStudioRequestRowsKept[]` to the input. Change line 50 to `automationStudioResultRefutedNoRecheckWords(findings.length ? findings : marked.findings, input.kept)`.
   - In `agreement.ts`, at both `automationStudioResultReaskRefutedNo({...})` calls (lines 319 and 335), pass `kept: input.summary && input.wording ? [...automationStudioResultKeptWithoutAskedColumn(input.summary), ...automationStudioResultKeptNotNamingTheItem(input.summary, input.wording.phrases)] : []`. Both functions come from the `request-rows/` barrel.

   The mechanical guard does not depend on this: the re-asked yes is held by `verdict.ts` either way.
2. **Should a kept-row hold have its own code?** It reuses `core.result.exclusion_evidence_missing` and the `exclusionEvidenceMissing` field, so the existing agreement, recheck and build-test routing (`not_judged`) applies without touching those files. The agreement would overwrite a separate code anyway in the two-call case (`agreement.ts:228-230`). A dedicated code such as `core.result.kept_row_unaccounted` would need edits there.
3. **The fixed header in `exclusion-evidence/recheck.ts`** (see Not verified) could gain one sentence for kept rows: name the row beside a quote of the request's words for what it asks for, and answer no if the request does not ask for it. That module is not in Owns.
4. **A quote is enough to account for a row.** A yes is taken once it names the flagged row beside any carrying quote of the request, even a quote unrelated to the row. This is the same standard t515 sets for left-out rows. Whether the quote really covers the row is still the judges' call. That fits "a hold is not a no", but a lazy yes can still pass.

## Round 2

**Outcome: Done.** All three items and the `weighedNos` addition are done.

What changed since round 1 corrects one claim there. Round 1's "Fix 1 never fires on a build test" holds only for the evidence-loop draft test, whose `buildTest` summary carries row labels and no cell values. The candidate trial, where the debugged false yes happened, is judged differently:

- **Judge path:** `automationStudioBuildTestJudge` (`build-test/judge.ts`) → `verifyAutomationStudioRunResult` → `verdict.ts`, with `wording` built from the instructions.
- **Summary it judges:** a finished run's summary (`service/candidate-trial/summary.ts` → `summarizeAutomationStudioRunResult`). Its record sets carry every stored row: when denied keys are given, rows are screened but never cut.

So fix 1 and fix 1b already fired there with no code change. The new test proves it end to end.

### What changed

All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/`.

- **Item 1 (proof):** new `build-test/tests/kept-rows-held.test.ts`. It replays the run's shape on a hardware store.
  - **Setup:** the request asks for name, price and unit price. The summary is built by `summarizeAutomationStudioRunResult` from 10 stored records. The 9th is "Ironleaf Wood Screw Organizer Case", with no `unitPrice`, and its name writes "Wood Screw" where the other nine write "Wood Screws".
  - **Provider:** scripted to always say yes, through the real build-test judge.
  - **Asserts:**
    - the judge's summary holds all 10 rows, the organizer without `unitPrice`;
    - two yes calls that never name the organizer give `not_judged` with `yesUnconfirmed`, over 4 provider calls (two calls, each rechecked once);
    - the recheck the provider is sent names the organizer, the `unitPrice` column line and the item-phrase line, under the new header sentence;
    - calls that name the organizer beside a quote of the request give `yes`.
- **Item 2 (wiring):**
  - `refuted-no/reask.ts` takes an optional `kept` input and passes it to `automationStudioResultRefutedNoRecheckWords`. One header line added.
  - `agreement.ts` passes `kept: automationStudioResultKeptRowsFlagged(input.summary, input.wording)` at both `automationStudioResultReaskRefutedNo` calls.
  - `verdict.ts`: the flag combination is now exported as `automationStudioResultKeptRowsFlagged(summary?, wording?)`, which returns `[]` when either is missing. It is used by both the verdict and the agreement, so `request-rows/` did not need a 25th file.
  - Test in `request-rows/tests/kept-rows-recheck.test.ts`. It uses the t607 lamps run (a double no calling two distinct stored rows one, which Core wholly refutes) with four more lamps stored and a bulb pack kept without a rating. The agreement marks `refutedNo`, and the recheck each call is asked with contains the scope sentence and `Halden Desk Lamp Bulb Pack, 2 Bulbs has no value in the column "rating"`.
- **Item 3:** `exclusion-evidence/recheck.ts` gets one more sentence at the end of the fixed `RECHECK` text:
  > Where a line names rows the result keeps rather than rows left out, there is no exclusion to show: name each such row in a sentence that quotes in double quotes the request's own words for what it asks for, and say whether the row is that; if the request does not ask for a row the result keeps, answer no.

  Plus a header note. The wording is generic.
- **`weighedNos` (t664):**
  - **Contract:** `contracts/verification.ts` gets `weighedNos?: Array<{ call: 1 | 2; recordContradicts?: "whole" | "part" }>`, with a doc comment.
  - **Producer:** `agreement.ts`'s double-no branch sets it from the same `weighedNos(input)` map that `bothReadings` labels from. There is one entry per call: `"whole"` where the record wholly refutes that no, `"part"` where it refutes it in part, and no `recordContradicts` where the no stands whole.
  - **When absent:** the field is absent when there is no record (no summary).
  - **After a re-ask:** reask re-agrees the re-asked calls through `agree`, so after the t607 re-ask the field describes the final calls.
  - **Test:** new `request-rows/tests/weighed-nos.test.ts` (placed there because `tests/` and `refuted-no/tests/` are full):
    - campsite: two partly refuted nos give `[{call:1,recordContradicts:"part"},{call:2,recordContradicts:"part"}]`;
    - two standing nos give `[{call:1},{call:2}]`;
    - a mixed pair gives `part` plus a bare entry;
    - lamps: two wholly refuted nos give `whole` twice, and with no summary the field is absent;
    - after the re-ask, where both calls answer a no Core cannot refute, the outcome is a no with `refutedNo.reasked` and `weighedNos` is `[{call:1},{call:2}]`.
- **`agreement.ts` size:** it reached 802 lines after the wiring, over the 800 limit. I removed my helper and called the exported function inline. The audit then rejected a block-bodied arrow as statement packing, so I rewrote it as one expression. The file is now exactly 800 lines, so the next addition there has to split the file.

### Commands run and observed results (round 2)

All from `packages/fluxiq`, except the audit, which runs from the Core root.

- `npx tsc -p . --noEmit` printed nothing (exit 0).
- `npx vitest run` over `result-verification`, `service/candidate-trial`, `service/subflow-trial` and the three flow-bootstrap tests that quote the recheck wording (`candidate/tests/trial-gate-unsure.test.ts`, `subflow-candidate/tests/subflow-trial-unsure.test.ts`, `subflow-candidate/tests/unchanged-after-no-words.test.ts`) printed `Test Files 139 passed (139)` after the last edit.
- New tests run alone:
  - `kept-rows-held.test.ts`: 3 passed;
  - `kept-rows-recheck.test.ts`: 4 passed;
  - `weighed-nos.test.ts`: 4 passed.
- `node scripts/structure-audit.mjs`:
  - **First run:** FAIL, file-lines, `agreement.ts` at 802.
  - **Second run:** FAIL, statement-packing, `agreement.ts` line 267.
  - **Final run:** `structure-audit: passed (388 warning(s), 1156 baselined)`.

### Not verified (round 2)

- **No live run.** I did not replay the towels trial's recorded judge requests.
- **Whether a judge follows the new recheck sentence.** The provider in the tests is scripted.
- **t664's reader against this producer.** `build-yes-hold/weighed-nos.ts` is in t664's tree, not this worktree. I matched the shape in t664's report but did not run its tests against it.
- **The evidence-loop draft test:** it still has no cell values, so fix 1 cannot fire there. Fix 1b can.

# t624 judge-settles-text-conditions: worker report

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t624/!FluxIQ` (branch `task/t624-judge-settles-text-conditions`). Nothing committed. No live run.

## Outcome

Done. All three fixes are in `runtime/result-verification/`, each pinned by a test that fails with its fix disabled. vitest on result-verification, service/candidate-trial, service/subflow-trial and llm/deepseek passes: 112 files, 1001 tests. tsc (`pnpm run check` in packages/fluxiq) passes, and so does the structure audit. No judge-prompt pin moved, because `llm/diagnosis-instructions.ts` was not touched.

## What changed and why

All paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/`.

### (1) Core settles a text test's left-out rows (`value-readings/settled-rows.ts`)

- **What qualifies.** A condition is a text test when it has `contains`, `startsWith`, `endsWith` or `matches`, or an `equals` whose values are all text. It may be negated. It must have no bound and no `is` beside it.
- **When a row is settled.** The row's aligned witness must be `state: "present"`, and `automationStudioRecordConditionHolds(condition, witness.value)` must be false.
- **What never settles a row.** A witness that found no value (`absent`), could not read it (`unavailable`), was `withheld`, or is missing. A found value that passes the condition. A condition that mixes text with a bound.
- **The sentence.** It follows the presence and bound sentences: a yes quotes once, in a sentence that names `condition N (wording)` or its column, the request's words asking only for rows whose `<column>` says what the condition looks for. For a negated test it is the words "leaving out rows whose" `<column>` says it. It also says: "If the request asks no such thing, these rows are ones it asks for."
- **`request-rows/summary-reads.ts` `boundNames`.** A settled text test is named by `condition N` and its column. The column comes from the wording (`TEXT_RELATION`/`TEXT_WORDING`) when no row says it. No number is taken from the test's text, because that number is part of what it looks for, not a bound.
- **`read-condition.ts`** doc updated.
- **Doc comments updated** in `value-readings/index.ts`, `summary-readings.ts` and `request-rows/unquoted-rows.ts`.

### (2) Left-out rows whose item is also in the result are marked on the judge's copy

- **New `request-rows/summary-with-also-in-result.ts`.** Under each read condition it adds `leftOutAlsoInResult`, listing the `leftOutOnlyByThis` rows, as given, whose label equals a stored row's label (stored rows taken from every record set). It also adds `alsoInResult`, with this sentence: "Each row in leftOutAlsoInResult is one this condition alone left out whose label is also a row of the result: another copy of the same item was kept, so that item is not missing from the result, and none of these rows is an item the condition took out of it."
  - Withheld labels are never marked.
  - Only the judge's copy changes; the summary itself does not.
  - Only read conditions are marked, not saved-answer processing conditions.
- **Naming.** The brief's example name `leftOutAlsoStored` trips the no-teaching guard test, because `SITE_WORDS` matches "store" in "Stored". The field is therefore `leftOutAlsoInResult`, which matches `checked-rows.ts`'s existing "(also in the result)".
- **`verify.ts`.** The judge's copy is now `WithRowIds(WithAlsoInResult(WithPagingWords(...)))`.
- **`request-rows/summary-with-row-ids.ts`.** A row that is also in the result gets no `[row XXXXXX]` id, since no yes is asked to name it (`unquoted-rows.ts` already skips `inResult` rows).
- **`read-condition.ts`** has the two new optional fields.

### (3) A no that only keeps or adds a condition the read applies triggers no re-ask

- **The brief's assumption does not match the evidence.** The 0029→0030 re-ask was **t515's unstated-exclusion re-ask**, not t607's. The `diff` of the two requests shows the recheck "advised leaving out rows by words the request never states as an exclusion: \"not contains Holder\"", which came from 0029's advice "Keep … condition 4 (name not contains Holder)". I fixed both paths.
- **t515 path.** New `request-rows/applied-exclusions.ts` adds `applied(text)` to `AutomationStudioRequestWording` (`request-wording.ts`). An advice exclusion is "applied" when its own words are exactly the own words of a text that an existing read or saved-answer condition already leaves rows out by. That covers a negated text test's quoted texts, and an `is absent` / `not is present` subject.
  - It uses exact equality, not a subset test. A subset test wrongly passed the existing t515 cases "not contain Handle" (which names less than `["Replacement Handle"]`) and "excludes replacement parts such as the Replacement Handle row" (a wider kind given by example).
  - `request-rows/unstated-exclusions.ts` does not mark an applied exclusion.
- **t607 path.** New `refuted-no/condition-wording.ts`. `weigh.ts` now reads each sentence without the bracketed condition wording after `condition N`, when that wording holds a relation from Core's grammar. Core's own words were being read as the judge's claims:
  - `(sponsored is absent)` matched `MISSING` ("is absent") and became a refutable "rows are missing" claim. In my 0029-shaped replay that made the no wholly refuted, which triggered t607's re-ask.
  - `(name not contains Holder)` hit `NEGATIVE` and stood as a reason.
  - A sentence that only keeps conditions now neither stands nor is refuted. The judge's own bracketed words are kept.

### Tests

- **New:**
  - `value-readings/tests/audiobooks-fixture.ts`: 0051's shape on a library catalogue.
  - `value-readings/tests/settled-rows.test.ts`: unit tests for the text settling.
  - `value-readings/tests/text-settled-judge.test.ts`: the stub-judge replay. For both a candidate trial and a subflow trial, two yeses give `verdict: "yes"` in 2 calls, and the judge's copy carries `leftOutSettled` and `leftOutAlsoInResult`. Without witnesses the same yes is held, and a yes with no quote beside the text test is held.
  - `request-rows/tests/summary-with-also-in-result.test.ts`: the also-in-result marking.
  - `request-rows/tests/kept-condition-advice.test.ts`: the 0029 shape. The stub-judge split yes and keep-no gives 2 calls, `unknown`, and no recheck. It also has unit tests for applied and not-applied exclusions, and shows that t607 does not wholly refute the no.
  - `refuted-no/tests/condition-wording.test.ts`.
- **Changed:**
  - `request-rows/tests/presence-catalogue.ts`: the t599 fixture's text-test witness is now `unavailable`, so its row stays unsettled and the t599 id and naming tests keep their premise. The old witness's value failed the test, so t624 would now settle that row.
  - `tests/judge-sees-the-read.test.ts`: the no-teaching guard now also covers t624's text-settled sentences, with and without a column, and the also-in-result sentence.
- **Mutation check.** I disabled the three fixes by hand (the text-settled branch, the wording strip in weigh, and `applied` in unstated). 6 of the new tests failed. I then restored the fixes from scratch backups.

## Commands run and observed results

- `npx vitest run src/programs/automation-studio/runtime/result-verification src/programs/automation-studio/runtime/service/candidate-trial src/programs/automation-studio/runtime/service/subflow-trial src/programs/automation-studio/runtime/llm/deepseek` (in packages/fluxiq) printed `Test Files 112 passed (112)` and `Tests 1001 passed (1001)`. It ran alone.
- `npx vitest run src/programs/automation-studio/runtime/llm/tests/diagnosis-channel.test.ts` printed `Tests 29 passed`. That file references `leftOutSettled`.
- `pnpm run check` (packages/fluxiq, tsc) printed `{"build-cache":"build","step":"fluxiq:check","reason":"inputs changed: packages/fluxiq; stored in the shared store ..."}` and no errors.
- `node scripts/structure-audit.mjs` printed `structure-audit: passed (363 warning(s), 1156 baselined)`. The only warnings on touched paths are advisory: request-rows has 22 source files (threshold 15), and `audiobooks-fixture.ts` has 12 exported values, the same as `lamps-fixture.ts`.
- With the fixes disabled, the two pin files showed `6 failed | 6 passed`.

## Not verified

- **No live run** (per the brief), and no replay of the actual 0051 or 0029 request files. The replays are of their shape, on a fixture from another kind of site.
- **Witness values are not checked for truncation.** Core tests the witness value the domain sends. If the domain truncated a long value, a `contains` test could fail on the truncated text. I did not check the domain's witness for truncation, because it lives in the downstream repo.
- **Biome** ignores these paths per biome.json, so no lint ran.
- **Not run:** whole-package vitest and `pnpm check` (the full-suite rule).

## Open questions or contradictions found

1. **The brief named `refuted-no/` and t607 for (3), but the 0029→0030 re-ask was t515's.** The recheck text shows it. Both paths are fixed. The t607 path did misfire in the replay as well: Core's own `(… is absent)` wording became a "missing" claim.
2. **The judge instruction is now incomplete.** `llm/diagnosis-instructions.ts` (not mine, unchanged) still says leftOutSettled rows are bound or presence rows only. Each condition's own `settled` sentence describes a text settlement, and `leftOutAlsoInResult` is explained only by its `alsoInResult` sentence. If the supervisor wants the instruction to name both, that file changes and pins in `llm/deepseek/tests/system-prompt-pins.json` move.
3. **`leftOutAlsoInResult` marks read conditions only.** Processing (saved-answer) conditions' left-out rows are not marked.

## Addendum: the judge instruction is updated (coordinator decision)

Two more files are now mine: `runtime/llm/diagnosis-instructions.ts` and `runtime/llm/deepseek/tests/system-prompt-pins.json`.

### What changed

All changes are in `AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION`, which is line 116 of `diagnosis-instructions.ts`. Every other sentence is byte-identical. There are three edits:

1. **The leftOutSettled exception sentence now covers text rows.** After "...or there where it keeps rows without it," it adds: "or, for a condition that tests text (contains, startsWith, endsWith, matches, or equals with text, possibly negated), its read found on the row a value that fails that condition as written,". The rest of the sentence is unchanged.
2. **A new sentence follows the "Such a presence condition's rows are settled the same way..." sentence:** "Such a text condition's rows are settled the same way: a yes quotes once, in a sentence that names that condition, the request's words asking for rows whose value says what the condition looks for, or for leaving such rows out, and where the request asks no such thing, those rows are ones it asks for."
3. **A second new sentence comes right after it:** "The rows in a condition's leftOutAlsoInResult are left-out rows whose label is also a row of the result: another copy of the same item was kept and came back, so none of them is a row the Flow dropped, none is missing from the result, and none needs a quote or a name in a yes."

No example was added. The new wording names no site, product or task.

### Lines that moved

- **`diagnosis-instructions.ts`:** line 116 only. The file keeps its CRLF line endings.
- **`system-prompt-pins.json`:** lines 9 and 10 only. These are the `loop_verification` and `loop_verification_build_test` pins. The file keeps its LF line endings.
  - I made the edits as exact substring replacements, applied twice in the pins file (once per pin). The script asserted each replacement count, and checked that the sentences need no JSON escaping.
  - `git diff -U0` shows one hunk per file: `@@ -116 +116 @@` and `@@ -9,2 +9,2 @@`.

### The no-teaching guard

- `result-verification/tests/judge-sees-the-read.test.ts` gained a test: "in the judge instruction, names none of them either". It holds the three new phrases to the same guard as before: no scenario names, no site words, no lab-task words.
- **Limit:** the test guards copies of the three phrases written into the test, not text read out of the instruction itself.
  - The llm barrel does not export `AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION`. Importing it straight from the leaf file failed the structure audit's barrel-import rule, so I removed that import.
  - The pins still prove the phrases are in the instruction.
  - If the instruction's wording changes later, the guard will keep passing on the old copies.

### Commands run and observed results

- `npx vitest run .../llm/deepseek .../llm/tests/diagnosis-channel.test.ts .../result-verification .../service/candidate-trial .../service/subflow-trial` ran alone and printed `Test Files 113 passed (113)` and `Tests 1031 passed (1031)`.
- `pnpm run check` (tsc) printed `{"build-cache":"build","step":"fluxiq:check","reason":"inputs changed: packages/fluxiq; stored in the shared store ..."}` and no errors.
- `node scripts/structure-audit.mjs` printed `structure-audit: passed (364 warning(s), 1156 baselined)`.
  - The one new advisory warning is that `judge-sees-the-read.test.ts` is now 406 lines, past the 400-line advisory threshold. The hard budget is 800.
  - The earlier `[imports]` failure from the leaf import is fixed.

### Not verified

No live judge call was made with the new prose, and no Lab run.

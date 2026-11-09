# w7: a named column never vanishes silently from a saved Flow's read

## Outcome

Partial. Both halves are built and tested, and every acceptance check named in the brief passes. One test outside
my grant now fails, because it asserts the old silent drop:
`domain/src/runtime/llm-evidence/plan-resolution/extraction/tests/run-record-output.test.ts:128`. Details are under
"Open questions". The lead needs to approve updating it or narrow rule (b).

## What changed and why

### Core (`C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/packages/fluxiq/src/runtime/flow-authoring/bootstrap/`)

- `answerability/instruction-columns.ts`
  - Lines 26-41: header paragraph for t877.
  - Lines 58-66: new exported types `AutomationStudioFlowBootstrapInstructionColumnsCutShort` and
    `AutomationStudioFlowBootstrapInstructionColumnList`. The second is `string[] & { cutShort? }`.
  - Lines 85-89: when the item the closing "and" or "&" introduced runs past `MAX_COLUMN_WORDS` and is not an
    ordering phrase, the parser returns `cutShort(...)`.
  - Lines 96-108: `cutShort` returns an **empty** list carrying `cutShort: { named, leading }`. `named` holds the
    names read before the item. `leading` holds the item's leading 3, 2 and 1 words that pass the name test, longest
    first.
  - Every other case returns exactly what it did before: a plain list, a comma clause, and an ordering.
  - Effect on callers that know no fields (the judge's `computed-facts/columns.ts`, `instruction-ask.ts`, and the
    unread-columns sentences): they now see no named columns for such phrasing, instead of a partial list.
- `authoring/assembled-record-output.ts`
  - Lines 24-33: header paragraph.
  - Lines 36-38: two imports.
    - `automationStudioLlmStepLogNote` comes from `../../../llm/step-log/note-step.ts`, not the barrel. The barrel
      closed a 17-module import cycle through `answer-step.ts`, `repeat-guard` and `replay.ts`, and the structure
      audit failed on it.
    - A type import of the column-list type.
  - Lines 70-71: the named columns go through `closedNamedColumns`.
  - Lines 88-91: when the list was cut short, no leading words matched, and the node is an extraction whose record
    output is undeclared or schema-derived, it writes one step-log note. The note says the named columns could not
    be read whole, names the columns read before the item, and says the read declares none and stores every field.
    It carries no page text.
  - Lines 119-134: `closedNamedColumns` picks the first leading candidate that `authoringInstructionRecordColumns`
    matches to a field key (exact, then ignoring case and separators). It returns `[...named, thatName]`. If none
    matches, it returns `[]` plus `unread`. A plan part's own columns still take precedence, as before.
  - How the cut-short data reaches here: `cutShort` rides on the array object, which `assemble-draft.ts:173`,
    `accept.ts:42`, `assemble.ts`, `json-plan.ts` and `normalise.ts` all pass by reference. I read every hop and
    none of them copies it. No file outside my grant changed.

### Downstream (`C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQWebExtension/domain/src/output-nodes/extract-list/`)

- `declared-columns.ts`
  - Lines 15-16 and 68-80: header changes for t877.
  - Lines 118-131: `webAutomationDeclaredColumnsRead`. A column the schema omits counts as a helper only if one of
    these holds:
    - a read `where` condition names it, or the read's sort or non-whole-row dedupe uses it;
    - the authored `process` names it;
    - the schema marks it `handling: "exclude"`;
    - an authored `process.columns` leaves it out.
  - Any other omitted column is kept: read, stored and shown. Run 12's filter-only helpers are still narrowed away.
  - Line 131 (`dropsExcluded`) and line 145: when a schema-excluded column that nothing uses leaves the read, and
    the author wrote no `process.columns`, the dispatch writes `process.columns`. Without this, re-dispatching the
    saved output would bring that column back. t510 depends on that idempotence, because submit saves the
    dispatched output.
  - Lines 153-171: `declaredColumns` also returns the `excluded` set.
  - I added no failure code. With this rule no column of the read is ever dropped without one of the reasons
    above, so no case remained that "cannot be kept". `runtime/failure/codes.ts` is untouched.
- `tests/declared-columns.test.ts`
  - Lines 128-139: the old case "a helper no condition reads leaves the read and the schema too" asserted the
    silent drop. It now asserts that plus and ad stay.
  - Lines 254-257: in the t510 dedupe case, `status` (used by nothing) is now stored and shown.
  - Lines 332-367: three new t877 cases:
    - run mw49972k's read `{title, price}` under schema `[title]` keeps price in the read, the schema and the
      stored row;
    - beside a kept column, a column only a condition reads is still narrowed away and read through its own spec;
    - a column the schema marks exclude and nothing uses leaves, and the second dispatch matches the first.
- `tests/one-page-read.test.ts` lines 212-219: this case now has a real helper, a condition on `company`, so it
  still proves that a whole-row dedupe pins no helper. It also asserts that the same read without that condition
  keeps `company`.

### Core tests

- `answerability/tests/instruction-columns.test.ts` lines 40-68:
  - the exact run phrasing gives `[]`, with `cutShort {named:["title"], leading:["price exactly as","price exactly","price"]}`;
  - several names before the item are all carried;
  - plain "title and price", "name and email", "name and message, where message is ..." and a long ordering after
    "and" are unchanged, with no `cutShort`.
- `authoring/tests/instruction-record-columns.test.ts` lines 10-13 (imports) and 121-171, through
  `assembleAutomationStudioFlowDraftPlan`:
  - the exact phrasing declares `[title, price]` with no note;
  - "order number exactly as printed" declares `orderNumber`, not `order`;
  - a long tail whose leading words name no field declares every field (`title, price, stock`) and writes exactly
    one note;
  - plain lists declare as before.
- I first put these cases in a new `authoring/tests/assembled-record-output.test.ts`. That pushed `authoring/tests/`
  to 26 files, over the structure audit's 25-file limit. I deleted it and moved the cases into this file, which
  already tests the same assembly door.

## Commands run and observed results

The Core commands ran in `!FluxIQ/packages/fluxiq` unless a line says otherwise. The domain commands ran in
`!FluxIQWebExtension`.

- `npx vitest run --maxWorkers 2 --minWorkers 1 src/runtime/flow-authoring/bootstrap/answerability/tests/instruction-columns.test.ts src/runtime/flow-authoring/bootstrap/authoring/tests/instruction-record-columns.test.ts`
  -> `Test Files 2 passed (2)`, `Tests 33 passed (33)`.
- The same vitest run with the cut-short branch disabled (temporary edit, then restored) -> 5 failed and 9 passed.
  The failures included `expected [ 'title' ] to deeply equal [ 'title', 'price' ]` and
  `expected [ 'title' ] to deeply equal [ 'title', 'price', 'stock' ]`. This ran while the assembly cases were
  still in the separate file. The plain-list guards pass both with and without the fix, by design.
- The neighbouring Core tests: answerability `tests/`, `read-record-output`, `record-output-part-defaults` and
  `instruction-record-columns` -> `Test Files 5 passed (5)`, `Tests 57 passed (57)`.
- `pnpm --filter fluxiq check` (in `!FluxIQ`) -> exit 0, run twice: before and after the import change.
- `pnpm structure:check` (in `!FluxIQ`)
  - First run: FAIL, the import cycle through the step-log barrel, plus `authoring/tests/` at 26 files.
  - After both fixes: `structure-audit: passed (531 warning(s), 1097 baselined)`, exit 0.
- `pnpm --filter @fluxiq-web-extension/domain check`
  - First run: refused, "Core's build ... is not current with its source".
  - I then ran `pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build`
    in Core -> exit 0. fluxiq and ui-components were rebuilt.
  - After the rebuild -> `core-build: ... current with its source`, exit 0. I ran it again after the last test
    edit -> exit 0.
- `DOMAIN_TEST_BUILD_LABEL=t877-w7 node scripts/test-domain.mjs output-nodes/extract-list` (in `domain/`)
  - On the final code: `# tests 102  # pass 102  # fail 0`.
  - With `unused` forced false (the old rule; temporary, then restored): `# pass 96  # fail 6`. The failures were
    the three new t877 cases, the updated "nothing uses" case, the t510 dedupe case and the one-page whole-row case.
  - Re-run after restoring: 102 out of 102 pass.
- `node scripts/structure-audit.mjs` (in `!FluxIQWebExtension`) -> `structure-audit: passed (244 warning(s), 552 baselined)`, exit 0.
- An extra regression check outside the brief: `DOMAIN_TEST_BUILD_LABEL=t877-w7 node scripts/test-domain.mjs runtime/llm-evidence/plan-resolution/extraction`
  -> `# tests 71  # pass 70  # fail 1`. The failure is `run-record-output.test.ts:128`, covered below.

## Not verified

- No live run, Lab run, browser replay or web build, as the brief instructs. The run's saved Flow was not replayed.
- Core's whole vitest suite and the domain's whole suite were not run. The full-suite allowance is for the lead's
  sweep.
- The judge's `computed-facts/columns.ts` and the answerability feedback now get `[]` for a cut-short instruction.
  I did not run their tests, which are outside my files. If one of them asserts a partial list for such phrasing,
  it will fail.
- Step-log notes are written on every assembly of such a draft, so a build that re-assembles often writes several
  identical notes. I accepted that duplication and did not measure how often it happens.

## Open questions or contradictions found

1. **A test outside my grant asserts the old drop.**
   - The test: `domain/src/runtime/llm-evidence/plan-resolution/extraction/tests/run-record-output.test.ts:128`,
     "a generic shorthand: four declared columns sorted by a helper ...".
   - The read has 10 columns and the schema declares 4, with no `process.columns`.
     - `ad` and `pounds` are condition helpers.
     - `endsAt` is the sort helper.
     - `condition`, `ends` and `bin` are used by nothing.
   - Under rule (b) those three are kept. `process.columns` is now
     `[title, price, bids, postage, condition, ends, bin]`, and line 142 expects only the first four.
   - This is the decided behaviour, so I believe the test's expectation should be updated. The 0022/0024 auction
     test beside it (line 105) still passes, because there the author wrote `process.columns` and marked the
     helpers exclude.
   - If the lead would rather drop columns that a model's own hand-written schema omits, rule (b) needs a
     distinction it does not have today: "Core declared the schema from the instruction" versus "the model wrote
     the schema". The dispatch cannot tell those apart.
2. **Interpretation of rule (b).** A column the schema marks `handling: "exclude"`, or that an authored
   `process.columns` leaves out, still counts as a helper even if no where, sort or dedupe uses it. Both are the
   author's explicit word, not silence. Without this, t510's auction case would store helpers its author excluded,
   and its re-dispatch idempotence test would fail.
3. **Two other people's edits in the Core tree.** `git status` in Core shows changes I did not make, under
   `framework/automation-service/service/answer-first/attempt/flow-stage.ts` and `.../flow-run/`
   (`person-check-port.ts`, `ports.ts` and its test). These are from the worker in flow-run. The domain tree shows
   an untracked debug note, `run-mw4bfyuz-9b7c57d7.md`, that is not mine either. My Core library rebuild compiled
   whatever was in the tree at that moment, their edits included.

## (b') rework (the lead's decision; it replaces the domain half above)

Core change (a) is kept exactly as it was. The domain half described above is withdrawn and replaced as follows.

### What changed

- `domain/src/output-nodes/extract-list/declared-columns.ts`
  - The narrowing is back to its original behaviour. The read is cut to the schema's columns. Where-only helpers
    leave the read, and the conditions read them through their own spec. Sort and dedupe helpers are stored, and
    are hidden through `shown`.
  - There is no widening, no `excluded` set and no `dropsExcluded`.
  - The one addition: `WebAutomationDeclaredColumnsRead.dropped: string[]`. It lists the read's columns that the
    narrowing removed and that no read `where` names, in field-map order. A column a sort, a dedupe or the authored
    `process` uses is never removed, so it never appears in `dropped`.
  - The header's t877 paragraph is rewritten to match.
  - `git diff` shows only two changes: the `dropped` type member and computation (two lines in the function,
    two in the returns), and the header paragraph.
- `tests/declared-columns.test.ts`
  - "a helper no condition reads ..." and the t510 dedupe case are restored to their originals. `git diff` against
    HEAD shows no change to either.
  - My three earlier t877 cases are removed. They are replaced by two cases at the end of the file:
    - Run mw49972k's read (title, price, and `sponsored` read only by a condition) under schema `[title]`:
      `dropped` is `["price"]`, the request fields are `["title"]` and the columns are `["title"]`.
    - A narrowing that drops only a condition helper, or a sort helper, gives `dropped: []`.
- `tests/one-page-read.test.ts` is restored to HEAD; `git diff` shows nothing.

### The step-log note itself is not written: the domain has no facility for it

- No source under `domain/src` writes a step-log note. The only step-log use is in a test,
  `evidence-summary/tests/page-text.test.ts`.
- `dispatch.ts` must stay browser-safe. Its header says it is bundled into the extension and so avoids
  `fluxiq/automation` values. `declared-columns.ts` sits in the same folder, and `native-runtime.ts` imports only
  types from `fluxiq/automation`.
- Core's `automationStudioLlmStepLogNote` writes files and reads `process.env`. The brief said to propose a route
  before adding one, so I added none.
- The proposed smallest route touches two files, one of them outside my grant:
  1. `extract-list/dispatch.ts` (mine): return the names beside the payload, never inside it, as
     `{ ok: true; payload; droppedColumns?: string[] }` from `narrowed.dropped`. Nothing new then reaches the page
     or Core's dispatch effect.
  2. `runtime/llm-evidence/plan-resolution/extraction/run-record-output.ts` (outside my grant): write one note there
     when `droppedColumns` is non-empty, using `automationStudioLlmStepLogNote` from `fluxiq/automation`.
     - That module runs at submit, when the saved Flow's record output is fixed, which is where run mw49972k's loss
       became permanent.
     - `llm-evidence` already imports `fluxiq/automation` values (`withheld.ts`, `vocabulary.ts`).
     - I confirmed the export: `import('fluxiq/automation')` gives `typeof automationStudioLlmStepLogNote === "function"`.
     - A note line could read: `A saved read drops columns it was written with that nothing uses: price.`
- A note on every run as well, not only at submit, would need a port the Node host supplies to `native-runtime.ts`.
  One way is an optional `stepLogNote` on the bundle the Node host builds (`host.ts` / `web-panel-host.ts`). That
  is more surface, and I would not do it unless the lead wants per-run notes.
- The brief's two note tests ("writes the note naming it", "writes none") are therefore written against `dropped`,
  the data the note would carry. They should move to `run-record-output`'s tests once the route is approved.

### Commands run and observed results (rework)

- `pnpm --filter @fluxiq-web-extension/domain check` -> `core-build: ... current with its source`, exit 0.
- `DOMAIN_TEST_BUILD_LABEL=t877-w7 node scripts/test-domain.mjs output-nodes/extract-list llm-evidence/plan-resolution/extraction`
  (in `domain/`) -> `# tests 172  # pass 172  # fail 0`. That includes `run-record-output.test.ts:128`, unchanged.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (244 warning(s), 552 baselined)`, exit 0.
- I did not re-run the fail-without-fix check for the two new cases. They read `dropped`, which did not exist before,
  so they cannot pass without it.

## Note route (approved: routes 1 and 2, the note at submit only)

### What changed

- `domain/src/output-nodes/extract-list/dispatch.ts`
  - The `ok` arm of `WebAutomationExtractListDispatch` gains `droppedColumns?: string[]`. It sits beside `payload`
    and never inside it; the type's doc comment says so.
  - The value is `narrowed.dropped` when that list is non-empty. Both `ok` returns carry it.
  - `native-runtime.ts` and the other callers spread or read only `payload`. So nothing new reaches the page or
    Core's dispatch effect.
- `domain/src/runtime/llm-evidence/plan-resolution/extraction/run-record-output.ts`
  - A header paragraph for t877.
  - A value import of `automationStudioLlmStepLogNote` from `fluxiq/automation`. This module runs in the host, and
    `llm-evidence` already imports values from that package.
  - When `dispatch.droppedColumns` is non-empty, `webPlanRunRecordOutput` writes one note. It holds column names
    only, never a cell value. For run mw49972k's shape the line is:
    `A saved read drops a column it was written with that nothing uses, because its declared columns leave it out: price.`
  - It writes nothing otherwise. The saved record output is unchanged: no widening.
- New test file
  `domain/src/runtime/llm-evidence/plan-resolution/extraction/tests/run-record-output-note.test.ts`, which writes to
  a temporary `FLUXIQ_LLM_STEP_LOG_DIR`:
  - Title and price under a title schema, with `sponsored` read only by a condition: exactly that one note line is
    written, and the saved schema is `[title]`.
  - Schemas `[title, price]` and `[title, price, sponsored]`: no note.
  - `run-record-output.test.ts` itself is untouched.
- The `dropped` cases in `extract-list/tests/declared-columns.test.ts` stay. They test the data the note carries.

### Commands run and observed results (note route)

- `pnpm --filter @fluxiq-web-extension/domain check` -> `core-build: ... current with its source`, exit 0.
- `DOMAIN_TEST_BUILD_LABEL=t877-w7 node scripts/test-domain.mjs output-nodes/extract-list llm-evidence/plan-resolution/extraction`
  (in `domain/`)
  - First run -> `# tests 174  # pass 174  # fail 0`. The two new note tests are `ok 136` and `ok 137`, and
    `run-record-output.test.ts:128` passes unchanged.
  - With the note write disabled (temporary, then restored): the note test alone gives `not ok 1 - t877: run
    mw49972k's read ... notes price`, `# pass 1  # fail 1`.
  - Re-run after restoring -> `# tests 174  # pass 174  # fail 0`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (244 warning(s), 552 baselined)`, exit 0.

### Not verified (note route)

- The note in a real submit. No live run or Lab run.
- A Flow re-resolved several times notes the drop on each resolution. I did not measure how often that happens.

```text
Outcome: Done
Changed: !FluxIQ/packages/fluxiq/src/runtime/flow-authoring/bootstrap/answerability/instruction-columns.ts, .../answerability/tests/instruction-columns.test.ts, .../authoring/assembled-record-output.ts, .../authoring/tests/instruction-record-columns.test.ts; !FluxIQWebExtension/domain/src/output-nodes/extract-list/declared-columns.ts, .../extract-list/dispatch.ts, .../extract-list/tests/declared-columns.test.ts, domain/src/runtime/llm-evidence/plan-resolution/extraction/run-record-output.ts, .../extraction/tests/run-record-output-note.test.ts (new)
Validation: `pnpm --filter @fluxiq-web-extension/domain check` -> exit 0; `DOMAIN_TEST_BUILD_LABEL=t877-w7 node scripts/test-domain.mjs output-nodes/extract-list llm-evidence/plan-resolution/extraction` -> 174/174 pass (note test fails with the note disabled); `node scripts/structure-audit.mjs` -> passed; Core unchanged since earlier: vitest 33/33, `pnpm --filter fluxiq check` exit 0, `pnpm structure:check` passed
Not verified: live/Lab submit; full suites; how often re-resolution repeats the note
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w7-named-columns.md
Notes: Submit-time note names dropped unused columns (column names only); dispatch carries `droppedColumns` beside its payload, never in it.
run-record-output.test.ts:128 and both restored tests pass unchanged; the answer keeps exactly the declared columns.
```

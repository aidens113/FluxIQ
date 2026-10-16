# t654 unseen-row-claim-refuted: worker report

## Outcome

Blocked. No source was changed. The brief's owned files cannot carry the two
facts the refutation rests on, so a sound implementation needs `refuted-no/types.ts`
and `refuted-no/record.ts` (or `refuted-no/weigh.ts`) as well. The brief does
not give me those files.

## What changed and why

Nothing. Below is why the owned files are not enough, and the re-brief that
would be.

### The data path today

- `weigh.ts` builds each sentence's claims as
  `automationStudioResultMissingClaim(sentence, named)`, where
  `named = automationStudioResultSentenceRows(sentence, record)`
  (`named-rows.ts`). `missing-claim.ts` sees only the sentence and `named`
  (`{ stored, leftOut, unmatched }`, declared in `types.ts`). `named-rows.ts`
  sees the `AutomationStudioResultNoRecord`. Neither sees the summary.
- An unseen row X, quoted by the judge, arrives as `named.unmatched === true`.
  `missing-claim.ts` then returns `{ refuted: false }`. An unquoted X matches no
  prefix in `record.pools` and is not detected at all. So fix 5 can only act on
  a quoted X, or on an id no row holds.

### Fact 1: narrowing steps ran before the read (missing from the record)

This is `summary.reads[].narrowedBefore` (`contracts/read-account.ts:112`, from
`narrowed-before.ts` via `result-summary.ts:249`). The record
(`refuted-no/record.ts`, `automationStudioResultNoRecord`) does not copy it, and
`types.ts` has no field for it. `record.nodeIds` is every flowShape step and
does not say which steps ran and acted before a read. Only `record.ts`, which is
given the summary, can carry this fact. That file is not owned.

### Fact 2: the read's labels are every row it saw (not true in general)

This was the debug's open point. `automationStudioRequestRowsReads`
(`request-rows/summary-reads.ts:91-152`) builds a run read's `labels` from
three sets:

- the stored labels, from `recordSets[].sampleRows`, which is a sample;
- each condition's `leftOutOnlyByThis`, which holds only the rows that
  condition left out by itself.

A row two conditions both rejected appears in no label list. So "X is not in the
read's labels" proves the read never saw X only when all of these hold for that
read account:

- `itemsSeen === kept + Σ conditions[].alone`, so no row was rejected by two or
  more conditions;
- every condition has `alone` defined and
  `leftOutOnlyByThis.length === alone`;
- no left-out label is `(withheld)`;
- `unfiltered !== true`;
- the stored sample is whole: `record.stored.length === record.storedCount`;
- likewise for the saved answer's `process.where` conditions on that read.

`itemsSeen`, `kept` and `unfiltered` are not in the record either.
`record.conditions` carries `rejected` and `leftOut`, but `leftOut` is absent
when the read did not send every row. So the completeness test also needs
`record.ts`.

### Why not work around it inside the owned files

The only channel from `named-rows.ts` to `missing-claim.ts` is the `named`
object, whose type `types.ts` declares. To pass these facts through it, I would
need one of two hacks:

- a hidden module-level WeakMap keyed by `named`;
- an undeclared extra property read through a cast.

Either hides the contract. I judged both worse than asking.

### Proposed re-brief (minimal)

**Owns:** `refuted-no/{types,record,unseen-row-claim (new),missing-claim}.ts`
and their tests.

**`types.ts`:**

- Add an optional
  `unseen?: (text: string) => { reads: Array<{ nodeId: string; narrowedBy: string[] }> } | undefined`
  to `AutomationStudioResultNoRecord`. An alternative is a per-read
  `{ nodeId, seenWhole: boolean, narrowedBefore: AutomationStudioResultNarrowingStep[] }[]`.
- Add an optional `unseen?: string[]` to `AutomationStudioResultNoNamedRows`:
  the unmatched quotes, as text.

**`record.ts`:**

- Build the per-read facts from `summary.reads[]` (`narrowedBefore`,
  `itemsSeen`, `kept`, `unfiltered`, the conditions' `alone` and
  `leftOutOnlyByThis`) and the processing conditions, using the completeness
  test above.
- Skip the subflow entry's reads, as `summary-reads.ts` does.

**`named-rows.ts`:** return the unmatched quote texts in `unseen`. That file is
already owned.

**`unseen-row-claim.ts`, the rule:**

- The sentence matches `MISSING`, or a missed / left out / filtered out /
  excluded verb, said of a condition named by number or as a
  condition/filter.
- It names no stored or left-out row, only unseen quotes.
- Every read the result was judged on has `seenWhole` and at least one
  `narrowedBefore` step.
- Then it is refuted, with the finding: `No condition saw "<X>": it is in none
  of the rows the read saw, so it never reached the read; <step labels> ran
  before it.`
- A sentence that blames a step stands. It names a narrowing step's label,
  control or node id, or a search/filter/facet/sort/step word, without a
  condition.

**Wiring:** `missing-claim.ts` consults the new claim before its
`named.unmatched → { refuted: false }` return. `weigh.ts` is unchanged.

**Tests:** these stay as the brief's definition of done. Also add one test: a
read whose `itemsSeen` exceeds `kept + Σ alone` does not refute.

## Commands run and observed results

- Read `refuted-no/{index,missing-claim,named-rows,weigh,types,record,row-reference-claim,left-out-finding,record-conditions}.ts`,
  `narrowed-before.ts` (header), `request-rows/summary-reads.ts` (1-160) and
  `contracts/read-account.ts` (60-140).
- `grep automationStudioResultNoRecord(`: the only caller is
  `agreement.ts:691`, which passes `summary`, `requestText`, `wording` and
  `other`.
- `git status --short` in the t654 Core worktree: clean. No tests, tsc or
  structure audit were run, because nothing changed.

## Not verified

- I did not check that live summaries always set `itemsSeen` on run read
  accounts. If they often lack it, the completeness test will rarely hold.
  Someone should check this against `run-mva6mlm4-97fe42f9` step 0045's judge
  request.
- I did not check whether that judge's sentence 0046 quoted the row, which the
  rule needs, or named it unquoted, which Core cannot detect.

## Open questions or contradictions found

- The brief's key "X is in none of the read's seen labels" does not hold as
  stated: `read.labels` omits rows two conditions both rejected, and stored
  rows beyond the sample. Without the completeness test, Core would refute
  with a claim it did not measure.

## Round 2

### Outcome

Done. I built the refutation as round 1 proposed. Core now refutes a sentence
saying a condition left out, missed, dropped or excluded a row, but only when
all of these hold:

- the read never saw the row;
- the read's own counts show that its labels are every row it saw;
- a step acted on the page before each read.

### What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/refuted-no/`.

- **`types.ts`.**
  - New `AutomationStudioResultNoSeenRead`: `{ nodeId, whole, narrowedBefore }`.
  - New optional `seen` and `seenLabels` on `AutomationStudioResultNoRecord`.
  - New optional `unseen: { quotes, reads?, seenLabels? }` on
    `AutomationStudioResultNoNamedRows`.
- **`record.ts`.** `seenReads(summary)` sets `whole` for each read only when all
  of these hold:
  - `itemsSeen` is defined and equals `kept + Σ alone`;
  - each condition has `alone` defined, `leftOutOnlyByThis.length === alone`,
    and no left-out label is `(withheld)`;
  - the read is not `unfiltered`;
  - every non-entry record set's `sampleRows.length === recordCount`, nothing
    was `cut`, and its processing conditions also name every row, with
    `Σ alone === filteredOut`.

  It skips the subflow entry's reads. It returns undefined when a build test's
  replayed reads (`readRows`) stand beside the run's reads, because those carry
  no counts. `narrowedBefore` comes from the account. `seenLabels` is every pool
  label.
- **`named-rows.ts`.**
  - `quotesUnmatched` now returns the unmatched quotes, not a boolean.
  - An unmatched id is tracked apart from them.
  - `unseen` is set only when every unmatched row was named by a quote.
  - `unmatched` itself behaves as before.
- **`unseen-row-claim.ts` (new).** It refutes only when all of these hold:
  - the sentence names no stored or left-out row, only unseen quotes;
  - it speaks of a condition and uses a left-out verb;
  - every read is whole and has at least one `narrowedBefore` step;
  - no quote shares its leading three words with any seen label, either way
    round.

  It does not refute, so the sentence stands, when the sentence speaks of a
  step, filter, facet, search, sort, option, category or department, or names a
  narrowing step's node id, label or control.

  The finding reads: `No condition saw "<X>": it is in none of the rows the read
  saw, so it never reached the read. "<step label>" acted on the page before
  the read; whether that was right is the judge's to weigh.`
- **`missing-claim.ts`.** For a sentence naming only rows Core has no record
  of, it consults the unseen claim first, before its `MISSING` gate. The verb is
  "missed", which `MISSING` does not hold. If the claim does not apply, the old
  path runs unchanged.
- **`index.ts`.** Exports the new file and gives one header line to it.
  **This file was outside my owned list.** The barrel rule needs every file
  exported.
- **`tests/unseen-row-claim.test.ts` (new).** Fixture: a library catalogue read
  after a "Choose Hardcover format" step. Five tests:
  1. "Condition 2 missed "<paperback>"" is wholly refuted, with Core's words.
  2. "The Format step removed …, which should be included" stands, and the
     reading holding both sentences is not wholly refuted.
  3. A row the read saw (a left-out rating row) has `unmatched` false, gets no
     unseen claim, and gets no unseen finding.
  4. With `itemsSeen` 6 against `kept + Σ alone` = 5, the read is not whole and
     nothing is refuted.
  5. With no narrowing step, nothing is refuted.

`weigh.ts`, `agreement.ts`, `narrowed-before.ts`, `contracts/**`,
`standing-no*/**`, `verify.ts`, `llm/**` and `flow-bootstrap/**` are untouched.

### Commands run and observed results

- `npx vitest run src/programs/automation-studio/runtime/result-verification/refuted-no/tests/unseen-row-claim.test.ts`
  (in `packages/fluxiq`): 5 passed.
- `npx vitest run src/programs/automation-studio/runtime/result-verification`:
  89 files, 814 tests passed.
- `npx tsc --noEmit -p tsconfig.json`, first run: 5 errors, all in my test
  (`changed` is not a reading field). I fixed them to `advice`.
- `npx tsc --noEmit -p tsconfig.json`, rerun: no output, exit 0.
- `npx vitest run …/result-verification/refuted-no` after the fix: 11 files,
  90 tests passed.
- `node scripts/structure-audit.mjs` (Core root): "structure-audit: passed (382
  warning(s), 1156 baselined)". None of the warnings were in my files.

### Not verified

- **Live summaries may not count.** Whether they carry `itemsSeen` and
  `alone`/`leftOutOnlyByThis` that add up is unchecked. If they usually don't,
  the rule seldom fires; it then fails safe, by not refuting. I checked neither
  this against `run-mva6mlm4-97fe42f9` step 0045 nor whether judge 0046 quoted
  the row.
- **The read's own dedupe is unchecked.** If a read's `kept` counts rows before
  its dedupe, the counts still add up. If it counts after, they don't, and Core
  does not refute.
- **No full sweep was run.** Only the result-verification directory was tested.

### Open questions or contradictions found

- **`index.ts` was outside the owned list.** I edited it only to export the new
  file, as the barrel rule requires.

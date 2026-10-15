# t628 report: judge kind exclusions and splits

Worker report for brief t628 (Core worktree `fxwork/t628/!FluxIQ`, branch
`task/t628-judge-kind-exclusions-and-splits`). Source debug:
`!FluxIQWebExtension/docs/working/automation-project-agents-plan/reports/a8-towels-run-mv9a4aj0-debug.md`.
Nothing was committed. No live run was made.

## Outcome

Done for R1, R2 and R3. I did not do R4 (order claims checked against page order).

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/`.

### R1: a no that says what a stored row is adds no exclusion (decisive, 0081/0082)

- `request-rows/unstated-exclusions.ts`: `automationStudioRequestUnstatedExclusions(advice, wording, namedStored = [])`
  takes a new third argument: the labels of the stored rows that the no's own reading names.
  - An exclusion is not marked when its **kind** has an own word (`wording.ownWords`) that is also a word of one of
    those labels. The kind is the exclusion's words before an example cue (`such as`, `like`, `for example`,
    `including`, `e.g.`), or all of its words when the part before the cue has no own words. Example: "exclude
    holders, ..." beside the stored "... Holder, Bamboo" is not marked.
  - It is still marked when the kind spells the row's own name (the label's first four words). In that case the
    advice names the row; it does not say what kind of row it is.
  - It is still marked when no named label contains a word of the kind. This keeps the t515 origin case,
    "excluding accessories such as <row>", marked.
- `agreement.ts` `unstatedExclusion(..., record)`: it gets the named stored labels from Core's record
  (`noRecordOf(input)`), sentence by sentence, using the same row naming the t607 weighing uses
  (`refuted-no/named-rows.ts`). With no summary there is no record, so the behaviour is what t515 had.
- `agreement.ts` `exclusionRecheckWords` is now symmetric. The last sentence now reads: "Answer again from the
  evidence, and answer no over a row the result keeps only where you quote words of the request that it fails:
  words that exclude it, or the words naming what the request asks for, which that row by its own words is not."
  The first two sentences are unchanged. This is runtime recheck text, not a prompt in
  `llm/diagnosis-instructions.ts`, and no pin moved. It names no site or task.

### R2: an unsure-and-no split is weighed against Core's record (0063/0065)

- `agree()`'s final branch (neither a yes nor two nos) now does two things:
  - It labels the no's `unconfirmedReading` wherever the t607 weighing refutes any of it (`refutedLabelled`):
    - wholly refuted: `Judge call N (contradicted by Core's record: <findings>): <its words>`;
    - partly refuted: `Judge call N (Core's record contradicts part of this reading: <findings>): ...`.
    - `expected` is left unlabelled, as in `refuted-no/reask.ts`.
  - It marks `contradictedUnsure` on an unsure call whose doubt the record contradicts.
- `contradictedUnsure` now covers dedupe-collapse doubts as well as paging doubts. It uses the new
  `refuted-no/dedupe-doubt.ts`. A doubt that says rows collapse or merge, or that the dedupe drops, loses or keeps
  only one of them, is contradicted when every record set counted its repeats and none was removed. That count
  comes from the new `record.duplicatesCounted` (and no build-test store removed a duplicate) together with
  `duplicatesRemoved === 0`. Core's record line names each stored row the doubt names that a condition alone left
  another copy of. The outcome carries `contradictedUnsure.about: "dedupe"`. That field is new and optional in
  `contracts.ts`; when it is absent, the doubt was about pages.
- The dedupe recheck has its own wording (`recheckWords(marked)`). `build-test/judge.ts` `doubtContradicted`
  describes a dedupe doubt in its own words. It now reads the re-ask's verdict at index 2 rather than the last
  verdict, and says "then said it does what was asked" when the re-asked doubt came back yes. Before, a yes at
  that point was reported as "still could not tell".
- Where t607 applies, the no is asked again:
  - The final branch does **not** set `refutedNo` itself. Re-asking only the no beside an unsure cannot produce two
    yeses, so it would cost a call and could not change the verdict.
  - `automationStudioResultVerificationReaskContradicted` now chains instead. After a contradicted doubt is asked
    again and answers yes, the agreement it reaches (yes beside the no) carries t607's `refutedNo`. If that no is
    wholly refuted and was not asked yet, it is asked once more through `automationStudioResultReaskRefutedNo`.
  - At most 4 calls, the same bound as the existing double-refuted re-ask (`2 * ASKS_PER_CHECK`). `calls` is the
    number of verdicts.
  - Core never turns a no into a yes. A yes still needs two judge yeses.

### R3: a left-out word belongs to the rows a condition left out (0086 `checked`)

- `request-rows/checked-rows.ts`: within a sentence, it now records where each named row is mentioned (by id or by
  label prefix) and where the first left-out word said of the run is.
- When the sentence names any row that a read condition left out, a stored row that no condition left out is
  called left out only if the left-out word comes **before** its mention.
  - The 0086 sentence ("the stored rows include <stored row> ... <two rows> were seen and only excluded by rating")
    no longer reports the stored row as misread.
  - The t474 origin (`run-muw60j7c`: "the condition alone excluded 6 rows ..., including <stored rows>") is still
    reported as misread.
- **This is narrower than the brief's wording.** The brief's rule ("a stored row named in the same sentence is not
  reported misread") would have broken the existing muw60j7c test. In that sentence the stored rows are named after
  rows the condition really left out, and the claim about them really is a misreading.
- If the word runs and the regex runs do not line up, the mention's position falls back to the end of the
  sentence. That is the conservative choice: the row is called left out, as before.

### Tests and fixture

- New fixture `request-rows/tests/potting-soil-fixture.ts`. It has the 0063-0088 shape on a garden-centre listing:
  a stored scoop, a sponsored second copy of a stored bag, two tools left out by rating, and dedupe duplicates as a
  parameter. It names no realistic scenario.
- `tests/agreement.test.ts`, new block "a no that says what a stored row is, and an unsure beside a no (t628)":
  - 0081/0082 replay: the no stands, the advice is not marked, `ask` is never called, and the outcome stays unsure.
  - The same advice is still marked when there is no record.
  - The t515 origin still marks and re-asks, and the recheck now carries the symmetric sentence.
  - 0063/0065 replay: the dedupe doubt is marked (`about: "dedupe"`, with the stored-copy line), and the refuted no's
    observed is labelled "contradicted by Core's record".
  - Chain: the doubt re-asked yes, then the no re-asked yes, gives `answers` with calls 4.
  - No chain when the re-asked doubt is still unsure.
  - Not contradicted when the dedupe removed a row.
  - Partial labelling when one of the no's reasons stands.
  - Nothing weighed without a record.
- `request-rows/tests/unstated-exclusions.test.ts`: four new cases. Not marked by a named row's kind word, including
  when the kind is said only by examples. Marked without named rows or with an unrelated row. Origin marked. Marked
  when the advice spells the row's name.
- `request-rows/tests/checked-rows.test.ts`: three new R3 cases. The 0086 shape is not misread. A left-out word
  said before a stored row is still misread. A sentence naming no conditioned row is unchanged.

## Commands run and observed results

All commands were run in `fxwork/t628/!FluxIQ/packages/fluxiq` unless noted. Nothing heavy was running beside them.

- Baseline, before edits: `npx vitest run src/programs/automation-studio/runtime/result-verification` gave
  "Test Files 76 passed (76), Tests 695 passed (695)".
- After the edits, before adding tests: the same command gave 76 files and 695 tests passed. No existing test
  changed.
- Final run:
  `npx vitest run $R/result-verification $R/service/candidate-trial $R/service/subflow-trial $R/llm/deepseek`
  (`R=src/programs/automation-studio/runtime`) gave "Test Files 112 passed (112), Tests 1016 passed (1016)". I ran it
  twice, before and after the audit fixes below, with the same result.
- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `node scripts/structure-audit.mjs` (Core root):
  - First run: 2 violations. `potting-soil-fixture.ts` had 16 exported values, and `contracts.ts` had 803 lines.
  - I reduced the fixture's exports to 13 and tightened the `contracts.ts` comment, which brought the file to 800
    lines.
  - Re-run: "structure-audit: passed (367 warning(s), 1156 baselined)".
- Each new test was checked against the original code by copying `HEAD`'s file in temporarily, then restoring it:
  - with the original `checked-rows.ts`, the new R3 test "belongs to the rows that condition left out..." failed
    (1 failed, 19 passed);
  - with the original `unstated-exclusions.ts`, the 0081 replay failed (1 failed, 35 passed).
  - Both files were restored, and the final runs above used the restored versions.
- `npx biome check <changed files>`: biome's config ignores these paths ("No files were processed"), so it did not
  apply.

## Not verified

- No live run or Lab run, as the brief says. The replays are stub-judge tests over a generic fixture, not the real
  step texts of `run-mv9a4aj0`. I did not run the weighing functions on 0065's actual text. In the fixture, the
  0065-shaped reading (one "are absent" sentence over two stored rows) is wholly refuted. The real 0065 also has an
  "s9 keeps only ValueRidge-brand" claim, which stands. That would make the real reading partly refuted: it gets the
  "contradicts part" label, and the chain does not re-ask it.
- I did not check whether the t515 origin run's actual advice contains a word of its named row's label. The origin
  shape is covered by a fixture case.
- I did not run the suites outside the four named directories (for example `flow-bootstrap/**`, which reads
  `doubtContradicted` and `unconfirmedReading`). That is left for the twice-daily sweep.
- R4 was not done.

## Open questions or contradictions found

- **R3 brief wording against an existing test.** As written in the brief, R3 would have broken the
  `run-muw60j7c` (t474) misread check. I implemented the positional rule instead (a left-out word said before the
  stored row). The supervisor should confirm that this is the intended reading.
- **R1 relies on the named row.** A no that names the wrong-kind row only in its summary, and not in its
  expected, observed or advice, still has its advice marked. The agreement only sees the judgement fields.
- **R2 chain order.** When both a contradicted doubt and a wholly refuted no are present, the doubt is asked first.
  The no is asked only if the doubt comes back yes. Re-asking only the no could never make two yeses, so I did not
  mark `refutedNo` in the final branch.

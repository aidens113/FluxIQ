# Report: fhl-core-judging

Root R = `C:/Users/osrs_/FluxStuff/!FluxIQ/packages/fluxiq/src/programs/automation-studio/runtime`. Read-only audit; no
code, git, build, test or model call. I171 / I256 = `R/llm/diagnosis-instructions.ts` line 171 (RESULT_VERIFICATION, one
20,614-char line, so I cite the sentence) and line 256 (BUILD_TEST, one line); order text :266, assembly :274-276.

## Outcome

Done. The judge is one prompt (I171, plus I256 for a build test) that asks about 20 questions in one reply. Of these,
about 12 are things Core can compute from data it already holds or from a small typed client contract (class b), about 9
are semantic (a, some mixed), and 3 are client-specific (c). Core already computes much of this, but mostly as
AFTER-the-fact overrides of a judge that was still asked the question. The cheapest cut in flips is to move the computed
facts BEFORE the call, fail on them without the judge, and ask the judge only the semantic residue.

Verified in code: every judge ask is awaited one after another (`result-verification/verify.ts:269,280,294-308`; the
`askCheck` loop at :339). The only `Promise.all` in the area is `run-outcome.ts:711` (summaries, not asks). So
concurrency of twin calls is NOT a cause of the flips.

## Judge questions table

Class: (a) semantic, (b) Core could settle from held data (contract named), (c) client-specific.

| # | Question the judge decides | Prompt | Class | Generic contract / note |
|---|---|---|---|---|
| 1 | Does each KEPT row's tested value meet the request's bound? ("compare the included cohort ... state how each tested value meets or fails") | I171, sentence "Before answering yes, compare the included cohort..." | b | Client supplies typed rows and typed column values; the task spec supplies a typed bound (op, value) per condition; Core compares. Today only LEFT-OUT rows are evaluated (`value-readings/settled-rows.ts:102`, `leftOutSettled`); kept rows get readings (`value-readings/condition-readings.ts`) but no verdict. |
| 2 | Is a left-out row excluded by the request's own words? (a yes must name the row and quote the excluding words) | I171 "Hold every row a condition alone left out ... quotes" | a for the exclusion; b for numeric, presence and text tests (already `leftOutSettled`) | Core enforces that a quote exists and runs in the request (`verdict/unquoted-line.ts`, `request-rows/unquoted-rows.ts`), not that it really excludes (the mvswh11y false pass). |
| 3 | Is the row count right ("too few records", "a count that cannot match")? | I171 "Answer diagnosis.answersRequest yes only when ... too few records ... a count" | b | `answer.rows {count, atLeast, atMost}` in the task spec; today `answer` is only `{kind:"records", columns}` (`result-verification/contracts/requested-output.ts:7`). Core compares with `totalRecordCount` or `buildTest.stores[].answer.rows`. Only "none stored" is checked now (`requested-output/missing.ts`). |
| 4 | Are the requested columns present and filled? | I171 `other` "missing columns"; I256 `buildTest.notes` | b | Columns are already typed (`answer.columns`). Core already holds `read-account/stored-columns.ts`, `emptied-columns.ts`, `request-rows/kept-without-asked-column.ts`, `rowsMissingRequired`. Make a missing or blank required column a Core defect. |
| 5 | Is a row stored twice? | I171 "Count distinct required subjects"; I256 "answer no when it would store a row twice (repeated)" | b | `processing.duplicates` and `buildTest.stores[].repeated` are Core's. Make `repeated` a Core no. |
| 6 | Is a cell the right value and in the requested shape? (`wrong_value`, `other` formatting) | I171 defects list | b for "cell not in the page's own text" and shape; a for "which value" | Client supplies typed cells plus the end-view elements they were read from; Core checks each cell is a verbatim substring of one element (the traced judges 189/190 `$0.00` vs `$7.59`, 198/199 superset text, 228/229). Format rules need a typed `format` on the part. |
| 7 | Is the sort order right? | I171 `other` ordering; `value-readings/sort-reading.ts` | b | `sortReading` records what a key read as and whether rows are in order; `value-readings/order-claim.ts` already overrides a judge that denies it. Make an out-of-order stored answer a Core finding when the spec has a sort. |
| 8 | Did a step before the read narrow the list more than the request asks ("2010 and later" vs "since 2000")? | I171 "resultSummary.reads[].narrowedBefore ..." | a | Words of a control vs words of the request. Core already measures `resultCount` before/after (`narrowed-before.ts`, `narrowing-group.ts`): after == before proves nothing was removed. Ask the judge only when the count shrank. |
| 9 | Does the Flow's set equal the set the request defines by a relation (loans, joined groups)? | I171 final third "Where the request defines its set by the person's relation..." | a | The family behind mvskodlp and mvswewhy. If the client types a per-row relation field (a sign each row shows), Core checks all kept rows carry it and no left-out row does (b). |
| 10 | Did each part with an effect change between before and after? | I171 "Judge each part with an effect by the change between before and after" | b when the part is typed | Client supplies typed before/after readings per witness place; Core computes the proof (`flow-bootstrap/trial-change/proof.ts`: shown, no_change, unproven, carried, already_in_end_state, contradicted) and overrides a yes (`site-change/held.ts`, `trial-change/contradicted.ts`, `site-change/count-differs.ts`). Gap: a part with NO typed `effect` goes to the judge "from the run alone". |
| 11 | Was anything changed that the task says to leave alone? | I171 "What the task says to leave as it is ... is met when before equals after" | b | `siteChangeFindings` `result.unasked_change` exists but is a hint to the judge; make it a hard Core no. |
| 12 | Did each act the request asks for happen, on the right thing? (`act_missing`, `act_wrong`) | I171 defects; I256 "Answer no when a clause of the instructions is done by no step" | a (clause vs step meaning); b for typed parts | Core locates a named act in the step record (`located-defects/act-located.ts`, `act-steps.ts`) but cannot decide the clause. With a typed part (`what`, `effect`) Core checks a step with that effect exists and ran. |
| 13 | Did a repeated step run on every kept row? | I256 "A repeated step acts on each row ... A step that did not pass on some rows" | b | `passes[]` with row and outcome are held; fail any pass that did not pass. |
| 14 | Is a withheld, excused, carried or `afterWithheld` step a defect? | I256 | b | Pure Core bookkeeping (`explored.landed`, `excused`, `afterWithheld`); the prompt only re-explains it. State it as a fact. |
| 15 | Working rows vs answer (`workingRows`, `keptEveryRow`, `leftOutAlsoInResult`) | I171 | b | Already flagged by Core; the judge is only told to honour the flag. State as fact, not as a question. |
| 16 | Is an empty result honest? | I171 "An empty result is judged the same way" | b | Already computed (`requested-output/honestly-empty.ts`). |
| 17 | Is the item the right kind of thing (type and content; a query match is not enough; an item sold with an excluded part is still the item)? | I171 | a | The main semantic residue. |
| 18 | What quantity does the request mean ("a numeral may describe only one component")? | I171 | a | Semantic. |
| 19 | Was a route named in the instructions followed? | I256 last sentence | a (route words); b if the client types the route | Steps' pages are held. |
| 20 | Converse: is every stored row one the request asks for in its answer? | `agreement/ask-again.ts:42` CONVERSE, :49 | a | The confirming ask; rows are listed by label only, no cells. |
| 21 | Re-asks: lone yes confirm, recheck exclusion evidence, split-no defect, contradicted unsure, refuted no | `agreement/unsupported-no.ts:195` CONFIRM_LONE_YES; `exclusion-evidence/recheck.ts:23`; `agreement/reask-split-no.ts`; `agreement/reask-contradicted.ts`; `refuted-no/reask.ts` | a, but each re-draws the same broad question | These are the flip patches; they add judge calls, not facts. |
| 22 | Home vs office address; "name included" in an address | the request, not the prompt (traced judges 170/171, 247/248) | c | The client types the target (which address id, which fields); Core compares. |
| 23 | Site words of a control ("Return button", "Join group") | I171 library example | c | Lives in the client's typed relation field and column roles. |
| 24 | Is a row the excluded kind (earbuds vs ear tips)? | I171 | c / a | Semantic over client text; Core cannot own it. |

Counts: b = rows 1, 3, 4, 5, 6 (part), 7, 10, 11, 13, 14, 15, 16. a = rows 2 (part), 8, 9, 12, 17, 18, 19, 20, 21. c = 22, 23, 24.

## Computed-first decomposition

**Step 0, before any judge call (Core only, no model).** Build a `computedFacts` block and decide a hard verdict where it
is conclusive:
1. Row count vs typed `answer.rows`; required columns present and non-blank; no repeated or duplicate row; each cell a
   verbatim substring of its source element or matching its typed format; every `where` bound evaluated on EVERY stored
   row as well as every left-out row (extend `settled-rows.ts` to kept rows); sort order if typed; every typed `effect`
   part has a proof; every `unchanged` place has before == after; every repeat pass passed; no working rows stored as the answer.
2. Any failed computed check is a Core **no** carrying a defect already located in Core's record (same shape as
   `located-defects/`, so repair gets row, column, value, request words). The judge is not needed to fail the run.
3. If all computed checks pass, ask the judge, but about the residue only.

**Step 1, narrow judge questions** (separate fields or separate small calls), with the computed facts stated as settled in
the prompt: "Core verified: 3 rows stored = 3 requested; columns A, B, C present and filled; every value is verbatim on
the page; no duplicates; the bound `at most 300` holds on all 3. Do not re-decide these."
- Q1 "Does each stored row, by its own cells, satisfy this clause of the request?" Rows listed with cells (not just
  labels), a cited cell per row.
- Q2 "Is this left-out row one the request asks for?" Only for left-out rows not settled by bound, presence or text; today's
  `unquotedRows`, made one question per row or small batch.
- Q3 "Do this control's words keep less than the request?" Only when `resultCount` shrank.
- Q4 act clauses with no typed part.
Expected size: from ~47k chars (system 24.4k + user 22.7k, fhl-step-workload) to roughly 5-10k, because the 20k-char
I171 paragraph mostly restates rules for facts Core would now state itself (my estimate, not measured).

**When computed check and judge disagree.** Facts are Core's; the judge decides only the residue.
- Computed fail, judge yes: no (Core's located defect). Today's overrides go only one way (`refuted-no/`, `site-change/held.ts`); make it symmetric.
- Computed pass, judge no with a defect Core can locate against a stored row's cells: stands as no (`located-defects/`).
- Computed pass, judge no with no located defect, or only a refuted claim: today's path (`unsupported-no`, `refuted-no`), unsure, never a no and never a yes Core made.
- Computed pass, judge unsure: unsure; "only yes passes" stays (`verdict/`).
- A task part that is fully typed (every clause computed, none semantic) could pass with no judge. Recommend as a later phase and only behind an explicit gate; until then a model yes is still required.

## Nondeterminism

**Causes.**
1. Provider side at temperature 0. Byte-identical 160,796-byte prompts (diff empty) gave yes then no in mvswewhy 0057/0059;
   also mvskodlp 0042/0043 and mvrj-c20c 0070/0071 (prompt equality not recorded there). The request is `temperature: 0`,
   thinking disabled, JSON mode, no seed, no top_p, no max_tokens (`llm/deepseek/request-body.ts:51-58`). Hosted-MoE batching
   and kernel nondeterminism are the usual cause; the repo neither controls nor measures it, and I did not probe it.
2. Not concurrency. Asks run serially (`verify.ts:269,280,339`). The 7 twin pairs in fhl-step-workload are the first ask and
   the second-ask-same-evidence; the second hits the prompt cache ($0.0003 vs $0.0014) and agreed 7 of 7. Byte-identical
   re-draws are also not independent samples.
3. Prompt size and mixed obligations: 40k-160k chars, ~20 obligations in one reply, so many near-ties. mvswewhy first asks
   0055/0056 differed by ~145 tokens and gave different confidences. Core's own build-test header records two judges
   differing by "one step number" (`build-test/judge.ts` header, murwcmx2 0032/0051).

**Options and cost** (DeepSeek flash: miss $0.15, hit $0.003, out $0.60 per M tokens; a judge call ~ $0.0003-$0.0014; judges
were 12% of the traced run's dollars).

| Option | Effect on flips | Cost |
|---|---|---|
| A. Computed first, then narrow questions | Removes the flip surface for class (b) entirely and shrinks the rest. Biggest win. | Build cost (below). Runtime: fewer and smaller judge calls (traced run: 14 judges, 4 of 7 verdicts a computable yes). |
| B. Cited answers checked by Core: a no names row id, column, actual value and request words and Core compares (this is `diagnosis.defects` + `located-defects/`, t752); extend to YES: a yes names, per stored row, the supporting cell and the request words | A hallucinated no is refused, not a coin toss; the yes path (where wrong rows slip through) becomes checkable. | One extra output field, +5-15% output tokens. |
| C. Ground a no in a located defect (keep `unsupported-no`) | A flipped no cannot fail a run alone. Residual danger is a flipped YES; guard with A and B. | Today an extra judge call per ungrounded no; fewer with A. |
| D. Majority, only for the semantic residue, only on disagreement; vary the prompt (row order shuffled, converse phrasing) so draws are not correlated | Real variance reduction for genuinely semantic questions. | +1 call on disagreement, ~$0.001. Never before computed checks. |
| E. Seed or provider knobs | No documented seed on this API; do not rely on it without a probe. | n/a |
| F. Drop the twin judge | Saves ~24 s and $0.0026 per build in the traced run but removes the only flip check today. Only after A and B. | negative |

Recommended order: A, B on yes, keep C, D last.

## How a real failure is still caught

- Computed checks only add refusals. Every Core no rests on a fact in Core's record (row count, a cell against a bound,
  before/after). No existing check is removed or relaxed. The oracle is the request's own typed bound, never inferred from
  what the Flow stored: a Flow storing 2 rows for "3 newest" fails on count.
- "Only yes passes" stays. A computed pass is not a yes unless the whole part is typed; any untyped clause still needs the
  judge's yes with its quote guard and the converse ask, so a wrongly kept semantic row (ear tips, mvswh11y) is still caught by the judge.
- Judge yes beside a computed fail: no. Judge no with a located defect: no. Judge no without one: unsure and re-asked as
  today, never turned into a pass. Nothing is forced to pass.
- Real semantic failures (wrong set, wrong act target) cannot be computed; they remain the judge's, made stable by B and D.
- Tuning ground truth is the Lab oracle after a run. Contracts are generic typed fields (rows, bounds, formats, before/after,
  relation sign), no site words.

## Risks

- Spec burden: bounds, counts, formats and effects must be typed by the supervisor. A wrong type makes Core wrongly fail or
  pass. Mitigation: each typed bound carries a verbatim request quote that Core checks runs word for word in the request
  (as `located-defects` does for `requestWords`).
- A cell-vs-page substring check can false-fail on normalised text (whitespace, currency symbols); needs a normalisation
  contract, not a tolerant match.
- Some bounds are semantic ("newest", "cheap"); leave them to the judge unless typed.
- Telling the judge "Core verified X" shifts trust; a Core bug becomes silent. Keep the facts visible in the failure record and tested.
- A seed-free provider may still flip the narrow questions; B and D remain needed.
- Teaching to the test: new prompt text keeps generic examples (library, permits) and never mirrors a scenario. The existing
  I171 library examples were already flagged for a human check in fhl-core-surface.
- Sprawl: `refuted-no/` alone has 25 files patched per incident by sentence-pattern weighing (`weigh.ts`). The computed layer
  should REPLACE that weighing where it applies, not sit beside it.

## Not verified

- The cause of the byte-identical flips (no probe; "provider side" is inferred from an empty prompt diff).
- That the traced "computable" cases pass a prototype pre-check (it is a reading of diagnoses, as fhl-step-workload also says).
- Exact line numbers inside I171 and I256 (single long lines; cited by sentence).
- Not read beyond headers or names: `build-yes-hold/*`, `completed-checks/*`, `accounting/*`, `unsettled/*`, `unsure-doubts/*`,
  `condition-observation/*`, `recovery/refuted-result/*`, `llm/verification-defects/*`; classified from other reports and sibling headers.
- Costs and call counts come from one traced build (fhl-step-workload); other builds differ. Size estimate for the narrowed prompt is mine.

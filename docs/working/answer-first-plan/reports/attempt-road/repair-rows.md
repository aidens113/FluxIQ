# Repair: a later correct read becomes the result

## Outcome

Done. The result is now what the model's latest read of a list says, in that order. Pages of one list still merge. The judge and the person read the same rows in the same order. Two things need a seam outside this lane: the card's line when a result gets smaller, and the tool description's words (below).

## The cause

Lines are at Core ee91b470a.

Every read was stored as an addition, and an addition can never move a row.

- `rows/row-sink.ts:106` always sent `writeMode: "append"`, ignoring the `writeMode: "replace"` the model had written on the read.
- `rows/row-sink.ts:61-69` (`keep`) dropped any row already seen, so a row kept the place of its first read.
- `rows/row-sink.ts:164-170` (`readBack`) did the same to the store's rows.
- Nothing held a list's identity across call shapes. `rows/dataset-of-read.ts:21` hashed the whole input, including a replay's `replay`, `from` and `produced`. So one list sat in two datasets.

The logs show this exactly:

| Step | Dataset | Rows it brought | What the judge then saw |
| --- | --- | --- | --- |
| 69 | by hand | 45, 22, 65 | |
| 75, 85, 102 | forward run | 45, 22, 65, then 95, 60, 45, 22, 65 | step 105: 45, 22, 65, 95, 60 |
| 110 | by hand | 22, 45, 60, 65, 95 | step 112: 45, 22, 65, 60, 95 |

The debug note gives 45, 22, 65, 95, 60 for both. That is the judge at step 105. Step 112 saw 60 before 95, which is step 69's rows with step 110's new ones added after.

## The rule

`rows/list-after-read.ts`. A read either carries the list on or starts it over. Taken in this order:

1. **A page the list holds, row for row in the same order:** carries on. New values replace old ones in place, and other pages stand.
2. **Another view of the site** (the address differs beyond its page words), and the model did not write `append`: over.
3. **The call or address names a page:** a page not held is the next page, whatever it repeats. A page held, with its rows moved, is over.
4. **The model wrote `replace`:** over.
5. **By rows:**
   - None known: next page.
   - All known, in another order or fewer: over (a sort or a filter).
   - Some known: next page if the read takes up where the list ended, or if under half of it is known (a feed repeating a row). Otherwise over.

The store is kept equal to the account. A read that only adds is an `append`. Anything else is a `replace` of the list's whole rows.

## How a re-read is told from a next page

All of this is evidence Core already holds, with no site words and no selector shape (`rows/read-evidence.ts`):

- **The model's own record output:** `datasetId` names the list, `writeMode` says replace or append, and `purpose: intermediate` marks a working read.
- **Page words:** plain values on the call or its parameters.
- **The address:** the read's own `url`, the answer's `location`, or the step's `from.location`. Page words split out, the rest is the view.
- **Rows** (`rows/row-ties.ts`): whole-row equality, then the column that tells this list's rows apart. A bare number or date ties nothing, the same stance as `act-record/same-row.ts` rule 2. That module ties on a share of a field's words, because its wrong tie costs a skipped press. Here a wrong tie overwrites a row, so this ties on a whole value.

## The cases

| Case | What happens |
| --- | --- |
| Re-read after a sort | New order, no doubling |
| Re-read after a filter | Rows gone from the list are gone from the result |
| Re-read after a lasting act | The new value, one row |
| Page 2 | Merges after page 1, in order, a repeated row once |
| Two pages, then page 1 sorted differently | **Over: the result is that one page.** A sort moves rows between pages, so the old page 2 has no place in the new order, and keeping it would hold rows a filter removed, with no way for the model to clear them. Starting over can always recover: reading page 2 again merges after it, and a judge says if it is short. The other way cannot. Page 1 read again unchanged keeps both pages |
| A different list on another view | Its own dataset, never mixed. The latest read's alone is the result, and going back to the first list makes that the result. The run guard in `result-dataset.ts` is unchanged |
| Two views on purpose | Same `datasetId` and `writeMode: append` merges them. Without this, a task asking for the union of two lists could never be met, which would be a new way to fail |
| Judge and person | Same rows, same order. `readBack` now also applies a run's declared `process` while the attempt is open (`rows/processed-rows.ts`). Before, a run's sort reached the person and not the judge |
| Empty or refused read, or every row refused by the schema | Changes nothing |
| `readBack` | Tested over real SQL, open and after processing |
| Witnesses, `skippedAsDone` | The sink feeds neither. The existing tests still pass (68 test files under `answer-first`) |

**What the card shows when a later read has fewer rows.** The latest read's rows, and it should also say so. `summary()` and `readBack()` now carry `fewerThanEarlier: { earlierRows }`, cleared once the list is that long again. Proposed words: "An earlier read of this list had 5 rows. This is the latest, with 3."

## Seams for the lead (not mine to touch)

1. **The card's line.** `attempt/keep.ts` `rowsOf` drops `fewerThanEarlier`, so the card does not say it yet. It needs that one field carried, and a note or contract field for the card.
2. **The tool description.** `writeMode` is described only as `append|replace` in `runtime/flow-authoring/bootstrap/plan/record-output-contract.ts:245`. Offer this there: "On a read of a list: `replace` says this read is the list as it now stands, `append` says it adds to what this name holds. Reuse the same `datasetId` for the same list."
3. **Telling the model.** `fromCall` now returns `startedOver`, and `call-chain.ts` ignores it. `round-note.ts` `rowsKept` could add the same `fewerThanEarlier`.

## What can still go wrong

- **A filter with no row in common, on an unchanged address, with no `replace` from the model:** read as a next page and mixed. The judge sees the mix. Nothing else distinguishes it.
- **A page word this does not read (`?p=2`, `/list/2`), or an address with a rotating token:** read as another view, so only the last page is the result and the judge says it is short. The model's way out is one `datasetId` with `append`. `p` is left out because on many sites it names a product (`shown-rows/read-page.ts` says the same).
- **Reads of two rows or fewer where a longer-worded column changes on every row:** rows do not tie and could double.
- **A read after a saved Flow's run, same columns, no name:** a run's batches state no address, so it can still merge with the run's rows.
- **A re-read where a value changes type against the dataset's schema** (a number becoming text): that row is refused and counted in `invalidCount`, so it leaves the result.
- **A second whole Flow run in one attempt with `append`** keeps first-seen order. The rule applies to reads, including forward runs, not to `recordBatch`.
- **Relative dates in `process`** are measured from now in `processed-rows.ts`, and from the run's start in the store.

## Open question

The model declared `process.sort` on every saved-list read, and Core ignores `process` on a by-hand read. A saved Flow's run applies it. So the same step can answer in a different order by hand and in a run. I did not build this, because the brief says the result is the read's order. It may be worth deciding: applying it would have made the first judged result correct at step 90.

## Commands run and observed results

From `packages/fluxiq`, with `--minWorkers 1 --maxWorkers 2`:

- `pnpm.cmd exec vitest run .../answer-first/rows .../answer-first/tests/attempt.test.ts .../answer-first/tests/latest-read.test.ts` -> `Test Files 8 passed (8)`, `Tests 88 passed (88)`.
- The same `latest-read.test.ts` with the rule taken out, `-t "after a sort"` -> `Tests 1 failed | 17 skipped (18)`, received Atlas, Birds, Clockmaking where the reverse was expected. Restored -> `Tests 1 passed | 17 skipped (18)`.
- `pnpm.cmd exec vitest run .../answer-first`, before the last test was added -> `Test Files 68 passed (68)`, `Tests 568 passed (568)`. Not asked for, and run to check nothing beside the rows broke.
- `pnpm.cmd --filter fluxiq check` -> exit 0.
- `node scripts/structure-audit.mjs` from the Core root -> exit 0, `structure-audit: passed (526 warning(s), 1097 baselined).` An earlier run failed on files other workers own and on my own statement packing, which I fixed.

## Not verified

- No live run, no browser, no `dist` rebuild, as the brief asked. The web answer's `read.url` and `location` were read from step 110's `result.json` and domain source. Replay answers are assumed to rely on `value.from.location`, from reading `replay-answer.ts`, not from a live replay.
- The final card of the paid run. Its logic gives 45, 22, 65, 60, 95, but the debug note says 95, 60, and I did not open the card's stored copy.
- Authored docs under `docs/` were not updated, as they are outside this brief.

// Which dataset is the result when an exploration read more than one.
//
// The rule is Core's: the result is the dataset the latest rows-storing read
// wrote to. The latest read is the one the model last chose to stand behind. A
// later page of the same list is the same dataset, so a list read in pages is
// whole, and a read of the same list again replaces what it says
// (`./list-after-read.ts`). A list is never mixed with another: each has its own
// dataset, and the latest read's alone is the result. An earlier read of
// something else (a look-up on the way) never replaces it, and a read that
// stored nothing never displaces an earlier one that did. A read the model
// marked as a working one is the result only while there is no other, and so
// is a list set aside because it lacks a condition of the result
// (`./row-sink.ts`, which leaves both out of the datasets it hands this).
//
// **A saved Flow's run is the task's own answer so far, not one read among others.** A read after
// it of something else (a look-up on the way to the next step) must not replace what the run found
// with less, so the latest read becomes the result only once it holds at least as many rows as the
// run's latest dataset. A later read of the same list is not another dataset at all
// (`./row-sink.ts`). A judge's no on the run's rows ends this (`runRowsRefused`), and the rule is
// the plain latest read again: otherwise a wrong list found by a run would outrank the short right
// one forever, and no check could ever pass.

/**
 * The id of the result dataset given the ids in the order their rows were stored (oldest first, repeats allowed), or `undefined` when none.
 * `ran` names the datasets a saved Flow's run wrote, whose rows still stand, and how many rows a dataset holds.
 */
export function automationStudioAnswerFirstResultDataset(storedInOrder: readonly string[], ran?: { ids: ReadonlySet<string>; rowsOf(datasetId: string): number }): string | undefined {
  const latest = storedInOrder.at(-1);
  if (latest === undefined || !ran || ran.ids.has(latest)) return latest;
  const runs = storedInOrder.filter((datasetId) => ran.ids.has(datasetId)).at(-1);
  return runs !== undefined && ran.rowsOf(runs) > ran.rowsOf(latest) ? runs : latest;
}

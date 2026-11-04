// Which dataset is the result when an exploration read more than one.
//
// The model never names its rows, so the rule is Core's: the result is the
// dataset the latest rows-storing read wrote to. The latest read is the one
// the model last chose to stand behind, and a later page of the same read is
// the same dataset, so a read taken in pages is whole. An earlier read of
// something else (a look-up on the way) never replaces it, and a read that
// stored nothing never displaces an earlier one that did.

/** The id of the result dataset given the ids in the order their rows were stored (oldest first, repeats allowed), or `undefined` when none. */
export function automationStudioAnswerFirstResultDataset(storedInOrder: readonly string[]): string | undefined {
  return storedInOrder.at(-1);
}

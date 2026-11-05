// Said under the rows when the latest read of the list held fewer than an earlier one did, so a
// person is told the result got smaller rather than finding it so. The rows shown are the latest
// read's all the same: it is what the list says now.


/** "An earlier read of this list had 5 rows. This is the latest, with 3."; none where the list did not get smaller. */
export function fewerWords(fewer: { earlierRows: number } | undefined, totalRows: number): string | undefined {
  if (fewer === undefined || !(fewer.earlierRows > totalRows)) return undefined;
  return `An earlier read of this list had ${fewer.earlierRows === 1 ? "1 row" : `${fewer.earlierRows} rows`}. This is the latest, with ${totalRows}.`;
}

// Said when the attempt left rows alone because its record held them done, so a person can see
// a row was left out and judge whether that was right. It says "looked", because a row the record
// could not tell from one already pressed is held too (`act-record/same-row.ts`), and it is not
// known to be done.

/** "Left out 1 that looked already done"; none for a count that is not above zero. */
export function skippedWords(count: number | undefined): string | undefined {
  if (count === undefined || !(count > 0)) return undefined;
  return `Left out ${count} that looked already done`;
}

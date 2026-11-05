// Said when the attempt left rows alone because its record held them done, so a person can see
// a row was skipped and judge whether that was right.

/** "Skipped 1 as already done" or "Skipped 2 as already done"; none for a count that is not above zero. */
export function skippedWords(count: number | undefined): string | undefined {
  if (count === undefined || !(count > 0)) return undefined;
  return `Skipped ${count} as already done`;
}

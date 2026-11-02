/** One sort key of a record set's answer as Core read it (`./value-readings/sort-reading.ts`, t511). */

export type ResultSortRead = {
  /** The stored column the key sorts by. */
  field: string;
  /** For the first key only: whether the rows shown are in the key's order as Core read it. */
  inOrder?: boolean;
  /** Core's sentence: the order, what the column was read as and on how many rows, and a few readings. */
  said: string;
};

/**
 * One thing wrong with what a run produced, as Core's own arithmetic found it.
 *
 * Coded, so a repair can act on it without reading prose, and ids only -- a
 * column id, a record set id -- because a value belongs to the person and a
 * count belongs to Core. `detail` is Core's sentence for a reader, never a
 * model's.
 */

export type ResultRepairFinding = {
  /** Core's stable code for this finding. */
  code: string;
  /** What was found, in Core's own words, bounded. */
  detail: string;
  /** The record set it is about, when it is about one. */
  datasetId?: string;
  /** The column ids it is about, bounded. Ids, never values. */
  columns?: string[];
};

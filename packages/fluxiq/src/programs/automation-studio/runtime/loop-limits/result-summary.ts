// The bounds on what one result verification may be shown of a run's result.
//
// Here for the reason `evidence-loop.ts` states beside it: two directories read
// these numbers and neither owns them. `runtime/result-verification/` applies
// them when it reduces a run's stored records to a summary, and
// `runtime/llm/harness/` applies them again at the provider, re-checking the
// slot's size before anything leaves the process. A constant both sides read is
// exactly the kind of thing that grows an import edge between them, and an edge
// in that direction would close a module cycle -- the result verification
// imports the harness's evidence screen as a value.
//
// They are ceilings, not targets. What a given call actually sends is smaller:
// a run that stored four rows sends four.
export const AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS = Object.freeze({
  /** Record sets summarized. A run that stored more says so in `withheld`. */
  maxRecordSets: 4,
  /** Sample rows per record set. */
  maxSampleRowsPerSet: 4,
  /**
   * Stored rows per record set that Core reads for its own checks -- a field
   * the record schema declares required and a row carries no value for. They
   * are counted, never sent, so this bounds a local read rather than a call:
   * one page of the run's record store, whose page size is capped at this.
   */
  maxRowsCheckedPerSet: 200,
  /** Sample rows across the whole summary. */
  maxSampleRows: 8,
  /** Columns listed per record set. */
  maxColumns: 24,
  /** Characters of any one sampled value. Longer values are cut and marked. */
  maxValueLength: 120,
  /** Steps of the Flow's own shape that are listed. */
  maxSteps: 40,
  /** The whole summary, serialized. */
  maxBytes: 4_000
});

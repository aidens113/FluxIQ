/**
 * One dataset the Flow a build proposes would write, as its test's reads
 * filled it (t274-c3). Live run `run-muw60j7c-bb7c9a62` (C-3): two reads
 * appended 20 unfiltered rows and then 10 filtered ones into one dataset, 3 of
 * them twice, and both judges of the test, told it stored nothing, said yes.
 */

export type BuildTestStore = {
  /** The dataset's id, as the Flow's record output names it. */
  dataset: string;
  /**
   * How its steps write it: `append` adds to what earlier steps stored,
   * `replace` clears it first. One word when every step that writes it says
   * the same, else each step's, in order ("append at step 6, replace at step 7").
   */
  writeMode: string;
  /** The steps that write it, by their number in `steps`, in Flow order. */
  steps: number[];
  /** How many answers of those steps' reads filled it in this test: one per pass of a repeated read, so one per page a loop read. */
  passes: number;
  /** The rows those reads returned in this test, every page's, rows a read did not list included, less any a later `replace` clears: what the run collects before its end makes the answer. */
  collected: number;
  /**
   * What the Flow would store: the collected rows made into the answer as a
   * run's end makes it (read-list design 5.1; `processAutomationStudioRecordRows`):
   * each row once (the whole row is its identity unless the read names a
   * dedupe key), then the read's own sort and limit. `rows` counts them;
   * `labels` names them in answer order, screened as a read's `readRows` are; a
   * row a read did not list counts and has no label.
   */
  answer: { rows: number; labels: string[] };
  /**
   * The collected rows the answer leaves out: repeats of an earlier row,
   * rows a condition over stored columns left out, rows past the limit.
   * Absent when the test could not make the answer -- its reads named their
   * rows by label only, and labels alone cannot tell two rows apart -- and
   * then `answer` is the collected rows as they came.
   */
  removed?: { duplicates: number; filteredOut: number; cut: number };
  /** True when the reads collected rows and the answer keeps none of them. */
  keptNone?: true;
  /** The labels that occur more than once in `answer.labels`, each once, in the order first seen. Absent when none does. */
  repeated?: string[];
};

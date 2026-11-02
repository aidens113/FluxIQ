/**
 * One `where` condition of a record set's processing, as the judge is shown it
 * (`processing-account.ts`, t493): its wording, its counts, and the rows it
 * alone left out, each by its label, screened as stored rows are -- the shape
 * of a list read's condition (`AutomationStudioResultReadAccount.conditions`).
 * Wording and rows are absent where no denied-keys declaration was made.
 * `testedLabel` is Core's own bookkeeping, as on a read's condition: the
 * condition tested the column every row it names is labelled by, so
 * `request-rows/` may flag them. No model is shown it
 * (`read-account/without-tested-label.ts`).
 */

export type ResultProcessingCondition = {
  /** Its place in `process.where`, counting from 1 (header); absent only on a condition built by hand. */
  number?: number;
  condition?: string;
  rejected: number;
  alone: number;
  leftOutOnlyByThis?: string[];
  testedLabel?: true;
  /** How Core read the tested value on a few rows the answer kept (`./value-readings/`, t511). */
  valuesRead?: string[];
};

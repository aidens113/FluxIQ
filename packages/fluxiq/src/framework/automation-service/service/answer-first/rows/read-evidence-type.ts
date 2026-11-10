import type { AutomationStudioFlowLessReadLeftOut } from "../../../../../runtime/result-verification/index.ts";

/** What a read says of itself (`./read-evidence.ts`). */
export type AutomationStudioAnswerFirstReadEvidence = {
  /** The name the model gave this list. */
  named?: string;
  /** Whether the model said this read replaces what the list held, or adds to it. */
  says?: "append" | "replace";
  /** The model marked it a working read, for a loop or a sum, never the answer. */
  lookUp: boolean;
  /** The address it read, without what only turns the page. */
  list?: string;
  /** Where in the list it read, where the call or the address says so. */
  place?: string;
  /** The `process` the model declared on its record output, as written: not yet read against a schema. */
  process?: unknown;
  /** What its own conditions left out, as its answer said it (`./read-evidence.ts`): what the judge is told of the page it read. */
  leftOut?: AutomationStudioFlowLessReadLeftOut;
};

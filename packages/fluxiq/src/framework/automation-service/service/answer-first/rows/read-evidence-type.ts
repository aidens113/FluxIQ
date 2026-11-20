import type { AutomationStudioFlowLessReadLeftOut } from "../../../../../runtime/result-verification/index.ts";

/** What a read says of itself (`./read-evidence.ts`). */
export type AutomationStudioAnswerFirstReadEvidence = {
  /** The address it read, without what only turns the page. */
  list?: string;
  /** What its own conditions left out, as its answer said it (`./read-evidence.ts`): what the judge is told of the page it read. */
  leftOut?: AutomationStudioFlowLessReadLeftOut;
};

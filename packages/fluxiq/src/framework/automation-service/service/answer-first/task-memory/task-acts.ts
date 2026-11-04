import type { AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";

/**
 * The act record of the task's latest attempt that wrote one. A Flow holds one record, its latest
 * attempt's, so another task on that Flow replaces it, and this is what still says what this task
 * pressed. Written through on every write of the record (`../attempt/run-attempt.ts`).
 */
export type AutomationStudioAnswerFirstTaskActs = {
  attemptId: string;
  flowId: string;
  data: AutomationStudioAttemptActRecordData;
};

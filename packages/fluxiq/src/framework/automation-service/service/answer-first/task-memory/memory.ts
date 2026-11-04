import type { AutomationStudioAnswerFirstAttemptProvenance } from "./provenance.ts";
import type { AutomationStudioAnswerFirstSavedFlow } from "./saved-flow.ts";
import type { AutomationStudioAnswerFirstTaskNote } from "./task-note.ts";

/** Everything kept for one task. */
export type AutomationStudioAnswerFirstTaskMemory = {
  taskId: string;
  /** The Flow the task lives under, latest. */
  flowId: string;
  best?: AutomationStudioAnswerFirstSavedFlow;
  latest?: AutomationStudioAnswerFirstSavedFlow;
  /** Newest last, the last 10. */
  notes: AutomationStudioAnswerFirstTaskNote[];
  /** Newest last, the last 100. */
  attempts: AutomationStudioAnswerFirstAttemptProvenance[];
};

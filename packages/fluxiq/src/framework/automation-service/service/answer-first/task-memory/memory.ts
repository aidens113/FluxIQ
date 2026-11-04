import type { AutomationStudioAnswerFirstAttemptProvenance } from "./provenance.ts";
import type { AutomationStudioAnswerFirstSavedFlow } from "./saved-flow.ts";
import type { AutomationStudioAnswerFirstTaskActs } from "./task-acts.ts";
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
  /** What the task's latest attempt that acted has done on the site, whatever has run on its Flow since. */
  acts?: AutomationStudioAnswerFirstTaskActs;
};

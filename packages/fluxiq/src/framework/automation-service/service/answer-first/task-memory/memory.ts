import type { AutomationStudioAnswerFirstFlowBase } from "./flow-base.ts";
import type { AutomationStudioAnswerFirstAttemptProvenance } from "./provenance.ts";
import type { AutomationStudioAnswerFirstSavedFlow } from "./saved-flow.ts";
import type { AutomationStudioAnswerFirstTaskActs } from "./task-acts.ts";
import type { AutomationStudioAnswerFirstTaskNote } from "./task-note.ts";

/** Everything kept for one task. */
export type AutomationStudioAnswerFirstTaskMemory = {
  taskId: string;
  /** The person's own name for the task, set by renaming it. Absent: the task is told by its Flow's name. */
  title?: string;
  /**
   * How human this task's runs act, 0-100: set through `update-task-settings`, or the person's starting value as the
   * task's first attempt was asked (`../attempt/run-attempt.ts`). Absent: the Flow's level or the starting value decides
   * (`resolveHumanness`). A stored 0 is a level like any other.
   */
  humanness?: number;
  /** The Flow the task lives under, latest. */
  flowId: string;
  /** Where the task starts, as it was asked: part of what it is (`../task-key/`), and what a person's Run again starts it from, since a press names no page. */
  startLocation?: string;
  best?: AutomationStudioAnswerFirstSavedFlow;
  latest?: AutomationStudioAnswerFirstSavedFlow;
  /** Newest last, the last 10. */
  notes: AutomationStudioAnswerFirstTaskNote[];
  /** Newest last, the last 100. */
  attempts: AutomationStudioAnswerFirstAttemptProvenance[];
  /** What the task's latest attempt that acted has done on the site, whatever has run on its Flow since. */
  acts?: AutomationStudioAnswerFirstTaskActs;
  /** Each Flow this task saved under, newest last, the last 20: what its steps were last known against (`./flow-base.ts`). */
  flowBases?: AutomationStudioAnswerFirstFlowBase[];
};

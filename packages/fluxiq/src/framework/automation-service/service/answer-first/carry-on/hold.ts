// What a press of "add budget and carry on" holds while the generation path runs (design, "Carry
// on"). `service.ts` and the generation path do not change, so the attempt is handed over through
// an `AsyncLocalStorage` scope around them: the ceiling reads it before the purse opens
// (`../attempt/ceiling.ts`), and the attempt's opening reads it to go on as the same attempt.
//
// **`opened` says the attempt took it.** Until then the ceiling reads it, and a press whose run
// never gets as far as an attempt puts the row back as it was.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioAnswerFirstAttemptRecord } from "../attempt-store/index.ts";
import type { AutomationStudioAnswerFirstTaskMemory } from "../task-memory/index.ts";

export type AutomationStudioAnswerFirstCarryOnHold = {
  projectId: string;
  flowId: string;
  taskId: string;
  attemptId: string;
  /** The attempt's row as the press found it. */
  before: AutomationStudioAnswerFirstAttemptRecord;
  /** What the task kept, as the press read it. */
  kept: AutomationStudioAnswerFirstTaskMemory | undefined;
  /** The attempt's own act record: the same record goes on. */
  acts: AutomationStudioAttemptActRecordData | undefined;
  /** The purse this segment asks for: what was left, and what was added. */
  askedUsd: number;
  /** The row's budget from now on: the old one, and what was added. */
  budgetUsd: number;
  opened: boolean;
};

export const automationStudioAnswerFirstCarryOnScope = new AsyncLocalStorage<AutomationStudioAnswerFirstCarryOnHold>();

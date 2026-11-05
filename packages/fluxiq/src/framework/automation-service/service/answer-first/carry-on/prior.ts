import type { AutomationStudioTaskAttemptPath, AutomationStudioTaskAttemptSpend } from "@fluxiq/contracts/automation";
import type { AutomationStudioAnswerFirstStepOrigin } from "../task-memory/index.ts";

/** What a carried-on attempt had when the person pressed (`./carried-opening.ts`): what its row reports is this and what it does from here. */
export type AutomationStudioAnswerFirstAttemptPrior = {
  spend: AutomationStudioTaskAttemptSpend;
  /** The row's budget from the press on. */
  budgetUsd: number;
  /** The purse the press asked for, which the host's total may hold lower. */
  askedUsd: number;
  /** How it had gone at the task. */
  path: AutomationStudioTaskAttemptPath;
  liveSteps: number;
  /** Each step as the task remembers it, from the attempt's last ending. */
  origins: readonly AutomationStudioAnswerFirstStepOrigin[];
  /** The rows it had already left out as done: the record counts only what this segment leaves out, and a person's card must not forget them. */
  skippedAsDone: number;
  /** Lasting acts the attempt had that could not be tied to a row (`actsWithNoRow`). */
  actsWithNoRow: number;
  /** The Flow it started from did not do the task on the site as it stood. */
  flowFailedLive: boolean;
};

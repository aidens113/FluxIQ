import type { AutomationStudioExplorationNoProgressReason } from "./reason.ts";

export type AutomationStudioExplorationProgressVerdict =
  | { advanced: true }
  | {
    advanced: false;
    reason: AutomationStudioExplorationNoProgressReason;
    /** True once the streak has reached the limit: the loop should stop. */
    stalled: boolean;
  };

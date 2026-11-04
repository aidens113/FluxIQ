import type { AutomationStudioAnswerFirstStepOrigin } from "./step-origin.ts";

/** Which route an attempt took, what it started from, and where each of its steps came from. */
export type AutomationStudioAnswerFirstAttemptProvenance = {
  attemptId: string;
  flowId: string;
  ordinal: number;
  route: "build" | "use" | "repair";
  startedFrom?: { attemptId: string; flowId: string; stepsDigest: string; steps: number; notes: number; provenWhole: boolean };
  steps: AutomationStudioAnswerFirstStepOrigin[];
};

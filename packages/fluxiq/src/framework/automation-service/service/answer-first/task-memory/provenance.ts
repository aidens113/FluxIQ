import type { AutomationStudioAnswerFirstStepOrigin } from "./step-origin.ts";

/** Which route an attempt took, what it started from, and where each of its steps came from. */
export type AutomationStudioAnswerFirstAttemptProvenance = {
  attemptId: string;
  flowId: string;
  ordinal: number;
  route: "build" | "use" | "repair";
  /** A person pressed Run again (`../run-again/`). A carry-on of it reads this: it was asked for again all the same. */
  askedAgain?: true;
  startedFrom?: { attemptId: string; flowId: string; stepsDigest: string; steps: number; notes: number; provenWhole: boolean };
  steps: AutomationStudioAnswerFirstStepOrigin[];
};

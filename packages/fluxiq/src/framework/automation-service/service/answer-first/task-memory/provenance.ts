import type { AutomationStudioAnswerFirstKeptCallerOptions } from "../../flow-bootstrap-commands/index.ts";
import type { AutomationStudioAnswerFirstStepOrigin } from "./step-origin.ts";

/** Which route an attempt took, what it started from, and where each of its steps came from. */
export type AutomationStudioAnswerFirstAttemptProvenance = {
  attemptId: string;
  flowId: string;
  ordinal: number;
  route: "build" | "use" | "repair";
  /** A person pressed Run again (`../run-again/`). A carry-on of it reads this: it was asked for again all the same. */
  askedAgain?: true;
  /** Its latest ending was a person's Stop. A carry-on that ends otherwise writes its row again without it. Run again reads it (`../run-again/run-again.ts`). */
  stoppedByPerson?: true;
  startedFrom?: { attemptId: string; flowId: string; stepsDigest: string; steps: number; notes: number; provenWhole: boolean };
  /** The options a caller drove it with, as far as they can be written down: what a person's press goes on under (`../caller/held.ts`). Absent on a chat attempt. */
  caller?: AutomationStudioAnswerFirstKeptCallerOptions;
  steps: AutomationStudioAnswerFirstStepOrigin[];
};

import { emitAutomationStudioActivityAskResolved } from "./ask/index.ts";
import { emitAutomationStudioActivityClearedWait } from "./ask/index.ts";
import { emitAutomationStudioActivityStep } from "./step/index.ts";
import { emitAutomationStudioActivityStepInterference } from "./step/index.ts";
import { emitAutomationStudioActivityStepReacquire } from "./step/index.ts";
import { emitAutomationStudioActivityStepRecovering } from "./step/index.ts";
import { emitAutomationStudioActivityStepRecovery } from "./step/index.ts";
import { emitAutomationStudioActivityStepSkipped } from "./step/index.ts";
import { emitAutomationStudioActivityThought } from "./thought.ts";
import { emitAutomationStudioActivityWaitingOnAsk } from "./ask/index.ts";
import { automationStudioActivityAction } from "./wording/index.ts";
import { automationStudioActivityHumanLabel } from "./wording/index.ts";
import { automationStudioActivityReasonText } from "./wording/index.ts";
import { automationStudioActivityAskResolution } from "./ask/index.ts";
import { automationStudioActivityRecoveryChoice } from "./wording/index.ts";
import { automationStudioActivityLoopWords } from "./loop/index.ts";
import { automationStudioActivityHold } from "./hold.ts";

/** Studio supplies words and cards; the kernel owns execution and scoped dispatch. */
export function automationStudioRuntimePresentation(operation: string, args: readonly unknown[]): unknown {
  const methods = { emitAutomationStudioActivityAskResolved, emitAutomationStudioActivityClearedWait, emitAutomationStudioActivityStep, emitAutomationStudioActivityStepInterference, emitAutomationStudioActivityStepReacquire, emitAutomationStudioActivityStepRecovering, emitAutomationStudioActivityStepRecovery, emitAutomationStudioActivityStepSkipped, emitAutomationStudioActivityThought, emitAutomationStudioActivityWaitingOnAsk, automationStudioActivityAction, automationStudioActivityHumanLabel, automationStudioActivityReasonText, automationStudioActivityAskResolution, automationStudioActivityRecoveryChoice, automationStudioActivityLoopWords, automationStudioActivityHold };
  if (!Object.prototype.hasOwnProperty.call(methods, operation)) return undefined;
  const method = methods[operation as keyof typeof methods];
  return Reflect.apply(method, undefined, args);
}

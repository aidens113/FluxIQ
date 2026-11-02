import { automationStudioSkippedStepDoesAct as skippedStepDoesAct } from "../../../../../engine/automation/step-skip/index.ts";
import { automationStudioClassifyLegacyStepAct } from "../compatibility/index.ts";

/** Legacy Studio documents retain their host interpretation through composition. */
export function automationStudioSkippedStepDoesAct(...args: Parameters<typeof skippedStepDoesAct>): boolean {
  const classifier = args[2] ?? automationStudioClassifyLegacyStepAct;
  return args[1] === undefined ? classifier?.(args[0]) ?? false : skippedStepDoesAct(args[0], args[1], classifier);
}

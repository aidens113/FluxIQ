import { resumeAutomationStudioGraph as resumeExecutableGraph } from "../../../../engine/automation/index.ts";
import { automationStudioClassifyLegacyStepAct } from "./compatibility/index.ts";
export type { AutomationStudioResumeOutcome, AutomationStudioRunResumption } from "../../../../engine/automation/index.ts";

export async function resumeAutomationStudioGraph(...args: Parameters<typeof resumeExecutableGraph>): ReturnType<typeof resumeExecutableGraph> {
  const [request, onExecutedTrace] = args;
  const options = request.options ?? {};
  return resumeExecutableGraph({ ...request, options: { ...options, classifyLegacyStepAct: options.classifyLegacyStepAct ?? automationStudioClassifyLegacyStepAct } }, onExecutedTrace);
}

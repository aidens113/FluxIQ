import { runAutomationStudioGraph as runExecutableGraph, resumeAutomationStudioGraphRun as resumeExecutableGraph } from "../../../../engine/automation/index.ts";
import { automationStudioClassifyLegacyStepAct } from "./compatibility/index.ts";
import { copyAutomationExecutionOptions } from "../../../../engine/automation/execution-admission/index.ts";
export type { AutomationStudioGraphRunSeed } from "../../../../engine/automation/index.ts";

export async function runAutomationStudioGraph(...args: Parameters<typeof runExecutableGraph>): ReturnType<typeof runExecutableGraph> {
  const [flow, options = {}, onExecutedTrace] = args;
  return runExecutableGraph(flow, copyAutomationExecutionOptions(copyAutomationExecutionOptions(options), { classifyLegacyStepAct: options.classifyLegacyStepAct ?? automationStudioClassifyLegacyStepAct }), onExecutedTrace);
}

export async function resumeAutomationStudioGraphRun(...args: Parameters<typeof resumeExecutableGraph>): ReturnType<typeof resumeExecutableGraph> {
  const [flow, options, seed, onExecutedTrace] = args;
  return resumeExecutableGraph(flow, copyAutomationExecutionOptions(copyAutomationExecutionOptions(options), { classifyLegacyStepAct: options.classifyLegacyStepAct ?? automationStudioClassifyLegacyStepAct }), seed, onExecutedTrace);
}

import { assertAutomationStudioCompiledPlan, compiledPlanToExecutableGraph, type AutomationStudioCompiledPlan } from "../../../flows/executable/compiled-plan/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { runAutomationStudioGraph } from "../graph-run.ts";

export function runAutomationStudioCompiledPlan(plan: AutomationStudioCompiledPlan, options: AutomationStudioGraphExecutionOptions = {}): Promise<AutomationStudioGraphExecutionTrace> {
  assertAutomationStudioCompiledPlan(plan);
  const startNodeId = options.startNodeId ?? plan.startNodeId ?? undefined;
  return runAutomationStudioGraph(compiledPlanToExecutableGraph(plan), startNodeId ? { ...options, startNodeId } : options);
}

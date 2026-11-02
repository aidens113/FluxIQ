import { assertAutomationStudioCompiledPlan, compiledPlanToExecutableGraph, type AutomationStudioCompiledPlan } from "../../../flows/executable/compiled-plan/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { runAutomationStudioGraph } from "../graph-run.ts";
import { copyAutomationExecutionOptions } from "../execution-admission/index.ts";

export function runAutomationStudioCompiledPlan(plan: AutomationStudioCompiledPlan, options: AutomationStudioGraphExecutionOptions = {}): Promise<AutomationStudioGraphExecutionTrace> {
  assertAutomationStudioCompiledPlan(plan);
  const startNodeId = options.startNodeId ?? plan.startNodeId ?? undefined;
  const placed = startNodeId ? copyAutomationExecutionOptions(options, { startNodeId }) : options;
  return runAutomationStudioGraph(compiledPlanToExecutableGraph(plan), placed);
}

import { compiledPlanToExecutableGraph, type AutomationStudioCompiledPlan } from "../../../flows/executable/compiled-plan/index.ts";
import { runAutomationStudioCompiledPlan as runExecutablePlan } from "../../../engine/automation/compiled-plan/index.ts";
import type { AutomationStudioFlowDocument } from "../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../../engine/automation/index.ts";
import { automationStudioClassifyLegacyStepAct } from "./executor/compatibility/index.ts";

export { AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION, AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION, compileAutomationStudioPlan, assertAutomationStudioCompiledPlan } from "../../../flows/executable/compiled-plan/index.ts";
export type { AutomationStudioCompiledPlanInstruction, AutomationStudioCompiledPlanNode, AutomationStudioCompiledPlanEdge, AutomationStudioCompiledPlan, CompileAutomationStudioPlanInput } from "../../../flows/executable/compiled-plan/index.ts";

/** The legacy Studio envelope around an independently executable compiled graph. */
export function compiledPlanToFlowDocument(plan: AutomationStudioCompiledPlan): AutomationStudioFlowDocument {
  const graph = compiledPlanToExecutableGraph(plan);
  return { schemaVersion: "0.1", flowId: graph.flowId, ownerKind: "policy", ownerId: graph.ownerId, name: plan.flowId, nodes: graph.nodes, edges: graph.edges, createdAt: plan.compiledAt, updatedAt: plan.compiledAt, metadata: graph.metadata };
}

/** Supplies the interpretation used by pre-contract Studio documents. */
export function runAutomationStudioCompiledPlan(plan: AutomationStudioCompiledPlan, options: AutomationStudioGraphExecutionOptions = {}): Promise<AutomationStudioGraphExecutionTrace> {
  return runExecutablePlan(plan, { ...options, classifyLegacyStepAct: options.classifyLegacyStepAct ?? automationStudioClassifyLegacyStepAct });
}

import type { AutomationStudioFlowBootstrapPlan } from "./plan.ts";
import type { AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapRisk } from "../index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "./subflow.ts";

export type AutomationStudioValidatedFlowBootstrapPlan = {
  plan: AutomationStudioFlowBootstrapPlan;
  risk: AutomationStudioFlowBootstrapRisk;
  subflows: Array<Omit<AutomationStudioFlowBootstrapSubflow, "nodes"> & {
    nodes: Array<AutomationStudioFlowBootstrapNode & { position: { x: number; y: number } }>;
  }>;
};

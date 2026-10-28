import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapNode } from "../plan/index.ts";
import type { AutomationStudioSiteResetTrialStep } from "../site-reset/index.ts";

/** The lasting steps a trial or entry preparation will run, in execution declaration order. */
export function automationStudioSiteResetTrialSteps(subflows: readonly { nodes: readonly AutomationStudioFlowBootstrapNode[] }[]): AutomationStudioSiteResetTrialStep[] {
  return subflows.flatMap((subflow) => subflow.nodes).map((node, index) => {
    const step: AutomationStudioSiteResetTrialStep = { step: index + 1, consequences: (node.consequences ?? []) as AutomationStudioActionConsequence[] };
    if (node.label !== undefined) step.label = node.label;
    if (node.resetWitness !== undefined) step.witness = node.resetWitness;
    return step;
  });
}

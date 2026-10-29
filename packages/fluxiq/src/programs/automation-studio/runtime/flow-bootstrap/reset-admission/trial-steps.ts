import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapNode } from "../plan/index.ts";
import type { AutomationStudioSiteResetTrialStep } from "../site-reset/index.ts";

/**
 * The lasting steps a trial or entry preparation will run, in execution declaration order. Each carries its node's definition
 * and `<subflow>.<node>` key, by which the step door's note of the tab it acts in is found (t791 fix 2).
 */
export function automationStudioSiteResetTrialSteps(subflows: readonly { key?: string; nodes: readonly AutomationStudioFlowBootstrapNode[] }[]): AutomationStudioSiteResetTrialStep[] {
  return subflows.flatMap((subflow) => subflow.nodes.map((node) => ({ node, subflowKey: subflow.key }))).map(({ node, subflowKey }, index) => {
    const step: AutomationStudioSiteResetTrialStep = { step: index + 1, consequences: (node.consequences ?? []) as AutomationStudioActionConsequence[], definitionId: node.definitionId };
    if (subflowKey !== undefined) step.ref = `${subflowKey}.${node.key}`;
    if (node.label !== undefined) step.label = node.label;
    if (node.resetWitness !== undefined) step.witness = node.resetWitness;
    return step;
  });
}

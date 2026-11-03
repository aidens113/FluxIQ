// The steps of a live trial as its readings need them (t775 D1): each plan
// node in run order across the trial's subflows, numbered as the trial door
// numbers them (`../reset-admission/trial-steps.ts`), with its registered
// definition, its lasting classes, its node's witness stamp unread, and the
// task parts the subflow it belongs to serves (`partsOf`, by subflow key;
// none where a build has no task parts, or for a subflow that only prepares
// the trial's entry), and (t796) its plan key, which its graph node carries as
// `bootstrapSymbolicKey`, so a step the trial's act ledger names by its graph
// node is matched to it (`./part-acting.ts`). Pure.

import type { AutomationStudioFlowBootstrapNode } from "../plan/index.ts";
import type { AutomationStudioTrialChangeStep } from "./contracts.ts";

/** The trial's steps (header). */
export function automationStudioTrialChangeSteps(subflows: readonly { key?: string; nodes: readonly AutomationStudioFlowBootstrapNode[] }[], partsOf: (subflowKey: string | undefined) => readonly string[] = () => []): AutomationStudioTrialChangeStep[] {
  let step = 0;
  return subflows.flatMap((subflow) => subflow.nodes.map((node) => {
    step += 1;
    const entry: AutomationStudioTrialChangeStep = { step, definitionId: node.definitionId, consequences: [...(node.consequences ?? [])], parts: [...partsOf(subflow.key)] };
    if (node.label !== undefined) entry.label = node.label;
    if (node.resetWitness !== undefined) entry.witness = node.resetWitness;
    if (node.key) entry.key = node.key;
    return entry;
  }));
}

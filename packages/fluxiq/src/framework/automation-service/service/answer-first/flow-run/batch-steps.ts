// Which draft step each record batch of a saved Flow's run is a page of (lane t905): the batch names the graph node that
// captured it, the graph names the plan node it was compiled from (`bootstrapSymbolicKey`, as `./steps-ran.ts` reads
// it), and the assembly's locator names the draft step that plan node stands for (`./step-of-node.ts`). Worked out once
// the run has ended, when its graph is known; a batch whose node stands for no draft step has none.
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstStepOfNode } from "./step-of-node.ts";
import type { AutomationStudioAnswerFirstFlowRunEnded } from "./steps-ran.ts";

const SYMBOLIC_KEY = "bootstrapSymbolicKey";

export function automationStudioAnswerFirstFlowRunBatchSteps(
  input: { buildPlan: AutomationStudioFlowBuildPlan; locator: AutomationStudioFlowBootstrapIssueLocator | undefined; saved: readonly AutomationStudioFlowDraftStep[]; graph: AutomationStudioAnswerFirstFlowRunEnded["graph"] },
  batches: readonly AutomationStudioRecordBatch[],
): { batch: AutomationStudioRecordBatch; step: AutomationStudioFlowDraftStep | undefined }[] {
  const keyOf = new Map((input.graph?.nodes ?? []).flatMap((node) => {
    const key = node.metadata?.[SYMBOLIC_KEY];
    return typeof key === "string" ? [[node.id, key] as const] : [];
  }));
  const stepOf = new Map<string, AutomationStudioFlowDraftStep>();
  for (const [subflowIndex, subflow] of input.buildPlan.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const found = automationStudioAnswerFirstStepOfNode(input.locator, input.saved, subflowIndex, nodeIndex);
      if (found) stepOf.set(node.key, found.step);
    }
  }
  return batches.map((batch) => {
    const key = keyOf.get(batch.nodeId);
    return { batch, step: key === undefined ? undefined : stepOf.get(key) };
  });
}

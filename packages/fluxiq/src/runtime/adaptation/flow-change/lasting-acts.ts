// Whether a pass may have done something lasting, so that running the Flow again
// from its start would do it a second time.
//
// The run's completed-act ledger lives in one graph run's holder, so a re-run from
// the start cannot skip what the first pass completed, and it must not be started
// where a lasting act may have landed (user rule, 2026-10-07: a lasting act is
// checked, never blindly repeated).
//
// **Stated, not guessed from the verb.** `automationStudioNodeActLasts` reads a
// verb's floor, and every press floors at `commit` because a press's effect is the
// page's to decide: that answers whether a lost acknowledgement may be retried,
// and it would refuse a re-run of every Flow that presses anything, a build's own
// whole-Flow test included. What a repeat would really do is what the step said
// it does: a consequence it declared, its explicit lasting marks
// (`automationStudioNodeExplicitLastingRisk`), or a permission consequence the
// domain's effect names. An outcome the run itself read as uncertain always counts.

import { automationStudioNodeExplicitLastingRisk, type AutomationStudioGraphExecutionOptions, type AutomationStudioNodeAttemptTrace } from "../../../framework/automation-service/executor/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../flows/authoring/model/index.ts";

/** Every `builtin.` node is Core's own, and a lasting one says so on the node. */
const CORE_DEFINITION_PREFIX = "builtin.";

/**
 * Whether any of `attempts` may have done something lasting. A nested attempt
 * whose graph cannot be read counts: not knowing is not a no.
 */
export async function automationStudioAttemptsMayHaveActedLastingly(input: {
  flow: Pick<AutomationStudioFlowDocument, "nodes">;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  resolveActionEffect?: AutomationStudioGraphExecutionOptions["resolveActionEffect"];
  subflowGraphs?: AutomationStudioGraphExecutionOptions["subflowGraphs"];
}): Promise<boolean> {
  for (const attempt of input.attempts) {
    // A step skipped as absent or already done acted on nothing in this attempt.
    if (attempt.skipped) continue;
    if (attempt.fault?.actUncertain === true || attempt.effectCheck?.result === "unknown") return true;
    const node = input.flow.nodes.find((candidate) => candidate.id === attempt.nodeId);
    if (node ? nodeStatesLastingAct(node, input.resolveActionEffect) : !attempt.definitionId.startsWith(CORE_DEFINITION_PREFIX)) return true;
    const nested = attempt.childTrace?.attempts;
    if (!nested?.length) continue;
    const subflowId = attempt.subflowTarget?.subflowId;
    const called = subflowId ? await input.subflowGraphs?.load(subflowId) : undefined;
    if (!called) return true;
    if (await automationStudioAttemptsMayHaveActedLastingly({ ...input, flow: called.graph, attempts: nested })) return true;
  }
  return false;
}

function nodeStatesLastingAct(node: AutomationStudioFlowNode, resolveActionEffect: AutomationStudioGraphExecutionOptions["resolveActionEffect"]): boolean {
  if (automationStudioNodeExplicitLastingRisk(node)) return true;
  return (resolveActionEffect?.(node)?.permissionConsequences?.length ?? 0) > 0;
}

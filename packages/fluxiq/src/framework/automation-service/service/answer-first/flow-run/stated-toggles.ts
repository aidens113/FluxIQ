// Which saved steps act on a control their attempt saw flip, and the state each should check for
// before it presses (t869, the lead's call on a Flow Core cannot tell is a toggle: the bias is
// against repeating).
//
// A candidate gets this at submit, from the model's explicit choice of state
// (`runtime/flow-authoring/bootstrap/script-statements/toggle/idempotent.ts`). An answer-first draft
// has no submit and asks nobody, and the state is known: the attempt did what the person asked, and
// the state to keep is the one its latest press of that control left. So this reads the same
// observations through the same tie (`automationStudioExploredToggleTie`), whatever the step declared,
// since a plain press that flipped its own control flips it back just the same.
//
// Observations that disagree, a node that cannot take `ensureState`, and a step the model already gave
// a state are left as they are. Nothing here refuses anything: a step with no state is pressed as the
// Flow says, and the act record is what holds it then.
//
// Worked out at the ending, while the attempt's handles still mean what they meant, and kept by step
// (`../task-memory/stated-toggle.ts`), since a later attempt's `t7` may be any control.

import { automationStudioToggleStateChoice } from "../../../toggle-state/index.ts";
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioExploredToggleTie, type AutomationStudioExploredToggle } from "../../../../../runtime/flow-authoring/bootstrap/script-statements/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioPlanControlState } from "../../../../../runtime/llm/harness-options/index.ts";
import type { AutomationStudioAnswerFirstStatedToggle } from "../task-memory/index.ts";
import { automationStudioAnswerFirstStepOfNode } from "./step-of-node.ts";

const ENSURE_STATE = "ensureState";

export function automationStudioAnswerFirstStatedToggles(input: {
  buildPlan: AutomationStudioFlowBuildPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
  handleViews?: readonly { node: string; handle: string; control?: AutomationStudioPlanControlState | undefined }[] | undefined;
  explored: readonly AutomationStudioExploredToggle[];
  saved: readonly AutomationStudioFlowDraftStep[];
  takesEnsureState: (definitionId: string) => boolean;
}): AutomationStudioAnswerFirstStatedToggle[] {
  const { plan } = input.buildPlan;
  const stated: AutomationStudioAnswerFirstStatedToggle[] = [];
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const step = automationStudioAnswerFirstStepOfNode(input.locator, input.saved, subflowIndex, nodeIndex);
      if (!step || !input.takesEnsureState(node.definitionId) || (node.parameters !== undefined && ENSURE_STATE in node.parameters)) continue;
      const ref = `${subflow.key}.${node.key}`;
      const views = (input.handleViews ?? []).filter((view) => view.node === ref);
      const others = plan.subflows.flatMap((each) => each.nodes.filter((other) => other !== node));
      const presses = automationStudioExploredToggleTie({ node: node.definitionId, handles: new Set(views.map((view) => view.handle)), target: node.parameters?.target, step: { ref, parameters: node.parameters, others } }, input.explored);
      const latest = presses.at(-1);
      if (!latest) continue;
      const choice = automationStudioToggleStateChoice({ parameters: { [ENSURE_STATE]: latest.signature }, explored: presses, controls: views.map((view) => view.control) });
      if (choice.kind === "selected") stated.push({ step: step.key, ensureState: choice.signature });
    }
  }
  return stated;
}

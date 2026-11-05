// A Flow with the states its steps check for written in: the draft an attempt saves, and a later
// attempt's run of the saved steps (`./stated-toggles.ts`). It is laid out again, because what a run
// really runs is the parts and not the plan, as a candidate's is
// (`runtime/flow-authoring/bootstrap/candidate/submission/submission.ts`, `relaid`). A plan the check
// will not take stays as it was, said in the step log: the state is a care taken, and a task does not
// stop for it.

import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapIssueLocator, type AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioLlmStepLogNote } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../attempt/index.ts";
import type { AutomationStudioAnswerFirstStatedToggle } from "../task-memory/index.ts";
import { automationStudioAnswerFirstStepOfNode } from "./step-of-node.ts";

type Registry = Pick<AutomationStudioAnswerFirstAttemptInput, "registry" | "resolution"> & { size?: AutomationStudioAnswerFirstAttemptInput["size"] };

export function automationStudioAnswerFirstStampedPlan(input: Registry, buildPlan: AutomationStudioFlowBuildPlan, locator: AutomationStudioFlowBootstrapIssueLocator | undefined, saved: readonly AutomationStudioFlowDraftStep[], stated: readonly AutomationStudioAnswerFirstStatedToggle[] | undefined): AutomationStudioFlowBuildPlan {
  if (!stated?.length) return buildPlan;
  const states = new Map(stated.map((each) => [each.step, each.ensureState]));
  const plan = structuredClone(buildPlan.plan);
  let changed = false;
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const step = automationStudioAnswerFirstStepOfNode(locator, saved, subflowIndex, nodeIndex);
      const state = step ? states.get(step.key) : undefined;
      if (!state) continue;
      node.parameters = { ...node.parameters, ensureState: structuredClone(state) };
      changed = true;
    }
  }
  if (!changed) return buildPlan;
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan, registry: input.registry, resolution: input.resolution, ...(input.size ? { size: input.size } : {}) });
  if (!validation.ok || !validation.validated) {
    automationStudioLlmStepLogNote(`A saved step's checked state could not be written in, so it stays a plain press: ${validation.issues.map((issue) => issue.code).join(", ") || "no code given"}`);
    return buildPlan;
  }
  return { ...buildPlan, plan: validation.validated.plan, risk: validation.validated.risk, subflows: validation.validated.subflows };
}

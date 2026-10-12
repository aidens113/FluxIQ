// Which parameters of a plan built from a draft the model wrote itself (t432).
//
// A plan assembled from the build's draft is the host's writing: each step is
// written with what it ran with, which the domain resolved from the handle the
// model named (`../node-tools/draft-step.ts`). One part of it is not. An
// `amend_draft` decision may carry `settings` onto a step -- a wait condition,
// an expected state, any parameter of the node -- and they are written over
// the parameters the step ran with, each replacing its parameter whole
// (`../../flow-draft/amendment/`). Those are the model's own words, and the
// model names an element only by the handle the page view printed (user,
// 2026-10-10). So the parameters an amendment wrote are named per node, and
// resolution hands them to the domain to judge as it judges a plan the model
// wrote (`./plan-parameter-resolution.ts`, `modelWrittenParameters`), leaving
// the rest of the step as it ran.

import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepId } from "../../flow-draft/index.ts";

/**
 * The parameters each node's draft step had amended onto it, by
 * `<subflow key>.<node key>`; a node with no amended settings is absent.
 * `draftStepIdByNodeKey` is the assembler's account of which draft step each
 * node was written from.
 */
export function automationStudioAmendedPlanParameters(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  steps: readonly AutomationStudioFlowDraftStep[];
  draftStepIdByNodeKey: Readonly<Record<string, string>>;
}): Map<string, string[]> {
  const amended = new Map<string, string[]>();
  const subflow = input.plan.subflows[0];
  if (!subflow) return amended;
  const byId = new Map(input.steps.map((step) => [automationStudioFlowDraftStepId(step), step] as const));
  for (const [key, stepId] of Object.entries(input.draftStepIdByNodeKey)) {
    const settings = byId.get(stepId)?.settings;
    if (settings && Object.keys(settings).length) amended.set(`${subflow.key}.${key}`, Object.keys(settings));
  }
  return amended;
}

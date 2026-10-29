// What a submission says of its steps that have no witness (t791 fix 2). A reversible lasting step is stamped with the
// place its change shows when it is resolved at submission (`../action-permissions.ts`, `planStep`); with none, its trial
// still runs, judged by its end view and done-when checks, and the submission that Core accepts says so now, not after
// the trial: each such step, by label, with how to give it a place or that no call in its own tab can. Advice, never a
// refusal. Pure over what the permission check noted.

import type { AutomationStudioPlanStepGaps } from "./step-gaps.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";

/** The most steps named, and the most of a label quoted. */
const NAMED_CAP = 5;
const LABEL_CAP = 80;

/** One advice line per step of `plan` that the check noted as having no witness (header), in plan order. */
export function automationStudioCandidateUnwitnessedAdvice(plan: AutomationStudioFlowBootstrapPlan, permissionFor: unknown): string[] {
  const gaps = (permissionFor as AutomationStudioPlanStepGaps | undefined)?.gaps?.();
  if (!gaps?.size) return [];
  const said: string[] = [];
  let step = 0;
  for (const subflow of plan.subflows) {
    for (const node of subflow.nodes) {
      step += 1;
      const gap = gaps.get(`${subflow.key}.${node.key}`);
      if (!gap || said.length >= NAMED_CAP) continue;
      const label = node.label;
      const name = label ? `${JSON.stringify(label.length > LABEL_CAP ? `${label.slice(0, LABEL_CAP - 1)}…` : label)} (plan step ${step})` : `plan step ${step}`;
      said.push(`The step ${name} changes something on the site and has no place named that shows its change. ${gap.instruction}`);
    }
  }
  return said;
}

// Whether a step the run passed over does a lasting act, so passing it over
// left that act not done (r4b F4).
//
// An optional step whose control is not shown is skipped as a success
// (`./absent-step.ts`): right for a popup, a banner or a consent prompt, which
// do nothing the person asked for. Wrong, silently, for a step that collects,
// adds, saves, sends or moves something: R4a's Flow carried the coupon the
// instruction asked it to collect on an optional step, and had its control
// been missing the run would have read `succeeded` with the coupon never
// collected. Authoring now refuses an optional step that does a requested act
// on both paths (`../../flow-bootstrap/instructed-acts/optional-act-steps.ts`,
// `step-fault.ts`); this is the run's own guard, for a Flow saved before that.
//
// A trusted client floor decides what the step does, independent of its
// label. Explicit authored risk may raise it; safe model claims cannot lower
// it. Old clients without a floor retain their control-before-label word
// classifier. Its answer is a compatibility annotation, never safety proof.
// The run says the act was not done, never that it failed: whether it was
// requested is the judge's question, which has the instruction.
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { readAutomationStudioResolvedActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import { automationStudioNodeExplicitLastingRisk } from "../defensive/index.ts";
import { automationStudioInstructedActWordsNameLastingAct } from "../../flow-bootstrap/instructed-acts/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";

/** Whether passing over this node leaves a lasting act it does not done (header). */
export function automationStudioSkippedStepDoesAct(
  node: Pick<AutomationStudioFlowNode, "label" | "parameterValues" | "metadata">,
  actionEffect?: AutomationStudioResolvedActionEffect
): boolean {
  const resolved = actionEffect === undefined ? undefined : readAutomationStudioResolvedActionEffect(actionEffect);
  if (resolved) return resolved.effectClass === "commit" || automationStudioNodeExplicitLastingRisk(node);
  const control = automationStudioModelFacingControlWords(node.parameterValues);
  const words = control ?? node.label?.trim();
  return words !== undefined && words !== "" && automationStudioInstructedActWordsNameLastingAct(words);
}

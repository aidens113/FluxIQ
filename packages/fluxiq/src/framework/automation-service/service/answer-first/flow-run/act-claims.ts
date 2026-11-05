// Which steps of a saved Flow claim a lasting act the person asked for (t869): what tells a press
// that does the person's act from a plain one, where its step declared no consequence.
//
// **The claim is the step's own word, and the person's words say what kind of act it is.** A model
// names which step does an act (`step.acts`, `runtime/flow-authoring/draft/act-claim.ts`), and Core
// read the acts from the instruction (`automationStudioInstructedActs`). So a step claiming "save
// these" lasts, and one claiming "narrow to five miles" does not: setting and opening are read from
// the page itself, and are sent again, as the build's first test sends them
// (`AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS`). A choice of an act (`a1.colour`) is no act.
//
// The plan key is what a Flow's node carries (`metadata.bootstrapSymbolicKey`), which the run gate reads.

import { AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS, automationStudioInstructedActs, type AutomationStudioFlowBootstrapIssueLocator, type AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";

/** The plan keys of the nodes whose draft step claims a lasting act of the instruction (header). */
export function automationStudioAnswerFirstFlowRunActClaims(input: {
  buildPlan: AutomationStudioFlowBuildPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
  saved: readonly AutomationStudioFlowDraftStep[];
  instructionText: string | undefined;
}): ReadonlySet<string> {
  const lasting = new Set(automationStudioInstructedActs(input.instructionText ?? "").filter((act) => AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS.includes(act.kind)).map((act) => act.id));
  const claimed = new Set<string>();
  if (lasting.size === 0) return claimed;
  const claims = (step: AutomationStudioFlowDraftStep | undefined) => step?.acts?.some((act) => lasting.has(act.trim().toLowerCase())) === true;
  for (const [subflowIndex, subflow] of input.buildPlan.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const place = input.locator?.nodes[`${subflowIndex}.${nodeIndex}`];
      if (place?.draftStep === undefined) continue;
      const step = input.saved.find((each) => (place.draftStepId !== undefined ? each.id === place.draftStepId : each.position === place.draftStep));
      if (claims(step)) claimed.add(node.key);
    }
  }
  return claimed;
}

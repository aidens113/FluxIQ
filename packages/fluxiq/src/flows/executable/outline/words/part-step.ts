// A node read the way a saved part's card reads its steps, and said the way
// the card says them: the same two helpers, not a copy of them. The card
// reads a recorded step as the output it dispatches with its payload for
// parameters (`runtime/project-parts/card/steps.ts`), and words it as the
// build's label when that reads as plain words, otherwise the plain name of
// what the step is (`framework/automation-service/service/project-parts/step-words.ts`).
import type { ProjectPartStep } from "../../../../api-contracts/automation/index.ts";
import { projectPartStepOf } from "../../../../framework/automation-service/service/project-parts/index.ts";
import { automationStudioPartSteps, type AutomationStudioPartStep } from "../../../../runtime/project-parts/card/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";

/** One node as a part step, its card words, and its label only when that reads as plain words. */
export type OutlinePartStep = { step: AutomationStudioPartStep; said: ProjectPartStep; plainLabel?: string };

/** The node read and said as a saved part's card reads and says its steps. */
export function outlinePartStepOf(node: AutomationStudioFlowNode): OutlinePartStep {
  const step = automationStudioPartSteps({ nodes: [node], edges: [] })[0]!;
  const said = projectPartStepOf({ ...step, isCall: false }, undefined);
  if (node.label === undefined) return { step, said };
  const { label: _label, ...unlabelled } = node;
  const plainName = projectPartStepOf({ ...step, node: unlabelled, isCall: false }, undefined).label;
  return said.label === plainName ? { step, said } : { step, said, plainLabel: said.label };
}

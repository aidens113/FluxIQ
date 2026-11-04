// Whether a step of a saved part does something lasting, and what. Read from both
// places it is stated, as a retry decides it (`engine/automation/defensive/lasting-act.ts`):
// what the step declared, and the trusted floor its definition resolves to. Either may
// raise it; neither lowers the other.
import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, type AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../../components/automation/control-flow/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../../components/automation/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, automationStudioNodeExplicitLastingRisk } from "../../../../../engine/automation/defensive/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";

export type ProjectPartStepClasses = { lasting: boolean; classes: AutomationStudioAttemptActClass[] };

/**
 * A call is not itself the step: what it calls runs through the same check, frame by
 * frame, so a call is looked inside rather than judged from its outside.
 */
export function projectPartStepClasses(node: AutomationStudioFlowNode, floor: AutomationStudioResolvedActionEffect | undefined): ProjectPartStepClasses {
  if (node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID) return { lasting: false, classes: [] };
  const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  const named = new Set<unknown>([...(Array.isArray(declared) ? declared : []), ...(floor?.permissionConsequences ?? [])]);
  const classes = AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((each) => named.has(each));
  return { lasting: classes.length > 0 || named.size > 0 || automationStudioNodeExplicitLastingRisk(node) || floor?.effectClass === "commit", classes };
}

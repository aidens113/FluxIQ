// A step that declared it has no lasting consequence (`consequences: none`,
// stored as `declaredConsequences: []` by the build, `./lasting-act.ts`) is
// safe to dispatch again: the author said nothing it does outlasts it. That
// declaration answers the question a producer's "the act may have been made"
// raises, so a timed-out press of a dismiss control is retried rather than
// refused as an uncertain lasting act (recovery matrix row 9, t404). A node
// that mutates by its own definition keeps its rule whatever the step declared.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "./lasting-act.ts";
import { automationStudioNodeMutates } from "./node-side-effect.ts";

/** Whether the step explicitly declared that nothing it does lasts. */
export function automationStudioNodeDeclaresNoLastingAct(node: AutomationStudioFlowNode): boolean {
  const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  return Array.isArray(declared) && declared.length === 0 && !automationStudioNodeMutates(node);
}

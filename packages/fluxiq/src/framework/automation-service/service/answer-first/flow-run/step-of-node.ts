// A plan node's draft step, found as `./permission.ts` and `./act-claims.ts` find one, and the key it is
// known by across attempts: its id, or its position where it has none.

import type { AutomationStudioFlowBootstrapIssueLocator } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";

export function automationStudioAnswerFirstStepOfNode(locator: AutomationStudioFlowBootstrapIssueLocator | undefined, saved: readonly AutomationStudioFlowDraftStep[], subflowIndex: number, nodeIndex: number): { step: AutomationStudioFlowDraftStep; key: string } | undefined {
  const place = locator?.nodes[`${subflowIndex}.${nodeIndex}`];
  if (place === undefined || (place.draftStep === undefined && place.draftStepId === undefined)) return undefined;
  const step = saved.find((each) => (place.draftStepId !== undefined ? each.id === place.draftStepId : each.position === place.draftStep));
  return step ? { step, key: step.id ?? `#${step.position}` } : undefined;
}

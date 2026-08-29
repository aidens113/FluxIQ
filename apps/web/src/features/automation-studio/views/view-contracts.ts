import {
  automationStudioViewDefinitionsList,
  type AutomationStudioViewId
} from "./canonical-view-definitions";
import type {
  AutomationViewDataIntensity,
  AutomationViewFunctionalityContract,
  AutomationViewScope
} from "./view-definition-types";

export type { AutomationViewDataIntensity, AutomationViewFunctionalityContract as AutomationViewContract, AutomationViewScope };

export const automationViewContracts = Object.freeze(Object.fromEntries(
  automationStudioViewDefinitionsList.map((definition) => [definition.id, definition.functionality])
)) as Readonly<Record<AutomationStudioViewId, AutomationViewFunctionalityContract<AutomationStudioViewId>>>;

export function automationViewContract(id: AutomationStudioViewId): AutomationViewFunctionalityContract<AutomationStudioViewId> {
  return automationViewContracts[id];
}
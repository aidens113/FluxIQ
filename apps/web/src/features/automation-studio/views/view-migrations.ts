import {
  automationStudioViewDefinitionsList,
  type AutomationStudioViewId
} from "./canonical-view-definitions";
import {
  automationStudioAdaptationsViewId,
  isRetiredAutomationStudioViewId,
  retiredAutomationStudioViewIds,
  retiredAutomationStudioViewReplacementValue,
  type RetiredAutomationStudioViewId
} from "./retired-view-migrations";

export { automationStudioAdaptationsViewId, isRetiredAutomationStudioViewId, retiredAutomationStudioViewIds };
export type { RetiredAutomationStudioViewId };

export type AutomationStudioViewMigrationContext = { hasFlow: boolean };

let automationStudioViewAliasCache: ReadonlyMap<string, AutomationStudioViewId> | null = null;

function automationStudioViewAliases(): ReadonlyMap<string, AutomationStudioViewId> {
  automationStudioViewAliasCache ??= new Map(automationStudioViewDefinitionsList.flatMap((definition) =>
    definition.aliases.map((alias) => [alias, definition.id] as const)
  ));
  return automationStudioViewAliasCache;
}

export function canonicalAutomationStudioViewId(
  value: string,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): string {
  const retired = isRetiredAutomationStudioViewId(value)
    ? retiredAutomationStudioViewReplacementValue(value)
    : undefined;
  if (retired) return context.hasFlow ? retired : value;
  return automationStudioViewAliases().get(value) ?? value;
}

export function retiredAutomationStudioViewReplacement(
  value: RetiredAutomationStudioViewId
): AutomationStudioViewId {
  return retiredAutomationStudioViewReplacementValue(value) as AutomationStudioViewId;
}
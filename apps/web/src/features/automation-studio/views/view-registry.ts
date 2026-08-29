import {
  automationStudioViewDefinitionsList,
  automationStudioViewId,
  automationStudioViewIds,
  automationStudioViews,
  type AutomationStudioViewDefinition,
  type AutomationStudioViewId,
  type AutomationStudioViewKey
} from "./canonical-view-definitions";
import type {
  AutomationStudioViewAvailability,
  AutomationStudioViewGroup,
  AutomationStudioViewRegion,
  AutomationStudioViewRequirement
} from "./view-definition-types";
import {
  canonicalAutomationStudioViewId,
  isRetiredAutomationStudioViewId,
  retiredAutomationStudioViewIds,
  retiredAutomationStudioViewReplacement,
  type AutomationStudioViewMigrationContext,
  type RetiredAutomationStudioViewId
} from "./view-migrations";

export {
  automationStudioViewId,
  automationStudioViewIds,
  automationStudioViews,
  canonicalAutomationStudioViewId,
  isRetiredAutomationStudioViewId,
  retiredAutomationStudioViewIds,
  type AutomationStudioViewAvailability,
  type AutomationStudioViewDefinition,
  type AutomationStudioViewGroup,
  type AutomationStudioViewId,
  type AutomationStudioViewKey,
  type AutomationStudioViewMigrationContext,
  type AutomationStudioViewRegion,
  type AutomationStudioViewRequirement,
  type RetiredAutomationStudioViewId
};

export type AutomationStudioViewResolution =
  | { status: "known"; id: AutomationStudioViewId; definition: AutomationStudioViewDefinition; migratedFrom: string | null }
  | { status: "retired"; id: RetiredAutomationStudioViewId; replacementId: AutomationStudioViewId }
  | { status: "unknown"; id: string };

let automationStudioViewRegistryCache: ReadonlyMap<AutomationStudioViewId, AutomationStudioViewDefinition> | null = null;

function automationStudioViewRegistry(): ReadonlyMap<AutomationStudioViewId, AutomationStudioViewDefinition> {
  automationStudioViewRegistryCache ??= new Map(
    automationStudioViewDefinitionsList.map((definition) => [definition.id, definition])
  );
  return automationStudioViewRegistryCache;
}

export function isAutomationStudioViewId(value: string): value is AutomationStudioViewId {
  return automationStudioViewRegistry().has(value as AutomationStudioViewId);
}

export function resolveAutomationStudioView(
  value: string,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): AutomationStudioViewResolution {
  if (isRetiredAutomationStudioViewId(value) && !context.hasFlow) {
    return { status: "retired", id: value, replacementId: retiredAutomationStudioViewReplacement(value) };
  }
  const canonical = canonicalAutomationStudioViewId(value, context);
  if (!isAutomationStudioViewId(canonical)) return { status: "unknown", id: value };
  return {
    status: "known",
    id: canonical,
    definition: automationStudioViewRegistry().get(canonical)!,
    migratedFrom: canonical === value ? null : value
  };
}

export function automationStudioViewDefinition(
  value: string,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): AutomationStudioViewDefinition | null {
  const resolution = resolveAutomationStudioView(value, context);
  return resolution.status === "known" ? resolution.definition : null;
}

export function automationStudioViewDefinitions(): readonly AutomationStudioViewDefinition[] {
  return automationStudioViewDefinitionsList;
}

export function automationStudioViewAvailable(value: string, context: AutomationStudioViewAvailability): boolean {
  return automationStudioViewDefinition(value, context)?.isAvailable(context) ?? false;
}

export function migrateAutomationStudioViewState(
  value: string,
  state: Readonly<Record<string, unknown>>,
  fromVersion: number,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): { id: AutomationStudioViewId; schemaVersion: number; state: Record<string, unknown> } | null {
  const definition = automationStudioViewDefinition(value, context);
  if (!definition) return null;
  const cache = definition.cache as {
    schemaVersion: number;
    migrateSavedState?: (saved: Readonly<Record<string, unknown>>, version: number) => Record<string, unknown>;
  };
  const migrated = fromVersion === cache.schemaVersion
    ? { ...state }
    : cache.migrateSavedState?.(state, fromVersion) ?? {};
  return { id: definition.id, schemaVersion: cache.schemaVersion, state: migrated };
}
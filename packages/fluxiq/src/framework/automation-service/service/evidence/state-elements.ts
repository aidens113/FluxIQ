import type {
  StateElementDescriptor,
  StateElementKind,
  StateSnapshot,
  StateValue,
  RecordingDomainDefinition
} from "../../../../flows/authoring/model/index.ts";
import type { NormalizedTimeline } from "../../../../runtime/recording/normalization/index.ts";
import type { AutomationStudioStateElementKindReader } from "../../nodes/index.ts";
import { formatStatePath } from "./text.ts";

// What a recorded state path means: which paths a domain declares, what kind
// of element a value looks like when the domain declares nothing, whether it
// is worth correlating at all, and how to rank the ones that are.
//
// A domain's own words for a path come from its implementation bundle
// (`stateElementKindReader`), asked first. Core keeps the words any domain's
// state uses. Nothing here screens anything: a kind ranks a path, so a domain
// with no reader only ranks its own words as Core's neutral ones.

/** The recording domains a timeline belongs to: the ones it names, or every one when it names none. */
function domainsOfTimeline(timeline: NormalizedTimeline, domains: readonly RecordingDomainDefinition[]): RecordingDomainDefinition[] {
  const domainIds = new Set<string>([
    ...(typeof timeline.metadata?.domainId === "string" ? [timeline.metadata.domainId] : []),
    ...timeline.timeline.map((entry) => typeof entry.metadata?.domainId === "string" ? entry.metadata.domainId : "").filter(Boolean)
  ]);
  return domains.filter((domain) => !domainIds.size || domainIds.has(domain.domainId));
}

/** The first reader the timeline's domains supply. */
export function stateElementKindReaderForTimeline(timeline: NormalizedTimeline, domains: readonly RecordingDomainDefinition[], readerOf: (domainId: string) => AutomationStudioStateElementKindReader | undefined): AutomationStudioStateElementKindReader | undefined {
  for (const domain of domainsOfTimeline(timeline, domains)) {
    const reader = readerOf(domain.domainId);
    if (reader) return reader;
  }
  return undefined;
}

export function stateElementDescriptorsForTimeline(timeline: NormalizedTimeline, domains: RecordingDomainDefinition[], readKind?: AutomationStudioStateElementKindReader): Map<string, StateElementDescriptor> {
  const descriptors = new Map<string, StateElementDescriptor>();
  for (const domain of domainsOfTimeline(timeline, domains)) {
    for (const pathDefinition of domain.statePaths ?? []) {
      const statePath = formatStatePath(pathDefinition.namespace, pathDefinition.path);
      descriptors.set(statePath, {
        namespace: pathDefinition.namespace,
        path: pathDefinition.path,
        kind: pathDefinition.elementKind ?? inferStateElementKind(pathDefinition.path, pathDefinition.type, readKind),
        ...(pathDefinition.label !== undefined ? { label: pathDefinition.label } : {}),
        ...(pathDefinition.description !== undefined ? { description: pathDefinition.description } : {}),
        ...(pathDefinition.entityId !== undefined ? { entityId: pathDefinition.entityId } : {}),
        ...(pathDefinition.entityKind !== undefined ? { entityKind: pathDefinition.entityKind } : {}),
        ...(pathDefinition.stableAcrossSessions !== undefined ? { stableAcrossSessions: pathDefinition.stableAcrossSessions } : {}),
        ...(pathDefinition.sensitive !== undefined ? { sensitive: pathDefinition.sensitive } : {}),
        ...(pathDefinition.metadata !== undefined ? { metadata: pathDefinition.metadata } : {})
      });
    }
  }
  return descriptors;
}

export function stateValuesFromSnapshot(snapshot: StateSnapshot): Array<[string, StateValue]> {
  return Object.entries(snapshot.namespaces).flatMap(([namespace, stateNamespace]) =>
    Object.entries(stateNamespace.values).map(([pathValue, stateValue]) => [formatStatePath(namespace, pathValue), stateValue] as [string, StateValue])
  );
}

export function prioritizedStateValuesForAction(snapshot: StateSnapshot, descriptors: Map<string, StateElementDescriptor>, limit: number, readKind?: AutomationStudioStateElementKindReader): Array<[string, StateValue]> {
  return stateValuesFromSnapshot(snapshot)
    .filter(([statePath, stateValue]) => isValuableStateElement(statePath, stateValue, descriptors, readKind))
    .map(([statePath, stateValue]) => ({ statePath, stateValue, score: stateElementPriority(statePath, stateValue, descriptors, readKind) }))
    .sort((left, right) => right.score - left.score || left.statePath.localeCompare(right.statePath))
    .slice(0, limit)
    .map((item) => [item.statePath, item.stateValue]);
}

export function stateElementPriority(statePath: string, stateValue: StateValue, descriptors: Map<string, StateElementDescriptor>, readKind?: AutomationStudioStateElementKindReader): number {
  const descriptor = descriptorForStateValue(statePath, stateValue, descriptors, readKind);
  let score = descriptors.has(statePath) ? 50 : 0;
  if (descriptor.stableAcrossSessions) score += 20;
  if (descriptor.entityId) score += 12;
  if (descriptor.kind === "static_id" || descriptor.kind === "selector") score += 18;
  if (descriptor.kind === "text" || descriptor.kind === "label") score += 14;
  if (descriptor.kind === "status" || descriptor.kind === "enabled" || descriptor.kind === "visibility") score += 10;
  if (descriptor.kind === "count") score += 4;
  if (stateValue.value === true) score += 4;
  if (typeof stateValue.value === "string" && stateValue.value.trim()) score += 3;
  return score;
}

export function descriptorForStateValue(statePath: string, stateValue: StateValue, descriptors: Map<string, StateElementDescriptor>, readKind?: AutomationStudioStateElementKindReader): StateElementDescriptor {
  const existing = descriptors.get(statePath);
  if (existing) return existing;
  const [namespace, ...pathParts] = statePath.split(".");
  const pathValue = pathParts.join(".");
  return {
    namespace: namespace || "custom",
    path: pathValue,
    kind: typeof stateValue.metadata?.elementKind === "string" ? stateValue.metadata.elementKind as StateElementKind : inferStateElementKind(pathValue, stateValue.type, readKind),
    ...(typeof stateValue.semanticRole === "string" ? { description: stateValue.semanticRole } : {}),
    ...(typeof stateValue.metadata?.label === "string" ? { label: stateValue.metadata.label } : {}),
    ...(typeof stateValue.metadata?.entityId === "string" ? { entityId: stateValue.metadata.entityId } : {}),
    ...(typeof stateValue.metadata?.entityKind === "string" ? { entityKind: stateValue.metadata.entityKind } : {}),
    ...(typeof stateValue.metadata?.stableAcrossSessions === "boolean" ? { stableAcrossSessions: stateValue.metadata.stableAcrossSessions } : {}),
    ...(stateValue.sensitive !== undefined ? { sensitive: stateValue.sensitive } : {})
  };
}

export function isValuableStateElement(statePath: string, stateValue: StateValue, descriptors: Map<string, StateElementDescriptor>, readKind?: AutomationStudioStateElementKindReader): boolean {
  if (stateValue.sensitive || stateValue.comparable === false) return false;
  const descriptor = descriptorForStateValue(statePath, stateValue, descriptors, readKind);
  if (descriptor.kind === "unknown" || descriptor.kind === "position" || descriptor.kind === "bounds") return false;
  const normalizedPath = statePath.toLowerCase();
  if (normalizedPath.includes("mouse") || normalizedPath.includes("cursor") || normalizedPath.includes("hover")) return false;
  return true;
}

export function inferStateElementKind(pathValue: string, type: StateValue["type"], readKind?: AutomationStudioStateElementKindReader): StateElementKind {
  const read = readKind?.(pathValue, type);
  if (read !== undefined) return read;
  const normalized = pathValue.toLowerCase();
  if (normalized.endsWith("id") || normalized.includes(".id")) return "static_id";
  if (normalized.includes("internal")) return "internal_id";
  if (normalized.includes("label")) return "label";
  if (normalized.includes("text") || normalized.includes("title") || normalized.includes("message")) return "text";
  if (normalized.includes("status") || normalized.includes("state")) return "status";
  if (normalized.includes("route")) return "route";
  if (normalized.includes("url") || normalized.includes("href")) return "url";
  if (normalized.includes("visible") || normalized.includes("visibility")) return "visibility";
  if (normalized.includes("enabled") || normalized.includes("disabled")) return "enabled";
  if (normalized.includes("count") || normalized.includes("total") || normalized.includes("quantity")) return "count";
  if (type === "point") return "position";
  if (type === "rectangle") return "bounds";
  if (type === "entity_ref" || type === "entity_ref_list") return "internal_id";
  if (type === "json") return "json";
  if (type === "string") return "text";
  if (type === "number" || type === "integer") return "count";
  if (type === "boolean") return "visibility";
  return "unknown";
}

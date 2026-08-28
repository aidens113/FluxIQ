import type { AutomationHierarchyNode } from "../hierarchy/model";

export type AutomationStudioFlowEntry = {
  source?: string;
  readOnly?: boolean;
  flow?: any;
};

export type FlowObjectKind = "recording" | "instruction" | "adaptation" | "runtime-object" | "subflow";

export type SubflowCategory = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
};

export type LocalMutation<TState> = {
  previous: TState;
  next: TState;
  restore: () => TState;
};

export function localMutation<TState>(previous: TState, next: TState): LocalMutation<TState> {
  return { previous, next, restore: () => previous };
}

export function applyFlowCreate(
  current: AutomationStudioFlowEntry[],
  incoming: AutomationStudioFlowEntry | any
): LocalMutation<AutomationStudioFlowEntry[]> {
  return localMutation(current, upsertFlowEntry(current, normalizeFlowEntry(incoming)));
}

export function applyFlowDelete(current: AutomationStudioFlowEntry[], flowIds: string | string[]): LocalMutation<AutomationStudioFlowEntry[]> {
  const ids = new Set(asArray(flowIds));
  const next = current.filter((entry) => {
    const flow = entry?.flow;
    const flowId = stringValue(flow?.flowId);
    if (!flowId) return true;
    if (ids.has(flowId)) return false;
    const parentFlowId = stringValue(flow?.metadata?.parentFlowId);
    return !parentFlowId || !ids.has(parentFlowId);
  });
  return localMutation(current, next);
}

export function applyFlowRename(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  name: string,
  options: { description?: string; updatedAt?: number } = {}
): LocalMutation<AutomationStudioFlowEntry[]> {
  const next = current.map((entry) => entry?.flow?.flowId === flowId
    ? { ...entry, flow: { ...entry.flow, name, ...(options.description !== undefined ? { description: options.description } : {}), ...(options.updatedAt !== undefined ? { updatedAt: options.updatedAt } : {}) } }
    : entry);
  return localMutation(current, next);
}

export function applyCustomFolderCreate(
  current: AutomationHierarchyNode[],
  folder: AutomationHierarchyNode
): LocalMutation<AutomationHierarchyNode[]> {
  return localMutation(current, upsertById(current, folder, (item) => item.id));
}

export function applyCustomFolderRename(
  current: AutomationHierarchyNode[],
  folderId: string,
  label: string
): LocalMutation<AutomationHierarchyNode[]> {
  return localMutation(current, current.map((node) => node.id === folderId ? { ...node, label } : node));
}

export function applyCustomFolderMove(
  current: AutomationHierarchyNode[],
  folderId: string,
  parentId: string | null
): LocalMutation<AutomationHierarchyNode[]> {
  return localMutation(current, current.map((node) => node.id === folderId ? { ...node, parentId } : node));
}

export function applyCustomFolderDelete(current: AutomationHierarchyNode[], folderId: string): LocalMutation<AutomationHierarchyNode[]> {
  const deleting = collectDescendantIds(current, folderId);
  deleting.add(folderId);
  return localMutation(current, current.filter((node) => !deleting.has(node.id)));
}

export function applySubflowCategoryCreate(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  category: SubflowCategory
): LocalMutation<AutomationStudioFlowEntry[]> {
  return localMutation(current, updateFlow(current, flowId, (flow) => ({
    ...flow,
    metadata: {
      ...(flow.metadata ?? {}),
      subflowCategories: upsertById(normalizeSubflowCategories(flow.metadata?.subflowCategories), normalizeSubflowCategory(category), (item) => item.id)
    }
  })));
}

export function applySubflowCategoryRename(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  categoryId: string,
  name: string,
  updatedAt?: number
): LocalMutation<AutomationStudioFlowEntry[]> {
  return localMutation(current, updateFlowCategories(current, flowId, (categories) => categories.map((category) => category.id === categoryId
    ? { ...category, name, ...(updatedAt !== undefined ? { updatedAt } : {}) }
    : category)));
}

export function applySubflowCategoryMove(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  categoryId: string,
  parentId: string | null,
  updatedAt?: number
): LocalMutation<AutomationStudioFlowEntry[]> {
  return localMutation(current, updateFlowCategories(current, flowId, (categories) => categories.map((category) => category.id === categoryId
    ? { ...category, parentId, ...(updatedAt !== undefined ? { updatedAt } : {}) }
    : category)));
}

export function applySubflowCategoryDelete(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  categoryId: string
): LocalMutation<AutomationStudioFlowEntry[]> {
  return localMutation(current, updateFlow(current, flowId, (flow) => {
    const categories = normalizeSubflowCategories(flow.metadata?.subflowCategories);
    const deleting = collectSubflowCategoryDescendantIds(categories, categoryId);
    deleting.add(categoryId);
    return {
      ...flow,
      expansion: {
        ...(flow.expansion ?? {}),
        subflowIds: stripDeletedSubflowCategoryFromSubflows(flow.expansion?.subflowIds, deleting)
      },
      metadata: {
        ...(flow.metadata ?? {}),
        hierarchySubflows: stripDeletedSubflowCategoryFromSubflows(flow.metadata?.hierarchySubflows, deleting),
        subflowCategories: categories.filter((category) => !deleting.has(category.id))
      }
    };
  }));
}

export function upsertObjectCollection<TItem>(
  current: TItem[],
  item: TItem,
  getId: (item: TItem) => string | null | undefined
): LocalMutation<TItem[]> {
  return localMutation(current, upsertById(current, item, getId));
}

export function deleteObjectCollectionItems<TItem>(
  current: TItem[],
  ids: string | string[],
  getId: (item: TItem) => string | null | undefined
): LocalMutation<TItem[]> {
  const deleting = new Set(asArray(ids));
  return localMutation(current, current.filter((item) => {
    const id = getId(item);
    return !id || !deleting.has(id);
  }));
}

export function upsertRecordingCollection<TItem extends Record<string, any>>(current: TItem[], recording: TItem): LocalMutation<TItem[]> {
  return upsertObjectCollection(current, recording, recordingIdOf);
}

export function deleteRecordingCollectionItems<TItem extends Record<string, any>>(current: TItem[], recordingIds: string | string[]): LocalMutation<TItem[]> {
  return deleteObjectCollectionItems(current, recordingIds, recordingIdOf);
}

export function applyFlowObjectReferenceUpsert(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  kind: FlowObjectKind,
  object: string | Record<string, any>
): LocalMutation<AutomationStudioFlowEntry[]> {
  const id = flowObjectId(kind, object);
  if (!id) return localMutation(current, current);
  return localMutation(current, updateFlowExpansionIds(current, flowId, expansionKeyForFlowObject(kind), (ids) => uniqueStrings([id, ...ids])));
}

export function applyFlowObjectReferenceDelete(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  kind: FlowObjectKind,
  objectIds: string | string[]
): LocalMutation<AutomationStudioFlowEntry[]> {
  const deleting = new Set(asArray(objectIds));
  return localMutation(current, updateFlowExpansionIds(current, flowId, expansionKeyForFlowObject(kind), (ids) => ids.filter((id) => !deleting.has(id))));
}

export function applySubflowReferenceUpsert(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  subflow: string | Record<string, any>,
  options: { name?: string; parentCategoryId?: string | null } = {}
): LocalMutation<AutomationStudioFlowEntry[]> {
  const subflowId = flowObjectId("subflow", subflow);
  if (!subflowId) return localMutation(current, current);
  return localMutation(current, updateFlow(current, flowId, (flow) => {
    const raw = Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds : [];
    const entry = typeof subflow === "object" && subflow && !Array.isArray(subflow) ? subflow : { subflowId };
    const nextEntry = {
      ...entry,
      subflowId,
      ...(options.name ? { name: options.name } : {}),
      ...(options.parentCategoryId ? { metadata: { ...((entry as any).metadata ?? {}), subflowCategoryId: options.parentCategoryId } } : {})
    };
    const nextSubflows = raw.some((item: any) => subflowReferenceId(item) === subflowId)
      ? raw.map((item: any) => subflowReferenceId(item) === subflowId ? nextEntry : item)
      : [...raw, nextEntry];
    return { ...flow, expansion: { ...(flow.expansion ?? {}), subflowIds: nextSubflows } };
  }));
}

export function applySubflowReferenceDelete(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  subflowIds: string | string[]
): LocalMutation<AutomationStudioFlowEntry[]> {
  const deleting = new Set(asArray(subflowIds));
  return localMutation(current, updateFlow(current, flowId, (flow) => ({
    ...flow,
    expansion: {
      ...(flow.expansion ?? {}),
      subflowIds: (Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds : []).filter((item: any) => !deleting.has(subflowReferenceId(item)))
    },
    metadata: {
      ...(flow.metadata ?? {}),
      hierarchySubflows: (Array.isArray(flow.metadata?.hierarchySubflows) ? flow.metadata.hierarchySubflows : []).filter((item: any) => !deleting.has(subflowReferenceId(item)))
    }
  })));
}

function normalizeFlowEntry(input: AutomationStudioFlowEntry | any): AutomationStudioFlowEntry {
  if (input?.flow) return input;
  return { source: "canonical", readOnly: false, flow: input };
}

function upsertFlowEntry(current: AutomationStudioFlowEntry[], incoming: AutomationStudioFlowEntry): AutomationStudioFlowEntry[] {
  const flowId = incoming.flow?.flowId;
  if (!flowId) return current;
  const next = current.map((entry) => entry?.flow?.flowId === flowId ? incoming : entry);
  return next.some((entry) => entry?.flow?.flowId === flowId) ? next : [incoming, ...next];
}

function updateFlow(current: AutomationStudioFlowEntry[], flowId: string, update: (flow: any) => any): AutomationStudioFlowEntry[] {
  return current.map((entry) => entry?.flow?.flowId === flowId ? { ...entry, flow: update(entry.flow) } : entry);
}

function updateFlowCategories(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  update: (categories: SubflowCategory[]) => SubflowCategory[]
): AutomationStudioFlowEntry[] {
  return updateFlow(current, flowId, (flow) => ({
    ...flow,
    metadata: { ...(flow.metadata ?? {}), subflowCategories: update(normalizeSubflowCategories(flow.metadata?.subflowCategories)) }
  }));
}

function updateFlowExpansionIds(
  current: AutomationStudioFlowEntry[],
  flowId: string,
  key: string,
  update: (ids: string[]) => string[]
): AutomationStudioFlowEntry[] {
  return updateFlow(current, flowId, (flow) => ({
    ...flow,
    expansion: { ...(flow.expansion ?? {}), [key]: update(uniqueStrings(Array.isArray(flow.expansion?.[key]) ? flow.expansion[key].map(String) : [])) }
  }));
}

function normalizeSubflowCategories(value: unknown): SubflowCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw: any) => {
    const normalized = normalizeSubflowCategory(raw);
    if (!normalized.id || !normalized.name || seen.has(normalized.id)) return [];
    seen.add(normalized.id);
    return [normalized];
  });
}

function normalizeSubflowCategory(raw: SubflowCategory): SubflowCategory {
  return {
    ...raw,
    id: String(raw.id ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    parentId: typeof raw.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null
  };
}

function stripDeletedSubflowCategoryFromSubflows(value: unknown, deletingCategoryIds: Set<string>): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {};
    const categoryId = stringValue(metadata.subflowCategoryId) ?? stringValue(metadata.categoryId);
    if (!categoryId || !deletingCategoryIds.has(categoryId)) return item;
    const { subflowCategoryId: _subflowCategoryId, categoryId: _categoryId, ...restMetadata } = metadata;
    return Object.keys(restMetadata).length ? { ...item, metadata: restMetadata } : omitKey(item, "metadata");
  });
}

function collectSubflowCategoryDescendantIds(categories: SubflowCategory[], categoryId: string): Set<string> {
  const deleting = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (deleting.has(category.id)) continue;
      if (category.parentId === categoryId || (category.parentId !== null && deleting.has(category.parentId))) {
        deleting.add(category.id);
        changed = true;
      }
    }
  }
  return deleting;
}

function collectDescendantIds(nodes: AutomationHierarchyNode[], parentId: string): Set<string> {
  const deleting = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (deleting.has(node.id)) continue;
      if (node.parentId === parentId || (node.parentId !== null && deleting.has(node.parentId))) {
        deleting.add(node.id);
        changed = true;
      }
    }
  }
  return deleting;
}

function flowObjectId(kind: FlowObjectKind, value: string | Record<string, any>): string {
  if (typeof value === "string") return value;
  if (kind === "recording") return stringValue(value.recordingId) ?? stringValue(value.id) ?? "";
  if (kind === "instruction") return stringValue(value.instructionId) ?? stringValue(value.id) ?? "";
  if (kind === "adaptation") return stringValue(value.adaptationId) ?? stringValue(value.id) ?? "";
  if (kind === "subflow") return stringValue(value.subflowId) ?? stringValue(value.id) ?? stringValue(value.sourceId) ?? "";
  return stringValue(value.runtimeObjectId) ?? stringValue(value.id) ?? "";
}

function expansionKeyForFlowObject(kind: FlowObjectKind): string {
  if (kind === "recording") return "recordingIds";
  if (kind === "instruction") return "instructionIds";
  if (kind === "adaptation") return "adaptationIds";
  if (kind === "subflow") return "subflowIds";
  return "runtimeObjectIds";
}

function subflowReferenceId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const raw = value as Record<string, unknown>;
  return stringValue(raw.subflowId) ?? stringValue(raw.id) ?? stringValue(raw.sourceId) ?? "";
}

function recordingIdOf(item: Record<string, any>): string | null | undefined {
  return stringValue(item.recordingId) ?? stringValue(item.id);
}

function upsertById<TItem>(items: TItem[], incoming: TItem, getId: (item: TItem) => string | null | undefined): TItem[] {
  const id = getId(incoming);
  if (!id) return items;
  const next = items.map((item) => getId(item) === id ? incoming : item);
  return next.some((item) => getId(item) === id) ? next : [incoming, ...next];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function omitKey<TObject extends Record<string, any>>(value: TObject, key: keyof TObject): Omit<TObject, keyof TObject> {
  const { [key]: _removed, ...rest } = value;
  return rest;
}

import type { ProgramCommandTransport } from "../data/program-transport";
import type { AutomationHierarchyKind, AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchySiblingPageLoader, AutomationHierarchySiblingPageResponse } from "./sibling-pager";

export const AUTOMATION_HIERARCHY_CHILDREN_ENDPOINT = "list-project-hierarchy-children";

export type AutomationHierarchySqlEntry = {
  entryId: string;
  parentEntryId: string | null;
  kind: string;
  ownerId: string;
  displayName: string;
  sortKey: string;
  depth: number;
  pathKey: string;
  isSystem: boolean;
  isDeleted: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

const hierarchyKinds = new Set<AutomationHierarchyKind>([
  "folder",
  "client",
  "proposal",
  "flow",
  "flow-object",
  "subflow",
  "instruction",
  "change-proposal",
  "adaptation",
  "task",
  "routine",
  "config",
  "recording",
  "run"
]);

export function createAutomationHierarchyChildrenTransport(
  transport: Pick<ProgramCommandTransport, "post">
): AutomationHierarchySiblingPageLoader {
  return async ({ projectId, parentId, cursor, limit, signal }) => {
    const response = await transport.post<{ page?: unknown }>(
      AUTOMATION_HIERARCHY_CHILDREN_ENDPOINT,
      { projectId, parentId, cursor, limit },
      { signal }
    );
    if (signal.aborted || response.aborted) return null;
    if (!response.ok) {
      throw new Error(response.error || "Unable to load hierarchy entries.");
    }
    return decodeAutomationHierarchyChildrenPage(response.payload?.page, parentId, limit);
  };
}

export function decodeAutomationHierarchyChildrenPage(
  value: unknown,
  requestedParentId: string | null,
  limit: number
): AutomationHierarchySiblingPageResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Hierarchy page response is malformed.");
  }
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const items: AutomationHierarchyNode[] = [];
  for (const candidate of value.items.slice(0, boundedLimit)) {
    const entry = decodeSqlEntry(candidate);
    if (!entry || entry.isDeleted || entry.parentEntryId !== requestedParentId) continue;
    items.push(automationHierarchyNodeFromSqlEntry(entry));
  }
  return {
    items,
    nextCursor: typeof value.nextCursor === "string" && value.nextCursor ? value.nextCursor : null,
    hasMore: value.hasMore === true
  };
}

export function automationHierarchyNodeFromSqlEntry(
  entry: AutomationHierarchySqlEntry
): AutomationHierarchyNode {
  const kind = hierarchyKinds.has(entry.kind as AutomationHierarchyKind)
    ? entry.kind as AutomationHierarchyKind
    : "folder";
  return {
    id: entry.entryId,
    label: entry.displayName,
    kind,
    category: "flow",
    parentId: entry.parentEntryId,
    sourceId: entry.ownerId,
    ...(kind === "flow" || kind === "subflow" || kind === "flow-object"
      ? { flowId: entry.ownerId }
      : {}),
    metadata: {
      hierarchyPersistence: "sql",
      sortKey: entry.sortKey,
      depth: entry.depth,
      pathKey: entry.pathKey,
      isSystem: entry.isSystem,
      revision: entry.revision,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      ...(hierarchyKinds.has(entry.kind as AutomationHierarchyKind)
        ? {}
        : { persistedKind: entry.kind })
    }
  };
}

function decodeSqlEntry(value: unknown): AutomationHierarchySqlEntry | null {
  if (!isRecord(value)
    || !nonEmptyString(value.entryId)
    || !(value.parentEntryId === null || typeof value.parentEntryId === "string")
    || !nonEmptyString(value.kind)
    || !nonEmptyString(value.ownerId)
    || !nonEmptyString(value.displayName)
    || typeof value.sortKey !== "string"
    || !finiteNumber(value.depth)
    || typeof value.pathKey !== "string"
    || typeof value.isSystem !== "boolean"
    || typeof value.isDeleted !== "boolean"
    || !finiteNumber(value.revision)
    || !finiteNumber(value.createdAt)
    || !finiteNumber(value.updatedAt)) return null;
  return {
    entryId: value.entryId,
    parentEntryId: value.parentEntryId,
    kind: value.kind,
    ownerId: value.ownerId,
    displayName: value.displayName,
    sortKey: value.sortKey,
    depth: value.depth,
    pathKey: value.pathKey,
    isSystem: value.isSystem,
    isDeleted: value.isDeleted,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

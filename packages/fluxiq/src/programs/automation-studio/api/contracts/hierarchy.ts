import type { JsonObject } from "../../../../core/index.ts";

export type AutomationStudioHierarchyNode = {
  id: string;
  label: string;
  kind: "folder" | "client" | "proposal" | "flow" | "config" | "recording" | "run" | "task" | "routine";
  category: "client" | "proposal" | "flow" | "config" | "recording" | "run" | "task" | "routine";
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
  recordingId?: string;
};

export type AutomationStudioProjectHierarchy = {
  customHierarchyNodes: AutomationStudioHierarchyNode[];
  deletedHierarchyIds: string[];
  workspacePrefs: JsonObject;
};

export type AutomationStudioHierarchyPageEntry = {
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

export type AutomationStudioListHierarchyChildrenRequest = {
  projectId: string;
  parentId: string | null;
  cursor?: string | null;
  limit?: number;
};

export type AutomationStudioHierarchyChildrenPage = {
  items: AutomationStudioHierarchyPageEntry[];
  nextCursor: string | null;
  hasMore: boolean;
};

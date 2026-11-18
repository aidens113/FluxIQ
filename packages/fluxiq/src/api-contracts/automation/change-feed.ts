export type AutomationStudioChangeFeedOperation = "create" | "update" | "delete" | "touch";

export type AutomationStudioChangeFeedEntityKind =
  | "project"
  | "flow"
  | "subflow"
  | "folder"
  | "recording"
  | "instruction"
  | "adaptation"
  | "runtime_run"
  | "hierarchy"
  | string;

export type AutomationStudioChangeFeedHierarchyScope = {
  kind: "project" | "flow" | "subflow" | "folder" | string;
  id?: string;
};

export type AutomationStudioProjectChangeFeedEvent = {
  projectId: string;
  sequence: number;
  transactionId: string;
  entityKind: AutomationStudioChangeFeedEntityKind;
  entityId: string;
  parentId?: string | null;
  operation: AutomationStudioChangeFeedOperation;
  revision: number;
  changedAt: number;
  hierarchyScope?: AutomationStudioChangeFeedHierarchyScope | null;
};

export type AutomationStudioProjectChangeFeedRequest = {
  projectId: string;
  afterSequence?: unknown;
  limit?: unknown;
};

export type AutomationStudioProjectChangeFeedPage = {
  events: AutomationStudioProjectChangeFeedEvent[];
  cursor: number;
  hasMore: boolean;
  fallback: boolean;
  /**
   * True when changes after the requested cursor were pruned by retention, so `events` cannot be
   * complete. The reader reloads what it shows and continues from `cursor`, the last sequence written.
   */
  resync: boolean;
};

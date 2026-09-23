import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRouteGroup, AutomationStudioFlowRouteRule } from "../../../model/index.ts";
import type { AutomationStudioSubflowSummary } from "../indexes/index.ts";

// What the Flow map reads and writes: a page of Subflow targets, a page of
// routes with their groups, the references pointing at a target, and the
// inputs that upsert a route or a route group.

export type AutomationStudioSubflowTargetPage = {
  subflows: AutomationStudioSubflowSummary[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AutomationStudioRouterRoutePage = {
  routes: AutomationStudioFlowRouteRule[];
  groups: AutomationStudioFlowRouteGroup[];
  counts: { total: number; active: number; disabled: number; byGroup: Record<string, number> };
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AutomationStudioRouterTargetReferenceBatch = {
  targets: Array<{
    subflowId: string;
    total: number;
    hasMore: boolean;
    references: Array<{
      id: string;
      kind: "route" | "fallback";
      name: string;
      status: string;
      order: number | "fallback";
      condition?: JsonValue;
      conditionLabel?: string;
    }>;
  }>;
  perTargetLimit: number;
};

export type UpsertFlowMapRouteGroupInput = {
  projectId: string;
  flowId: string;
  groupId?: string;
  name: string;
  description?: string;
  order?: unknown;
  status?: AutomationStudioFlowRouteGroup["status"];
  collapsed?: boolean;
};

export type UpsertFlowMapRouteInput = {
  projectId: string;
  flowId: string;
  ruleId?: string;
  name: string;
  description?: string;
  targetSubflowId: string;
  order?: unknown;
  status?: AutomationStudioFlowRouteRule["status"];
  groupId?: string | null;
  setAsFallback?: boolean;
  confidence?: unknown;
  conditionSummary?: string;
  conditionSignalPath?: string;
  conditionOperator?: string;
  conditionExpected?: unknown;
  clearCondition?: boolean;
};

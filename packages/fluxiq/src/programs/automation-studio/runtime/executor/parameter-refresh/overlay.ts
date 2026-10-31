import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../nodes/index.ts";
import type { AutomationStudioTargetRefresh } from "./refresh.ts";
import type { AutomationStudioTargetRefreshPatch } from "./patch.ts";

/** Private, arrival-only target data; never part of graph options, shared values or a saved Flow. */
export type AutomationStudioParameterRefreshOverlay = {
  nodeId: string;
  definitionId: string;
  definitionVersion?: string;
  refresh: AutomationStudioTargetRefresh;
  baseline: Readonly<Record<string, JsonValue>>;
  patches: readonly AutomationStudioTargetRefreshPatch[];
  floor?: AutomationStudioResolvedActionEffect | undefined;
  effectFailure?: true;
  active: boolean;
};

import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../components/automation/index.ts";
import type { AutomationStudioTargetRefresh } from "../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioTargetRefreshPatch } from "../../../runtime/automation-host/contracts/index.ts";

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

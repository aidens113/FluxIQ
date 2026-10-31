import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../../host-runtime.ts";
import type { AutomationStudioTargetRefresh } from "../parameter-refresh/index.ts";

/** Find a target by saved identity without source-node lineage, using isolated resolved inputs. */
export type AutomationStudioUnboundTargetReacquireRequest = {
  /** The original node, supplied as an isolated snapshot. */
  node: AutomationStudioFlowNode;
  /** Actual resolved node parameters, retaining a policy wrapper when present. */
  parameters: Readonly<Record<string, JsonValue>>;
  refresh: AutomationStudioTargetRefresh;
  /** Existing attempt context for the host to prove the same resource, place and document. */
  previousAttempt: {
    attemptId: string;
    beforeAction?: AutomationStudioHostStateSnapshotRef;
  };
  failure: AutomationStudioFailureRecord;
  signal?: AbortSignal;
};

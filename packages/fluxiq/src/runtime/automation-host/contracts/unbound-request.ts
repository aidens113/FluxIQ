import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../index.ts";
import type { AutomationStudioTargetRefresh } from "./target-refresh.ts";

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

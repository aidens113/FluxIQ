import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../model/index.ts";

export type AutomationStudioHostRuntimeCapability =
  | "action-dispatch"
  | "state-snapshot"
  | "state-diff"
  | "wait-observe"
  | "external-side-effect"
  | "rollback-hint";

export type AutomationStudioHostStateSnapshotRef = {
  stateSnapshotId: string;
  stateRef: string;
  capturedAt: number;
  summary?: JsonObject;
};

export type AutomationStudioHostRuntimeActionContext = {
  node: AutomationStudioFlowNode;
  attemptId: string;
  inputs: Readonly<Record<string, JsonValue>>;
  previousStateRef?: AutomationStudioHostStateSnapshotRef;
};

export type AutomationStudioHostRuntimeBoundary = {
  capabilities: Iterable<AutomationStudioHostRuntimeCapability | string>;
  captureStateSnapshot?(input: AutomationStudioHostRuntimeActionContext & { point: "before_action" | "after_action" | "after_wait_retry" | "after_patch_test" }): AutomationStudioHostStateSnapshotRef | Promise<AutomationStudioHostStateSnapshotRef>;
  inspectStateDiff?(input: { before?: AutomationStudioHostStateSnapshotRef; after?: AutomationStudioHostStateSnapshotRef; node: AutomationStudioFlowNode; attemptId: string }): JsonObject | Promise<JsonObject>;
  rollbackHint?(input: AutomationStudioHostRuntimeActionContext): JsonObject | Promise<JsonObject>;
};

export function hostRuntimeCapabilityIds(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): string[] {
  return [...new Set([...(hostRuntime?.capabilities ?? [])].map(String).filter(Boolean))].sort();
}

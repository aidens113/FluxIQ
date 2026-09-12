import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../model/index.ts";
import type { AutomationNodeExpectationEvaluation, AutomationNodeExpectationEvaluationContext, AutomationNodeExpectationEvaluator } from "../nodes/index.ts";

export type AutomationStudioHostRuntimeCapability =
  | "action-dispatch"
  | "state-snapshot"
  | "state-diff"
  | "wait-observe"
  | "external-side-effect"
  | "rollback-hint"
  | "expectation-evaluation";

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
  /**
   * Decides whether an expected state holds. Bound with the rest of the host
   * runtime, so a host that binds nothing keeps Core's unconditional pass.
   */
  expectationEvaluator?(conditions: JsonValue[], mode: string, timeoutMs: number, context: AutomationNodeExpectationEvaluationContext): AutomationNodeExpectationEvaluation | Promise<AutomationNodeExpectationEvaluation>;
};

export function hostExpectationEvaluator(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): AutomationNodeExpectationEvaluator | undefined {
  const evaluate = hostRuntime?.expectationEvaluator;
  if (!evaluate) return undefined;
  return (conditions, mode, timeoutMs, context) => evaluate.call(hostRuntime, conditions, mode, timeoutMs, context);
}

export function hostRuntimeCapabilityIds(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): string[] {
  return [...new Set([...(hostRuntime?.capabilities ?? [])].map(String).filter(Boolean))].sort();
}

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

export async function captureHostState(
  options: AutomationStudioGraphExecutionOptions,
  input: { node: AutomationStudioFlowNode; attemptId: string; inputs: Readonly<Record<string, JsonValue>>; point: "before_action" | "after_action" | "after_wait_retry" | "after_patch_test" }
): Promise<AutomationStudioHostStateSnapshotRef | undefined> {
  const capture = options.hostRuntime?.captureStateSnapshot;
  if (!capture) return undefined;
  try {
    return await Promise.resolve(capture(input));
  } catch {
    return undefined;
  }
}

export async function enrichAttemptWithHostState(
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions,
  beforeAction: AutomationStudioHostStateSnapshotRef | undefined,
  hostCapabilities: string[]
): Promise<AutomationStudioNodeAttemptTrace> {
  const node = { id: attempt.nodeId, definitionId: attempt.definitionId, parameterValues: {} };
  const afterAction = await captureHostState(options, { node, attemptId: attempt.attemptId, inputs: attempt.inputs, point: "after_action" });
  const inspectStateDiff = options.hostRuntime?.inspectStateDiff;
  let stateDiff: JsonObject | undefined;
  if (inspectStateDiff && (beforeAction || afterAction)) {
    try {
      stateDiff = await Promise.resolve(inspectStateDiff({
        ...(beforeAction ? { before: beforeAction } : {}),
        ...(afterAction ? { after: afterAction } : {}),
        node,
        attemptId: attempt.attemptId
      }));
    } catch {
      stateDiff = undefined;
    }
  }
  return {
    ...attempt,
    ...(hostCapabilities.length ? { hostCapabilities } : {}),
    ...((beforeAction || afterAction || stateDiff) ? {
      stateRefs: {
        ...(beforeAction ? { beforeAction } : {}),
        ...(afterAction ? { afterAction } : {}),
        ...(stateDiff ? { stateDiff } : {})
      }
    } : {})
  };
}

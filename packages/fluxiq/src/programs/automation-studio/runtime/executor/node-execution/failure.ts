import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioFaultFromThrownError, automationStudioThrownErrorText } from "../defensive/index.ts";

export function automationStudioNodeAttemptFailure(
  node: AutomationStudioFlowNode,
  error: unknown,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  startedAt: number,
  inputs: Record<string, JsonValue>
): AutomationStudioNodeAttemptTrace {
  const finishedAt = options.now?.() ?? Date.now();
  const fault = automationStudioFaultFromThrownError(error, { now: finishedAt, aborted: options.signal?.aborted === true });
  const thrownText = automationStudioThrownErrorText(error);
  return {
    attemptId: `${node.id}.attempt.${attemptNumber}`,
    nodeId: node.id,
    definitionId: node.definitionId,
    startedAt,
    finishedAt,
    status: "failed",
    route: "failed",
    inputs,
    outputs: {},
    effects: [],
    message: thrownText || "Node execution failed.",
    failure: { category: fault.category, code: fault.code, retryable: fault.disposition === "retry", stage: "execution" },
    fault
  };
}


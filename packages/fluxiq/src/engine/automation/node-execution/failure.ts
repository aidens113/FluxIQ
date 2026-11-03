import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../index.ts";
import { automationStudioFaultFromThrownError, automationStudioThrownErrorText } from "../defensive/index.ts";
import { automationCallbackObservation, automationObservedClock } from "../execution-admission/kernel/index.ts";

export function automationStudioNodeAttemptFailure(
  node: AutomationStudioFlowNode,
  error: unknown,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  startedAt: number,
  inputs: Record<string, JsonValue>,
  mayHaveActed = true
): AutomationStudioNodeAttemptTrace {
  const observation = automationCallbackObservation(options);
  let finishedAt = startedAt;
  if (!observation) {
    finishedAt = options.now?.() ?? Date.now();
  } else {
    try {
      finishedAt = automationObservedClock(observation, options, options)();
    } catch {
      // best-effort: the clock refusal fences its actual frame; keep the action's primary fault and prior timestamp.
    }
  }
  const classified = automationStudioFaultFromThrownError(error, { now: finishedAt, aborted: options.signal?.aborted === true });
  const fault = mayHaveActed ? classified : { ...classified, effect: "unacted" as const };
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
    failure: { category: fault.category, code: fault.code, retryable: fault.disposition === "retry", stage: "execution", ...(mayHaveActed ? {} : { effect: "unacted" as const }) },
    fault
  };
}

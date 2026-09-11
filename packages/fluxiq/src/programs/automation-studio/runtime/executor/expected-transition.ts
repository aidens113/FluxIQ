import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioExpectedTransition, AutomationStudioGraphRunStatus, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

export function expectedTransitionForNode(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): AutomationStudioExpectedTransition {
  const expectedOutputs = jsonObjectParameter(node.parameterValues?.expectedOutputs);
  const expectedEffects = expectedEffectsForNode(node);
  const expectedState = jsonObjectParameter(node.parameterValues?.expectedState)
    ?? expectationStateFromNode(node)
    ?? undefined;
  const expectedRoute = typeof node.parameterValues?.expectedRoute === "string" && node.parameterValues.expectedRoute.trim()
    ? node.parameterValues.expectedRoute.trim()
    : node.definitionId === "builtin.policy.expectation"
      ? "passed"
      : node.definitionId === "builtin.timing.timeout"
        ? String(node.parameterValues?.timeoutRoute ?? "timeout")
        : attempt.status === "failed"
          ? "failed"
          : undefined;
  const tolerance = {
    ...(node.definitionId === "builtin.timing.wait" || node.definitionId === "builtin.routine.approval" ? { allowWaiting: true } : {}),
    ...(node.definitionId === "builtin.timing.timeout" ? { toleratedRoutes: ["timeout", "success"] } : {})
  };
  const expectedStatus = expectedStatusForNode(node);
  return {
    transitionId: `${attempt.attemptId}.expected`,
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(expectedRoute ? { expectedRoute } : {}),
    ...(expectedStatus ? { expectedStatus } : {}),
    ...(expectedOutputs ? { expectedOutputs } : {}),
    ...(expectedEffects.length ? { expectedEffects } : {}),
    ...(expectedState ? { expectedState } : {}),
    ...(Object.keys(tolerance).length ? { tolerance } : {})
  };
}

function expectedStatusForNode(node: AutomationStudioFlowNode): AutomationStudioGraphRunStatus | undefined {
  if (node.definitionId === "builtin.timing.wait" || node.definitionId === "builtin.routine.approval") return "waiting";
  if (node.definitionId === "builtin.control.end" && node.parameterValues?.resultStatus === "failed") return "failed";
  return "succeeded";
}

function expectedEffectsForNode(node: AutomationStudioFlowNode): Array<{ type: string; payload?: JsonValue }> {
  if (Array.isArray(node.parameterValues?.expectedEffects)) return node.parameterValues.expectedEffects.filter(isEffectShape);
  if (node.definitionId === "builtin.policy.action") return [{ type: "policy.output.dispatch" }];
  if (node.definitionId === "builtin.policy.expectation") return [{ type: "policy.expectation.checked" }];
  if (node.definitionId === "builtin.routine.approval") return [{ type: "routine.approval.requested" }];
  if (node.definitionId === "builtin.routine.task-policy") return [{ type: "routine.task-policy.requested" }];
  if (node.definitionId === "builtin.routine.subroutine") return [{ type: "routine.subroutine.requested" }];
  if (node.definitionId.startsWith("builtin.database.")) return [{ type: `${node.definitionId.replace("builtin.", "")}.requested` }];
  return [];
}

function expectationStateFromNode(node: AutomationStudioFlowNode): JsonObject | undefined {
  if (node.definitionId !== "builtin.policy.expectation") return undefined;
  const conditions = Array.isArray(node.parameterValues?.conditions) ? node.parameterValues.conditions : [];
  if (!conditions.length) return undefined;
  return { conditions: conditions as JsonValue, mode: typeof node.parameterValues?.mode === "string" ? node.parameterValues.mode : "all" };
}

function jsonObjectParameter(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function isEffectShape(value: unknown): value is { type: string; payload?: JsonValue } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string");
}

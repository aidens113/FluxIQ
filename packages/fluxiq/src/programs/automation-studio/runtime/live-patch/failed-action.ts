// The failed action as a domain's target check is asked about it.
//
// Without the output a recorded Flow's every action reads as the same
// `builtin.policy.action`, and a domain that keys what a repair may re-point on
// the verb finds nothing it may. Without what the node addressed, a domain can
// say whether the model was shown a control, but not whether that control is
// the one the step acted on.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import type { AutomationStudioRuntimeTargetOverrideFailedAction } from "./refusal-reasons.ts";

/** Core's node definition for a recorded action, which dispatches only its `parameters` payload. */
const POLICY_ACTION_DEFINITION_ID = "builtin.policy.action";

/**
 * The attempt's node and definition, the output that node dispatches wherever
 * the Flow names one, and what the node addressed wherever it holds that.
 */
export function automationStudioRuntimeTargetOverrideFailedAction(
  flow: AutomationStudioFlowDocument,
  failedAttempt: AutomationStudioNodeAttemptTrace
): AutomationStudioRuntimeTargetOverrideFailedAction {
  const node = flow.nodes.find((candidate) => candidate.id === failedAttempt.nodeId);
  const outputId = dispatchedOutputId(node?.parameterValues?.outputId) ?? dispatchedOutputId(node?.metadata?.outputActionId);
  const recordedTarget = node ? recordedActionTarget(node) : undefined;
  return {
    nodeId: failedAttempt.nodeId,
    definitionId: failedAttempt.definitionId,
    ...(outputId ? { outputId } : {}),
    ...(recordedTarget ? { recordedTarget } : {})
  };
}

/** An output id is an identifier; a state binding, or a string no output could be named, is not one. */
function dispatchedOutputId(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,126}[A-Za-z0-9])?$/u.test(value) ? value : undefined;
}

/**
 * The `element` and `target` of the payload the node dispatches, read from the
 * same place `actionTargetParameterValues` writes a repair: a policy action's
 * `parameters`, any other node's own parameter values. Only those two keys are
 * copied, so a typed value or anything else the payload carries never reaches
 * the check. A bound value is not a target the Flow holds.
 */
function recordedActionTarget(node: AutomationStudioFlowNode): AutomationStudioRuntimeTargetOverrideFailedAction["recordedTarget"] {
  const values = node.parameterValues;
  const payload = node.definitionId === POLICY_ACTION_DEFINITION_ID ? values?.parameters : values;
  if (!plainObject(payload)) return undefined;
  const element = plainObject(payload.element) ? structuredClone(payload.element) : undefined;
  const target = plainObject(payload.target) ? structuredClone(payload.target) : undefined;
  if (!element && !target) return undefined;
  return { ...(element ? { element } : {}), ...(target ? { target } : {}) };
}

function plainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !isAutomationNodeParameterStateBinding(value);
}

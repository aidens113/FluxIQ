// Where a target repair is written on a node, shared by every place one is
// written: the typed project store and the file-based applier when a change is
// applied, and a live repair's trial on its throwaway copy. One mapping, so a
// trial exercises exactly what an apply would change.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../nodes/index.ts";

const POLICY_ACTION_DEFINITION_ID = "builtin.policy.action";

/** The node a target repair re-points: its id, its definition, and the parameter values it holds now. */
export type AutomationStudioActionTargetNode = { nodeId: string; definitionId: string; parameterValues: JsonObject };

/**
 * The parameter values that re-point a node at `target`, in the place the node
 * reads its target from when it runs.
 *
 * - A native node is handed `parameterValues.target`.
 * - A policy action, which is what a recorded step is, dispatches only its
 *   `parameters` payload, so its target is that payload's `target`: the slot
 *   Core's output dispatch reads an element target from. Written beside the
 *   payload, the target reached nothing and the step kept acting on the
 *   element it was recorded with. A payload that is not a plain object cannot
 *   take one, and the change is refused rather than recorded as applied.
 */
export function actionTargetParameterValues(node: AutomationStudioActionTargetNode, target: JsonValue | undefined, adaptationId: string): JsonObject {
  if (target === undefined) throw new Error(`Action target patch for ${node.nodeId} has no target; ${adaptationId} refused.`);
  if (node.definitionId !== POLICY_ACTION_DEFINITION_ID) return { target };
  const payload = node.parameterValues.parameters;
  if (payload === undefined) return { parameters: { target } };
  if (!isPlainJsonObject(payload) || isAutomationNodeParameterStateBinding(payload)) throw new Error(`Policy action ${node.nodeId} has no output payload object to re-point; ${adaptationId} refused.`);
  return { parameters: { ...payload, target } };
}

function isPlainJsonObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

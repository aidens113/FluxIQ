// A repair's handler as the nodes a graph stores it in (state-aware recovery
// plan, C4): a `builtin.control.handler` registration, its body built as
// `./step-insert.ts` builds inserted steps, and a `builtin.control.handler-end`
// carrying the disposition, joined by the `body` port and `success` edges.
//
// The registration is read back by `automationStudioGraphHandlerRegistrations`
// (`runtime/executor/lifecycle/`) exactly as an authored Handler is: nothing
// here is a second representation.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID } from "../../nodes/control-flow/index.ts";
import { automationStudioHandlerThenDisposition, type AutomationStudioRuntimePatchHandlerSpec } from "../llm/index.ts";

/** Where each body step sits relative to the one before it. */
const STEP_X_OFFSET = 320;

/** How far below the step it was written for a new handler is drawn. */
const HANDLER_Y_OFFSET = 240;

/**
 * The handler's nodes and edges. The Handler takes `handlerNodeId`; its body
 * steps take `<idBase>.step-<n>` and its end `<idBase>.end`, and its edges are
 * named from `idBase` too, so a caller can check every id it will take before
 * it adds any.
 */
export function automationStudioRuntimePatchHandlerGraph(input: {
  spec: AutomationStudioRuntimePatchHandlerSpec;
  handlerNodeId: string;
  idBase: string;
  runId: string;
  reason: string;
  position?: { x: number; y: number };
}): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
  const { spec, idBase } = input;
  const metadata: JsonObject = { runtimePatchRunId: input.runId };
  const at = (column: number) => (input.position ? { position: { x: input.position.x + STEP_X_OFFSET * column, y: input.position.y + HANDLER_Y_OFFSET } } : {});
  const stepIds = spec.steps.map((_step, index) => `${idBase}.step-${index + 1}`);
  const endId = `${idBase}.end`;
  const then = spec.then;
  const nodes: AutomationStudioFlowNode[] = [
    {
      id: input.handlerNodeId,
      definitionId: AUTOMATION_STUDIO_HANDLER_DEFINITION_ID,
      label: "Handler",
      description: input.reason,
      parameterValues: {
        event: spec.event,
        scope: spec.scope.kind === "nodes" ? { kind: "nodes", nodeIds: [...spec.scope.nodeIds] } : { kind: "subflow", inherit: spec.scope.inherit !== false },
        when: json(spec.when),
        order: 0,
        completionCheck: json(spec.completionCheck ?? []),
        maxRuns: 1
      },
      ...at(0),
      metadata: { ...metadata }
    },
    ...spec.steps.map((step, index): AutomationStudioFlowNode => ({
      id: stepIds[index]!,
      definitionId: step.definitionId,
      label: step.label ?? step.definitionId,
      description: input.reason,
      ...(step.parameters ? { parameterValues: structuredClone(step.parameters) } : {}),
      ...at(index + 1),
      metadata: { ...metadata }
    })),
    {
      id: endId,
      definitionId: AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID,
      label: "Handler End",
      parameterValues: {
        disposition: automationStudioHandlerThenDisposition(then),
        ...(then.kind === "route" ? { checkpointId: then.checkpointId } : {}),
        ...(then.kind === "resolve" ? { outputs: structuredClone(then.outputs) } : {})
      },
      ...at(spec.steps.length + 1),
      metadata: { ...metadata }
    }
  ];
  const edges: AutomationStudioFlowEdge[] = [{ id: `${idBase}.body`, sourceNodeId: input.handlerNodeId, sourcePortId: "body", targetNodeId: stepIds[0]!, targetPortId: "in" }];
  for (let index = 0; index + 1 < stepIds.length; index += 1) {
    edges.push({ id: `${idBase}.step.${index + 1}`, sourceNodeId: stepIds[index]!, sourcePortId: "success", targetNodeId: stepIds[index + 1]!, targetPortId: "in" });
  }
  edges.push({ id: `${idBase}.done`, sourceNodeId: stepIds[stepIds.length - 1]!, sourcePortId: "success", targetNodeId: endId, targetPortId: "in" });
  return { nodes, edges };
}

/** A typed condition list as the stored JSON it becomes. */
function json(value: unknown): JsonValue {
  return structuredClone(value) as JsonValue;
}

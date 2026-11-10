// Which Flow a calling step runs, read the way each calling node stores it.
import type { JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../components/automation/control-flow/index.ts";
import { getCallFlowConfiguration } from "../../composite/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import type { OutlineLink } from "../types/index.ts";

/**
 * The Flow a node runs: a published Flow a composite node calls (its
 * `fluxiq.callFlow` metadata), the Subflow or saved part a Call Subflow names,
 * or the `target` ({ flowId } or { fluxNode }) or bare `flowId` a Call Flow
 * carries. Nothing when the node names none.
 */
export function outlineCallLinkOf(node: AutomationStudioFlowNode): OutlineLink | undefined {
  const composite = getCallFlowConfiguration(node);
  if (composite) return { kind: "flow", id: composite.target.flowId };
  const params = node.parameterValues ?? {};
  if (node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID) {
    if (text(params.subflowId)) return { kind: "subflow", id: text(params.subflowId)! };
    const part = record(params.part);
    return part && text(part.partId) ? { kind: "part", id: text(part.partId)! } : undefined;
  }
  const target = record(params.target);
  if (target && text(target.flowId)) return { kind: "flow", id: text(target.flowId)! };
  if (target && text(target.fluxNode)) return { kind: "fluxnode", id: text(target.fluxNode)! };
  if (text(params.flowId)) return { kind: "flow", id: text(params.flowId)! };
  return text(params.subflowId) ? { kind: "subflow", id: text(params.subflowId)! } : undefined;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function record(value: JsonValue | undefined): { [key: string]: JsonValue } | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

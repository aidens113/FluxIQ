// The instruction scope a save request addresses, derived from its payload.

import type { SaveFlowInstructionRequest } from "../contracts.ts";
import type { AutomationStudioInstructionScope } from "../../model/index.ts";

export function flowInstructionScopeFromPayload(projectId: string, flowId: string, payload: SaveFlowInstructionRequest): AutomationStudioInstructionScope {
  if (payload.scopeKind === "global") return { kind: "global" };
  if (payload.scopeKind === "project") return { kind: "project", projectId };
  if (payload.scopeKind === "router") return { kind: "router", projectId, flowId, routerId: String(payload.routerId ?? "router.default") };
  if (payload.scopeKind === "subflow") return { kind: "subflow", projectId, flowId, subflowId: String(payload.subflowId ?? "") };
  if (payload.scopeKind === "node") return { kind: "node", projectId, flowId, nodeId: String(payload.nodeId ?? ""), ...(typeof payload.subflowId === "string" && payload.subflowId ? { subflowId: payload.subflowId } : {}) };
  if (payload.scopeKind === "on_error") return { kind: "on_error", projectId, flowId, ...(typeof payload.subflowId === "string" && payload.subflowId ? { subflowId: payload.subflowId } : {}), ...(typeof payload.nodeId === "string" && payload.nodeId ? { nodeId: payload.nodeId } : {}) };
  if (payload.scopeKind === "adaptation_review") return { kind: "adaptation_review", projectId, flowId, ...(typeof payload.subflowId === "string" && payload.subflowId ? { subflowId: payload.subflowId } : {}) };
  return { kind: "flow", projectId, flowId };
}

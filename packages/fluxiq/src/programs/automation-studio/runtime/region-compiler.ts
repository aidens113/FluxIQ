import type { AutomationStudioFlowArtifact, AutomationStudioFlowRegion, PolicyGraph } from "../model/index.ts";
import { validateAutomationStudioFlowRegions, type AutomationStudioValidationIssue } from "../model/index.ts";

export type AutomationStudioRegionExecutionPlan = {
  regions: Array<AutomationStudioFlowRegion & { nodeIds: string[] }>;
  handoffs: NonNullable<AutomationStudioFlowArtifact["regionHandoffs"]>;
  nodeRegionIds: Record<string, string>;
};

/** Compiles region ownership and makes every cross-region graph edge explicit. */
export function compileAutomationStudioRegions(flow: AutomationStudioFlowArtifact): { ok: true; plan: AutomationStudioRegionExecutionPlan } | { ok: false; issues: AutomationStudioValidationIssue[] } {
  const issues = validateAutomationStudioFlowRegions({ ...(flow.regions ? { regions: flow.regions } : {}), ...(flow.regionHandoffs ? { handoffs: flow.regionHandoffs } : {}), nodeIds: flow.nodes.map((node) => node.id), scope: flow.scope }).issues;
  const nodeRegionIds: Record<string, string> = {};
  for (const region of flow.regions ?? []) for (const nodeId of region.nodeIds) nodeRegionIds[nodeId] = region.id;
  for (const [index, edge] of flow.edges.entries()) {
    const fromRegionId = nodeRegionIds[edge.sourceNodeId]; const toRegionId = nodeRegionIds[edge.targetNodeId];
    if (!fromRegionId || !toRegionId || fromRegionId === toRegionId) continue;
    const handoff = (flow.regionHandoffs ?? []).find((item) => item.fromRegionId === fromRegionId && item.toRegionId === toRegionId && item.fromPortId === (edge.sourcePortId ?? "success") && item.toPortId === (edge.targetPortId ?? "in"));
    if (!handoff) issues.push({ severity: "error", code: "flow.region_cross_edge_without_handoff", message: `Edge ${edge.id} crosses regions without a declared typed handoff.`, path: `edges.${index}` });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, plan: { regions: (flow.regions ?? []).map((region) => ({ ...region, nodeIds: [...region.nodeIds] })), handoffs: flow.regionHandoffs ?? [], nodeRegionIds } };
}

/** Non-destructively places an existing policy graph in a policy region. */
export function adaptPolicyGraphToPolicyRegion(policy: PolicyGraph, regionId = `policy.${policy.policyId}`): AutomationStudioFlowRegion {
  return { id: regionId, name: policy.taskId ?? policy.policyId, kind: "policy", nodeIds: policy.nodes.map((node) => node.id), entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" } }], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" } }, { id: "failed", name: "Failed", valueType: { kind: "unknown" } }], metadata: { policyId: policy.policyId } };
}

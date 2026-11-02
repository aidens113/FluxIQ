import { validateAutomationStudioFlowRegions } from "../index.ts";
import type { AutomationStudioValidationIssue } from "../../validation/index.ts";
import type { RegionExecutionPlan, RegionCompilationGraph } from "./plan.ts";

/** Compiles region ownership and makes every cross-region graph edge explicit. */
export function compileExecutableRegions(flow: RegionCompilationGraph): { ok: true; plan: RegionExecutionPlan } | { ok: false; issues: AutomationStudioValidationIssue[] } {
  const issues = validateAutomationStudioFlowRegions({ ...(flow.regions ? { regions: flow.regions } : {}), ...(flow.regionHandoffs ? { handoffs: flow.regionHandoffs } : {}), nodeIds: flow.nodes.map((node) => node.id), ...(flow.scope ? { scope: flow.scope } : {}) }).issues;
  const nodeRegionIds: Record<string, string> = {};
  for (const region of flow.regions ?? []) for (const nodeId of region.nodeIds) nodeRegionIds[nodeId] = region.id;
  for (const [index, edge] of flow.edges.entries()) {
    const fromRegionId = nodeRegionIds[edge.sourceNodeId];
    const toRegionId = nodeRegionIds[edge.targetNodeId];
    if (!fromRegionId || !toRegionId || fromRegionId === toRegionId) continue;
    const handoff = (flow.regionHandoffs ?? []).find((item) => item.fromRegionId === fromRegionId && item.toRegionId === toRegionId && item.fromPortId === (edge.sourcePortId ?? "success") && item.toPortId === (edge.targetPortId ?? "in"));
    if (!handoff) issues.push({ severity: "error", code: "flow.region_cross_edge_without_handoff", message: `Edge ${edge.id} crosses regions without a declared typed handoff.`, path: `edges.${index}` });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, plan: { regions: (flow.regions ?? []).map((region) => ({ ...region, nodeIds: [...region.nodeIds] })), handoffs: flow.regionHandoffs ?? [], nodeRegionIds } };
}

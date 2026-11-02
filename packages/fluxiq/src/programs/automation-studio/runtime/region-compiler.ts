import type { AutomationStudioFlowRegion, PolicyGraph } from "../model/index.ts";
export { compileExecutableRegions as compileAutomationStudioRegions } from "../../../flows/executable/regions/compilation/index.ts";
export type { RegionExecutionPlan as AutomationStudioRegionExecutionPlan } from "../../../flows/executable/regions/compilation/index.ts";

/** Non-destructively places an existing policy graph in a policy region. */
export function adaptPolicyGraphToPolicyRegion(policy: PolicyGraph, regionId = `policy.${policy.policyId}`): AutomationStudioFlowRegion {
  return { id: regionId, name: policy.taskId ?? policy.policyId, kind: "policy", nodeIds: policy.nodes.map((node) => node.id), entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" } }], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" } }, { id: "failed", name: "Failed", valueType: { kind: "unknown" } }], metadata: { policyId: policy.policyId } };
}

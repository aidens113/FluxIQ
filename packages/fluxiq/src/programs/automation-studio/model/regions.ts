import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowScope, AutomationStudioFlowValueType } from "./flows.ts";
import type { AutomationStudioValidationIssue, AutomationStudioValidationResult } from "./validation.ts";

export type AutomationStudioFlowRegionKind = "deterministic" | "trigger" | "policy";
export type AutomationStudioFlowRegionPort = { id: string; name: string; valueType: AutomationStudioFlowValueType };
export type AutomationStudioFlowRegion = {
  id: string;
  name: string;
  kind: AutomationStudioFlowRegionKind;
  nodeIds: string[];
  entryPorts: AutomationStudioFlowRegionPort[];
  exitPorts: AutomationStudioFlowRegionPort[];
  timeoutMs?: number;
  requiredRuntimeCapabilities?: string[];
  metadata?: JsonObject;
};
export type AutomationStudioFlowRegionHandoff = {
  id: string;
  fromRegionId: string;
  fromPortId: string;
  toRegionId: string;
  toPortId: string;
  metadata?: JsonObject;
};

export function validateAutomationStudioFlowRegions(input: { regions?: AutomationStudioFlowRegion[]; handoffs?: AutomationStudioFlowRegionHandoff[]; nodeIds: Iterable<string>; scope: AutomationStudioFlowScope }): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = []; const regions = input.regions ?? []; const ids = new Set<string>(); const nodeOwner = new Set<string>(); const knownNodes = new Set(input.nodeIds);
  for (const [index, region] of regions.entries()) {
    const path = `regions.${index}`;
    if (!region.id.trim() || ids.has(region.id)) issues.push({ severity: "error", code: "flow.region_duplicate_id", message: "Regions require unique non-empty IDs.", path: `${path}.id` });
    ids.add(region.id);
    if (!region.name.trim()) issues.push({ severity: "error", code: "flow.region_missing_name", message: "Region name is required.", path: `${path}.name` });
    if (region.timeoutMs !== undefined && region.timeoutMs <= 0) issues.push({ severity: "error", code: "flow.region_invalid_timeout", message: "Region timeoutMs must be positive.", path: `${path}.timeoutMs` });
    const entryIds = new Set<string>(); const exitIds = new Set<string>();
    for (const [portIndex, port] of region.entryPorts.entries()) {
      if (!port.id.trim() || entryIds.has(port.id)) issues.push({ severity: "error", code: "flow.region_duplicate_entry_port", message: "Region entry ports require unique non-empty IDs.", path: `${path}.entryPorts.${portIndex}.id` });
      entryIds.add(port.id);
    }
    for (const [portIndex, port] of region.exitPorts.entries()) {
      if (!port.id.trim() || exitIds.has(port.id)) issues.push({ severity: "error", code: "flow.region_duplicate_exit_port", message: "Region exit ports require unique non-empty IDs.", path: `${path}.exitPorts.${portIndex}.id` });
      exitIds.add(port.id);
    }
    for (const [capabilityIndex, capability] of (region.requiredRuntimeCapabilities ?? []).entries()) if (!capability.trim()) issues.push({ severity: "error", code: "flow.region_invalid_capability", message: "Required runtime capabilities must be non-empty.", path: `${path}.requiredRuntimeCapabilities.${capabilityIndex}` });
    for (const nodeId of region.nodeIds) {
      if (!knownNodes.has(nodeId)) issues.push({ severity: "error", code: "flow.region_unknown_node", message: `Region references unknown node ${nodeId}.`, path: `${path}.nodeIds` });
      if (nodeOwner.has(nodeId)) issues.push({ severity: "error", code: "flow.region_node_multiple_owners", message: `Node ${nodeId} belongs to more than one region.`, path: `${path}.nodeIds` });
      nodeOwner.add(nodeId);
    }
  }
  if (regions.length) for (const nodeId of knownNodes) if (!nodeOwner.has(nodeId)) issues.push({ severity: "error", code: "flow.region_unowned_node", message: `Node ${nodeId} must belong to exactly one region.`, path: "regions" });
  const handoffIds = new Set<string>();
  for (const [index, handoff] of (input.handoffs ?? []).entries()) {
    const from = regions.find((region) => region.id === handoff.fromRegionId); const to = regions.find((region) => region.id === handoff.toRegionId); const path = `regionHandoffs.${index}`;
    if (!handoff.id.trim() || handoffIds.has(handoff.id)) issues.push({ severity: "error", code: "flow.region_handoff_duplicate_id", message: "Region handoffs require unique non-empty IDs.", path: `${path}.id` });
    handoffIds.add(handoff.id);
    if (handoff.fromRegionId === handoff.toRegionId) issues.push({ severity: "error", code: "flow.region_handoff_self_reference", message: "A region handoff must cross a region boundary.", path });
    if (!from || !to) issues.push({ severity: "error", code: "flow.region_handoff_unknown_region", message: "Region handoff must reference existing regions.", path });
    else {
      const fromPort = from.exitPorts.find((port) => port.id === handoff.fromPortId); const toPort = to.entryPorts.find((port) => port.id === handoff.toPortId);
      if (!fromPort) issues.push({ severity: "error", code: "flow.region_handoff_unknown_exit", message: "Region handoff references an unknown exit port.", path: `${path}.fromPortId` });
      if (!toPort) issues.push({ severity: "error", code: "flow.region_handoff_unknown_entry", message: "Region handoff references an unknown entry port.", path: `${path}.toPortId` });
      if (fromPort && toPort && JSON.stringify(fromPort.valueType) !== JSON.stringify(toPort.valueType) && fromPort.valueType.kind !== "unknown" && toPort.valueType.kind !== "unknown") issues.push({ severity: "error", code: "flow.region_handoff_type_mismatch", message: "Region handoff ports must have compatible value types.", path });
    }
  }
  return { ok: issues.length === 0, issues };
}

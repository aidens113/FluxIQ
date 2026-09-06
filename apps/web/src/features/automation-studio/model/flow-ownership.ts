export function automationFlowMetadata(flow: any): Record<string, unknown> {
  return flow?.metadata && typeof flow.metadata === "object" && !Array.isArray(flow.metadata)
    ? flow.metadata
    : {};
}

export function isAutomationSubflowGraph(flow: any): boolean {
  const metadata = automationFlowMetadata(flow);
  const hasOwnershipTriple = metadata.subflowGraph === true
    && typeof metadata.parentFlowId === "string"
    && Boolean(metadata.parentFlowId.trim())
    && typeof metadata.parentSubflowId === "string"
    && Boolean(metadata.parentSubflowId.trim());
  if (!hasOwnershipTriple) return false;
  const hasRepresentationMarker = metadata.flowRepresentationVersion !== undefined || metadata.flowRepresentationKind !== undefined;
  return !hasRepresentationMarker
    || (metadata.flowRepresentationVersion === 1 && metadata.flowRepresentationKind === "subflow_graph");
}

export function isAutomationTopLevelFlow(flow: any): boolean {
  return Boolean(flow?.flowId) && !isAutomationSubflowGraph(flow);
}

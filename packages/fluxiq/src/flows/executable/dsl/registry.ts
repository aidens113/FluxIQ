import type { ExecutableFlow } from "../graph/index.ts";
import { getCallFlowConfiguration } from "../composite/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeDefinition } from "../../../components/automation/index.ts";
import type { FlowCompilerDiagnostic, FlowDependency } from "./contracts.ts";
import { collectSchemaTypes } from "./dependencies.ts";

export function validateFlowRegistry(flow: ExecutableFlow, registry: AutomationStudioNodeRegistry, diagnostics: FlowCompilerDiagnostic[]): void {
  for (const [index, node] of flow.nodes.entries()) {
    const definition = registry.get(node.definitionId);
    if (!definition && getCallFlowConfiguration(node)) continue;
    if (!definition) { diagnostics.push({ severity: "error", code: "flow.node_definition_unavailable", message: `Node definition ${node.definitionId} is not registered for this Flow scope.`, path: `nodes.${index}.definitionId`, remediation: "Register the node manifest in the importing runtime or choose a node available in this scope." });
      continue; }
    if (node.definitionVersion && node.definitionVersion !== definition.version) { diagnostics.push({ severity: "error", code: "flow.node_definition_version_mismatch", message: `Node ${node.definitionId} pins ${node.definitionVersion}, but the registry provides ${definition.version}.`, path: `nodes.${index}.definitionVersion`, remediation: "Install the pinned node definition or explicitly review and save an upgrade." });
      continue; }
    if (!definitionScopeAllows(definition.availability, flow.scope)) { diagnostics.push({ severity: "error", code: "flow.node_definition_wrong_scope", message: `Node definition ${node.definitionId} is not available in this Flow scope.`, path: `nodes.${index}.definitionId`, remediation: "Use the node only inside its declared global/domain scope." });
      continue; }
    for (const edge of flow.edges.filter((item) => item.sourceNodeId === node.id)) if (edge.sourcePortId && !["success", "failed"].includes(edge.sourcePortId) && !definition.outputs.some((port) => port.id === edge.sourcePortId)) diagnostics.push({ severity: "error", code: "flow.edge_unknown_source_port", message: `Node ${node.id} has no output port ${edge.sourcePortId}.`, path: `edges.${flow.edges.indexOf(edge)}.sourcePortId`, remediation: "Use an output port declared by the pinned node definition." });
    for (const edge of flow.edges.filter((item) => item.targetNodeId === node.id)) if (edge.targetPortId && edge.targetPortId !== "in" && !definition.inputs.some((port) => port.id === edge.targetPortId)) diagnostics.push({ severity: "error", code: "flow.edge_unknown_target_port", message: `Node ${node.id} has no input port ${edge.targetPortId}.`, path: `edges.${flow.edges.indexOf(edge)}.targetPortId`, remediation: "Use an input port declared by the pinned node definition." });
  }
}

function definitionScopeAllows(availability: AutomationStudioNodeDefinition["availability"], scope: ExecutableFlow["scope"]): boolean { return availability.kind === "both" || (availability.kind === "global" && scope.kind === "global") || (availability.kind === "domain" && scope.kind === "domain" && availability.domainId === scope.domainId); }

export function validateFlowDependencies(flow: ExecutableFlow, dependencies: FlowDependency[], registry: AutomationStudioNodeRegistry, diagnostics: FlowCompilerDiagnostic[]): void {
  const pins = new Set(dependencies.map((item) => `${item.kind}:${item.id}@${item.version}`));
  for (const [index, node] of flow.nodes.entries()) {
    const call = getCallFlowConfiguration(node);
    if (call && !pins.has(`flow:${call.target.flowId}@${call.target.version}`)) diagnostics.push({ severity: "error", code: "flow.call_dependency_undeclared", message: `Call Flow dependency ${call.target.flowId}@${call.target.version} is not declared.`, path: `nodes.${index}`, remediation: "Add the exact published Flow version to dependencies." });
    if (call || node.definitionId.startsWith("builtin.")) continue;
    const definition = registry.get(node.definitionId);
    const version = node.definitionVersion ?? definition?.version;
    if (version && !pins.has(`node:${node.definitionId}@${version}`)) diagnostics.push({ severity: "error", code: "flow.node_dependency_undeclared", message: `Node dependency ${node.definitionId}@${version} is not declared.`, path: `nodes.${index}`, remediation: "Add the exact node-definition version to dependencies." });
  }
  const schemaTypes = [...flow.interface.inputs, ...flow.interface.outputs, ...flow.variables, ...(flow.regions ?? []).flatMap((region) => [...region.entryPorts, ...region.exitPorts])].flatMap((item) => collectSchemaTypes(item.valueType));
  for (const schema of schemaTypes) {
    if (!schema.version) diagnostics.push({ severity: "error", code: "flow.schema_dependency_unversioned", message: `Schema dependency ${schema.id} has no version.`, path: "interface", remediation: "Pin a schemaVersion and declare the matching schema dependency." });
    else if (!pins.has(`schema:${schema.id}@${schema.version}`)) diagnostics.push({ severity: "error", code: "flow.schema_dependency_undeclared", message: `Schema dependency ${schema.id}@${schema.version} is not declared.`, path: "interface", remediation: "Add the exact schema version to dependencies." });
  }
}

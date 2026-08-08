import type { AutomationStudioFlowArtifact } from "../model/index.ts";
import type { AutomationStudioFlowDefinition } from "./contracts.ts";

const importLine = 'import { defineFlow } from "fluxiq/automation-studio/dsl";';

/** Stable, reviewable TypeScript export for a visual-owned canonical Flow. */
export function generateFlowTypeScript(flow: AutomationStudioFlowArtifact): string {
  const definition: AutomationStudioFlowDefinition = {
    flowId: flow.flowId, name: flow.name, ...(flow.description ? { description: flow.description } : {}), scope: flow.scope, visibility: flow.visibility, origin: flow.origin,
    interface: flow.interface, errors: flow.errors, variables: flow.variables, nodes: flow.nodes, edges: flow.edges,
    ...(flow.regions ? { regions: flow.regions } : {}), ...(flow.regionHandoffs ? { regionHandoffs: flow.regionHandoffs } : {}), ...(flow.executionDefaults ? { executionDefaults: flow.executionDefaults } : {}),
    dependencies: dependencyPins(flow)
  };
  return `${importLine}\n\nexport default defineFlow(${JSON.stringify(definition, null, 2)});\n`;
}

function dependencyPins(flow: AutomationStudioFlowArtifact) {
  const pins = new Map<string, { id: string; version: string; kind: "flow" | "node" | "schema" }>();
  for (const node of flow.nodes) {
    const value = node.metadata?.["fluxiq.callFlow"] as Record<string, any> | undefined; const target = value?.target;
    if (target?.flowId && target?.version) pins.set(`flow:${target.flowId}@${target.version}`, { id: target.flowId, version: target.version, kind: "flow" });
    else if (!node.definitionId.startsWith("builtin.") && node.definitionVersion) pins.set(`node:${node.definitionId}@${node.definitionVersion}`, { id: node.definitionId, version: node.definitionVersion, kind: "node" });
  }
  for (const item of [...flow.interface.inputs, ...flow.interface.outputs, ...flow.variables, ...(flow.regions ?? []).flatMap((region) => [...region.entryPorts, ...region.exitPorts])]) for (const schema of collectSchemas(item.valueType)) if (schema.version) pins.set(`schema:${schema.id}@${schema.version}`, { id: schema.id, version: schema.version, kind: "schema" });
  return [...pins.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
function collectSchemas(valueType: AutomationStudioFlowArtifact["interface"]["inputs"][number]["valueType"]): Array<{ id: string; version?: string }> { if (valueType.kind === "schema") return [{ id: valueType.schemaId, ...(valueType.schemaVersion ? { version: valueType.schemaVersion } : {}) }]; if (valueType.kind === "array") return collectSchemas(valueType.item); if (valueType.kind === "record") return Object.values(valueType.properties ?? {}).flatMap(collectSchemas); return []; }

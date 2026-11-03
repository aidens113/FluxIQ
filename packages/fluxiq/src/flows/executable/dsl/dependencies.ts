import type { ExecutableFlow } from "../graph/index.ts";
import type { FlowDependency } from "./contracts.ts";

export function normalizeDependencies(items: FlowDependency[]): FlowDependency[] { return [...items].map((item) => ({ ...item })).sort((a, b) => `${a.kind}:${a.id}@${a.version}`.localeCompare(`${b.kind}:${b.id}@${b.version}`)); }

export function collectSchemaTypes(valueType: ExecutableFlow["interface"]["inputs"][number]["valueType"]): Array<{ id: string; version?: string }> {
  if (valueType.kind === "schema") return [{ id: valueType.schemaId, ...(valueType.schemaVersion ? { version: valueType.schemaVersion } : {}) }];
  if (valueType.kind === "array") return collectSchemaTypes(valueType.item);
  if (valueType.kind === "record") return Object.values(valueType.properties ?? {}).flatMap(collectSchemaTypes);
  return [];
}

export function flowDependencyPins(flow: ExecutableFlow) {
  const pins = new Map<string, { id: string; version: string; kind: "flow" | "node" | "schema" }>();
  for (const node of flow.nodes) {
    const value = node.metadata?.["fluxiq.callFlow"] as Record<string, any> | undefined;
    const target = value?.target;
    if (target?.flowId && target?.version) pins.set(`flow:${target.flowId}@${target.version}`, { id: target.flowId, version: target.version, kind: "flow" });
    else if (!node.definitionId.startsWith("builtin.") && node.definitionVersion) pins.set(`node:${node.definitionId}@${node.definitionVersion}`, { id: node.definitionId, version: node.definitionVersion, kind: "node" });
  }
  for (const item of [...flow.interface.inputs, ...flow.interface.outputs, ...flow.variables, ...(flow.regions ?? []).flatMap((region) => [...region.entryPorts, ...region.exitPorts])]) for (const schema of collectSchemaTypes(item.valueType)) if (schema.version) pins.set(`schema:${schema.id}@${schema.version}`, { id: schema.id, version: schema.version, kind: "schema" });
  return [...pins.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

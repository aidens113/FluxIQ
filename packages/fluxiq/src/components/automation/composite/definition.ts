import { compositeNodeDefinitionId } from "../../../flows/executable/composite/definition/index.ts";
import type { ExecutableFlowSnapshot } from "../../../flows/executable/composite/index.ts";
import type { AutomationStudioNodeDefinition } from "../definitions.ts";
import { flowValueTypeToNodeValueType } from "./value-type.ts";

/** Projects executable content with supplied display text into a callable definition. */
export function projectPublishedFlowSnapshotToNodeDefinition(snapshot: ExecutableFlowSnapshot & { name: string; description?: string }): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: compositeNodeDefinitionId(snapshot), version: snapshot.version, label: snapshot.name,
    description: snapshot.description ?? `Call published Flow ${snapshot.flowId}@${snapshot.version}.`, category: "public-flows",
    source: { kind: "composite", flowId: snapshot.flowId, version: snapshot.version },
    availability: snapshot.scope.kind === "global" ? { kind: "global" } : { kind: "domain", domainId: snapshot.scope.domainId },
    capabilities: { executable: true, composite: true, asynchronous: true, retryable: true, recoverable: true },
    inputs: snapshot.interface.inputs.map((port) => ({ id: port.id, label: port.name, valueType: flowValueTypeToNodeValueType(port.valueType), ...(port.required ? { required: true } : {}) })),
    outputs: [...snapshot.interface.outputs.map((port) => ({ id: port.id, label: port.name, valueType: flowValueTypeToNodeValueType(port.valueType) })), ...snapshot.errors.map((error) => ({ id: `error.${error.id}`, label: error.id, valueType: "object" as const, role: "error" as const }))],
    parameters: []
  };
}

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import type { AutomationStudioCallFlowTarget } from "./target.ts";
import type { AutomationStudioCallFlowBinding } from "./binding.ts";
import type { AutomationStudioCallFlowConfiguration } from "./configuration.ts";
import { compositeNodeDefinitionId } from "../definition/index.ts";
import { CALL_FLOW_METADATA_KEY as callFlowMetadataKey } from "../configuration.ts";

export function createCallFlowNode(input: { id: string; target: AutomationStudioCallFlowTarget; label?: string; position?: { x: number; y: number }; inputBindings?: AutomationStudioCallFlowBinding[]; outputBindings?: AutomationStudioCallFlowBinding[]; errorBindings?: AutomationStudioCallFlowBinding[] }): AutomationStudioFlowNode {
  const configuration: AutomationStudioCallFlowConfiguration = { target: structuredClone(input.target), ...(input.inputBindings?.length ? { inputBindings: structuredClone(input.inputBindings) } : {}), ...(input.outputBindings?.length ? { outputBindings: structuredClone(input.outputBindings) } : {}), ...(input.errorBindings?.length ? { errorBindings: structuredClone(input.errorBindings) } : {}) };
  return { id: input.id, definitionId: compositeNodeDefinitionId(input.target), definitionVersion: input.target.version, ...(input.label ? { label: input.label } : {}), ...(input.position ? { position: input.position } : {}), metadata: { [callFlowMetadataKey]: configuration } as JsonObject };
}

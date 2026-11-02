import type { AutomationStudioFlowArtifact } from "../model/index.ts";
import type { AutomationStudioFlowDefinition } from "./contracts.ts";

import { generateFlowDefinitionTypeScript, flowDependencyPins } from "../../../flows/executable/dsl/index.ts";

/** Stable, reviewable TypeScript export for a visual-owned canonical Flow. */
export function generateFlowTypeScript(flow: AutomationStudioFlowArtifact): string {
  const metadata = representationMetadata(flow);
  const definition: AutomationStudioFlowDefinition = {
    flowId: flow.flowId, name: flow.name, ...(flow.description ? { description: flow.description } : {}), scope: flow.scope, visibility: flow.visibility, origin: flow.origin,
    ...(metadata ? { metadata } : {}),
    interface: flow.interface, errors: flow.errors, variables: flow.variables, nodes: flow.nodes, edges: flow.edges,
    ...(flow.regions ? { regions: flow.regions } : {}), ...(flow.regionHandoffs ? { regionHandoffs: flow.regionHandoffs } : {}), ...(flow.executionDefaults ? { executionDefaults: flow.executionDefaults } : {}),
    dependencies: flowDependencyPins(flow)
  };
  return generateFlowDefinitionTypeScript(definition, { moduleImport: "fluxiq/automation-studio/dsl" });
}

function representationMetadata(flow: AutomationStudioFlowArtifact): AutomationStudioFlowDefinition["metadata"] | undefined {
  const metadata = flow.metadata;
  if (!metadata) return undefined;
  const selected: NonNullable<AutomationStudioFlowDefinition["metadata"]> = {
    ...(metadata.flowRepresentationVersion === 1 ? { flowRepresentationVersion: 1 } : {}),
    ...(metadata.flowRepresentationKind === "orchestration" || metadata.flowRepresentationKind === "subflow_graph" || metadata.flowRepresentationKind === "legacy_single_graph"
      ? { flowRepresentationKind: metadata.flowRepresentationKind }
      : {}),
    ...(typeof metadata.subflowGraph === "boolean" ? { subflowGraph: metadata.subflowGraph } : {}),
    ...(typeof metadata.parentFlowId === "string" ? { parentFlowId: metadata.parentFlowId } : {}),
    ...(typeof metadata.parentSubflowId === "string" ? { parentSubflowId: metadata.parentSubflowId } : {})
  };
  return Object.keys(selected).length ? selected : undefined;
}
